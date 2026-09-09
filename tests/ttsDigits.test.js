/* How numbers are spoken, checked against the code that speaks them.
 *
 * This suite used to carry its own copy of the digit expander, and the copy
 * spaced the digits out: "230" became "2 3 0". The product says "two three
 * zero" — ICAO words, which is the point of an aviation English trainer — and
 * has for long enough that nobody can say when it changed. Three suites in this
 * directory asserted the old behaviour and all three passed, because none of
 * them ever called the product.
 *
 * Nothing is copied here now. _ttslift takes the methods out of TTSService.js
 * and calls them on an object, so `self` resolves the way it does in Apps
 * Script. If the chain is renamed or moved, this fails loudly instead of
 * quietly grading a function that no longer exists. */
'use strict';
const { TTS, missing, say, digits } = require('./_ttslift');

let passed = 0, failed = 0;
function assert(label, condition, detail) {
  if (condition) { console.log('  ✓ ' + label); passed++; }
  else { console.error('  ✗ ' + label + (detail ? ' — ' + detail : '')); failed++; }
}

console.log('\nICAO digits, from TTSService.js\n');
console.log('the chain is still there to lift:');
assert('every method found', missing.length === 0, 'missing: ' + missing.join(', '));
if (!TTS) { console.error('\ncannot continue'); process.exit(1); }

console.log('\ndigits become ICAO words, not spaced numerals:');
assert('"230" → "two three zero"',  digits('230') === 'two three zero',  'got "' + digits('230') + '"');
assert('"27"  → "two seven"',       digits('27')  === 'two seven',       'got "' + digits('27')  + '"');
assert('"12"  → "one two"',         digits('12')  === 'one two',         'got "' + digits('12')  + '"');
// The old copies asserted "2 3 0". Stated here so the regression is named.
assert('and never the spaced-numeral form the old copies asserted',
       !/\d\s\d/.test(digits('230')), 'got "' + digits('230') + '"');

console.log('\nedges:');
assert('single digit "5" → "five"',            digits('5') === 'five');
assert('4-digit "7700" → "seven seven zero zero"', digits('7700') === 'seven seven zero zero');
assert('5-digit "10000" → "one zero zero zero zero"', digits('10000') === 'one zero zero zero zero');

console.log('\nin a sentence, through the real pronunciation pass:');
assert('heading "HEADING 230"', say('HEADING 230') === 'heading two three zero',
       'got "' + say('HEADING 230') + '"');
assert('runway "RUNWAY 27"',    say('RUNWAY 27')   === 'runway two seven',
       'got "' + say('RUNWAY 27') + '"');
assert('frequency "118.7" keeps the decimal',
       say('118.7') === 'one one eight decimal seven', 'got "' + say('118.7') + '"');
assert('flight level "FL250"',  say('FL250') === 'flight level two five zero',
       'got "' + say('FL250') + '"');

const sentence = say('turn right heading 230, cleared ILS runway 27, descend 12 000');
console.log('\na whole clearance:');
assert('heading spoken',  sentence.indexOf('heading two three zero') !== -1, sentence);
assert('runway spoken',   sentence.indexOf('runway two seven') !== -1, sentence);
// ILS is spelled out letter by letter rather than read as a word.
assert('ILS is spelled',  sentence.indexOf('I L S') !== -1, sentence);
assert('nothing is left as bare numerals', !/\d/.test(sentence), sentence);

console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed ? 1 : 0);
