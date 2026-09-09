/* The semantic-token grader, run rather than re-typed.
 *
 * This suite used to paste copies of the functions into itself, renamed to drop
 * the underscore the originals carry. Nothing checked the copies still matched,
 * and one had already fallen behind: its normalizeForGrading was missing
 *
 *     .replace(/\b(\d{1,2}) (\d{3})\b/g, '$1$2')
 *
 * the step that makes "FLIGHT LEVEL 3 000" and "FL3000" normalise alike. The
 * suite graded against a normaliser the product stopped using, passed, and
 * reported that grading worked. Its neighbour extractSemanticTokens was
 * byte-identical to the original, so the file looked maintained — one function
 * current, one stale, a green tick over both.
 *
 * That is the F-0017a shape: a second copy nobody keeps. So there is no copy
 * here now. The four functions are lifted out of Scripts.html and executed.
 *
 * The suite also asserts what the source only asks for in a comment.
 * _clientNormalizeText says "MUST stay identical to AttemptService.normalizeText_"
 * and _clientEvaluate says its order and pass rule "MUST match
 * AttemptService.evaluateAnswer_". A rule that lives in a comment is a wish;
 * this compares the two files. */
'use strict';
const fs = require('fs');
const S  = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
const A  = fs.readFileSync(__dirname + '/../Attemptservice.js', 'utf8');

function grab(src, sig) {
  const i = src.indexOf(sig);
  if (i === -1) return null;
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  return null;
}
// Compared with comments stripped and the underscore convention flattened: the
// server writes normalizeForGrading_ as an object method, the client writes
// _normalizeForGrading as a declaration. Same code, two house styles.
const shape = t => t
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1')
  .replace(/this\.|self\./g, '').replace(/\b_?(\w+?)_?\b/g, '$1')
  .replace(/\s+/g, ' ').trim();
const body = t => shape(t.slice(t.indexOf('{')));

const NEEDED = ['_normalizeForGrading', '_extractSemanticTokens', '_clientNormalizeText', '_clientEvaluate'];
const parts  = NEEDED.map(n => grab(S, 'function ' + n + '('));

let passed = 0, failed = 0;
function assert(label, condition, detail) {
  if (condition) { console.log('  ✓ ' + label); passed++; }
  else { console.error('  ✗ ' + label + (detail ? ' — ' + detail : '')); failed++; }
}

console.log('\nthe grader, lifted from Scripts.html and run\n');

console.log('every function the client actually grades with is present:');
NEEDED.forEach((n, i) => assert(n + ' found in source', !!parts[i]));
if (parts.some(p => !p)) { console.error('\ncannot continue without all four'); process.exit(1); }

const api = new Function(parts.join('\n') + '\nreturn { ' + NEEDED.join(', ') + ' };')();
const normalizeForGrading   = api._normalizeForGrading;
const extractSemanticTokens = api._extractSemanticTokens;
const clientEvaluate        = api._clientEvaluate;

console.log('\nthe client and the server agree, which the source only asks for in a comment:');
[['normalizeForGrading',   'function _normalizeForGrading(',   'normalizeForGrading_: function('],
 ['extractSemanticTokens', 'function _extractSemanticTokens(', 'extractSemanticTokens_: function(']
].forEach(([name, cSig, sSig]) => {
  const c = grab(S, cSig), s = grab(A, sSig);
  assert(name + ' exists on both sides', !!c && !!s);
  if (c && s) assert(name + ' is the same code in both', body(c) === body(s),
                     'client ' + body(c).length + ' chars, server ' + body(s).length);
});

// The step the stale copy was missing. Asserted directly, so this suite can
// never again pass against a normaliser that lacks it.
console.log('\nthe normaliser joins a split thousand:');
assert('"FLIGHT LEVEL 3 000" keeps the digits together',
       normalizeForGrading('flight level 3 000').indexOf('3000') !== -1,
       'got "' + normalizeForGrading('flight level 3 000') + '"');
