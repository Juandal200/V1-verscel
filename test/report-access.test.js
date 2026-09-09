/* Who may read the examiner's working, and who may spend the model budget.
 *
 * A customer review found that students could see annotated transcripts and
 * correction details. The report I wrote first said the data leaked in a network
 * response and was never drawn — which was wrong, and wrong in a way worth
 * recording: I searched for `annotatedTranscript`, the name the PIPELINE uses,
 * and the client reads `av.annotated_transcript`. Same data, different
 * convention, and one spelling of a search found one of them.
 *
 * What was actually there was a button. _renderScoreJSON drew a whole "Show
 * Admin Report" panel on `if (av)` alone, with no role check, on the candidate's
 * own results screen.
 *
 * Underneath it, two endpoints with no authentication at all: /api/tea and
 * /api/tea-pipeline answered Access-Control-Allow-Origin: * and asked nothing of
 * the caller, so any page on the internet could spend the account's model budget.
 * And apiSaveTEAResult took no session and called no requireRole, while doPost
 * admits anything matching /^api[A-Z]/ — an unauthenticated write of an
 * arbitrary examination result. */
const fs = require('fs');
const S  = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
const T  = fs.readFileSync(__dirname + '/../TEAService.js', 'utf8');
const A  = fs.readFileSync(__dirname + '/../Authservice.js', 'utf8');
const G  = fs.readFileSync(__dirname + '/../Código.js', 'utf8');
const TEA  = fs.readFileSync(__dirname + '/../api/tea.mjs', 'utf8');
const PIPE = fs.readFileSync(__dirname + '/../api/tea-pipeline.mjs', 'utf8');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
const Sc = strip(S), Tc = strip(T), TEAc = strip(TEA), PIPEc = strip(PIPE);

/* Run the code, do not describe it.
 *
 * Most of this file matches patterns in source, which is the right tool for
 * "the button is gone" and the wrong one for "the answer is correct". Six
 * assertions below used to be regexes over sessionValid, written when it
 * returned a boolean; F-0021 and D-1 changed the contract to
 * null | { role, status } and the regexes went on matching nothing. They failed
 * for a stale reason for weeks, which is worse than not existing, because a
 * suite with permanent red in it trains everyone to stop reading it.
 *
 * And a regex could not have caught what was actually wrong. The catch branch
 * returned { role: '' } with no status key, so paidPlan read undefined as a paid
 * plan and shipped all six ICAO descriptors. Every line a pattern would have
 * matched was correct. The defect was a key that was not there.
 *
 * So these lift the function out of the file and run it. */
function grab(src, sig) {
  const i = src.indexOf(sig);
  if (i === -1) return null;
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  return null;
}

const quietConsole = { warn() {}, error() {}, log() {} };

/* Every answer Apps Script has actually been seen to give, plus the two ways it
 * gives none at all. 'html' is the consent page api/gas.mjs documents. */
function stubTransport(state) {
  return async function () {
    state.calls++;
    if (state.mode === 'throw')   throw new Error('fetch failed');
    if (state.mode === 'abort')   { const e = new Error('aborted'); e.name = 'AbortError'; throw e; }
    if (state.mode === 'html')    return { text: async () => '<!doctype html><html>consent</html>' };
    if (state.mode === 'garbage') return { text: async () => 'not json at all' };
    if (state.mode === 'no')      return { text: async () => JSON.stringify({ ok: false }) };
    if (state.mode === 'free')    return { text: async () => JSON.stringify({ ok: true, user: { role: 'STUDENT' }, accessStatus: { status: 'free'   } }) };
    return                               { text: async () => JSON.stringify({ ok: true, user: { role: 'STUDENT' }, accessStatus: { status: 'active' } }) };
  };
}

