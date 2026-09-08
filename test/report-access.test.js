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
// {} is truthy, so the free tier drew the button onto an empty panel.
ok('the redacted view carries null, not an empty object',
   /admin_view: null/.test(Sc) && !/admin_view: \{\}/.test(Sc));

console.log('--- the pipeline stops handing it to the browser ---');
ok('only the student view is returned',
   /res\.status\(200\)\.json\(\{ ok: true, student_view \}\)/.test(PIPEc));
ok('admin_view is no longer in the response',
   !/json\(\{ ok: true, student_view, admin_view \}\)/.test(PIPEc));
// The save already happened server to server, before the response is written.
ok('but it is still filed server-side',
   PIPEc.indexOf("action: 'apiSaveTEAResult'") < PIPEc.indexOf('res.status(200).json({ ok: true, student_view })'));

console.log('--- the two proxies ask who is calling ---');
[['api/tea.mjs', TEAc], ['api/tea-pipeline.mjs', PIPEc]].forEach(([name, src]) => {
  ok(name + ' checks the origin',   /function originAllowed\(req\)/.test(src));
  ok(name + ' checks the session',  /async function sessionValid\(token\)/.test(src));
  ok(name + ' refuses with a 403',
     (src.match(/res\.status\(403\)\.json\(\{ ok: false, code: 'FORBIDDEN'/g) || []).length === 2);
  ok(name + ' no longer answers every origin',
     !/setHeader\('Access-Control-Allow-Origin', '\*'\)/.test(src) &&
     /setHeader\('Access-Control-Allow-Origin', APP_ORIGIN \|\| '\*'\)/.test(src));
  /* The presence check is what carries the weight, and it is free: an anonymous
   * caller has no token and is refused without Apps Script being asked anything.
   *
   * The round trip is deliberately the weakest link. Apps Script answers a
   * non-browser client with an HTML consent page — every time, when probed from a
   * terminal — and api/gas.mjs already documents that it does this under load and
   * on cold starts. A validator that refused whenever it could not get an answer
   * would 403 real candidates mid-examination. Only a parsed, explicit rejection
   * refuses here. */
  const sv = src.slice(src.indexOf('async function sessionValid'),
                       src.indexOf('export default async function handler'));
  ok(name + ' refuses a missing token without any round trip',
     /if \(!token \|\| typeof token !== 'string'\) return false;/.test(sv) &&
     sv.indexOf("return false") < sv.indexOf('fetch('));
  ok(name + ' treats an HTML consent page as not-an-answer',
     /\^\\s\*\(<!doctype\|<html\)/i.test(sv) && /allowing on token presence/.test(sv));
  ok(name + ' refuses only on an explicit rejection',
     /return j\.ok !== false;/.test(sv));
  ok(name + ' and never on its own failure',
     !/catch \(e\) \{[\s\S]{0,120}return false;\s*\n\s*\}/.test(sv));
  ok(name + ' bounds the round trip', /setTimeout\(\(\) => ac\.abort\(\), 8000\)/.test(sv));
  ok(name + ' validates before spending anything',
     src.indexOf('sessionValid(') < src.indexOf('GEMINI_API_KEY'));
});
ok('every client caller sends a session',
   (Sc.match(/sessionToken:\s*AppState\.sessionToken/g) || []).length >= 4 &&
   (Sc.match(/fetch\('\/api\/tea/g) || []).length === 4);

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

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
