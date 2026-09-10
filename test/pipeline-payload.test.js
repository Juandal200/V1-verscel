/* Six megabytes into a four-and-a-half megabyte door.
 *
 * /api/tea-pipeline is the grader that reads the ICAO scale verbatim and has the
 * acoustic evidence — speech rate, pauses, per-word confidence. It obtained that
 * evidence by transcribing every recording a SECOND time, which meant the client
 * posting two dozen base64 recordings in one request body. Vercel rejected the
 * body with 413 before the function was invoked, so not one [PIPELINE] line was
 * ever logged and every sitting fell to the text-only fallback.
 *
 * The failure scaled with the candidate: a student who answered briefly stayed
 * under the limit and got the full grader, one who spoke at length did not. The
 * better the English, the worse the marking.
 *
 * The exam already transcribes each answer through /api/whisper, one at a time,
 * and those calls work. Asking for the detail there removes the second
 * transcription and the bulk upload with it. */
const fs = require('fs');
const W    = fs.readFileSync(__dirname + '/../api/whisper.mjs', 'utf8');
const PIPE = fs.readFileSync(__dirname + '/../api/tea-pipeline.mjs', 'utf8');
const S    = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');

function grab(src, sig) {
  const i = src.indexOf(sig);
  if (i < 0) throw new Error('not found: ' + sig);
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
}

/* ── the real whisper handler, on a fake OpenAI ───────────────────────────── */
/* buildRichTranscript reconstructs the line from the WORD list, not from `text`,
 * so the fixture has to carry every word or the assertion tests the fixture
 * rather than the function. */
const SAID = 'I fly the Airbus A320 out of Bogota';
const OPENAI_SAID = {
  text: SAID,
  words: SAID.split(' ').map((w, i) => ({ word: w, start: i * 0.3, end: i * 0.3 + 0.25 })),
  segments: [{ id: 0, start: 0, end: 2.4, text: SAID, avg_logprob: -0.2, no_speech_prob: 0.01 }],
  duration: 2.4,
};
/* `authed` false makes sessionValid answer null, which is how the proxy is asked
 * to refuse. The import is stubbed rather than loaded because this file runs the
 * handler in a sandbox, and lib/session.mjs would try to reach Apps Script. */
async function whisper(url, sent, authed) {
  const src = grab(W, 'export default async function handler(req, res)').replace(/^export default /, '');
  const out = {};
  const res = {
    setHeader(){}, end(){},
    status(c) { out.code = c; return this; },
    json(b) { out.body = b; return this; },
  };
  const req = {
    method: 'POST', url,
    headers: { 'content-type': 'audio/webm', 'x-session-token': 'T' },
    async *[Symbol.asyncIterator]() { yield Buffer.alloc(4096, 7); },
  };
  const handler = new Function('Buffer','FormData','Blob','fetch','process','console',
    'sessionValid','tokenFrom','SESSION_UNAVAILABLE',
    src + '\nreturn handler;')(
    Buffer,
    class { append(k, v) { sent.push(k); } },
    class {},
    async () => ({ ok: true, json: async () => OPENAI_SAID }),
    { env: { OPENAI_API_KEY: 'sk-test' } },
    { error(){}, warn(){}, log(){} },
    async () => (authed === false ? null : { role: 'STUDENT', status: 'active' }),
    (r) => String((r.headers || {})['x-session-token'] || ''),
    { unavailable: true },
  );
  await handler(req, res);
  return out;
}

