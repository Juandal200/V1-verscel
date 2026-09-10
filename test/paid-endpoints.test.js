/* Nothing spends money for a stranger.
 *
 * Three paths billed a third party for anyone who could send a POST:
 *
 *   api/tea-audio.mjs  — {text, voice, lang} → Google Cloud TTS, per character
 *   api/whisper.mjs    — raw audio → OpenAI Whisper, per minute
 *   api/gas.mjs        — apiGenerateIcaoTestVoiceInternal_ → the same Google TTS,
 *                        reached by name because the router matched the SHAPE of
 *                        the name rather than asking whether it was public
 *
 * api/tea-pipeline.mjs already carried a secret. Somebody recognised this class
 * and closed one member of it; the siblings never got the same treatment.
 */
const fs = require('fs');
const L  = fs.readFileSync(__dirname + '/../lib/session.mjs',      'utf8');
const TA = fs.readFileSync(__dirname + '/../api/tea-audio.mjs',    'utf8');
const WH = fs.readFileSync(__dirname + '/../api/whisper.mjs',      'utf8');
const C  = fs.readFileSync(__dirname + '/../Código.js',            'utf8');
let fails = 0;
const ok = (n, c) => { if (!c) fails++; console.log((c ? '  PASS  ' : '  FAIL  ') + n); };

console.log('--- the door the router left open is shut ---');
/* The trailing underscore means "internal" everywhere in this codebase. The regex
 * only ever read the front of the name. */
const allow = C.slice(C.indexOf('var allowed ='), C.indexOf('var output ='));
ok('the allowlist rejects private helpers',
   /\/\^api\[A-Z\]\/\.test\(action\) && !\/_\$\/\.test\(action\)/.test(allow));

/* Enumerated rather than assumed: the fix is worth nothing if a fourth helper is
 * added tomorrow with no underscore, and worth checking that today's three are
 * actually the shape the condition catches. */
const helpers = [...C.matchAll(/^function (api[A-Z][A-Za-z0-9_]*_)\s*\(/gm)].map(m => m[1]);
ok('the private api* helpers all end in _', helpers.every(h => /_$/.test(h)));
ok('and there are some to catch',           helpers.length >= 2);
[...fs.readdirSync(__dirname + '/..').filter(f => f.endsWith('.js'))].forEach(function (f) {
  const src = fs.readFileSync(__dirname + '/../' + f, 'utf8');
  const bad = [...src.matchAll(/^function (api[A-Z][A-Za-z0-9_]*[^_\s(])\s*\(/gm)]
    .map(m => m[1]).filter(n => /Internal|Helper|_resolve/.test(n));
  ok(f + ' names no public-looking internal', bad.length === 0);
});

console.log('--- the session check lives outside api/ ---');
/* Every file in api/ becomes a public route on Vercel. That is why two copies of
 * this function already existed — and they drifted, which is the whole argument. */
ok('lib/session.mjs exists',   fs.existsSync(__dirname + '/../lib/session.mjs'));
ok('and api/ has no shared module',
   !fs.readdirSync(__dirname + '/../api').some(f => /session|auth|shared|common/i.test(f)));
ok('it is imported, not copied, by tea-audio', /from '\.\.\/lib\/session\.mjs'/.test(TA));
ok('and by whisper',                           /from '\.\.\/lib\/session\.mjs'/.test(WH));
ok('neither defines its own',
   !/function sessionValid/.test(TA) && !/function sessionValid/.test(WH));

console.log('--- both refuse before spending, not after ---');
[['tea-audio', TA, 'GOOGLE_TTS_API_KEY'], ['whisper', WH, 'OPENAI_API_KEY']].forEach(function (p) {
  const src = p[1];
  /* Order matters and is the whole point: an auth check after the fetch is not a
   * check, it is a log line.
   *
   * Anchored on the CODE that reads the key, not on the key's name — tea-audio's
   * file header mentions GOOGLE_TTS_API_KEY in a comment on line 3, so the first
   * version of this line compared against a comment and failed correct code. That
   * is the sixth time a comment has broken the check written beside it here. */
  ok(p[0] + ' checks the caller before reading its key',
     src.indexOf('sessionValid(tokenFrom(req))') < src.indexOf('const apiKey = process.env.' + p[2]));
  ok(p[0] + ' refuses SESSION_UNAVAILABLE too',
     /caller === SESSION_UNAVAILABLE/.test(src));
});
/* Whisper refuses in the shape the client already handles, so a refusal costs a
 * less accurate transcript rather than the student's answer. */
ok('whisper refuses with noKey, tripping the browser fallback',
   /noKey: true,[\s\S]{0,120}FORBIDDEN/.test(WH));

console.log('--- the cache is what makes asking affordable ---');
/* /api/whisper fires on every spoken answer. A round trip to Apps Script per
 * answer would double the latency of the core loop and the load on a
 * 30-execution budget. Run, not read: a TTL that never expires and a TTL that
 * never hits look identical in source. */
const mod = new Function('Date', 'Map', 'console',
  L.slice(L.indexOf('const TTL_MS'), L.indexOf('async function askWhoIsCalling')) +
  '\nreturn { cacheGet, cacheSet, TTL_MS };')(Date, Map, console);
mod.cacheSet('tok', { role: 'STUDENT' });
ok('a stored verdict comes back',      mod.cacheGet('tok').role === 'STUDENT');
ok('an unknown token does not',        mod.cacheGet('other') === undefined);
ok('the window is five minutes',       mod.TTL_MS === 5 * 60 * 1000);
/* Bounded. A Map that only grows is a leak on a long-lived instance, and the
 * person filling it would be someone sending random tokens. */
for (let i = 0; i < 600; i++) mod.cacheSet('t' + i, { role: 'X' });
ok('and it cannot grow without bound', true === (mod.cacheGet('t0') === undefined));

console.log('--- a refusal is never cached ---');
/* SESSION_UNAVAILABLE means "could not establish", not "no". Caching it would
 * turn one bad minute from Apps Script into five minutes of refusals. */
const body = L.slice(L.indexOf('export async function sessionValid'));
ok('SESSION_UNAVAILABLE is returned without storing',
   /return SESSION_UNAVAILABLE;\s*\/\/ deliberately NOT cached/.test(body));
ok('a parsed denial is cached',        /cacheSet\(token, null\); return null;/.test(body));

console.log('--- the token is read from both places one time ---');
ok('a header, for the endpoint that posts binary', /x-session-token/.test(L));
ok('and a JSON body, for the one that does not',   /b\.sessionToken/.test(L));
ok('whisper announces the header to CORS',
   /Access-Control-Allow-Headers[^)]*X-Session-Token/.test(WH));

console.log(fails ? '\n' + fails + ' FAILING' : '\nAll paid-endpoint assertions passed.');
process.exit(fails ? 1 : 0);
