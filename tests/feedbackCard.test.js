// Unit tests for Issue 7 — Expected readback hidden behind "Show answer"
// Run: node tests/feedbackCard.test.js

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

// ---------- minimal safeText stub ----------

function safeText(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ---------- renderAttemptFeedback HTML builder (extracted logic) ----------

function buildFeedbackHtml(res) {
  var evaluation = res.evaluation || {};
  var missing = evaluation.keywordsMissing || [];
  var ok = evaluation.correct === true;

  var expectedHtml = res.expectedAnswer
    ? (function(s){ var l = String(s||'').toLowerCase(); return l.charAt(0).toUpperCase()+l.slice(1); })(res.expectedAnswer)
    : '';

  return (
    '<h3>' + (ok ? '✓ Read-back accepted' : '✗ Non-standard read-back') + '</h3>' +
    '<p><strong>Score:</strong> ' + safeText(evaluation.score || 0) + '/100</p>' +
    (missing.length
      ? '<p><strong>Missing:</strong> ' + safeText(missing.map(function(k){ return k.toLowerCase(); }).join(', ')) + '</p>'
      : '<p style="color:#6ee7b7;"><strong>✓ All required elements included.</strong></p>') +
    (!ok && expectedHtml
      ? '<div style="margin-top:6px;">' +
          '<button class="btn secondary" style="font-size:0.8rem;padding:4px 10px;" onclick="var d=document.getElementById(\'fbExpected\');d.style.display=d.style.display===\'none\'?\'\':\'none\'">Show answer</button>' +
          '<p id="fbExpected" style="display:none;margin-top:6px;"><em>' + safeText(expectedHtml) + '</em></p>' +
        '</div>'
      : '')
  );
}

// ---------- tests ----------

var EXPECTED_TEXT = 'right heading 230, cleared ILS approach runway 27, Speedbird 217 heavy';

console.log('\nIssue 7 — feedback card Expected readback\n');

// Failure card
console.log('Failure card:');
var failHtml = buildFeedbackHtml({
  evaluation: { correct: false, score: 50, keywordsMissing: ['HEADING 230', 'RUNWAY 27'] },
  expectedAnswer: EXPECTED_TEXT
});

assert('does NOT show Expected inline',
       failHtml.indexOf('<strong>Expected:</strong>') === -1);

assert('has "Show answer" button',
       failHtml.indexOf('Show answer') !== -1);

assert('expected text is present but hidden (display:none)',
       failHtml.indexOf('display:none') !== -1 &&
       failHtml.indexOf('fbExpected') !== -1);

assert('expected text is inside the hidden element (not exposed)',
       (function() {
         var hiddenStart = failHtml.indexOf('fbExpected');
         var expectedPos = failHtml.toLowerCase().indexOf('right heading');
         return hiddenStart !== -1 && expectedPos > hiddenStart;
       })());

assert('Missing keywords shown', failHtml.indexOf('heading 230') !== -1);
assert('Score shown',            failHtml.indexOf('50/100') !== -1);

// Success card
console.log('\nSuccess card:');
var okHtml = buildFeedbackHtml({
  evaluation: { correct: true, score: 100, keywordsMissing: [] },
  expectedAnswer: EXPECTED_TEXT
});

assert('no "Show answer" button on success',  okHtml.indexOf('Show answer') === -1);
assert('no Expected inline on success',        okHtml.indexOf('<strong>Expected:</strong>') === -1);
assert('no fbExpected element on success',     okHtml.indexOf('fbExpected') === -1);
assert('all-included message shown',           okHtml.indexOf('All required elements') !== -1);

// Failure with no expectedAnswer — no Show answer button
console.log('\nFailure with no expectedAnswer:');
var failNoExpHtml = buildFeedbackHtml({
  evaluation: { correct: false, score: 30, keywordsMissing: ['CLIMB'] },
  expectedAnswer: ''
});
assert('no "Show answer" when expectedAnswer is empty', failNoExpHtml.indexOf('Show answer') === -1);

// ---------- summary ----------
console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
