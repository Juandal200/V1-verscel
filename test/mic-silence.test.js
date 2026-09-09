/* Saying nothing scored full marks.
 *
 * A student opened a level, tapped the microphone, said nothing at all, tapped
 * it again — and the correct read-back appeared in the box and was graded. It
 * took three things at once:
 *
 *   the recorder's only test was `e.data.size > 0`, and silence has bytes;
 *   the scenario's expected read-back was sent to Whisper as its bias prompt;
 *   Whisper at temperature 0, given no signal, returns the prompt.
 *
 * So the answer left with the audio and came back as the transcript. It defeated
 * the replay gate — "ATC TEXT HIDDEN — UNLOCKS AFTER 4 REPLAYS" — and wrote a
 * false attempt to the Attempts sheet.
 *
 * This suite runs the real recorder. The mic IIFE is lifted out of Scripts.html
 * and executed in a VM against a fake microphone, so what is being tested is the
 * shipped startMicInput and not a description of it: the takes below are
 * waveforms, and what the suite asserts is whether a request was made. */
const fs = require('fs');
const vm = require('vm');

const S = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
const W = fs.readFileSync(__dirname + '/../api/whisper.mjs', 'utf8');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');

/* ── the real IIFE, lifted whole ──────────────────────────────────────────── */
const start = S.indexOf('/* ── Global mic utility');
const end   = S.indexOf('}());', start);
if (start < 0 || end < 0) { console.log('  FAIL  could not find the mic IIFE'); process.exit(1); }
const MIC_SRC = S.slice(start, end + 5);

/* ── a fake microphone ────────────────────────────────────────────────────── */
function el(id) {
  const e = {
    id, value: '', innerHTML: '', textContent: '', disabled: false,
    _attrs: {}, children: [],
    classList: { _s: new Set(),
      add(...c){c.forEach(x=>this._s.add(x));}, remove(...c){c.forEach(x=>this._s.delete(x));},
      contains(c){return this._s.has(c);} },
    focus(){}, dispatchEvent(){}, setAttribute(k,v){this._attrs[k]=v;},
    getAttribute(k){return k in this._attrs ? this._attrs[k] : null;},
    remove(){ if (this.parentNode) this.parentNode.children =
                this.parentNode.children.filter(c => c !== this); },
    querySelector(sel){ return this.children.find(c => '.'+c.className === sel) || null; },
  };
  e.parentNode = null;
  return e;
}
function makeParent(child) {
  const p = el('parent');
  p.children = [child];
  child.parentNode = p;
  p.insertBefore = (node, before) => { p.children.push(node); node.parentNode = p; };
  return p;
}

/* A take is a level in raw byte units either side of the 128 midpoint, sampled
 * once per meter tick. RMS works out to exactly level/128, so every number below
 * is a value the shipped thresholds can be read against directly. */