function liftSessionValid(src) {
  const state = { calls: 0, mode: 'ok' };
  const body  = grab(src, 'async function sessionValid(');
  if (!body) return null;
  /* Both names. api/tea.mjs reads GAS_AUTH_URL and api/tea-pipeline.mjs reads
   * GAS_WEBHOOK_URL, and supplying only one left the other undefined — a
   * ReferenceError, swallowed by the function's own catch, which made every
   * mode return the fail-open answer and two assertions fail for a reason that
   * had nothing to do with the code. Caught here rather than shipped, but it is
   * the same trap this file exists to stop, so the reach check below is what
   * actually guards it. */
  const { sessionValid } = new Function('fetch', 'GAS_AUTH_URL', 'GAS_WEBHOOK_URL', 'console',
    body + '\nreturn { sessionValid };')(stubTransport(state), 'stub://gas', 'stub://gas', quietConsole);
  return async function (mode, token) {
    state.mode = mode; state.calls = 0;
    const caller = await sessionValid(token);
    return { caller, calls: state.calls };
  };
}

/* The handler's own line, lifted verbatim, so the check and the code cannot
 * drift apart the way the last six did. */
function liftPaidPlan(src) {
  const line = (src.match(/const paidPlan = [^\n]+/) || [])[0];
  return line ? new Function('caller', line + '\nreturn paidPlan;') : null;
}

function liftWithhold(src) {
  const parts = [
    (src.match(/const TEA_DESCRIPTORS = [^\n]+/) || [])[0],
    grab(src, 'function withholdDescriptors('),
    grab(src, 'function logServerError('),
    grab(src, 'function withholdInMessage('),
  ];
  if (parts.some(x => !x)) return null;
  return new Function('fetch', 'GAS_AUTH_URL', 'console',
    parts.join('\n') + '\nreturn withholdInMessage;'
  )(async () => ({ text: async () => '{}' }), 'stub://gas', quietConsole);
}

