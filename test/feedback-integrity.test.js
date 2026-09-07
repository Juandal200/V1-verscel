/* What the exercise tells you, and what it must not.
 *
 * Three faults, all visible on one screenshot of exercise 2 of 8:
 *
 *   The card read "Route progress: 88% (7/8 phases)" on the second exercise of a
 *   fresh run, while the rail beside it showed one phase done. It was reporting a
 *   LIFETIME record as though it were a position — apiGetRouteCompletion reads the
 *   Attempts sheet by userId, level and country with no session and no date, and its
 *   answer was written into both working sets. The unseen half of that was worse:
 *   serverConfirmedIds gates advancing, so the gate opened on phases the student had
 *   not answered in this run.
 *
 *   Under it: "Missing: runway 27, turn right heading 050, squawk 5501, report
 *   passing 4 000 feet" — the answer key, directly above a Retry button.
 *
 *   And the read-back it marked 20/100 had been transcribed as "zero-zero-FIT" and
 *   "Tongue Right". The student may well have said it correctly. Whisper was being
 *   called with no prompt at all, so it was transcribing general English. */
const fs = require('fs');
const S = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
const W = fs.readFileSync(__dirname + '/../api/whisper.mjs', 'utf8');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};

console.log('--- a lifetime record is not a position ---');
// Anchored on the call, not the first mention of its name — the note explaining
// this fault names the function, and the slice landed inside the note.
const seed = S.slice(S.indexOf('.apiGetRouteCompletion(AppState.sessionToken') - 1400,
                     S.indexOf('.apiGetRouteCompletion(AppState.sessionToken') + 120);
ok('the lifetime answer is counted, not spread into a set',
   /AppState\.training\.lifetimeCompleted = n;/.test(seed));
ok('it no longer writes the advance gate',
   !/serverConfirmedIds\['i' \+ i\] = true;\s*\n\s*AppState\.training\.completedScenarioIds/.test(S));
ok('nor the progress bar',
   !/done\[String\(sc\.scenarioId[\s\S]{0,200}completedScenarioIds\['i' \+ i\] = true/.test(S));
ok('and it is cleared when a run starts',
   /lifetimeCompleted = null;/.test(S));

console.log('--- the card says which number it is showing ---');
const card = S.slice(S.indexOf('route-progress-live') - 400, S.indexOf('route-progress-live') + 700);
ok('this run is labelled as this run',       /<strong>This run:<\/strong>/.test(card));
ok('the vague label is gone',                !/<strong>Route progress:<\/strong>/.test(S));
ok('the lifetime figure has its own line',   /Best on this route:/.test(card));
ok('shown only when it is ahead of the run',
   /lifetimeCompleted\) > completedCount/.test(card));

console.log('--- the two sets still mean what they meant ---');
// This was already right and the fix must not disturb it: optimistic drives the
// bar, confirmed opens the door. What was wrong was the lifetime data in both.
ok('the advance gate reads the confirmed set',
   /function isCurrentScenarioCompleted\(\)[\s\S]{0,200}serverConfirmedIds/.test(S));
ok('the optimistic view is still separate',
   /function isCurrentScenarioCompletedOptimistic\(\)/.test(S));
ok('and only a server response writes the confirmed set',
   /if \(correct && completionKey && !res\._fromClient\) \{\s*\n\s*AppState\.training\.serverConfirmedIds/.test(S));

console.log('--- the card does not hand over the answer ---');
const src = S.slice(S.indexOf('  var _KW_CATEGORIES'), S.indexOf('  function renderAttemptFeedback'));
const categorise = new Function(src + 'return _missingCategories;')();
ok('the verbatim keyword list is gone',
   !/<strong>Missing:<\/strong>' \+ safeText\(missing\.map/.test(S));
ok('and what replaces it names a kind',
   /You did not read back:/.test(S));

// The exact list from the screenshot.
const real = ['runway 27', 'turn right heading 050', 'squawk 5501', 'report passing 4 000 feet'];
const said = categorise(real).join(', ');
console.log('    ' + said);
ok('it names every kind that was missed', categorise(real).length === 4);
ok('and not one of the values',           !/\d/.test(said));
[['QNH 1013', 'the altimeter setting'],
 ['contact tower 118.1', 'a frequency or a station'],
 ['taxi via alpha', 'a taxi instruction'],
 ['flight level 350', 'a flight level'],
 ['DESERTAIR 727', 'your callsign']].forEach(([kw, want]) => {
  ok(`"${kw}" reads as ${want}`, categorise([kw])[0] === want);
});
ok('an unrecognised keyword still says something useful',
   categorise(['wibble'])[0] === 'an element of the clearance');
ok('the same kind twice is said once',
   categorise(['heading 050', 'heading 270']).length === 1);
// The data is not what changed — only what the student is shown.
ok('the attempt row still carries every keyword',
   /keywordsMissing:\s*\(la\.keywordsMissing\s*\|\|\s*\[\]\)\.join\('\|'\)/.test(S));

console.log('--- the transcriber is told what it is listening to ---');
ok('a prompt is sent',            /formData\.append\('prompt'/.test(W));
ok('it carries ICAO phraseology', /const PHRASEOLOGY =/.test(W) && /cleared for takeoff/i.test(W));
ok('and the clearance this answer reads back',
   /x-expected-readback/.test(W) && /PHRASEOLOGY \+ ' ' \+ expected/.test(W));
// The tail of a Whisper prompt carries the most weight, so the scenario goes last.
ok('the scenario goes last, where the weight is',
   W.indexOf('PHRASEOLOGY') < W.indexOf("PHRASEOLOGY + ' ' + expected"));
ok('it does not invent when unsure', /formData\.append\('temperature', '0'\)/.test(W));
ok('the header is allowed through CORS',
   /Allow-Headers[^)]*X-Expected-Readback/.test(W));
ok('the client sends it',         /X-Expected-Readback/.test(S));
ok('stripped to what a header may carry',
   /replace\(\/\[\^\\x20-\\x7E\]\/g, ' '\)/.test(S));

console.log('--- and the fallback picks the best guess, not the first ---');
ok('it asks for several',        /maxAlternatives = 5;/.test(S));
ok('and chooses among them',     /function _bestAlternative\(result, expected\)/.test(S));
const bs = S.slice(S.indexOf('function _bestAlternative'), S.indexOf('function _resetBtn'));
const deps = S.slice(S.indexOf('  var _BASE_FIXES'), S.indexOf('  function _resetBtn'));
const best = new Function(deps + 'return _bestAlternative;')();
// The recogniser ranked the wrong one first. This is that transcript.
const picked = best([
  { transcript: 'Report passing zero zero-zero-FIT after departure, Tongue Right. Cleared for takeoff.' },
  { transcript: 'Runway two seven, turn right heading zero five zero, squawk five five zero one, report passing four thousand feet' }
], 'Runway 27, turn right heading 050, squawk 5501, report passing 4000 feet');
ok('the aviation reading beats the recogniser\'s own ranking',
   /turn right heading/i.test(picked) && !/Tongue Right/i.test(picked));
ok('with nothing to compare against it keeps the first',
   best([{ transcript: 'one' }, { transcript: 'two' }], '') === 'one');

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
