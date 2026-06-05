// Unit tests for Issue 2 — audio serial queue (no overlap)
// Run: node tests/audioQueue.test.js

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

// ---------- minimal stubs ----------

function makeAudio() {
  var handlers = {};
  var instance = {
    volume: 1,
    playbackRate: 1,
    currentTime: 0,
    _paused: false,
    _playing: false,
    addEventListener: function(event, fn, opts) {
      handlers[event] = fn;
    },
    removeEventListener: function(event, fn) {
      if (handlers[event] === fn) delete handlers[event];
    },
    pause: function() { this._paused = true; this._playing = false; },
    play: function() {
      this._playing = true;
      return { catch: function() {} };
    },
    // test helper — simulate audio finishing
    _fireEnded: function() {
      if (handlers['ended']) handlers['ended']();
    },
    _fireError: function() {
      if (handlers['error']) handlers['error']();
    }
  };
  return instance;
}

// ---------- logic under test (extracted from Scripts.html) ----------

var SimMedia = { atcAudio: null };
var AtcRadioEngine = { cancel: function() {}, speak: function(t, c, cb) { if (cb) cb(); } };
var AtcReplayGate  = { increment: function() {} };

var _audioFactory = makeAudio;
var _atcAudioGen  = 0;

function _atcPlaybackRate() { return 1.0; }

function _playAtcAudio(res, atcText, country, andThen) {
  var myGen = ++_atcAudioGen;

  if (SimMedia.atcAudio) {
    try { SimMedia.atcAudio.pause(); SimMedia.atcAudio.currentTime = 0; } catch (e) {}
    SimMedia.atcAudio = null;
  }
  AtcRadioEngine.cancel();

  try {
    var a = _audioFactory();
    a.volume = 1;
    a.playbackRate = _atcPlaybackRate();
    SimMedia.atcAudio = a;
    AtcReplayGate.increment();

    function _done() {
      if (_atcAudioGen !== myGen) return;
      if (SimMedia.atcAudio === a) SimMedia.atcAudio = null;
      if (andThen) andThen();
    }
    a.addEventListener('ended', _done, { once: true });
    a.addEventListener('error', _done, { once: true });

    a.play().catch(function() {
      if (_atcAudioGen !== myGen) return;
      a.removeEventListener('ended', _done);
      a.removeEventListener('error', _done);
      if (SimMedia.atcAudio === a) SimMedia.atcAudio = null;
      AtcRadioEngine.speak(atcText, country, andThen);
    });
  } catch (e) {
    if (_atcAudioGen !== myGen) return;
    AtcReplayGate.increment();
    AtcRadioEngine.speak(atcText, country, andThen);
  }
}

// ---------- tests ----------

console.log('\nIssue 2 — audio serial queue\n');

// 1. andThen does NOT fire immediately on play()
console.log('andThen timing:');
(function() {
  var andThenFired = false;
  _playAtcAudio({ audioBase64: 'abc' }, 'text', 'USA', function() { andThenFired = true; });
  assert('andThen not fired immediately after play()', andThenFired === false);
  // simulate audio ending
  SimMedia.atcAudio._fireEnded();
  assert('andThen fires after ended event', andThenFired === true);
  SimMedia.atcAudio = null;
})();

// 2. Previous audio is stopped when new segment starts
console.log('\nprevious audio stopped on new segment:');
(function() {
  var first = null;
  _playAtcAudio({ audioBase64: 'seg1' }, 'text1', 'USA', null);
  first = SimMedia.atcAudio;
  assert('first audio is playing', first && first._playing);

  // start second segment before first ends
  _playAtcAudio({ audioBase64: 'seg2' }, 'text2', 'USA', null);
  assert('first audio was paused', first._paused === true);
  assert('SimMedia.atcAudio is now the second segment', SimMedia.atcAudio !== first);
  SimMedia.atcAudio = null;
})();

// 3. andThen from segment 1 does not fire after segment 2 replaces it
console.log('\nstale andThen from replaced segment:');
(function() {
  var seg1Cb = 0;
  var seg2Cb = 0;

  _playAtcAudio({ audioBase64: 'seg1' }, 'text1', 'USA', function() { seg1Cb++; });
  var seg1Audio = SimMedia.atcAudio;

  // Replace with segment 2 before seg1 ends
  _playAtcAudio({ audioBase64: 'seg2' }, 'text2', 'USA', function() { seg2Cb++; });

  // Now fire seg1's ended — its _done still has reference but SimMedia.atcAudio !== seg1Audio
  seg1Audio._fireEnded();
  assert('seg1 andThen does not fire (audio was replaced)', seg1Cb === 0,
         'seg1Cb=' + seg1Cb);

  // Fire seg2 ended
  SimMedia.atcAudio._fireEnded();
  assert('seg2 andThen fires correctly', seg2Cb === 1, 'seg2Cb=' + seg2Cb);
  SimMedia.atcAudio = null;
})();

// 4. andThen fires via error event too
console.log('\nandThen fires on error event:');
(function() {
  var fired = false;
  _playAtcAudio({ audioBase64: 'abc' }, 'text', 'USA', function() { fired = true; });
  SimMedia.atcAudio._fireError();
  assert('andThen fires on audio error event', fired === true);
  SimMedia.atcAudio = null;
})();

// 5. SimMedia.atcAudio nulled after ended
console.log('\nSimMedia.atcAudio cleanup:');
(function() {
  _playAtcAudio({ audioBase64: 'abc' }, 'text', 'USA', null);
  assert('atcAudio set while playing', SimMedia.atcAudio !== null);
  SimMedia.atcAudio._fireEnded();
  assert('atcAudio nulled after ended', SimMedia.atcAudio === null);
})();

// ---------- summary ----------
console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
