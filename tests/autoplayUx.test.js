/* What happens when the clearance stops playing.
 *
 * The old suite built a makeEnv() that reimplemented the three things
 * _onAutoplayDone does, then asserted its own reimplementation. It could not
 * have failed if the product changed, which is the only reason a test exists.
 *
 * _onAutoplayDone is a nested function inside the simulator's media setup, so it
 * closes over byId, SimAudio and prefetchNextScenarioAudio rather than importing
 * them. Lifted with those supplied, it runs exactly as it does in the browser.
 *
 * The behaviour matters beyond tidiness. The Replay button is disabled while the
 * clearance speaks and the hint says so; if this stops running, the student is
 * left looking at a dead button under a label claiming audio is still playing —
 * which is what F-0011 found when Retry skipped autoplay and nobody re-enabled
 * either. */
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

console.log('\nautoplay hand-back, from Scripts.html\n');
const body = grab('function _onAutoplayDone(');
assert('_onAutoplayDone found in source', !!body);
if (!body) { console.error('\ncannot continue'); process.exit(1); }

function env(withDom) {
  const btn  = { disabled: true, style: {} };
  const hint = { style: { display: 'block' } };
  const els  = withDom ? { atcReplayBtn: btn, atcAutoplayHint: hint } : {};
  const seen = { prefetch: 0, chime: 0 };
  const fn = new Function('byId', 'SimAudio', 'prefetchNextScenarioAudio',
    body + '\nreturn _onAutoplayDone;'
  )(id => els[id] || null,
    { chimeUnlock() { seen.chime++; } },
    () => { seen.prefetch++; });
  return { btn, hint, seen, done: fn };
}

console.log('the button and the hint are handed back:');
let e = env(true);
assert('the button starts disabled', e.btn.disabled === true);
assert('the hint starts visible',    e.hint.style.display !== 'none');
e.done();
assert('the button is re-enabled',   e.btn.disabled === false);
assert('and the hint is hidden',     e.hint.style.display === 'none');

console.log('\nand the next clearance is fetched, but not before:');
e = env(true);
assert('no prefetch while the clearance is still playing', e.seen.prefetch === 0);
e.done();
assert('prefetch runs once it finishes', e.seen.prefetch === 1);
assert('the unlock chime plays too',     e.seen.chime === 1);

console.log('\nand a missing DOM does not take the turn down:');
e = env(false);
let threw = false;
try { e.done(); } catch (err) { threw = true; }
assert('no crash when neither element is present', threw === false);
// The prefetch is the part that must survive: the student can be on the next
// scenario before its audio exists otherwise.
assert('the prefetch still happens', e.seen.prefetch === 1);

console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed ? 1 : 0);