(async () => {
console.log('--- nothing is transcribed without a session ---');
/* This endpoint took raw audio from anyone on the internet and paid OpenAI for
 * the transcription. It refuses now — and refuses with noKey, the shape the
 * client already reads as "Whisper is unavailable", so the student drops to the
 * browser's own speech recognition instead of losing the answer. */
let refused = [];
let rr = await whisper('/api/whisper', refused, false);
ok('an unauthenticated call is refused', rr.body.ok === false);
ok('and OpenAI is never reached',        refused.length === 0);
ok('it answers noKey, so the fallback trips', rr.body.noKey === true);
ok('and names the reason',               rr.body.code === 'FORBIDDEN');

console.log('--- verbose is opt-in, and additive ---');
let sent = [];
let r = await whisper('/api/whisper', sent);
ok('the plain call still answers with a transcript', r.body.ok === true && r.body.transcript === OPENAI_SAID.text);
ok('and carries no verbose payload',                 !('verbose' in r.body));
// The simulator's read-back posts here too and wants a string, nothing else.
ok('nothing verbose is requested of OpenAI',         sent.indexOf('response_format') === -1);

sent = [];
r = await whisper('/api/whisper?verbose=1', sent);
ok('the verbose call still answers the same transcript', r.body.transcript === OPENAI_SAID.text);
ok('and adds the acoustic detail',
   !!r.body.verbose && r.body.verbose.words.length === 8 && r.body.verbose.duration === 2.4);
ok('asking OpenAI for word and segment timings',
   sent.indexOf('response_format') >= 0 && sent.filter(k => k === 'timestamp_granularities[]').length === 2);

console.log('--- the pipeline builds its transcript without transcribing ---');
/* buildRichTranscript is unchanged and still takes exactly the shape it always
 * took — what changed is who produced it. */
// The thresholds the markers are derived from, lifted with the functions rather
// than restated here — a constant pasted into a test is a second copy of it.
const CONSTS = PIPE.slice(PIPE.indexOf('const HESITATION_RE'),
                          PIPE.indexOf('const MIN_FLAG_LENGTH') + 60);
const build = new Function('console',
  CONSTS + '\n' +
  grab(PIPE, 'function buildWordConfidenceMap(') + '\n' +
  grab(PIPE, 'function buildRichTranscript(') + '\nreturn buildRichTranscript;')(console);
const rich = build(OPENAI_SAID, 'Part 1');
ok('the enriched transcript carries the words',  /I fly the Airbus/.test(rich));
ok('and the acoustic markers the grader reads',  /\[Speech rate: \d+ WPM\]/.test(rich));

const code = strip(PIPE);
ok('the handler accepts pre-transcribed answers', /richResults = \[\]/.test(code));
/* Anchored on the whole condition, not on the name appearing somewhere near it.
 * The first version of this asserted only that the string "richResults.length"
 * sat above the audio path — so short-circuiting the branch to
 * `false && richResults.length` left every assertion in this file green. A test
 * that survives its subject being switched off is testing nothing. */
ok('and takes that branch on richResults alone',
   /\} else if \(richResults\.length\) \{/.test(code));
ok('ahead of the audio path',
   code.indexOf('else if (richResults.length)') < code.indexOf('if (!openaiKey)'));
ok('refusing plainly when none of them carry text',
   /No usable transcripts provided/.test(code));
// The audio path stays for the mock mode and anything still sending segments.
ok('the old audio path is still there for callers that need it',
   /transcribeSegment\(audioBase64, openaiKey\)/.test(code));

console.log('--- and the request now fits through the door ---');
/* The assertion that would have caught this. A realistic sitting: 24 answers,
 * ~150 words each with word timings and segment logprobs. Vercel's serverless
 * body limit is about 4.5 MB; the old payload was ~6 MB of base64 audio. */
function realisticAnswer(i) {
  const words = [];
  for (let w = 0; w < 150; w++) {
    words.push({ word: 'runway' + w, start: w * 0.4, end: w * 0.4 + 0.35 });
  }
  const segments = [];
  for (let g = 0; g < 12; g++) {
    segments.push({ id: g, start: g * 5, end: g * 5 + 5, avg_logprob: -0.31,
                    no_speech_prob: 0.02, text: 'cleared for takeoff runway two seven right' });
  }
  return { id: 'seg_' + i, partLabel: 'Part 2A',
           verbose: { text: 'cleared for takeoff '.repeat(30), words, segments, duration: 60 } };
}
const richResults = [];
for (let i = 0; i < 24; i++) richResults.push(realisticAnswer(i));
const bytes = Buffer.byteLength(JSON.stringify({ richResults, history: [], bank: 'VERSION_A' }));
console.log('        24 answers as transcripts: ' + Math.round(bytes / 1024) + ' KB');
ok('a full sitting is comfortably under Vercel\'s 4.5 MB body limit', bytes < 4.5 * 1024 * 1024);
ok('and under one megabyte, with room for longer answers', bytes < 1024 * 1024);

console.log('--- the client sends transcripts, not recordings ---');
const sc = strip(S);
ok('the exam asks for the acoustic detail',   /fetch\('\/api\/whisper\?verbose=1'/.test(sc));
ok('and keeps it per answer',                 /_t\.richResults\.push\(\{/.test(sc));
ok('it is cleared with the rest of the state', /_t\.richResults=\[\]/.test(sc));
ok('the pipeline call carries richResults',   /richResults: _t\.richResults,/.test(sc));
// This is the line that caused the 413.
ok('and no longer carries the recordings',    !/segments:\s*_t\.segments,/.test(sc));
/* The recordings stay on the device. They are still the durable evidence of what
 * was said, and the unheard-sitting guard still counts them to decide whether an
 * examination may be marked at all. */
ok('but the recordings are still kept',       /_t\.segments\.push\(\{/.test(sc));
ok('and still gate whether a sitting may be graded',
   /_t\.segments\.length === 0 && _heard\.answered < _heard\.asked \/ 2/.test(sc));

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
})();
