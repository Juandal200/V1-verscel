/* A route is the flight the student picked, and resuming it continues it.
 *
 * Five things this holds, all found by describing the flow end to end rather than
 * by anything failing:
 *
 *   The scenario list groups by FLIGHT and each card says "8 phases". The runner
 *   was then handed the whole LEVEL with a cursor pointing at that flight's first
 *   phase — so the header counted every scenario in the level, the rail drew all of
 *   them, and every phase before the cursor was marked complete to stop the debrief
 *   gate objecting. Phases nobody flew were recorded as flown, and the number on
 *   the card was not the number on the screen.
 *
 *   A saved position was a number. Coming back, that number was trusted as far as a
 *   bounds check, so a level an admin had reordered resumed somebody onto a
 *   different exercise.
 *
 *   A resumed run minted a NEW session id, which made the second half of a route
 *   look like a session of its own: three phases covered where the gate wants
 *   eight, so a route somebody actually finished scored nothing.
 *
 *   The replay threshold IS the difficulty — it is the single thing that makes
 *   level 9 harder than level 2 — and a failed config call replaced it with 2
 *   without a word.
 *
 *   The XP chip flew on the CLIENT's verdict, and the server's replaces it. When
 *   they disagreed a student watched twenty-five points award themselves and then
 *   saw the panel change. */
const fs = require('fs');
const S = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
const C = fs.readFileSync(__dirname + '/../Código.js', 'utf8');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};

console.log('--- the route is the flight on the card ---');
const launch = S.slice(S.indexOf('function launchOperationalScenario'),
                       S.indexOf('var SIM_STATE_KEY'));
ok('it hands over the group, not the level',
   /scenarios: group\.scenarios\.slice\(\)/.test(launch));
ok('and starts at that flight\'s first phase',
   /_launchIndex = 0;/.test(launch));
ok('nothing hunts for the group inside the whole route any more',
   !/allScenarios\[i\]\.scenarioId === firstScenario\.scenarioId/.test(launch));
ok('which flight is being flown is remembered',
   /_activeGroupIdx = groupIdx/.test(launch));

console.log('--- nothing is marked complete that was not flown ---');
// The helper this used as an end marker sits ABOVE renderScenarioRoute in the
// file, so the slice ran backwards and matched nothing — a test that passes on an
// empty string is worse than no test. Bounded by what follows it instead.
const rStart = S.indexOf('function renderScenarioRoute');
const route  = S.slice(rStart, S.indexOf('function getCurrentScenarioSim', rStart));
ok('no phase below the cursor is pre-marked',
   !/completedScenarioIds\['i' \+ _pri\]/.test(route));
ok('a resumed run carries what the server confirmed',
   /_resumeConfirmedIds/.test(route) && /serverConfirmedIds\[id\]\s*=\s*true/.test(route));

console.log('--- a saved position identifies what it is a position in ---');
const save = S.slice(S.indexOf('function _simStateSave'), S.indexOf('function _simStateLoad'));
['groupIdx', 'scenarioId', 'phaseCount', 'confirmedIds', 'sessionId'].forEach(k => {
  ok('it stores ' + k, new RegExp('\\b' + k + ':').test(save));
});
const load = S.slice(S.indexOf('function _simStateLoad'), S.indexOf('function _simStateLoad') + 1400);
ok('a position written before this is discarded, not guessed at',
   /!s\.scenarioId \|\| s\.groupIdx == null/.test(load));
// The bounds check passed happily on a reordered route. Identity does not.
ok('resuming checks the scenario at the cursor is the one that was saved',
   /String\(_at\.scenarioId\) === String\(_resume\.scenarioId\)/.test(S));
ok('and that the flight is still the same length',
   /_g\.length === Number\(_resume\.phaseCount\)/.test(S));
ok('a position that no longer matches is dropped and the list shown',
   /removeItem\(SIM_STATE_KEY\)[\s\S]{0,200}renderScenarioSelector|no longer matches/.test(S));

console.log('--- a resumed run is the same run ---');
ok('it keeps the session it started with',
   /sessionId = AppState\.training\._resumeSessionId \|\|/.test(S));
