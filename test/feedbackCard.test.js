/* What a student is told after an attempt — and what they are deliberately not.
 *
 * The suite that used to be here asserted a card with a "Show answer" button, an
 * inline "Expected:" line, and a hidden #fbExpected element carrying the answer
 * text. None of those exist in the product. Not renamed — gone, and gone on
 * purpose. renderAttemptFeedback says so in its own comment: the expected
 * read-back is what the student is meant to stop listening for, "and listening
 * is the whole skill", so the screen gives the score and sends them back to the
 * radio. What was missed is still written to the attempt row for an instructor.
 *
 * So the old suite was not merely stale. It asserted the opposite of a decision,
 * and if anyone had believed it they would have put the answer back on the
 * screen to make it pass. That is worse than a test that fails.
 *
 * This one runs the real renderAttemptFeedback and guards the decision. */
'use strict';
const fs = require('fs');
const S  = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');

function grab(sig) {
  const i = S.indexOf(sig); if (i < 0) return null;
  let d = 0;
  for (let k = S.indexOf('{', i); k < S.length; k++) {
    if (S[k] === '{') d++; else if (S[k] === '}') { d--; if (!d) return S.slice(i, k + 1); }
  }
  return null;
}

let passed = 0, failed = 0;
function assert(label, condition, detail) {
  if (condition) { console.log('  ✓ ' + label); passed++; }
  else { console.error('  ✗ ' + label + (detail ? ' — ' + detail : '')); failed++; }
}

console.log('\nattempt feedback, from Scripts.html\n');

const body = grab('function renderAttemptFeedback(');
assert('renderAttemptFeedback found in source', !!body);
if (!body) { console.error('\ncannot continue'); process.exit(1); }

// What the card is written INTO, captured instead of rendered.
const anything = () => new Proxy({}, { get: (t, p) => (p in t ? t[p] : function () {}) });

let written = '';
// classList because the card marks itself as a result once the verdict is on it
// (has-verdict, for the phone layout). Every real element has one; this stub did
// not, and the first line to use it threw before a single assertion ran.
const el = { set innerHTML(v) { written = v; }, get innerHTML() { return written; },
             style: {}, className: '', appendChild() {}, addEventListener() {},
             classList: { add() {}, remove() {}, contains() { return false; } } };
const AppState = { training: { currentIndex: 0, scenarios: [{}, {}, {}], completedScenarioIds: {} } };
const stubs = {
  AppState,
  byId: () => el,
  safeText: v => String(v == null ? '' : v).replace(/[<>&]/g, ''),
  getRouteProgressPct: () => 33,
  isCurrentScenarioCompleted: () => false,
  goToNextScenario() {}, retryCurrentScenario() {}, renderTrainingFinished() {},
  setImmersiveFeedback(html) { written = html; },
  uiIcon: () => '<svg></svg>', uiIconInline: () => '<svg></svg>',
  document: { getElementById: () => el, querySelector: () => el, createElement: () => el },
  window: {}, console: { log() {}, warn() {}, error() {} },
  // Collaborators the card reaches for on the way past. A Proxy answers
  // whatever it asks for, so the suite does not break the next time the
  // feedback path gains a call.
  SimAudio:  anything(), SimMedia: anything(), AtcRadioEngine: anything(),
  Gamification: anything(), _showXpFloat() {}, _showSimToast() {},
  // The card gives the Send button back now that the verdict is on screen —
  // it used to be left saying "Evaluating…" for the thirty seconds until the
  // safety net fired. Stubbed here; test/readback-button.test.js runs the real one.
  _resetSendReadbackBtn() {},
};
const render = new Function(...Object.keys(stubs), body + '\nreturn renderAttemptFeedback;')(...Object.values(stubs));

function html(res) { written = ''; render(res); return written; }

const EXPECTED = 'right heading 230, cleared ILS approach runway 27';
const failed_  = html({ evaluation: { correct: false, score: 50,
                                      keywordsMissing: ['heading 230', 'runway 27'],
                                      keywordsOk: [] }, expectedAnswer: EXPECTED });
const ok_      = html({ evaluation: { correct: true, score: 100,
                                      keywordsMissing: [], keywordsOk: ['heading 230'] },
                        expectedAnswer: EXPECTED });

console.log('a failed attempt does not hand over the answer:');
assert('the expected read-back is not in the markup', failed_.indexOf(EXPECTED) === -1);
assert('nor any part of it',                          failed_.indexOf('heading 230') === -1,
       'found it — the answer is on screen again');
assert('there is no "Show answer" control',           failed_.indexOf('Show answer') === -1);
assert('and nothing hides it in the DOM instead',     failed_.indexOf('fbExpected') === -1);
// Never fix by hiding: display:none on the answer would still have sent it.
assert('no hidden element carries it',
       !/display:\s*none[^>]*>[^<]*heading 230/.test(failed_));

console.log('\nbut the student is told where they stand:');
assert('the card was written at all', failed_.length > 0);
assert('a passed attempt says so',    /All required elements/.test(ok_));
assert('a failed attempt does not',   !/All required elements/.test(failed_));

console.log('\nand the feedback widget is offered either way:');
/* This was `ok ? widget : ''`, so feedback came only from students who had just
 * succeeded — F-0012. A failed phase is where the useful signal is. */
const widgetIn = h => /feedback-card|Rate this scenario/.test(h);
assert('after a pass', widgetIn(ok_));
assert('after a fail', widgetIn(failed_), 'the F-0012 regression is back');

console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed ? 1 : 0);
