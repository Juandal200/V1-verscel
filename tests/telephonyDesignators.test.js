// Unit tests for Issue 4 — telephony designator TTS preprocessing
// Run: node tests/telephonyDesignators.test.js

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

// ---------- stubs (mirrors TTSService.js logic) ----------

var TELEPHONY_DESIGNATORS = [
  'FASTAIR','SPEEDBIRD','CACTUS','REACH',
  'UNITED','AMERICAN','DELTA','BRITISH'
];

function expandDigitsIcao(numStr) {
  return String(numStr || '').split('').join(' ');
}

function prepareAtcPronunciation(text) {
  var out = String(text || '').trim().toUpperCase();

  // 10b. Telephony designators (the step under test)
  var tdPattern = new RegExp(
    '\\b(' + TELEPHONY_DESIGNATORS.join('|') + ')\\s+(\\d{1,4})(?:\\s+(HEAVY|SUPER))?\\b', 'gi'
  );
  out = out.replace(tdPattern, function(_, designator, num, suffix) {
    return designator.charAt(0).toUpperCase() + designator.slice(1).toLowerCase() +
           ' ' + expandDigitsIcao(num) +
           (suffix ? ' ' + suffix.toLowerCase() : '');
  });

  return out;
}

// ---------- tests ----------

console.log('\nIssue 4 — telephony designator preprocessing\n');

// Core seeded designators
console.log('Seeded designators:');
assert('SPEEDBIRD 217 HEAVY → "Speedbird 2 1 7 heavy"',
       prepareAtcPronunciation('SPEEDBIRD 217 HEAVY') === 'Speedbird 2 1 7 heavy',
       'got "' + prepareAtcPronunciation('SPEEDBIRD 217 HEAVY') + '"');

assert('DELTA 123 → "Delta 1 2 3" (not skipped)',
       prepareAtcPronunciation('DELTA 123') === 'Delta 1 2 3',
       'got "' + prepareAtcPronunciation('DELTA 123') + '"');

assert('CACTUS 444 → "Cactus 4 4 4"',
       prepareAtcPronunciation('CACTUS 444') === 'Cactus 4 4 4',
       'got "' + prepareAtcPronunciation('CACTUS 444') + '"');

assert('UNITED 1 → "United 1"',
       prepareAtcPronunciation('UNITED 1') === 'United 1',
       'got "' + prepareAtcPronunciation('UNITED 1') + '"');

assert('AMERICAN 52 → "American 5 2"',
       prepareAtcPronunciation('AMERICAN 52') === 'American 5 2',
       'got "' + prepareAtcPronunciation('AMERICAN 52') + '"');

assert('FASTAIR 345 → "Fastair 3 4 5"',
       prepareAtcPronunciation('FASTAIR 345') === 'Fastair 3 4 5',
       'got "' + prepareAtcPronunciation('FASTAIR 345') + '"');

assert('REACH 701 → "Reach 7 0 1"',
       prepareAtcPronunciation('REACH 701') === 'Reach 7 0 1',
       'got "' + prepareAtcPronunciation('REACH 701') + '"');

assert('BRITISH 92 SUPER → "British 9 2 super"',
       prepareAtcPronunciation('BRITISH 92 SUPER') === 'British 9 2 super',
       'got "' + prepareAtcPronunciation('BRITISH 92 SUPER') + '"');

// Case-insensitive input
console.log('\nCase-insensitive input:');
assert('lowercase "speedbird 217 heavy" works',
       prepareAtcPronunciation('speedbird 217 heavy').indexOf('Speedbird') !== -1 &&
       prepareAtcPronunciation('speedbird 217 heavy').indexOf('2 1 7') !== -1,
       'got "' + prepareAtcPronunciation('speedbird 217 heavy') + '"');

// HEAVY / SUPER suffix optional
console.log('\nHEAVY/SUPER suffix:');
assert('DELTA 456 HEAVY → includes "heavy"',
       prepareAtcPronunciation('DELTA 456 HEAVY').indexOf('heavy') !== -1,
       'got "' + prepareAtcPronunciation('DELTA 456 HEAVY') + '"');

assert('UNITED 10 (no suffix) → no trailing word',
       prepareAtcPronunciation('UNITED 10') === 'United 1 0',
       'got "' + prepareAtcPronunciation('UNITED 10') + '"');

// ---------- summary ----------
console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
