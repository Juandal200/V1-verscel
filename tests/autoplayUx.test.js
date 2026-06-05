// Unit tests for Issue 6 — autoplay UX (disable replay button, hide hint after ended)
// Run: node tests/autoplayUx.test.js

'use strict';

var passed = 0;
var failed = 0;

function assert(label, condition, detail) {
  if (condition) {
    console.log('  ✓ ' + label);
    passed++;
  } else {
    console.error('  ✗ ' + label + (detail ? ' — ' + detail : ''));
    failed++;
  }
}

// ---------- DOM stubs ----------

function makeBtn() {
  return { disabled: false, _id: 'atcReplayBtn' };
}

function makeHint() {
  return { style: { display: '' }, _id: 'atcAutoplayHint' };
}

// ---------- logic under test (extracted from Scripts.html simMediaAutoPlayAtc) ----------

function makeEnv() {
  var btn  = makeBtn();
  var hint = makeHint();
  var dom  = { atcReplayBtn: btn, atcAutoplayHint: hint };

  function byId(id) { return dom[id] || null; }

  var prefetchCalled = false;
  function prefetchNextScenarioAudio() { prefetchCalled = true; }

  // The block of code extracted verbatim from simMediaAutoPlayAtc
  var _replayBtn = byId('atcReplayBtn');
  if (_replayBtn) _replayBtn.disabled = true;

  function _onAutoplayDone() {
    var b = byId('atcReplayBtn');
    var h = byId('atcAutoplayHint');
    if (b) b.disabled = false;
    if (h) h.style.display = 'none';
    prefetchNextScenarioAudio();
  }

  return {
    btn: btn,
    hint: hint,
    _onAutoplayDone: _onAutoplayDone,
    getPrefetchCalled: function() { return prefetchCalled; }
  };
}

// ---------- tests ----------

console.log('\nIssue 6 — autoplay UX\n');

console.log('button disabled during autoplay:');
(function() {
  var env = makeEnv();
  assert('button is disabled immediately after autoplay starts', env.btn.disabled === true);
})();

console.log('\nbutton re-enabled after ended:');
(function() {
  var env = makeEnv();
  assert('button starts disabled',   env.btn.disabled === true);
  env._onAutoplayDone();
  assert('button re-enabled after _onAutoplayDone()', env.btn.disabled === false);
})();

console.log('\nhint hidden after ended:');
(function() {
  var env = makeEnv();
  assert('hint visible at start', env.hint.style.display !== 'none');
  env._onAutoplayDone();
  assert('hint hidden after _onAutoplayDone()', env.hint.style.display === 'none');
})();

console.log('\nprefetchNextScenarioAudio called via _onAutoplayDone:');
(function() {
  var env = makeEnv();
  assert('prefetch not called yet', env.getPrefetchCalled() === false);
  env._onAutoplayDone();
  assert('prefetch called after _onAutoplayDone()', env.getPrefetchCalled() === true);
})();

console.log('\nnull DOM (no crash when elements missing):');
(function() {
  var prefetchCalled = false;
  function prefetchNextScenarioAudio() { prefetchCalled = true; }
  function byId() { return null; }

  var _replayBtn = byId('atcReplayBtn');
  if (_replayBtn) _replayBtn.disabled = true;

  function _onAutoplayDone() {
    var b = byId('atcReplayBtn');
    var h = byId('atcAutoplayHint');
    if (b) b.disabled = false;
    if (h) h.style.display = 'none';
    prefetchNextScenarioAudio();
  }

  var threw = false;
  try { _onAutoplayDone(); } catch (e) { threw = true; }
  assert('no crash when DOM elements are absent', threw === false);
  assert('prefetch still called', prefetchCalled === true);
})();

// ---------- summary ----------
console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
