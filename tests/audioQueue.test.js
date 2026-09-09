/* The ATC audio queue: one clearance at a time, and the callback that follows it.
 *
 * The old suite pasted its own _playAtcAudio in and reduced _atcPlaybackRate to
 * `return 1.0`, which is the whole function gone. What it tested was a sketch of
 * the product from whenever somebody last copied it.
 *
 * Both are lifted from Scripts.html now. The collaborators are recording stubs
 * rather than hand-written fakes: a Proxy answers any method the real function
 * reaches for and logs the name, so the suite does not need updating every time
 * the audio path calls one more thing — and the log is worth asserting on.
 *
 * ONE ASSERTION FROM THE OLD SUITE IS GONE ON PURPOSE. It checked that starting
 * a second segment left SimMedia.atcAudio pointing at a DIFFERENT object. The
 * product reuses a single <audio> element (_simAudioEl) — createMediaElementSource
 * may be called only once per element, which is why — so the identity test can
 * never pass again and never should. What matters is the same thing it was
 * really asking: the second clearance replaced the first. That is asserted on
 * the src being set again and the engine being cancelled. */
'use strict';
const fs = require('fs');
const S  = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');

function grab(sig) {
  const i = S.indexOf(sig); if (i < 0) return null;
  let d = 0;
  for (let k = S.indexOf('{', i); k < S.length; k++) {
    if (S[k] === '{') d++; else if (S[k] === '}') { d--; if (!d) return S.slice(i, k + 1); }
  }
  return null;
}

let passed = 0, failed = 0;
function assert(label, condition, detail) {
  if (condition) { console.log('  ✓ ' + label); passed++; }
  else { console.error('  ✗ ' + label + (detail ? ' — ' + detail : '')); failed++; }
}

const calls = [];
const spy = (name, real) => new Proxy(real || {}, { get(t, p) {
  if (p in t) return t[p];
  if (typeof p !== 'string') return undefined;
  return function () { calls.push(name + '.' + p); };
}});

function makeEl() {
  const h = {};
  return {
    _playing: false, _paused: false, _srcSet: 0, currentTime: 0, volume: 1, playbackRate: 1,
    addEventListener: (e, f) => { h[e] = f; }, removeEventListener: e => { delete h[e]; },
    play() { this._playing = true; this._paused = false; return { catch() {} }; },
    pause() { this._paused = true; this._playing = false; },
    _fire(e) { if (h[e]) h[e](); },
    set src(v) { this._srcSet++; this._src = v; }, get src() { return this._src; },
    set onended(f) { h.ended = f; }, set onerror(f) { h.error = f; },
  };
}

const EL = makeEl();
const SimMedia = { atcAudio: null, bgCtx: null };
const stubs = {
  SimMedia,
  SimAudio:       spy('SimAudio'),
  AtcReplayGate:  spy('AtcReplayGate'),
  AtcRadioEngine: spy('AtcRadioEngine', {
    cancel() { calls.push('AtcRadioEngine.cancel'); },
    speak(t, c, cb) { calls.push('AtcRadioEngine.speak'); if (cb) cb(); },
  }),
  _simAudioEl: () => EL, _showVoiceBadge() {}, _atcLevelFactor: () => 1, _simUnvoiced() {},
  console:  { log() {}, warn() {}, error() {} },
  document: { getElementById: () => null, querySelector: () => null, createElement: () => makeEl() },
  window:   {},
};

console.log('\nthe ATC audio queue, lifted from Scripts.html\n');
const rateFn = grab('function _atcPlaybackRate(');
const playFn = grab('function _playAtcAudio(');
assert('_atcPlaybackRate found in source', !!rateFn);
assert('_playAtcAudio found in source',    !!playFn);
if (!rateFn || !playFn) { console.error('\ncannot continue'); process.exit(1); }

const api = new Function(...Object.keys(stubs),
  rateFn + '\n' + playFn + '\nvar _atcAudioGen = 0;' +
  '\nreturn { _playAtcAudio: _playAtcAudio, _atcPlaybackRate: _atcPlaybackRate };'
)(...Object.values(stubs));

console.log('\nandThen waits for the clip to finish:');
let fired = false;
calls.length = 0;
api._playAtcAudio({ audioBase64: 'abc', voiceName: 'v' }, 'text', 'USA', () => { fired = true; });
assert('not fired immediately after play()', fired === false);
assert('the reused element is the one playing', SimMedia.atcAudio === EL);
// Autoplay is the clearance arriving, not a replay — F-0014. The gate is still
// told, so the count exists; what it must not do is charge a listen.
assert('the replay gate is told about the autoplay', calls.includes('AtcReplayGate.increment'));
EL._fire('ended');
assert('fires on the ended event', fired === true);
assert('and the element is released', SimMedia.atcAudio === null);

console.log('\na second clearance replaces the first:');
calls.length = 0;
let c1 = 0, c2 = 0;
api._playAtcAudio({ audioBase64: 's1' }, 't1', 'USA', () => { c1++; });
const srcAfterFirst = EL._srcSet;
api._playAtcAudio({ audioBase64: 's2' }, 't2', 'USA', () => { c2++; });
assert('the element is loaded again', EL._srcSet === srcAfterFirst + 1);
assert('and the speech engine is cancelled', calls.includes('AtcRadioEngine.cancel'));

console.log('\nthe replaced segment does not call back:');
EL._fire('ended');
assert('segment 1 callback never fires', c1 === 0, 'fired ' + c1 + ' times');
assert('segment 2 callback fires once',  c2 === 1, 'fired ' + c2 + ' times');

console.log('\nan error ends the turn rather than hanging it:');
let errFired = false;
api._playAtcAudio({ audioBase64: 'boom' }, 't', 'USA', () => { errFired = true; });
EL._fire('error');
assert('andThen runs on the error event', errFired === true);

/* The rate was stubbed to `return 1.0`, which is the entire point of the
 * function removed: a cached clip replayed at a fixed speed is what made the
 * simulator sound flat. */
console.log('\nplayback speed actually varies:');
const auto   = Array.from({ length: 40 }, () => api._atcPlaybackRate(0));
const manual = Array.from({ length: 40 }, () => api._atcPlaybackRate(1));
assert('autoplay is not a constant', new Set(auto).size > 1);
assert('autoplay stays within 0.94–1.08',
       Math.min(...auto) >= 0.94 && Math.max(...auto) <= 1.08,
       Math.min(...auto).toFixed(3) + '–' + Math.max(...auto).toFixed(3));
assert('a manual replay is never slower than real time', Math.min(...manual) >= 1.0);
/* The comment above the function says "between 1.0x and 1.5x"; the code is
 * 1.0 + Math.random() * 0.3, so the ceiling is 1.3. The code is asserted, and
 * the disagreement is left for a ticket rather than fixed here. */
assert('and a manual replay stays within the range the CODE sets (1.0–1.3)',
       Math.max(...manual) <= 1.3, Math.max(...manual).toFixed(3));

console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed ? 1 : 0);
