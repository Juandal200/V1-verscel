/* Things that must exist in exactly one place.
 *
 * The recurring failure in this project is not bad fixes, it is partial ones: a bug is
 * reported in one screen, the cause is found and repaired there, the symptom goes, the
 * tests pass — and two or three other copies of the same code carry on being wrong
 * until somebody happens to walk into one.
 *
 *   the mid-activity guard  went into handleServerError, 1 of 43 callers
 *   the simulator teardown  went into setActiveNav, 1 of 4 exits
 *   the microphone hold     went into the exam, leaving the simulator and the legacy
 *                           exam asking again on every answer
 *
 * Each time it looked finished precisely because the fix worked where I looked. So the
 * counting is done here instead of being remembered. Raising a number below is
 * allowed; doing it silently is not.
 */
const fs = require('fs');
const S  = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
let fails = 0;
const ok = (n, c) => { if (!c) fails++; console.log((c ? '  PASS  ' : '  FAIL  ') + n); };

function count(re) { return (S.match(re) || []).length; }

/* Each entry: what it is, how to find it, how many may exist, and why. */
const INVARIANTS = [
  { what: 'places that write the error panel',
    re: /function showContentError/g, max: 1,
    why: 'the mid-activity guard lives inside it, so every caller inherits it' },

  { what: 'places that leave simulator focus mode',
    re: /classList\.remove\(\s*['"]sim-focus-mode/g, max: 1,
    why: 'leaving must stop the engine audio, and a second exit would forget to' },

  { what: 'places that decide whether results are paid for',
    re: /function _teaResultsLocked/g, max: 1,
    why: 'the band leaked three separate ways when the rule lived in one renderer' },

  { what: 'places that speak a band aloud',
    re: /overall ICAO band is/g, max: 0,
    why: 'the examiner read out the number the report was charging to show' },

  { what: 'raw getUserMedia calls',
    re: /navigator\.mediaDevices\.getUserMedia\(/g, max: 3,
    why: 'one per holder — the simulator, the exam, and the exam\'s fallback. ' +
         'A fourth means somebody is asking for the microphone again per answer' },

  { what: 'loops that stop a microphone track',
    re: /getTracks\(\)\.forEach\(function ?\(t\) ?\{ ?t\.stop\(\)/g, max: 3,
    why: 'releasing belongs to the holder. A recorder that stops its own tracks ' +
         'forces the next answer to ask for permission again on iOS' },

  { what: 'hardcoded teal accents',
    re: /00d48e|0\s*,\s*212\s*,\s*142/g, max: 0,
    why: 'the brand colour is a token so it can be changed in one line' },
];

console.log('--- one shape, one implementation ---');
INVARIANTS.forEach(inv => {
  const n = count(inv.re);
  const good = n <= inv.max;
  ok(`${String(n).padStart(2)} / max ${inv.max}  ${inv.what}`, good);
  if (!good) console.log('           why it matters: ' + inv.why);
});

/* A recorder set up beside its own getUserMedia is the exact shape that keeps
 * duplicating. Count them so a new one has to be justified. */
console.log('--- recording blocks ---');
const recorders = count(/new MediaRecorder\(/g);
ok(`${recorders} MediaRecorder constructions (max 6)`, recorders <= 6);

/* Where a tier ends.
 *
 * The 1-3 / 4-6 / 7-9 partition was written SIX times across three IIFEs: the
 * level map's exam card and its tier builder, the tier name on the route header,
 * the Progress rank bands, and twice more in the exam module. None knew about the
 * others, and one of them was an `else` that filed level 10 under Expert without
 * anyone deciding it.
 *
 * Not from the sheet, and the reason is worth keeping here so nobody tries: the
 * server's groupKey takes two values, FOUNDATION and OPERATIONAL, and answers a
 * different question. Levels 1 to 9 are all FOUNDATION, so deriving the tiers
 * from it would collapse the nine into one. */
console.log('--- the level tier partition ---');
ok('one declaration of the partition',
   (S.match(/window\.LEVEL_TIERS = \[/g) || []).length === 1);
const literalCuts = count(/levels: \[\s*1\s*,\s*2\s*,\s*3\s*\]|levels: \[\s*4\s*,\s*5\s*,\s*6\s*\]|levels: \[\s*7\s*,\s*8\s*,\s*9\s*\]/g);
ok(`${literalCuts} literal tier bands outside it (max 3, all inside the declaration)`,
   literalCuts <= 3);
/* The else that assumed. A level in no tier has to be reported, not filed.
 *
 * Against STRIPPED source. The comment on the replacement quotes the expression
 * it replaced — as comments explaining a fix tend to — and this read it as the
 * code still being there. Fourth time in a week that a comment I wrote broke a
 * check I wrote. */
const Sc = S.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
ok('no ladder assumes the last tier',
   !/<=\s*3\s*\?\s*'Foundation'/.test(Sc));
ok('and tierOfLevel returns null rather than guessing',
   /window\.tierOfLevel = function[\s\S]{0,400}return null;/.test(S));
// Two vocabularies on the same cuts. They must not merge.
ok('the rank labels stay separate from the content tier names',
   /_PROG_RANKS = \[/.test(S) && /Junior Captain/.test(S) && !/name: 'Junior Captain'/.test(S));

/* The world map draws tiers. If it brought its own idea of where they end, it
 * would be the fifth copy — which is why T2 came before it. */
ok('the map takes the partition rather than declaring one',
   /_lmRenderMap\(_lmModels, TIERS, heroBar, heroCard, vrSlot\)/.test(S) &&
   !/function _lmRenderMap[\s\S]{0,4000}levels: \[1, ?2, ?3\]/.test(S));
/* The map's own body, matched by braces on STRIPPED source — not a character
 * window on the raw file. The window version caught the comment inside the
 * function explaining that lockedByPlan opens the plans modal, and reported the
 * map as recomputing a state it only reads. Fifth time this week that a comment
 * broke the check written beside it. */
function bodyOf(sig) {
  const src = S.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
  const i = src.indexOf(sig);
  if (i < 0) return '';
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  return '';
}
/* Two functions since the home page started drawing this: the stage, which is
 * the map, and the chrome the levels screen wraps it in. Reading only the wrapper
 * would report a 400-character function as "handed the level states" and mean
 * nothing by it. */
const mapBody = bodyOf('function _lmStageHtml(models, tiers, vrSlot)') +
                bodyOf('function _lmRenderMap(models, tiers, heroBar, heroCard, vrSlot)');
ok('the map is handed the level states', mapBody.length > 500);
ok('and does not work them out again',   !/lockedByPlan|unlocked === false/.test(mapBody));

/* Client and server is a genuine boundary, so the seventh copy stays — and is
 * compared instead. Código.js gates levels 4, 7 and 10 on the preceding exam;
 * if the client's partition ever disagrees, the map offers a checkpoint the
 * server does not enforce, or hides one it does. */
console.log('--- and the server agrees with it ---');
const COD = fs.readFileSync(__dirname + '/../Código.js', 'utf8');
const serverGate = COD.match(/lvl === (\d+) \? 1 : lvl === (\d+) \? 2 : lvl === (\d+) \? 3/);
ok('the server still gates three levels on exams', !!serverGate);
if (serverGate) {
  const clientNext = [...S.matchAll(/nextLevel: (\d+)/g)].map(m => Number(m[1]));
  const serverNext = serverGate.slice(1, 4).map(Number);
  ok(`server gates ${serverNext.join('/')} and the client's tiers lead to ${clientNext.join('/')}`,
     clientNext.length === 3 && clientNext.every((n, i) => n === serverNext[i]));
}

console.log(fails ? ('\n' + fails + ' FAILING — a second copy appeared, or a limit needs raising deliberately')
                  : '\nall green');
process.exit(fails ? 1 : 0);
