/* R-0009 — what a review found by sitting in the simulator for an hour.
 *
 * The two blockers turned out to be one bug wearing two faces. The transmission
 * plays by itself when a phase opens, and that automatic playback was spending
 * one of the student's replays — so the counter read 1 of 2 before they touched
 * anything, and the attempt row was sent to the server claiming a replay they
 * never made. Meanwhile Retry rebuilt the screen, which re-ran init(), which set
 * the count back to zero — and autoplay put it straight back to one. Press Retry
 * four times, hear the clearance four times, and the count is still one. The text
 * could never unlock.
 *
 * Two controls that both play the audio, and only one of them counts. */
const fs = require('fs');
const S = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
const C = fs.readFileSync(__dirname + '/../Styles.html', 'utf8');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
const Sc = strip(S), Cc = strip(C);
const gate = Sc.slice(Sc.indexOf('var AtcReplayGate'), Sc.indexOf('var SimMedia'));

console.log('--- F-0013 · only a press spends a replay ---');
ok('increment knows who asked',        /function increment\(isManual\)/.test(gate));
ok('an automatic play does not count', /if \(!isManual\) \{ _renderCounter\(\); return; \}/.test(gate));
ok('but it still redraws the counter', /_renderCounter\(\); return;/.test(gate));
// Three autoplay paths: the normal one, the catch, and the no-audio fallback.
ok('all three autoplay paths pass false',
   (Sc.match(/AtcReplayGate\.increment\(false\)/g) || []).length === 3);
ok('both replay-button paths pass true',
   (Sc.match(/AtcReplayGate\.increment\(true\)/g) || []).length === 2);
ok('and no call is left ambiguous',
   !/AtcReplayGate\.increment\(\s*\)/.test(Sc));
/* The count goes to the server on the attempt row. A phantom replay there is a
 * phantom replay in every report built on it. */
ok('the attempt row still reports the count',
   /replayCount:\s+AtcReplayGate\.getCount\(\)/.test(Sc));

console.log('--- F-0014 · a rebuild does not erase the count ---');
ok('the gate knows which message it holds', /var _key\s+= '';/.test(gate));
ok('init takes that key',                   /function init\(text, threshold, key\)/.test(gate));
ok('and only resets for a different one',
   /var same = key && key === _key;/.test(gate) &&
   /if \(!same\) \{\s*\n\s*_count\s+= 0;/.test(gate));
ok('a rebuild still redraws, because the DOM went away',
   /if \(!same\) \{[\s\S]{0,120}\}\s*\n\s*_renderCounter\(\);\s*\n\s*_renderText\(\);/.test(gate));
// The run id changes when the route restarts; the scenario id when the phase does.
ok('the key is the run and the scenario',
   /\(AppState\.training\.sessionId \|\| ''\) \+ '\|' \+ \(\(scenario && scenario\.scenarioId\) \|\| ''\)/.test(Sc));
ok('Retry still rebuilds the stage, as it always did',
   /function retryCurrentScenario\(\)[\s\S]{0,200}renderScenarioStageImmersive\(\)/.test(Sc));

console.log('--- and the words match what the counter counts ---');
ok('the status line talks about replays',   /more replays to unlock the text/.test(gate));
ok('the mask does too',                     /unlocks after ' \+ _threshold \+ ' replay/.test(gate));
// It read "do not press Replay" directly above the only control that unlocks it.
ok('the hint no longer forbids the fix',    !/do not press Replay/.test(Sc));
ok('it says when Replay becomes available', /Replay is available once it finishes/.test(Sc));

console.log('--- F-0010 · Retry is reachable without scrolling ---');
/* It was written into #simFeedbackBox, the last block in the card — so it landed
 * under the textarea, under Speak, under Send, and under however many lines of
 * feedback the attempt produced. */
const card = Sc.slice(Sc.indexOf('sim-readback-priority-card'),
                      Sc.indexOf('mountImmersiveScenarioVisual(scenario);'));
ok('the row has its own element',   /id="simActionRow"/.test(card));
ok('it sits above the feedback box',
   card.indexOf('simActionRow') < card.indexOf('id="simFeedbackBox"'));
ok('and directly below Send',
   card.indexOf('simSendReadbackBtn') < card.indexOf('simActionRow'));
ok('empty until there is something to act on', /id="simActionRow"[^>]*display:none/.test(card));
ok('the feedback html no longer carries the buttons',
   !/'<div class="sim-action-row">'/.test(Sc));
ok('they are written to the row instead',
   /actionRow\.innerHTML = actions;/.test(Sc) && /actionRow\.style\.display = 'flex';/.test(Sc));

console.log('--- F-0011 · the rating says what happened ---');
/* Anchor on the ASSIGNMENT, not the name. The name appears first inside an
 * onclick attribute a thousand lines earlier, and slicing between two onclick
 * attributes hands back one line of markup that contains none of this. */
const fb = Sc.slice(Sc.indexOf('window._fbScenarioSubmit = function'),
                    Sc.indexOf('window._fbScenarioSkip = function'));
ok('a comment alone is worth sending',
   /if \(_selectedStars === 0 && !comment\)/.test(fb));
ok('and an empty form is asked about, not blanked',
   /Choose a star rating or write a comment first/.test(fb));
ok('the thanks waits for the server',
   /withSuccessHandler\(function\(res\)[\s\S]{0,220}Thanks for your feedback/.test(fb));
ok('a failure says so',              /withFailureHandler\(function\(\) \{ _fbRatingFailed/.test(fb));
ok('and keeps what they typed',      /function _fbRatingFailed[\s\S]{0,200}btns\[b\]\.disabled = false/.test(Sc));
ok('there is a pending state between the two', /note\('Sending/.test(fb));
ok('nothing is confirmed before the call returns',
   !/w\.innerHTML = '<p style="color:var\(--green\)[^']*'\s*\+\s*\(_selectedStars > 0/.test(Sc));

console.log('--- F-0012 · the arrows belong to whoever is using them ---');
const keys = Sc.slice(Sc.indexOf('function _bindCommsKeyHandler'), Sc.indexOf('var _ALT_PHASES'));
ok('the handler is still capture-phase',
   /document\.addEventListener\('keydown', _commsKeyHandler, true\)/.test(keys));
ok('but yields while the read-back box has focus',
   /if \(_ae && _ae\.id === 'pilotReadback'\) return;/.test(keys));
// The yield must come before the arrows, or it changes nothing.
ok('and yields before it reads them',
   keys.indexOf("_ae.id === 'pilotReadback'") < keys.indexOf("e.key === 'ArrowUp'"));
ok('Enter still submits from anywhere',
   keys.indexOf("e.key === 'Enter'") < keys.indexOf("_ae.id === 'pilotReadback'"));
ok('the on-screen climb and descend still fly it',
   /_adjAlt\(100\)/.test(Sc) && /_adjAlt\(-100\)/.test(Sc));

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
