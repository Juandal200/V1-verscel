/* T-8, and the duplicated sessionValid that C3 names.
 *
 * This used to fail OPEN: a consent page, an unparseable body or no answer at
 * all returned a caller object with an empty role, so a request proceeded on the
 * token merely being a non-empty string — nothing had checked it was real. Audit
 * #2 confirmed six such branches across the two proxies, and the condition is
 * sustained: six consecutive probes on 2026-09-08 all returned the consent page.
 *
 * The rule now: a PARSED body is authoritative in both directions. Anything
 * unusable is retried once and then refuses — but refuses as "could not confirm",
 * never as "sign in", because a student whose session is fine must not lose it
 * over a backend fault.
 *
 * Both proxies carry their own copy. api/ is a public route directory, so a
 * shared module there becomes a public endpoint — the boundary is real, and
 * CLAUDE.md says compare the copies rather than hope. The parity block does. */
'use strict';
const fs = require('fs');
const F = { 'api/tea.mjs': null, 'api/tea-pipeline.mjs': null };
for (const k of Object.keys(F)) F[k] = fs.readFileSync(__dirname + '/../' + k, 'utf8');
let fails = 0; const ok = (n, c, d) => { if (!c) fails++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c || !d ? '' : ' — ' + d)); };
function grab(src, sig) {
  const i = src.indexOf(sig); if (i < 0) return null;
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  return null;
}
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1').replace(/\s+/g, ' ').trim();

function lift(src) {
  const state = { mode: 'ok', calls: 0 };
  const stub = async () => {
    state.calls++;
    if (state.mode === 'throw') throw new Error('boom');
    if (state.mode === 'html')  return { text: async () => '<!doctype html><html>consent</html>' };
    if (state.mode === 'junk')  return { text: async () => 'not json' };
    if (state.mode === 'no')    return { text: async () => JSON.stringify({ ok: false }) };
    return { text: async () => JSON.stringify({ ok: true, user: { role: 'STUDENT' }, accessStatus: { status: 'active' } }) };
  };
  const body = grab(src, 'const SESSION_UNAVAILABLE') === null
    ? null
    : src.slice(src.indexOf('const SESSION_UNAVAILABLE'));
  const parts = [
    'const SESSION_UNAVAILABLE = { unavailable: true };',
    grab(src, 'async function _askWhoIsCalling('),
    grab(src, 'async function sessionValid('),
  ];
  if (parts.some(p => !p)) return null;
  const api = new Function('fetch', 'GAS_AUTH_URL', 'GAS_WEBHOOK_URL', 'console',
    parts.join('\n') + '\nreturn { sessionValid, SESSION_UNAVAILABLE };'
  )(stub, 'stub://gas', 'stub://gas', { warn() {}, error() {}, log() {} });
  return {
    async run(mode, token) { state.mode = mode; state.calls = 0;
      const r = await api.sessionValid(token); return { r, calls: state.calls }; },
    UNAVAILABLE: api.SESSION_UNAVAILABLE,
  };
}

(async function () {
  for (const name of Object.keys(F)) {
    console.log('\n' + name + ' — executed:');
    const s = lift(F[name]);
    ok(name + ' can be lifted and run', !!s);
    if (!s) continue;

    let a = await s.run('ok', '');
    ok('no token is refused outright', a.r === null);
    ok('without asking Apps Script anything', a.calls === 0);

    a = await s.run('no', 'tok');
    ok('a parsed denial refuses', a.r === null);
    ok('on the first answer, no retry', a.calls === 1, String(a.calls));

    for (const mode of ['html', 'junk', 'throw']) {
      a = await s.run(mode, 'tok');
      ok(mode + ' twice REFUSES rather than passing', a.r === s.UNAVAILABLE,
         JSON.stringify(a.r));
      ok('  and it tried exactly twice', a.calls === 2, String(a.calls));
      ok('  and never returns an empty role/plan object',
         !(a.r && a.r.role === '' ) && !(a.r && a.r.status === ''));
    }

    a = await s.run('ok', 'tok');
    ok('a real session is allowed', a.r && a.r.unavailable !== true && a.calls === 1);

    ok('no fail-open language survives in the file',
       !/allowing on token presence/.test(F[name]));
    ok('and the handler answers "could not confirm", not "sign in"',
       /code: 'SESSION_UNCONFIRMED'/.test(F[name]) &&
       /Your session is still valid/.test(F[name]));
    // 403 would make the client clear a token that is perfectly good.
    ok('with a 200, so the client keeps the session',
       /if \(caller\.unavailable\) \{\s*res\.status\(200\)/.test(F[name].replace(/\s+/g, ' ').replace(/if \(caller\.unavailable\) \{ res\.status\(200\)/, 'if (caller.unavailable) {\n    res.status(200)')) ||
       /caller\.unavailable[\s\S]{0,80}res\.status\(200\)/.test(F[name]));
  }

  /* C3: the two copies must not drift. api/ is a public route directory, so a
   * shared module there becomes a public endpoint — the duplication is forced,
   * and comparison is what CLAUDE.md asks for in that case. */
  console.log('\nthe two copies agree where they must:');
  const askA = strip(grab(F['api/tea.mjs'], 'async function _askWhoIsCalling(') || '');
  const askB = strip(grab(F['api/tea-pipeline.mjs'], 'async function _askWhoIsCalling(') || '');
  ok('the transport half is identical apart from the URL constant',
     askA.replace(/GAS_AUTH_URL/g, 'URL') === askB.replace(/GAS_WEBHOOK_URL/g, 'URL'),
     'lengths ' + askA.length + ' vs ' + askB.length);

  const svA = strip(grab(F['api/tea.mjs'], 'async function sessionValid(') || '');
  const svB = strip(grab(F['api/tea-pipeline.mjs'], 'async function sessionValid(') || '');
  // The return shapes differ by design — one carries role, the other does not —
  // so the decisions are compared, not the payloads.
  const decisions = t => [
    /if \(!token \|\| typeof token !== 'string'\) return null;/.test(t),
    (t.match(/await _askWhoIsCalling\(token\)/g) || []).length === 2,
    /return SESSION_UNAVAILABLE;/.test(t),
    /if \(j\.ok === false\) return null;/.test(t),
  ].join(',');
  ok('and both take the same decisions in the same order',
     decisions(svA) === decisions(svB), decisions(svA) + '  vs  ' + decisions(svB));
  ok('both declare the same sentinel',
     /const SESSION_UNAVAILABLE = \{ unavailable: true \};/.test(F['api/tea.mjs']) &&
     /const SESSION_UNAVAILABLE = \{ unavailable: true \};/.test(F['api/tea-pipeline.mjs']));

  console.log(fails ? ('\n' + fails + ' FAILING') : '\nall green');
  process.exit(fails ? 1 : 0);
})();
