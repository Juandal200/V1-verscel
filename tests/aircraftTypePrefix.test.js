/* Aircraft type prefixes, checked where they are actually expanded.
 *
 * The old suite defined its own expandTypePrefix and tested that. There is no
 * such function in the product — the expansion is step 9b inside
 * prepareAtcPronunciation_ — so the suite tested a reimplementation of a step,
 * and the reimplementation had drifted: it asserted "Boeing 7 4 7" while the
 * product says "Boeing seven four seven".
 *
 * A test of a function that does not exist cannot fail for the right reason.
 * This one runs the real pass. */
'use strict';
const { TTS, missing, say } = require('./_ttslift');

let passed = 0, failed = 0;
function assert(label, condition, detail) {
  if (condition) { console.log('  ✓ ' + label); passed++; }
  else { console.error('  ✗ ' + label + (detail ? ' — ' + detail : '')); failed++; }
}

console.log('\naircraft type prefixes, through prepareAtcPronunciation_\n');
assert('the pronunciation chain lifted', missing.length === 0, missing.join(', '));
if (!TTS) { console.error('\ncannot continue'); process.exit(1); }

console.log('\nknown manufacturers are named:');
[['B747',   'Boeing seven four seven'],
 ['A320',   'Airbus three two zero'],
 ['E175',   'Embraer one seven five'],
 ['b737',   'Boeing seven three seven'],
 ['a319',   'Airbus three one niner'],
].forEach(([input, expected]) => {
  const got = say(input);
  assert(input + ' → "' + expected + '"', got === expected, 'got "' + got + '"');
});

console.log('\nan unknown prefix is spelled, not guessed:');
assert('MD11 → "M D one one"',        say('MD11')   === 'M D one one',        say('MD11'));
assert('CRJ700 → "C R J seven zero zero"',
       say('CRJ700') === 'C R J seven zero zero', say('CRJ700'));

console.log('\nin a sentence:');
const sentence = say('Boeing B737 on stand 4');
assert('the type is expanded inside a line', sentence.indexOf('Boeing seven three seven') !== -1, sentence);

console.log('\nedges:');
// One digit is not a type, so nothing should fire.
assert('B7 is left alone',            say('B7') === 'B7', say('B7'));
// Five digits is not a type either — but the letter is still spelled, because
// a lone B in a clearance is Bravo. Recorded as the behaviour, not the intent.
assert('B12345 is not read as a type', say('B12345').indexOf('Boeing') === -1, say('B12345'));
assert('plain words are untouched apart from spelled initialisms',
       say('cleared ILS approach') === 'cleared I L S approach', say('cleared ILS approach'));

console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed ? 1 : 0);
