/* Call signs, checked against the list the product actually uses.
 *
 * The old suite pasted a stub and said so in its header — "stubs (mirrors
 * TTSService.js logic)". A mirror is only a mirror while somebody polishes it.
 * This one asserted "Speedbird 2 1 7 heavy"; the product says "Speedbird two
 * one seven heavy", and the suite was green throughout.
 *
 * TELEPHONY_DESIGNATORS is lifted from the source too, so a designator added
 * there is covered here without anyone remembering to add it twice. */
'use strict';
const { TTS, missing, designators, say } = require('./_ttslift');

let passed = 0, failed = 0;
function assert(label, condition, detail) {
  if (condition) { console.log('  ✓ ' + label); passed++; }
  else { console.error('  ✗ ' + label + (detail ? ' — ' + detail : '')); failed++; }
}

console.log('\ntelephony designators, from TTSService.js\n');
assert('the pronunciation chain lifted', missing.length === 0, missing.join(', '));
assert('and so did the designator list', !!designators);
if (!TTS) { console.error('\ncannot continue'); process.exit(1); }

console.log('\na designator is title-cased and its number spoken in ICAO words:');
[['SPEEDBIRD 217 HEAVY', 'Speedbird two one seven heavy'],
 ['DELTA 123',           'Delta one two three'],
 ['CACTUS 444',          'Cactus four four four'],
 ['UNITED 1',            'United one'],
 ['AMERICAN 52',         'American five two'],
 ['FASTAIR 345',         'Fastair three four five'],
 ['REACH 701',           'Reach seven zero one'],
 ['BRITISH 92 SUPER',    'British niner two super'],
].forEach(([input, expected]) => {
  const got = say(input);
  assert(input + ' → "' + expected + '"', got === expected, 'got "' + got + '"');
});

// 9 is "niner" in ICAO, and that is the whole reason this runs through the
// product rather than a mirror of it — a stub is exactly where a "nine" creeps
// back in and nothing notices.
console.log('\nnine is niner:');
assert('BRITISH 92 says niner, not nine',
       say('BRITISH 92 SUPER').indexOf('niner') !== -1 && say('BRITISH 92 SUPER').indexOf('nine ') === -1,
       say('BRITISH 92 SUPER'));

console.log('\ncase and suffixes:');
assert('lowercase input is handled',
       say('speedbird 217 heavy') === 'Speedbird two one seven heavy', say('speedbird 217 heavy'));
assert('HEAVY is kept',  say('DELTA 456 HEAVY').indexOf('heavy') !== -1, say('DELTA 456 HEAVY'));
assert('no suffix invents none',
       say('UNITED 10') === 'United one zero', say('UNITED 10'));

console.log('\nevery designator in the list is actually handled:');
const list = new Function(designators + '\nreturn TELEPHONY_DESIGNATORS;')();
assert('the list is not empty', list.length > 0);
const unhandled = list.filter(d => {
  const out = say(d + ' 123');
  // Handled means title-cased and the number spoken — not left in shouting caps.
  return out === (d + ' 123') || /\d/.test(out);
});
assert('all ' + list.length + ' designators are expanded', unhandled.length === 0,
       'unhandled: ' + JSON.stringify(unhandled));

console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed ? 1 : 0);
