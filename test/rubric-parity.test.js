/* Two graders, one standard.
 *
 * api/tea-pipeline.mjs grades recorded speech with acoustic evidence.
 * api/tea.mjs grades the text of the conversation when the pipeline does not
 * produce a result. They are separate deployments with separate prompts, and
 * nothing in the language forces them to agree.
 *
 * They did not agree. The pipeline carried the ICAO Doc 9835 scale verbatim,
 * under an instruction reading "Do not grade against a paraphrase of it". The
 * fallback WAS that paraphrase, and it defined only levels 3, 4 and 5 — so when
 * it awarded a candidate band 1, it was assigning a band its own rubric did not
 * describe. Which grader marked you decided which standard you were held to.
 *
 * A shared module would be the real fix. Nothing in api/ imports a local file
 * today, and an import that fails to bundle takes BOTH graders down and every
 * exam with them — so the copies stay, and this compares them instead. That is
 * the trade CLAUDE.md allows: two copies across a real boundary, with an
 * executable parity test rather than a comment asking them to stay in step. */
const fs = require('fs');
const TEA  = fs.readFileSync(__dirname + '/../api/tea.mjs', 'utf8');
const PIPE = fs.readFileSync(__dirname + '/../api/tea-pipeline.mjs', 'utf8');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};

const CRIT = 'CRITICAL RULE: overall_band = the LOWEST score among all six dimensions. It is NOT an average.';
const SCALE_HEAD = 'ICAO LANGUAGE PROFICIENCY RATING SCALE (Doc 9835)';

/* The scale runs from its heading to the end of the notes on applying it.
 *
 * Not "to the bottleneck rule": between the two sit blocks that belong to ONE
 * grader — the replay ceiling and the no-acoustic-data instruction are the
 * fallback's alone. Taking everything up to CRITICAL RULE swept those in and
 * reported the two scales as differing when only the surrounding material did.
 * The terminator below is the last line of the notes, and both files carry it. */
const SCALE_TAIL = 'comes from the descriptor wording above.';
function scaleOf(src) {
  const a = src.indexOf(SCALE_HEAD);
  const b = src.indexOf(SCALE_TAIL);
  return (a < 0 || b < 0 || b < a) ? null : src.slice(a, b + SCALE_TAIL.length);
}

console.log('--- both graders carry the same scale ---');
const a = scaleOf(TEA), b = scaleOf(PIPE);
ok('the fallback has the ICAO scale',   a !== null);
ok('the pipeline has the ICAO scale',   b !== null);
ok('and they are character for character identical', a !== null && a === b);
if (a !== null && b !== null && a !== b) {
  const at = a.split('\n'), bt = b.split('\n');
  for (let i = 0; i < Math.max(at.length, bt.length); i++) {
    if (at[i] !== bt[i]) { console.log('        first difference, line ' + (i+1) +
      ':\n          tea.mjs : ' + (at[i]||'(missing)') +
      '\n          pipeline: ' + (bt[i]||'(missing)')); break; }
  }
}

console.log('--- all six descriptors, all six levels, in both ---');
const DESCRIPTORS = ['PRONUNCIATION', 'STRUCTURE', 'VOCABULARY', 'FLUENCY', 'COMPREHENSION', 'INTERACTIONS'];
for (const [name, src] of [['tea.mjs', TEA], ['tea-pipeline.mjs', PIPE]]) {
  const s = scaleOf(src) || '';
  ok(name + ': all six descriptors named',
     DESCRIPTORS.every(d => new RegExp('^' + d, 'm').test(s)));
  // Level 1 is the one the fallback used to award without defining.
  ok(name + ': level 1 defined six times, once per descriptor',
     (s.match(/Performs at a level below the Elementary level\./g) || []).length === 6);
  ok(name + ': every descriptor block runs 6 down to 1',
     DESCRIPTORS.every(d => {
       const i = s.search(new RegExp('^' + d, 'm'));
       if (i < 0) return false;
       const block = s.slice(i, i + 2600);
       return [6,5,4,3,2,1].every(n => new RegExp('^ ' + n + ' ', 'm').test(block));
     }));
}

console.log('--- the level 4 wording is ICAO\'s, not a stricter paraphrase ---');
/* Three wordings were proposed that each moved the pass line UP: pronunciation
 * "rarely" (that is level 5's word), structure "never obscure", comprehension
 * "consistently accurate" (level 6's). For a test certifying against a legal
 * minimum, strictness at the pass line fails pilots ICAO says should pass. */
const s = scaleOf(PIPE) || '';
ok('pronunciation 4 is "only sometimes interfere"',
   /^ 4 \.\.\.are influenced by the first language or regional variation but only sometimes interfere/m.test(s));
ok('and 5 is "rarely" — the two bands stay distinguishable',
   /^ 5 \.\.\.though influenced by the first language or regional variation, rarely interfere/m.test(s));
ok('structure 4 is "rarely interfere with meaning", not "never obscure"',
   /^ 4 Basic grammatical[\s\S]{0,240}but rarely interfere with meaning\./m.test(s));
ok('comprehension 4 is "mostly accurate", not "consistently"',
   /^ 4 Comprehension is mostly accurate on common, concrete and work-related topics/m.test(s));
// CEFR is not an ICAO mapping and must not become the thing being graded.
ok('no CEFR band is used as a descriptor anchor', !/\b(A1|A2|B1|B2|C1|C2)\b/.test(s));

console.log('--- the aviation guardrail is in both, identically ---');
const G = 'AVIATION GUARDRAIL — READ THIS BEFORE ASSIGNING ANY BAND.';
function guardOf(src) {
  const i = src.indexOf(G);
  return i < 0 ? null : src.slice(i, src.indexOf(CRIT)).replace(/\s+$/, '');
}
ok('the fallback has it',  guardOf(TEA)  !== null);
ok('the pipeline has it',  guardOf(PIPE) !== null);
ok('and they match exactly', guardOf(TEA) !== null && guardOf(TEA) === guardOf(PIPE));
ok('it names the thing that must not be rewarded',
   /must not be rewarded as range or fluency/.test(TEA));
ok('and the thing that must not be penalised',
   /is a complete Level 4\s*\n?performance and must be graded as one/.test(TEA.replace(/\r/g,'')));

console.log('--- the bottleneck rule survives in both ---');
ok('tea.mjs',           TEA.indexOf(CRIT) !== -1);
ok('tea-pipeline.mjs',  PIPE.indexOf(CRIT) !== -1);

console.log('--- what belongs to one grader only ---');
// The fallback has no acoustic data and used to be free to invent it.
ok('the fallback is told it has none',
   /YOU HAVE NO ACOUSTIC DATA ON THIS PATH\./.test(TEA));
ok('and told not to describe what it cannot measure',
   /Do not invent\s*\n?them and do not describe them as though you had measured them\./.test(TEA.replace(/\r/g,'')));
ok('the pipeline is not given that instruction — it HAS the data',
   !/YOU HAVE NO ACOUSTIC DATA/.test(PIPE));
// The replay ceiling is only computable where the marker arrives.
ok('the replay ceiling lives with the fallback',   /REPLAY RULE — BINDING/.test(TEA));
ok('and the pipeline gets it applied in code instead',
   !/REPLAY RULE — BINDING/.test(PIPE));

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
