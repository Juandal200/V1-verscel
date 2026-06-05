// Unit tests for Issue 1 — semantic token grader
// Run: node tests/grader.test.js

'use strict';

// ---------- pure functions copied from Scripts.html / Attemptservice.js ----------

function normalizeForGrading(text) {
  return String(text || '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSemanticTokens(normExpected) {
  var t = normExpected;
  var tokens = [];
  var knownWord = /^(HEADING|RUNWAY|FLIGHT|APPROACH|CONTACT|CLEARED|CLIMB|DESCEND|MAINTAIN|EXPEDITE|REPORT|SQUAWK|CROSS|ENTER|HOLD|TURN|DIRECT|DEPARTURE|ARRIVAL)$/;

  var approachMatch = t.match(/\b(ILS APPROACH|VOR APPROACH|RNAV APPROACH|NDB APPROACH|VISUAL APPROACH|SURVEILLANCE APPROACH)\b/);
  if (approachMatch) tokens.push(approachMatch[1]);

  var rwyMatch = t.match(/\bRUNWAY\s+(\d{1,2}[LRC]?)\b/);
  if (rwyMatch) tokens.push('RUNWAY ' + rwyMatch[1]);

  var hdgMatch = t.match(/\bHEADING\s+(\d{2,3})\b/);
  if (hdgMatch) tokens.push('HEADING ' + hdgMatch[1]);

  if (/\bRIGHT\b/.test(t) && /\bHEADING\b/.test(t)) tokens.push('RIGHT');
  else if (/\bLEFT\b/.test(t) && /\bHEADING\b/.test(t)) tokens.push('LEFT');

  ['CLEARED', 'TAXI', 'MAINTAIN', 'EXPEDITE', 'REPORT', 'HOLD SHORT', 'LINE UP'].forEach(function(v) {
    if (t.indexOf(v) !== -1) tokens.push(v);
  });

  if (t.indexOf('CONTACT') !== -1) {
    tokens.push('CONTACT');
    var contactFreq = t.match(/\bCONTACT\b[^.]*?(\d{3})\b/);
    if (contactFreq) tokens.push(contactFreq[1]);
  }
  if (t.indexOf('CLIMB') !== -1) {
    tokens.push('CLIMB');
    var climbNum = t.match(/\bCLIMB\b[^.]*?(\d{3,5})\b/);
    if (climbNum) tokens.push(climbNum[1]);
  }
  if (t.indexOf('DESCEND') !== -1) {
    tokens.push('DESCEND');
    var descendNum = t.match(/\bDESCEND\b[^.]*?(\d{3,5})\b/);
    if (descendNum) tokens.push(descendNum[1]);
  }

  var words = t.split(' ');
  for (var i = 0; i < words.length - 1; i++) {
    if (words[i].length >= 4 && !knownWord.test(words[i]) &&
        /^\d{2,4}$/.test(words[i + 1])) {
      var cs = words[i] + ' ' + words[i + 1];
      if (words[i + 2] === 'HEAVY' || words[i + 2] === 'SUPER') cs += ' ' + words[i + 2];
      tokens.push(cs);
      break;
    }
  }
  return tokens;
}

function clientEvaluate(answer, keywordsText, expectedReadback) {
  var normAnswer   = normalizeForGrading(answer);
  var normExpected = expectedReadback ? normalizeForGrading(expectedReadback) : '';

  if (normExpected) {
    var tokens  = extractSemanticTokens(normExpected);
    if (tokens.length > 0) {
      var missing = tokens.filter(function(t) { return normAnswer.indexOf(t) === -1; });
      var matched = tokens.filter(function(t) { return normAnswer.indexOf(t) !== -1; });
      var score   = Math.round((matched.length / tokens.length) * 100);
      return { correct: score >= 90, score: score,
               keywordsOk: matched, keywordsMissing: missing };
    }
  }
  // Fallback (not exercised in these tests)
  return { correct: false, score: 0, keywordsOk: [], keywordsMissing: [] };
}

// ---------- helpers ----------

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

// ---------- tests ----------

const EXPECTED = 'right heading 230, cleared ILS approach runway 27, Speedbird 217 heavy';

console.log('\nIssue 1 — semantic token grader\n');

// Token extraction
console.log('extractSemanticTokens:');
var tokens = extractSemanticTokens(normalizeForGrading(EXPECTED));
assert('extracts ILS APPROACH',        tokens.indexOf('ILS APPROACH') !== -1);
assert('extracts RUNWAY 27',           tokens.indexOf('RUNWAY 27') !== -1);
assert('extracts HEADING 230',         tokens.indexOf('HEADING 230') !== -1);
assert('extracts RIGHT (direction)',   tokens.indexOf('RIGHT') !== -1);
assert('extracts CLEARED',             tokens.indexOf('CLEARED') !== -1);
assert('extracts SPEEDBIRD 217 HEAVY', tokens.indexOf('SPEEDBIRD 217 HEAVY') !== -1);
assert('extracts exactly 6 tokens',    tokens.length === 6, 'got ' + tokens.length + ': ' + JSON.stringify(tokens));

// Correct variants — must score >= 90
console.log('\nCorrect variants (must score >= 90):');
[
  ['all caps + commas',     'RIGHT HEADING 230, CLEARED ILS APPROACH RUNWAY 27, SPEEDBIRD 217 HEAVY'],
  ['all lowercase',         'right heading 230, cleared ils approach runway 27, speedbird 217 heavy'],
  ['callsign first (reordered)', 'Speedbird 217 heavy, cleared ILS approach runway 27, right heading 230'],
  ['no punctuation',        'right heading 230 cleared ILS approach runway 27 Speedbird 217 heavy'],
].forEach(function(pair) {
  var label  = pair[0];
  var input  = pair[1];
  var result = clientEvaluate(input, '', EXPECTED);
  assert(label + ' — score ' + result.score,
         result.score >= 90 && result.correct === true,
         'missing: ' + JSON.stringify(result.keywordsMissing));
});

// Partial variant — must score 40-70, correct === false
console.log('\nPartial variant (must score 40–70, correct=false):');
var partial = clientEvaluate('heading 230, ILS approach 27, Speedbird 217 heavy', '', EXPECTED);
assert('score in 40-70 range — got ' + partial.score,
       partial.score >= 40 && partial.score <= 70,
       'matched: ' + JSON.stringify(partial.keywordsOk) + ', missing: ' + JSON.stringify(partial.keywordsMissing));
assert('correct === false', partial.correct === false);

// Edge: empty answer
console.log('\nEdge cases:');
var empty = clientEvaluate('', '', EXPECTED);
assert('empty answer scores 0', empty.score === 0);

// Edge: gibberish answer
var gibberish = clientEvaluate('banana helicopter squirrel', '', EXPECTED);
assert('gibberish scores 0', gibberish.score === 0);

// Edge: no expectedReadback falls through to keyword fallback (returns 0 from stub)
var noExpected = clientEvaluate('anything', 'CLEARED|RUNWAY 27', '');
assert('no expectedReadback uses fallback (returns object)', typeof noExpected.score === 'number');

// CONTACT + frequency — wrong frequency fails
console.log('\nCONTACT frequency grading (Bug 2 regression):');
var CONTACT_EXP = 'FASTAIR 345 CONTACT ALEXANDER CONTROL 129 DECIMAL 1';
var contactTokens = extractSemanticTokens(normalizeForGrading(CONTACT_EXP));
assert('extracts CONTACT token', contactTokens.indexOf('CONTACT') !== -1);
assert('extracts frequency 129 as separate token', contactTokens.indexOf('129') !== -1);

var wrongFreq = clientEvaluate(
  'FASTAIR 345 CLIMB TO FLIGHT LEVEL 120 CONTACT DEPARTURE 121 DECIMAL 750', '', CONTACT_EXP);
assert('wrong frequency fails (score < 90)', wrongFreq.score < 90,
       'got score=' + wrongFreq.score + ' missing=' + JSON.stringify(wrongFreq.keywordsMissing));
assert('correct === false for wrong frequency', wrongFreq.correct === false);

var rightFreq = clientEvaluate(
  'FASTAIR 345 CONTACT ALEXANDER CONTROL 129 DECIMAL 1', '', CONTACT_EXP);
assert('correct frequency passes', rightFreq.score >= 90 && rightFreq.correct === true,
       'got score=' + rightFreq.score);

// Exact copy of ATC text must score 100 (regression for "CLIMB 120" substring bug)
var EXACT_COPY_EXP = 'FASTAIR 345 CLIMB TO FLIGHT LEVEL 120 CONTACT DEPARTURE 121 DECIMAL 750';
var exactCopy = clientEvaluate(EXACT_COPY_EXP, '', EXACT_COPY_EXP);
assert('exact copy of ATC text scores 100', exactCopy.score === 100 && exactCopy.correct === true,
       'got score=' + exactCopy.score + ' missing=' + JSON.stringify(exactCopy.keywordsMissing));

// CLIMB with altitude — wrong altitude fails
var CLIMB_EXP = 'FASTAIR 345 CLIMB FLIGHT LEVEL 120 CONTACT DEPARTURE 119 DECIMAL 7';
var climbWrong = clientEvaluate('FASTAIR 345 CLIMB FLIGHT LEVEL 80 CONTACT DEPARTURE 119 DECIMAL 7', '', CLIMB_EXP);
assert('wrong climb altitude fails', climbWrong.score < 90,
       'got score=' + climbWrong.score);

// ---------- summary ----------
console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
