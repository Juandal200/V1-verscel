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

console.log(fails ? ('\n' + fails + ' FAILING — a second copy appeared, or a limit needs raising deliberately')
                  : '\nall green');
process.exit(fails ? 1 : 0);