ok('and a fresh run still mints one', /'SES-' \+ Date\.now\(\)/.test(S));

console.log('--- the difficulty is not changed in silence ---');
const thr = S.slice(S.indexOf('function _replayThresholdUnavailable'),
                    S.indexOf('function _simToast'));
ok('a failed config call is retried once', /_thresholdRetried/.test(thr));
ok('and the student is told before the default is used', /_simToast\(/.test(thr));
/* This wanted the literal `replayThreshold = 2;`. T-5 named that constant, so
 * the assertion failed while the behaviour it guards — a student is never
 * refused training because a config call did not answer — was intact. The
 * property is that a default is applied, not that it is spelled 2 here. */
ok('the default is still applied, so nobody is refused training',
   /AppState\.training\.replayThreshold = _DEFAULT_REPLAY_THRESHOLD;/.test(thr));
ok('and it comes from the named constant, not a literal',
   !/replayThreshold = \d+;/.test(thr));
// The value itself is asserted, with its cross-runtime twin, in
// test/threshold-parity.test.js — not duplicated here.
ok('which is declared with a value', /var _DEFAULT_REPLAY_THRESHOLD\s*=\s*\d+\s*;/.test(S));

console.log('--- the XP waits for the award to be real ---');
const submit = S.slice(S.indexOf('function submitScenarioAnswer'),
                       S.indexOf('function submitScenarioAnswer') + 6000);
/* CHANGED 7 Sep 2026, reversing a change made the day before.
 *
 * The chip was made to wait for the server so an animation could not be un-played
 * if the verdict changed underneath it. True, and the wrong trade: a disagreement
 * is rare, an Apps Script round trip happens on EVERY correct answer, and on a
 * cold start it is many seconds. Every student paid that wait, every time, to
 * guard against something that may never happen.
 *
 * It fires synchronously in the click handler now, on the screen they are looking
 * at. The server's total still wins — lmsXpTotal overwrites the running figure
 * when it lands — so only the animation is optimistic, and an animation that is
 * occasionally optimistic beats one that is always late. */
ok('the chip flies with the answer',
   /if \(clientEval\.correct\) _showXpFloat\(25\);/.test(submit));
ok('and nothing holds it for a round trip',
   !/res\.attempt\.correct\) \{\s*\n\s*_showXpFloat\(25\)/.test(submit));
ok('a server disagreement is still noticed',
   /XP shown on a client pass the server failed/.test(submit));
ok('the feedback is still instant, which was the point of it',
   /renderAttemptFeedback\(\{\s*\n\s*evaluation: clientEval/.test(submit));
ok('every disagreement between the two graders is recorded',
   /apiLogGraderDisagreement/.test(submit));
ok('and there is something that reads them back',
   /function checkGraderAgreement\(\)/.test(fs.readFileSync(__dirname + '/../LogService.js', 'utf8')));

console.log('--- the level map shows what the shop sold ---');
// buildTrainingCatalogV5Hard_(user, 10) — a hardcoded ten, while the subscription
// card sells whatever the catalogue publishes. A student could pay for Full and
// find five of the levels they bought absent from the map.
ok('the cap is read from the catalogue', /levelCapsFromContent_\(\)\.full/.test(C));
ok('and is not a literal ten', !/buildTrainingCatalogV5Hard_\(user, 10\)/.test(C));
ok('with a floor, so a catalogue read that fails does not empty the map',
   /Math\.max\(_published, 10\)/.test(C));

console.log('--- a screen with one option is not a choice ---');
ok('a level with one country opens it directly',
   /countries\.length === 1\) \{\s*\n\s*startCountryTraining/.test(S));

console.log('--- a failure of ours does not read as a mistake of theirs ---');
ok('a script fetch that fails gives the sitting back', /_scReleaseHold\(\)/.test(S));
ok('and the hold is only released if one was taken',
   /function _scReleaseHold\(\) \{\s*\n\s*if \(!_sc\.reserved\) return;/.test(S));

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