assert('and a two-digit lead joins too',
       normalizeForGrading('climb 12 500').indexOf('12500') !== -1,
       'got "' + normalizeForGrading('climb 12 500') + '"');
assert('while an ordinary pair of numbers is left alone',
       normalizeForGrading('runway 2 7').indexOf('27') === -1);

const EXPECTED = 'right heading 230, cleared ILS approach runway 27, Speedbird 217 heavy';

console.log('\nextractSemanticTokens:');
const tokens = extractSemanticTokens(normalizeForGrading(EXPECTED));
assert('extracts ILS APPROACH',        tokens.indexOf('ILS APPROACH') !== -1);
assert('extracts RUNWAY 27',           tokens.indexOf('RUNWAY 27') !== -1);
assert('extracts HEADING 230',         tokens.indexOf('HEADING 230') !== -1);
assert('extracts RIGHT (direction)',   tokens.indexOf('RIGHT') !== -1);
assert('extracts CLEARED',             tokens.indexOf('CLEARED') !== -1);
assert('extracts SPEEDBIRD 217 HEAVY', tokens.indexOf('SPEEDBIRD 217 HEAVY') !== -1);
assert('extracts exactly 6 tokens',    tokens.length === 6,
       'got ' + tokens.length + ': ' + JSON.stringify(tokens));

console.log('\ncorrect variants (must score >= 90):');
[['all caps + commas',           'RIGHT HEADING 230, CLEARED ILS APPROACH RUNWAY 27, SPEEDBIRD 217 HEAVY'],
 ['all lowercase',               'right heading 230, cleared ils approach runway 27, speedbird 217 heavy'],
 ['callsign first (reordered)',  'Speedbird 217 heavy, cleared ILS approach runway 27, right heading 230'],
 ['no punctuation',              'right heading 230 cleared ILS approach runway 27 Speedbird 217 heavy'],
].forEach(([label, input]) => {
  const r = clientEvaluate(input, '', EXPECTED);
  assert(label + ' — score ' + r.score, r.score >= 90 && r.correct === true,
         'missing: ' + JSON.stringify(r.keywordsMissing));
});

/* The branch the copied version never had.
 *
 * The pasted clientEvaluate went straight to semantic tokens, with a stub
 * marked "not exercised in these tests" where the real function's FIRST branch
 * is. That branch is the curated keywords column, and _clientEvaluate's own
 * comment calls it the authority: the extractor is only the fallback for
 * scenarios with no keywords. So the suite exercised the fallback and left the
 * rule that actually decides a student's attempt untested. */
console.log('\nthe keywords column wins, and it is checked now:');
const KW = 'CLEARED ILS APPROACH|RUNWAY 27|SPEEDBIRD 217';
let r = clientEvaluate('Speedbird 217, cleared ILS approach runway 27', KW, EXPECTED);
assert('every required element present scores 100', r.score === 100 && r.correct === true,
       'missing: ' + JSON.stringify(r.keywordsMissing));
r = clientEvaluate('Speedbird 217, cleared ILS approach', KW, EXPECTED);
assert('one missing element fails the attempt', r.correct === false,
       'score ' + r.score);
assert('and the missing element is named', r.keywordsMissing.indexOf('RUNWAY 27') !== -1,
       JSON.stringify(r.keywordsMissing));
// Callers hand over either a pipe-joined string or an already-split array —
// the ICAO Test path passes scenario.keywords directly.
r = clientEvaluate('Speedbird 217, cleared ILS approach runway 27', KW.split('|'), EXPECTED);
assert('an array of keywords is accepted too', r.score === 100 && r.correct === true);
// With no keywords it must fall back rather than pass everything.
r = clientEvaluate('nothing like the clearance', '', EXPECTED);
assert('no keywords falls back to the extractor', r.correct === false && r.score < 90);

console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed ? 1 : 0);
