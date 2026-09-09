/* T-7 — three counters, three surfaces, and none of them knew the others existed.
 *
 * The simulator's AtcReplayGate, the practice test's _t.listens and the scripted
 * exam's _sc.recReplaysLeft all count "times a recording was played", all feed
 * something a student is judged on, and were written as if each were the only
 * one. Two were already named constants; the third was a bare `1` at the point
 * of use, with nothing recording that being stricter than practice was a
 * decision rather than an oversight.
 *
 * THIS DOES NOT ASSERT THEY ARE EQUAL, and that is the point. They measure
 * different things with different consequences — unlocking text, capping a band,
 * spending a replay — and forcing one number on all three would be the wrong
 * fix wearing the right rule's clothes. What it asserts is that each is NAMED,
 * that none is a literal at its use site, and that the one which deliberately
 * differs says why. */
'use strict';
const fs = require('fs');
const S = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
const SRC = S.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
let fails = 0; const ok = (n, c, d) => { if (!c) fails++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c || !d ? '' : ' — ' + d)); };

console.log('\nreplay counters: named, documented, and deliberately different\n');

const decls = {
  '_DEFAULT_REPLAY_THRESHOLD': /var _DEFAULT_REPLAY_THRESHOLD\s*=\s*(\d+)\s*;/,
  'TEA_MAX_LISTENS':           /var TEA_MAX_LISTENS\s*=\s*(\d+)\s*;/,
  'SC_REC_REPLAYS':            /var SC_REC_REPLAYS\s*=\s*(\d+)\s*;/,
};
const values = {};
console.log('all three are named:');
Object.keys(decls).forEach(function (k) {
  const m = SRC.match(decls[k]);
  ok(k + ' is declared', !!m);
  if (m) values[k] = Number(m[1]);
});

console.log('\nnone is a bare literal at its use site:');
ok('the scripted exam uses the constant',
   /_sc\.recReplaysLeft = SC_REC_REPLAYS;/.test(SRC));
ok('and no longer a literal 1', !/_sc\.recReplaysLeft = 1;/.test(SRC));
ok('the practice test caps with the constant', /used >= TEA_MAX_LISTENS/.test(SRC));
ok('the simulator gate takes the constant',
   /_threshold\s+=\s+_DEFAULT_REPLAY_THRESHOLD/.test(SRC));

/* Deliberately absent: any assertion that the three agree. Recorded so nobody
 * "fixes" this later by adding one. */
console.log('\nthey are allowed to differ, and here they do:');
ok('simulator ' + values['_DEFAULT_REPLAY_THRESHOLD'] +
   ', practice ' + values['TEA_MAX_LISTENS'] +
   ', scripted ' + values['SC_REC_REPLAYS'],
   values['SC_REC_REPLAYS'] !== values['TEA_MAX_LISTENS']);
ok('and the stricter one explains itself',
   /One replay in a scripted sitting, where practice allows two/.test(S));
ok('naming the evidence, not just the number',
   /Needing the repeat IS the comprehension evidence/.test(S));

console.log('\nthe coupling between two of them is documented where it happens:');
// The seed and the replay allowance are set on adjacent lines. Nothing said so.
/* Whitespace-normalised: the comment wraps, and a sentence that spans a line
 * break with a leading `*` is still the same sentence. A check about prose must
 * not fail on where the prose happened to wrap. */
const seed = S.slice(S.indexOf('_sc.recReplaysLeft = SC_REC_REPLAYS;'),
                     S.indexOf('_sc.recReplaysLeft = SC_REC_REPLAYS;') + 1400)
              .replace(/\n\s*\*\s?/g, ' ').replace(/\s+/g, ' ');
ok('the seed is called deliberate',   /deliberate/i.test(seed));
ok('it says what each counter is for',
   /caps the comprehension band/i.test(seed) && /Replay button spends/i.test(seed));
ok('it explains why the count starts at one, not zero',
   /never heard the recording/i.test(seed));
ok('and warns that changing one without the other misgrades',
   /Changing either without the other/i.test(seed) &&
   /grade against a number the student never saw/i.test(seed));
// Both directions: the declaration must point at the use site too.
ok('the declaration points back at the coupling',
   /LOOK AT THE LINE BELOW IT AT THE POINT OF USE/.test(S));
ok('and each declaration names the other two surfaces',
   /the SIMULATOR/.test(S) && /the PRACTICE TEST/.test(S) && /the SCRIPTED EXAM/.test(S));

console.log('\nscope, because the constant is read in a different function:');
const declAt = SRC.indexOf('var SC_REC_REPLAYS');
const useAt  = SRC.indexOf('_sc.recReplaysLeft = SC_REC_REPLAYS;');
ok('declared before its use', declAt !== -1 && useAt > declAt, declAt + ' vs ' + useAt);

console.log(fails ? ('\n' + fails + ' FAILING') : '\nall green');
process.exit(fails ? 1 : 0);
