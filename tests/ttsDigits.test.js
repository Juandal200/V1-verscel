// Unit tests for Issue 3 — digit-by-digit TTS preprocessing
// Run: node tests/ttsDigits.test.js

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

// ---------- _expandDigitsIcao_ (from TTSService.js) ----------

function expandDigitsIcao(numStr) {
  return String(numStr || '').split('').join(' ');
}

// ---------- _prepBrowserTts (from Scripts.html AtcRadioEngine) ----------

function prepBrowserTts(text) {
  return String(text || '').replace(/\b(\d+)\b/g, function(_, n) {
    return n.split('').join(' ');
  });
}

// ---------- minimal prepareAtcPronunciation_ (server-side path) ----------
// Reproduces only the digit-expansion steps to keep the test self-contained.

function prepareAtcPronunciation(text) {
  var out = String(text || '').trim();

  // FL: flight level
  out = out.replace(/\bFL\s*(\d{1,4})\b/gi, function(_, n) {
    return 'flight level ' + expandDigitsIcao(n);
  });

  // Frequencies
  out = out.replace(/\b(\d{3})\.(\d{1,3})\b/g, function(_, i, d) {
    return expandDigitsIcao(i) + ' decimal ' + expandDigitsIcao(d);
  });

  // Runway
  out = out.replace(/\b(?:RUNWAY|RWY)\s+(\d{1,2})([LRClrc]?)\b/gi, function(_, num, side) {
    var sides = { L:'left', l:'left', R:'right', r:'right', C:'center', c:'center' };
    var sideWord = sides[side] ? ' ' + sides[side] : '';
    var padded = num.length === 1 ? '0' + num : num;
    return 'runway ' + expandDigitsIcao(padded) + sideWord;
  });

  // Heading
  out = out.replace(/\b(?:HEADING|HDG)\s+(\d{3})\b/gi, function(_, h) {
    return 'heading ' + expandDigitsIcao(h);
  });

  // Catch-all digit groups (5,4,3,2 digits then single)
  out = out.replace(/\b(\d{5})\b/g, function(_, n) { return expandDigitsIcao(n); });
  out = out.replace(/\b(\d{4})\b/g, function(_, n) { return expandDigitsIcao(n); });
  out = out.replace(/\b(\d{3})\b/g, function(_, n) { return expandDigitsIcao(n); });
  out = out.replace(/\b(\d{2})\b/g, function(_, n) { return expandDigitsIcao(n); });
  out = out.replace(/\b(\d)\b/g,    function(_, n) { return n; });

  return out;
}

// ---------- tests ----------

console.log('\nIssue 3 — digit-by-digit TTS preprocessing\n');

// Core spec examples
console.log('_expandDigitsIcao_ spec examples:');
assert('"230" → "2 3 0"', expandDigitsIcao('230') === '2 3 0',
       'got "' + expandDigitsIcao('230') + '"');
assert('"27"  → "2 7"',  expandDigitsIcao('27')  === '2 7',
       'got "' + expandDigitsIcao('27') + '"');
assert('"12"  → "1 2"',  expandDigitsIcao('12')  === '1 2',
       'got "' + expandDigitsIcao('12') + '"');

// Additional digit lengths
console.log('\nAdditional lengths:');
assert('single digit "5" → "5"', expandDigitsIcao('5') === '5');
assert('4-digit "7700" → "7 7 0 0"', expandDigitsIcao('7700') === '7 7 0 0');
assert('5-digit "10000" → "1 0 0 0 0"', expandDigitsIcao('10000') === '1 0 0 0 0');

// Server-side prepareAtcPronunciation_ pipeline
console.log('\nprepareAtcPronunciation_ pipeline:');
assert('heading "HEADING 230" contains "2 3 0"',
       prepareAtcPronunciation('HEADING 230').indexOf('2 3 0') !== -1,
       'got "' + prepareAtcPronunciation('HEADING 230') + '"');

assert('runway "RUNWAY 27" contains "2 7"',
       prepareAtcPronunciation('RUNWAY 27').indexOf('2 7') !== -1,
       'got "' + prepareAtcPronunciation('RUNWAY 27') + '"');

assert('frequency "118.7" contains "1 1 8" and "7"',
       prepareAtcPronunciation('118.7').indexOf('1 1 8') !== -1 &&
       prepareAtcPronunciation('118.7').indexOf('7') !== -1,
       'got "' + prepareAtcPronunciation('118.7') + '"');

assert('flight level "FL250" contains "2 5 0"',
       prepareAtcPronunciation('FL250').indexOf('2 5 0') !== -1,
       'got "' + prepareAtcPronunciation('FL250') + '"');

// Browser TTS preprocessor
console.log('\n_prepBrowserTts (browser fallback path):');
assert('"230" in sentence',
       prepBrowserTts('heading 230').indexOf('2 3 0') !== -1,
       'got "' + prepBrowserTts('heading 230') + '"');
assert('"27" in sentence',
       prepBrowserTts('runway 27').indexOf('2 7') !== -1,
       'got "' + prepBrowserTts('runway 27') + '"');
assert('"12" in sentence',
       prepBrowserTts('climb to 12000').indexOf('1 2') !== -1,
       'got "' + prepBrowserTts('climb to 12000') + '"');
assert('non-digit text unchanged',
       prepBrowserTts('cleared ILS approach') === 'cleared ILS approach');

// ---------- summary ----------
console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