function run(take) {
  return new Promise(resolve => {
    const ta   = el('answerBox');
    const btn  = el('micBtn');
    const parent = makeParent(btn);
    let tick = 0;
    const calls = [];
    let recorder = null;

    const doc = {
      getElementById: id => (id === 'answerBox' ? ta : id === 'micBtn' ? btn : null),
      createElement: () => el('made'),
    };
    class FakeRecorder {
      static isTypeSupported() { return true; }
      constructor(stream, opts) { this.mimeType = (opts||{}).mimeType || 'audio/webm'; this.state='inactive'; recorder=this; }
      start() { this.state = 'recording'; }
      stop() {
        this.state = 'inactive';
        this.ondataavailable({ data: { size: take.bytes } });
        this.onstop();
      }
    }
    // In a browser `window` IS the global object, and startMicInput reads AppState
    // bare. A context whose window is some other object would not be the same
    // scope the shipped code runs in.
    const g = {
      uiIconInline: () => '<svg/>',
      AppState: { training: { scenarios: [{ expectedReadback: take.expected }], currentIndex: 0 } },
      document: doc, console,
      navigator: { mediaDevices: { getUserMedia: () => Promise.resolve({ active: true, getTracks: () => [] }) } },
      MediaRecorder: FakeRecorder,
      Blob: class { constructor(parts){ this.parts = parts; } },
      Event: class { constructor(t){ this.type = t; } },
      AudioContext: class {
        resume(){} close(){}
        createMediaStreamSource(){ return { connect(){} }; }
        createAnalyser(){ return { fftSize: 2048, getByteTimeDomainData(buf) {
          const lvl = take.level(tick++);
          for (let i = 0; i < buf.length; i++) buf[i] = 128 + (i % 2 ? lvl : -lvl);
        } }; }
      },
      Uint8Array, Promise, Date, Math, String, Number, JSON, setTimeout, clearTimeout,
      setInterval, clearInterval, alert: () => {},
      fetch: (url, opt) => { calls.push({ url, opt }); return Promise.resolve({
        json: () => Promise.resolve({ ok: true, transcript: take.transcript }) }); },
    };
    g.window = g;
    const ctx = vm.createContext(g);
    const win = g;
    vm.runInContext(MIC_SRC, ctx);

    let got = null;
    win.startMicInput('answerBox', 'micBtn', take.pass, t => { got = t; });
    setTimeout(() => {
      win.startMicInput('answerBox', 'micBtn');            // second tap → stop
      setTimeout(() => {
        const notice = parent.children.find(c => c.className === 'mic-notice');
        resolve({ calls, box: ta.value, onTranscript: got, btn,
                  notice: notice ? notice.textContent : null });
      }, 60);
    }, take.ms);
  });
}

const level = k => () => k;                      // flat: a room, boosted or not
const bursty = (lo, hi) => i => (i % 3 === 0 ? hi : lo);
const CLEARANCE = 'Runway two seven right cleared for takeoff wind two four zero at eight';

