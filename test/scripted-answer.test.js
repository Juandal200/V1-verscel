/* The answer the exam threw away.
 *
 * A C1 pilot sat the mock test, spoke every answer, and was awarded band 1 in
 * all six descriptors. The grading was right about what it was shown: every one
 * of his twenty-four answers reached the grader as the literal words
 * "(no answer given)".
 *
 * Nothing had failed. The microphone worked, the audio recorded at full length,
 * it uploaded, and OpenAI was PAID to transcribe it — that day was the highest
 * spend in the billing period. The transcripts came back correct and were
 * dropped on arrival, by three lines:
 *
 *     function _scOnce(fn) {
 *       var used = false;
 *       return function () { if (used) return; used = true; try { fn(); } catch (e) {} };
 *     }
 *
 * fn() — bare. _scOnce guards four callbacks and two of them carry the only
 * thing the exam exists to collect. `String(undefined || '(no answer given)')`
 * did the rest.
 *
 * This runs the real _scRecord against a fake microphone and a successful
 * Whisper response, and asserts the words the candidate said arrive at the
 * caller. It would have been red every day this product has existed. */
const fs = require('fs');
const S = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
const code = strip(S);

function grab(sig) {
  const i = S.indexOf(sig);
  if (i < 0) throw new Error('not found: ' + sig);
  let d = 0;
  for (let k = S.indexOf('{', i); k < S.length; k++) {
    if (S[k] === '{') d++;
    else if (S[k] === '}') { d--; if (!d) return S.slice(i, k + 1); }
  }
}

const SPOKEN = 'I fly the Airbus A320 out of Bogota on short haul sectors';

/* ── the real _scRecord, on a fake microphone ─────────────────────────────── */
function record(whisperResponse) {
  return new Promise(function (resolve) {
    let rec = null;
    const _sc = {};
    const _t  = { segments: [] };
    class FakeRecorder {
      static isTypeSupported() { return true; }
      constructor(stream, opts) { this.mimeType = (opts||{}).mimeType || 'audio/webm'; this.state = 'inactive'; rec = this; }
      start() { this.state = 'recording'; }
      stop()  { this.state = 'inactive'; this.ondataavailable({ data: { size: 4096 } }); this.onstop(); }
    }
    const stubs = {
      navigator: { mediaDevices: { getUserMedia: () => Promise.resolve({ active: true, getAudioTracks: () => [], getTracks: () => [] }) } },
      window: { MediaRecorder: FakeRecorder },
      MediaRecorder: FakeRecorder,
      _scMicStream: () => Promise.resolve({ active: true, getAudioTracks: () => [], getTracks: () => [] }),
      _scTyped: () => {},
      _sc, _t,
      _teaVizMic: () => {}, _teaVizStop: () => {}, _setStatus: () => {}, _scClearTimer: () => {},
      Blob: class { constructor(parts, o) { this.parts = parts; this.type = (o||{}).type; } },
      FileReader: class { readAsDataURL() { this.result = 'data:audio/webm;base64,QUJD'; if (this.onloadend) this.onloadend(); } },
      fetch: () => Promise.resolve({ json: () => Promise.resolve(whisperResponse) }),
      Promise, Error, String, Number, console,
    };
    const src = [grab('function _scOnce(fn)'), grab('function _scRecord(step, done)'),
                 'return _scRecord;'].join('\n');
    const _scRecord = new Function(...Object.keys(stubs), src)(...Object.values(stubs));

    // Verbatim the shape _scAsk uses (Scripts.html:28762): whatever arrives here
    // is what the grader is given.
    _scRecord({ id: 'q1', answerSeconds: 110 }, function (transcript) {
      resolve({ given: transcript,
                history: String(transcript || '(no answer given)'),
                segments: _t.segments.length });
    });
    setTimeout(function () { _sc.stop(); }, 0);
  });
}

(async () => {
console.log('--- a transcript reaches the exam ---');
let r = await record({ ok: true, transcript: SPOKEN });
ok('the callback is given what Whisper returned', r.given === SPOKEN);
ok('and that is what the grader is shown',        r.history === SPOKEN);
ok('not the words that replaced it',              r.history !== '(no answer given)');
ok('the recording is kept as evidence',           r.segments === 1);

console.log('--- and a take that really was empty still reads as one ---');
// The guard this bug hid behind must keep working: silence is still silence.
r = await record({ ok: true, transcript: '' });
ok('an empty transcript is recorded as no answer', r.history === '(no answer given)');
r = await record({ ok: false, error: 'Whisper API error' });
ok('and so is a failed transcription',             r.history === '(no answer given)');

console.log('--- the helper forwards, and fires once ---');
const _scOnce = new Function(grab('function _scOnce(fn)') + '\nreturn _scOnce;')();
let seen = [];
const g = _scOnce(function (v) { seen.push(v); });
g('first'); g('second');
ok('the argument survives the wrapper', seen[0] === 'first');
ok('and it still only fires once',      seen.length === 1);
// A throwing callback must not escape — four call sites rely on that.
let threw = false;
try { _scOnce(function () { throw new Error('boom'); })(); } catch (e) { threw = true; }
ok('a throwing callback is still swallowed', threw === false);

console.log('--- the typed path carries its answer too ---');
// _scTyped passes the textarea contents through the same helper.
ok('it sends the value, not nothing',
   /done\(v \? String\(v\.value \|\| ''\) : ''\);/.test(code));
ok('through the same guard',
   /function _scTyped\(step, done, notice\) \{\s*\n\s*done = _scOnce\(done\);/.test(code));

console.log('--- forwarding is safe for the other two consumers ---');
/* _scSpeak's done is assigned to el.onended, so it now forwards a DOM Event.
 * That is harmless only while every caller ignores its parameters. */
ok('_scSpeak still hands its callback to onended', /el\.onended = done;/.test(code));
ok('and _scNextStep declares no parameter to receive it',
   /function _scNextStep\(\) \{/.test(code));
ok('_scAsk still calls its own done bare',
   /_t\.history\.push\(\{ role: 'user', content: String\(transcript \|\| '\(no answer given\)'\) \}\);\s*\n\s*done\(\);/.test(code));

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
})();
