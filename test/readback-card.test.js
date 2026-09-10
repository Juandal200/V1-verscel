/* The read-back card's layout, and the state that used to live on a button.
 *
 * This file was test/readback-button.test.js. It covered #simSendReadbackBtn —
 * one lookup, one label, and a thirty-second timer that reset both. The QA
 * restructure of 2026-09-09 deleted that button: speaking is the input and
 * typing is the alternative to it, so the card has ONE primary action and Enter
 * submits a typed answer, as _commsKeyHandler has always done.
 *
 * What the old suite protected is still protected, in the place the state moved
 * to. There is no button to disagree about any more — the row has two slots and
 * the right-hand one carries either a status or the advance button, never both,
 * because they cannot co-occur.
 *
 * Stopping the recorder still does not submit. That is deliberate and it is
 * asserted here: Whisper mishears aviation terms, _BASE_FIXES repairs forty of
 * them and is known incomplete, and grading is on keywords — so the transcript
 * has to survive long enough to be read. */
const fs = require('fs');
const vm = require('vm');
const S = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
const C = fs.readFileSync(__dirname + '/../Styles.html', 'utf8');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};
// A comment must never be what satisfies a check, nor what breaks one.
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
const code  = strip(S);
const css   = C.replace(/\/\*[\s\S]*?\*\//g, '');

function grab(sig) {
  const i = S.indexOf(sig);
  if (i < 0) throw new Error('not found: ' + sig);
  let d = 0;
  for (let k = S.indexOf('{', i); k < S.length; k++) {
    if (S[k] === '{') d++;
    else if (S[k] === '}') { d--; if (!d) return S.slice(i, k + 1); }
  }
}

console.log('--- one renderer builds this card ---');
ok('renderScenarioStageImmersive exists',
   /function renderScenarioStageImmersive\(\) \{/.test(code));
// The practice test has its own card around #icaoReadback. If a second thing
// ever emits #pilotReadback, the two-copies rule has arrived here too.
ok('and nothing else emits the read-back textarea',
   (code.match(/id="pilotReadback"/g) || []).length === 1);
ok('the practice test is a separate card, untouched',
   /id="icaoReadback"/.test(code));

/* The card as EMITTED, with comments stripped first.
 *
 * Built from S, the order check failed on "Practice again" — appearing 900
 * characters early, inside the comment above the action row that explains why
 * Practice again sits above the feedback panel. Second time in this session a
 * comment I wrote broke a check I wrote; the rule is in CLAUDE.md and it is
 * still easy to forget. Markup only, from here down. */
const card = code.slice(code.indexOf('sim-readback-priority-card'),
                        code.indexOf('mountImmersiveScenarioVisual(scenario);'));

console.log('--- the DOM order matches the target ---');
const order = ['PILOT READ-BACK', 'sim-helper-text', 'id="pilotReadback"',
               'id="simMicBtn"', 'id="simActionRow"', 'Practice again',
               'id="simStatusText"', 'id="simFeedbackBox"'];
let last = -1, bad = null;
order.forEach(tok => {
  const at = card.indexOf(tok);
  if (at < 0 || at < last) bad = bad || tok;
  last = Math.max(last, at);
});
ok('label, hint, textarea, action, row, practice-again, status, feedback — in that order',
   bad === null);
if (bad) console.log('        first out of place: ' + bad);

console.log('--- one full-width primary action ---');
ok('the speak button carries the full-width class', /id="simMicBtn"[^>]*sim-speak-action/.test(card));
ok('and the class is what makes it full width', /\.sim-speak-action \{[^}]*width: 100%/.test(css));
// Send is gone from markup, from the DOM, and from anything that looked it up.
ok('no send button is emitted',        !/simSendReadbackBtn/.test(code));
ok('nothing looks one up',             !/_sendReadbackBtn/.test(code));
ok('and the label-restore mechanism went with it', !/data-idle-label/.test(code));
// The handler must NOT go: Enter submits through it.
ok('the submit handler survives',      /function immersiveSendReadback\(\)/.test(code));
ok('Enter still reaches it',
   /if \(e\.key === 'Enter' && !e\.shiftKey\) \{[\s\S]{0,80}_simSubmitReadback\(\);/.test(code));

console.log('--- stopping the recorder does not submit ---');
ok('the transcript handler still gates on Enter having asked',
   /window\._simOnTranscript = function\(\) \{\s*\n\s*if \(!_sendAfterTranscript\) return;/.test(code));
ok('and the keyboard path still stops the recorder first',
   /_sendAfterTranscript = true;/.test(code));

console.log('--- no bare "Retry" is left in this card ---');
const verdict = code.slice(code.indexOf('var actions ='), code.indexOf('var actionRow'));
ok('the action is named once, not by outcome', /Practice again<\/button>/.test(verdict));
ok('and never "Retry"',                        !/>Retry</.test(verdict));
ok('nor is it named by outcome anywhere in the card', !/'Practice again' : 'Retry'/.test(code));
// Every other Retry in the file belongs to another screen and is out of scope.
ok('the card as first drawn says Practice again', /Practice again<\/button>/.test(card));
ok('and does not say Retry',                      !/>Retry</.test(card));

console.log('--- the feedback panel is always there ---');
ok('it is rendered with the card, not on the first verdict',
   /id="simFeedbackBox"[^>]*is-empty/.test(card));
ok('carrying its placeholder',   /Feedback appears after evaluation/.test(card));
ok('with space reserved so nothing shifts', /#simFeedbackBox \{[^}]*min-height/.test(css));
/* On the ID, deliberately. .sim-feedback-box is declared twice at top level in
 * Styles.html, differing on min-height, so the first is dead — a change written
 * there would have done nothing at all. */
ok('and the reserve is not written on the duplicated class',
   !/\.sim-feedback-box \{[^}]*min-height: 150px/.test(css));

console.log('--- the row keeps one shape in every state ---');
ok('the action row is never hidden',   !/id="simActionRow"[^>]*display:none/.test(card));
ok('nor toggled by script',            !/actionRow\.style\.display/.test(code));
ok('the verdict rebuilds both slots',
   /'<button class="btn secondary" onclick="retryCurrentScenario\(\)">Practice again<\/button>' \+/.test(verdict));
ok('advance and status share the right-hand slot',
   /isCurrentScenarioCompleted\(\)/.test(verdict) && /id="simStatusText"/.test(verdict));
// A pass the server has not confirmed must not offer a way onward.
ok('an unconfirmed pass shows Saving, not a button',
   /: '<span id="simStatusText" class="sim-status-text">' \+ \(ok \? 'Saving/.test(verdict));

console.log('--- the status slot, run for real ---');
const src = [grab('function _simSetStatus(text)'),
             'return _simSetStatus;'].join('\n');
function slot(initial) {
  const el = { textContent: initial };
  const set = new Function('byId', src)(() => el);
  return { el, set };
}
let s1 = slot('');
s1.set('Evaluating…');
ok('it writes the status',            s1.el.textContent === 'Evaluating…');
s1.set('');
ok('and clears it',                   s1.el.textContent === '');
const missing = new Function('byId', src)(() => null);
missing('Evaluating…');
ok('a missing slot is not an error',  true);

console.log('--- the complete set of statuses, and no others ---');
const phase = grab('window._micPhase = function (textareaId, phase)');
ok('recording while the microphone is live',   /'Recording\\u2026'/.test(phase));
ok('transcribing after they stop',             /'Transcribing\\u2026'/.test(phase));
ok('evaluating on submit',                     /_simSetStatus\('Evaluating\\u2026'\)/.test(code));
ok('saving until the server confirms',         /'Saving\\u2026'/.test(verdict));
// "Live transcription" would claim something batch Whisper does not do.
// Against stripped source: the comment at the fetch explains that this is NOT
// live transcription, and the phrase in it is not a claim the product makes.
ok('nothing claims live transcription',        !/[Ll]ive transcription/.test(code));

console.log('--- and only this screen hears the microphone ---');
ok('the hook is registered, not called across the boundary',
   /window\._micPhase = function \(textareaId, phase\)/.test(code));
ok('it ignores every other textarea',
   /if \(textareaId !== 'pilotReadback'\) return;/.test(phase));
ok('the recorder guards the call',
   /try \{ if \(window\._micPhase\) window\._micPhase\(textareaId, phase\); \} catch \(e\) \{\}/.test(code));
ok('and emits at every exit, not only the happy one',
   (code.match(/_emitPhase\(textareaId, ''\)/g) || []).length >= 3);

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