(async () => {
console.log('--- silence never leaves the browser ---');
/* The bug as reported: tap, say nothing, tap. Whisper would have answered with
 * the prompt, so what has to be asserted is that it was never asked. */
let r = await run({ ms: 700, bytes: 4096, level: level(2), transcript: CLEARANCE,
                    expected: CLEARANCE, pass: '' });
ok('a silent take makes no request',        r.calls.length === 0);
ok('nothing is written into the box',       r.box === '');
ok('and no answer is handed to the grader', r.onTranscript === null);
ok('the student is told why',
   r.notice === 'We didn’t hear anything — tap to speak again.');
ok('and the button is usable again',        r.btn.disabled === false);
ok('with no processing state left on it',   !r.btn.classList.contains('processing'));

console.log('--- automatic gain control cannot fake a voice ---');
/* getUserMedia turns AGC on by default, and AGC with nothing to work on lifts
 * the room's noise floor until it meets the target. Peak alone would pass this
 * take: 9/128 is 0.070, well over the 0.02 floor. It is flat, and speech is not. */
r = await run({ ms: 700, bytes: 4096, level: level(9), transcript: CLEARANCE,
                expected: CLEARANCE, pass: '' });
ok('a loud flat room still makes no request', r.calls.length === 0);
ok('and still says so',
   r.notice === 'We didn’t hear anything — tap to speak again.');

console.log('--- and a real answer goes through ---');
r = await run({ ms: 4000, bytes: 4096, level: bursty(3, 30), transcript: CLEARANCE,
                expected: CLEARANCE, pass: '' });
ok('a spoken take is sent',                 r.calls.length === 1);
ok('the transcript reaches the box',        r.box === CLEARANCE);
ok('and the grader is given it',            r.onTranscript !== null);
// The whole point of the exercise is to say the clearance back word for word.
// A guard that rejected an exact match would fail every student who got it right.
ok('an exact, correct read-back is NOT rejected as an echo',
   r.onTranscript !== null && r.calls.length === 1);

/* A quiet speaker on a low-gain microphone peaks at 12/128 = 0.094, under the
 * loudness threshold. The dynamics carry it: 0.094 over a 0.031 median is 3.0.
 * This is the direction that matters most — rejecting a real answer is worse
 * than the exploit, which at least takes deliberate silence to trigger. */
r = await run({ ms: 4000, bytes: 4096, level: bursty(4, 12), transcript: CLEARANCE,
                expected: CLEARANCE, pass: '' });
ok('a quiet but real voice is not turned away', r.calls.length === 1);

console.log('--- the answer is not in the request ---');
r = await run({ ms: 4000, bytes: 4096, level: bursty(3, 30), transcript: CLEARANCE,
                expected: CLEARANCE, pass: CLEARANCE });
const hdrs = r.calls[0].opt.headers;
ok('no expected-readback header is sent',   !('X-Expected-Readback' in hdrs));
ok('no header carries the clearance',
   !Object.keys(hdrs).some(k => String(hdrs[k]).indexOf('cleared for takeoff') >= 0));
ok('the request is the audio and its type', Object.keys(hdrs).join() === 'Content-Type');
// Even when the caller passes the answer in explicitly, which the ICAO test and
// the exam both do through AppState.
ok('and nothing in Scripts.html builds that header any more',
   !/X-Expected-Readback/.test(S));

console.log('--- nor in the prompt the proxy sends ---');
ok('the proxy no longer reads the header',  !/x-expected-readback/i.test(W));
ok('the prompt is the vocabulary, nothing else',
   /formData\.append\('prompt', PHRASEOLOGY\);/.test(strip(W)));
ok('with no scenario text appended to it',
   !/PHRASEOLOGY \+ ' ' \+/.test(strip(W)));
// The disambiguation the prompt exists for survives: it is what separates
// "turn right" from "tongue right", and both headings are still in the list.
ok('and it still contains both headings',
   /turn left heading, turn right heading/.test(W));
ok('the temperature is still pinned',       /formData\.append\('temperature', '0'\)/.test(strip(W)));

console.log('--- an echo is rejected if one ever gets back ---');
/* The collision guard. Word-for-word equal to the expected read-back, off audio
 * that could not have contained it: four words a second is faster than anyone
 * reads back a clearance, and this take is 700ms for thirteen words.
 *
 * It is loud enough to be sent — that is the point. The silence gate is in front
 * of this, so the low-volume clause of the guard is now a second line rather
 * than a live one; the length clause is what fires. */
r = await run({ ms: 700, bytes: 4096, level: bursty(3, 30), transcript: CLEARANCE,
                expected: CLEARANCE, pass: CLEARANCE });
ok('the take is sent',                      r.calls.length === 1);
ok('but the echo is not written to the box', r.box === '');
ok('nor handed to the grader',              r.onTranscript === null);
ok('and it is reported as not heard',
   r.notice === 'We didn’t hear anything — tap to speak again.');

// Same length of audio, a transcript short enough to have fitted in it.
r = await run({ ms: 700, bytes: 4096, level: bursty(3, 30), transcript: 'Roger wilco',
                expected: CLEARANCE, pass: CLEARANCE });
ok('a short real answer in short audio still goes through', r.onTranscript !== null);

console.log('--- the notice clears on the next tap ---');
ok('the notice is removed rather than hidden',
   /if \(!text\) \{ if \(el\) el\.remove\(\); return; \}/.test(S));
ok('and every tap clears it first',
   /var btn = document\.getElementById\(btnId\);\s*\n\s*_micNotice\(btn, ''\);/.test(S));
ok('it is announced, not just drawn',       /setAttribute\('role', 'status'\)/.test(S));
ok('and it is styled',
   /\.mic-notice \{/.test(fs.readFileSync(__dirname + '/../Styles.html', 'utf8')));

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
})();