console.log('--- the admin panel has a reader ---');
ok('there is a check',            /function _teaMayReadAdminReport\(\)/.test(Sc));
ok('and the panel uses it',       /if \(av && _teaMayReadAdminReport\(\)\) \{/.test(Sc));
ok('the bare `if (av)` is gone',  !/\n\s*if \(av\) \{/.test(Sc));
/* window., not a bare call: _lmsVisible is declared in the IIFE that opens at
 * line 299 and _renderScoreJSON lives in the one that opens at 25228. A bare
 * reference across that boundary is a ReferenceError — the fault that locked
 * every new student out of the simulator in September. */
const gate = Sc.slice(Sc.indexOf('function _teaMayReadAdminReport'),
                      Sc.indexOf('function _renderScoreJSON'));
ok('it reaches the helper through window', /window\._lmsVisible && window\._lmsVisible\(\)/.test(gate));
ok('and refuses when it cannot answer',    /catch \(e\) \{ return false; \}/.test(gate));
ok('the helper is actually exported',      /window\._lmsVisible\s*=\s*_lmsVisible/.test(Sc));

console.log('--- and a redacted report has nothing to open ---');
/* {} is truthy, so the free tier drew the button onto an empty panel.
 *
 * This used to read Scripts.html, and it cannot any more — which is the point.
 * D-1 deleted _teaRedactScores, because a client that redacts has already been
 * sent the thing it is hiding (rule 5). The check moved to where the behaviour
 * moved, and now runs it rather than describing it. */
const withhold = liftWithhold(TEAc);
ok('the withholding is where the browser cannot reach it', typeof withhold === 'function');
if (withhold) {
  const report = JSON.stringify({
    student_view: { overall_band: 4, pronunciation: 5, structure: 5, vocabulary: 5,
                    fluency: 5, comprehension: 5, interactions: 5, summary: 'Strong throughout.' },
    admin_view:   { transcript: 'ATC: CLIMB FL350', technical_justification: 'band 5 evidence' }
  });
  const held = withhold(report, '');
  const out  = JSON.parse(held.message);
  ok('a report for a caller with no plan is withheld', held.withheld === true);
  ok('all six descriptors are zeroed',
     ['pronunciation','structure','vocabulary','fluency','comprehension','interactions']
       .every(k => out.student_view[k] === 0));
  ok('the band survives, so the paywall has something to sell',
     out.student_view.overall_band === 4);
  ok('the summary is emptied', out.student_view.summary === '');
  ok('the redacted view carries null, not an empty object',
     out.admin_view === null);
  ok('and the examiner working is not in the message at all',
     !/CLIMB FL350/.test(held.message) && !/band 5 evidence/.test(held.message));

  // A spoken turn is not a payload, and must come back byte for byte.
  const spoken = 'Thank you. Now describe the weather at your home airfield.';
  const turn   = withhold(spoken, '');
  ok('a spoken turn is returned untouched',
     turn.withheld === false && turn.message === spoken);
}

console.log('--- the pipeline stops handing it to the browser ---');
ok('only the student view is returned',
   /res\.status\(200\)\.json\(\{ ok: true, student_view \}\)/.test(PIPEc));
ok('admin_view is no longer in the response',
   !/json\(\{ ok: true, student_view, admin_view \}\)/.test(PIPEc));
// The save already happened server to server, before the response is written.
ok('but it is still filed server-side',
   PIPEc.indexOf("action: 'apiSaveTEAResult'") < PIPEc.indexOf('res.status(200).json({ ok: true, student_view })'));

async function main() {

console.log('--- the two proxies ask who is calling ---');
for (const [name, src] of [['api/tea.mjs', TEAc], ['api/tea-pipeline.mjs', PIPEc]]) {
  ok(name + ' checks the origin',   /function originAllowed\(req\)/.test(src));
  ok(name + ' checks the session',  /async function sessionValid\(token\)/.test(src));
  /* This was an exact count of two, and F-0021 added a third refusal — the
   * ADMIN_REPORT role gate — so it failed for having MORE security than when it
   * was written. The property that matters is not how many refusals there are;
   * it is that no refusal is a bare 403 the client cannot classify. */
  const status403 = (src.match(/res\.status\(403\)/g) || []).length;
  const coded403  = (src.match(/res\.status\(403\)\.json\(\{ ok: false, code: 'FORBIDDEN'/g) || []).length;
  ok(name + ' refuses with a 403', status403 >= 2);
  ok(name + ' and every refusal carries the code', coded403 === status403);
  ok(name + ' never answers a wildcard origin',
     !/setHeader\('Access-Control-Allow-Origin', '\*'\)/.test(src) &&
     !/APP_ORIGIN \|\| '\*'/.test(src));
  /* The first version allowed everything when APP_ORIGIN was unset, so the lock
   * did nothing until somebody set a dashboard value, in the right environment,
   * and redeployed — three chances to end up silently unprotected, and it took
   * two of them. The request already carries the answer: a cross-site call has
   * the attacker's Origin and our Host, and they do not match. */
  ok(name + ' compares Origin to Host with nothing configured',
     /new URL\(origin\)\.host === host/.test(src));
  ok(name + ' and an unset override does not mean "allow anyone"',
     !/if \(!APP_ORIGIN\) return true;/.test(src));
  ok(name + ' a missing Origin header is still not evidence',
     /if \(!origin\) return true;/.test(src));

  /* From here the function is EXECUTED. See the note at the top of the file:
   * these were regexes written against a boolean sessionValid, they failed for
   * a stale reason after F-0021 and D-1 changed the contract, and a regex could
   * not have seen the missing status key that was shipping every descriptor. */
  const run  = liftSessionValid(src);
  const paid = liftPaidPlan(src);
  ok(name + ' sessionValid can be lifted and run', typeof run === 'function');
  ok(name + ' the handler computes a plan from what it returns', typeof paid === 'function');
  if (run && paid) {
    /* The presence check is what carries the weight, and it is free: an
     * anonymous caller is refused without Apps Script being asked anything. */
    let a = await run('ok', '');
    ok(name + ' refuses a missing token', a.caller === null);
    ok(name + ' without any round trip',  a.calls === 0);

    a = await run('no', 'tok');
    ok(name + ' refuses on an explicit rejection', a.caller === null);

    /* And only on that. Apps Script answers a non-browser client with an HTML
     * consent page, and api/gas.mjs documents it doing so under load and on cold
     * starts. A validator that refused whenever it could not get an answer would
     * 403 real candidates mid-examination. That is T-8: a deliberate trade, and
     * the reason the next assertion is the one that matters. */
    for (const mode of ['html', 'garbage', 'throw', 'abort']) {
      a = await run(mode, 'tok');
      ok(name + ' does not refuse on ' + mode + ', so a sitting survives it',
         a.caller !== null);
      /* D-1, and the fix in this batch. An unknown plan is a free plan. The
       * catch branch used to omit status entirely, so paidPlan read undefined —
       * neither 'free' nor '' — as PAID, and all six descriptors shipped on the
       * one branch where the plan is least knowable. */
      ok(name + ' but ' + mode + ' leaves the plan unknown, which withholds',
         paid(a.caller) === false);
    }

    a = await run('free', 'tok');
    ok(name + ' a real free plan withholds', paid(a.caller) === false);
    a = await run('ok', 'tok');
    ok(name + ' a real paid plan does not',  paid(a.caller) === true);
    /* And the answer came from the transport, not from the function throwing on
     * the way there. Without this, a harness that fails to supply a binding
     * looks exactly like a proxy that refuses everything. */
    ok(name + ' and that answer came from a real round trip', a.calls === 1);
  }

  ok(name + ' bounds the round trip', /setTimeout\(\(\) => ac\.abort\(\), 8000\)/.test(src));
  ok(name + ' validates before spending anything',
     src.indexOf('sessionValid(') < src.indexOf('GEMINI_API_KEY'));
}

/* This asserted `fetch('/api/tea` appears exactly four times. It was stale at
 * three and went green when F-0024 added a fourth — a count is not the property.
 * The property is that no call site reaches these endpoints anonymously, so
 * every one of them is found and read. */
{
  const sites = [];
  for (let i = Sc.indexOf("fetch('/api/tea"); i !== -1; i = Sc.indexOf("fetch('/api/tea", i + 1)) sites.push(i);
  // The body is sometimes built into a variable well above the call, so look back.
  const carried = sites.filter(i => /sessionToken/.test(Sc.slice(Math.max(0, i - 1200), i + 500)));
  ok('there are client callers to check', sites.length >= 3);
  ok('every client caller sends a session (' + carried.length + '/' + sites.length + ')',
     carried.length === sites.length);
}

console.log('--- filing a result needs a credential ---');
ok('there is one',                /function _teaCallerAuthorised_\(data\)/.test(Tc));
ok('and the endpoint uses it',    /if \(!_teaCallerAuthorised_\(data\)\) \{/.test(Tc));
ok('a refusal is a 403, not a crash', /code: 'FORBIDDEN'/.test(Tc));
ok('the secret never reaches Drive or the sheet',
   /if \(data && data\.pipelineSecret\) delete data\.pipelineSecret;/.test(Tc));
ok('the pipeline sends it when configured',
   /gasData\.pipelineSecret = process\.env\.PIPELINE_SECRET/.test(PIPEc));
/* Apps Script and Vercel deploy separately. If this demanded the secret before
 * the pipeline sent one, every result would stop being filed — silently, because
 * the candidate's screen never mentions the save. Unset accepts, and says so. */
ok('an unset secret still accepts, and warns',
   /if \(!expected\) \{[\s\S]{0,320}return true;/.test(Tc) &&
   /PIPELINE_SECRET is not set/.test(T));

console.log('--- a refusal says it is a refusal ---');
ok('requireRole tags the denial',  /denied\.code = 'FORBIDDEN';/.test(strip(A)));
ok('and apiError_ carries it out', /if \(err && err\.code === 'FORBIDDEN'\)/.test(strip(G)));
ok('with a status and plain words',
   /out\.status\s*= 403;/.test(strip(G)) && /not available for your role/.test(G));

console.log('--- and the admin door checks the role ---');
// Not a replacement for the server gate — the 161 gated endpoints still refuse.
// This stops the app drawing a room the student cannot be in.
ok('renderAdminNav refuses first',
   /function renderAdminNav\(\) \{[\s\S]{0,700}if \(!_lmsVisible\(\)\) \{ renderHome\(\); return; \}/.test(Sc));

console.log(fails ? ('\n' + fails + ' FAILING') : '\nall green');
process.exit(fails ? 1 : 0);
}

main().catch(e => { console.log('  FAIL  the suite itself threw: ' + e.message); process.exit(1); });
