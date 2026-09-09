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

console.log('--- the card hands over nothing at all ---');
/* CHANGED 6 Sep 2026, twice in a day, and the second time was the right one.
 *
 * It printed the keywords verbatim above a Retry button, which is an answer key.
 * That became the KIND of thing missed rather than its value, on the reasoning that
 * a student who fails and is told nothing learns nothing.
 *
 * The reasoning was wrong, because the exercise already answers it: four listens
 * unlock the transmission in full. The path back from a failed read-back is to
 * listen again, and the app exists to give exactly that. Naming the missing
 * elements — even as categories — tells a student which parts to stop listening
 * for, and listening is the whole skill.
 *
 * So the card carries the score and nothing else. What was missed is still written
 * to the attempt row and still visible to an instructor. */
ok('no keyword list',            !/<strong>Missing:<\/strong>/.test(S));
ok('no category list either',    !/You did not read back/.test(S));
ok('and the classifier that built it is gone, not merely unused',
   !/_missingCategories/.test(S) && !/_KW_CATEGORIES/.test(S));
ok('a wrong answer shows its score',
   /<strong>Score:<\/strong> ' \+ safeText\(evaluation\.score \|\| 0\)/.test(S));
ok('and adds nothing when something is missing',
   /\(missing\.length\s*\n?\s*\? ''/.test(S));
ok('a right answer is still told it was right',
   /All required elements included/.test(S));
// The data is not what changed — only what the student is shown.
ok('the attempt row still carries every keyword',
   /keywordsMissing:\s*\(la\.keywordsMissing\s*\|\|\s*\[\]\)\.join\('\|'\)/.test(S));

/* --- the transcriber is told what KIND of thing it is listening to ---
 *
 * Five assertions here used to require the opposite of what follows. They
 * required the scenario's expected read-back to be appended to the Whisper
 * prompt, and required the header that carried it — on the reasoning that the
 * tail of a prompt has the most weight and the sharpest hint for a read-back is
 * the clearance being read back.
 *
 * That reasoning was right about prompting and wrong about the product. The
 * hint was the answer. At temperature 0 with silence to transcribe, Whisper
 * returns the prompt — so a student who tapped the microphone, said nothing and
 * tapped again got the correct read-back typed into the box and scored on it.
 *
 * The assertions are reversed rather than deleted, because the thing that must
 * not come back is exactly what they used to demand. The vocabulary stays: it
 * is what separates "turn right" from "tongue right", and neither of those is
 * the answer to anything. */
console.log('--- the transcriber is told what it is listening to ---');
ok('a prompt is sent',            /formData\.append\('prompt'/.test(W));
ok('it carries ICAO phraseology', /const PHRASEOLOGY =/.test(W) && /cleared for takeoff/i.test(W));
ok('and it is the same prompt for every request',
   /formData\.append\('prompt', PHRASEOLOGY\);/.test(W));
ok('the scenario\'s own answer is NOT appended to it',
   !/PHRASEOLOGY \+ ' ' \+/.test(W));
ok('it does not invent when unsure', /formData\.append\('temperature', '0'\)/.test(W));
ok('the proxy does not read an expected-readback header',
   !/x-expected-readback/i.test(W));
ok('nor allow one through CORS',  !/X-Expected-Readback/.test(W));
ok('and the client does not send one', !/X-Expected-Readback/.test(S));
// What the prompt is FOR still works: the ambiguity it resolves is between two
// aviation phrases, and both are in the list.
ok('both headings are still in the vocabulary',
   /turn left heading, turn right heading/.test(W));

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
