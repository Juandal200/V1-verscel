/* The app must not confirm work the server never recorded.
 *
 * renderTrainingFinished called _finish(null) on BOTH failure paths, and _finish
 * is the entire ceremony: markCurrentRouteCompletedOnClient, buildCompletionCatalog,
 * the certificate auto-save, the debrief. For a route the server has no record of.
 * The student saw "ROUTE COMPLETE", closed the app, and came back to a level still
 * locked — A1's untruth arriving from the other direction.
 *
 * WHAT IS ACTUALLY AT RISK, and why the copy says what it says. apiSubmitAttempt
 * appends to Attempts and calls updateUserProgress as each phase is answered, so
 * the answers and per-scenario progress are already banked. apiCompleteRoute and
 * apiFinalizeRoute are reconciliation calls. Telling a student their progress was
 * lost would be as untrue as telling them it was saved. */
'use strict';
const fs = require('fs');
const S  = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
const A  = fs.readFileSync(__dirname + '/../Attemptservice.js', 'utf8');
const SRC = S.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
let fails = 0; const ok = (n, c, d) => { if (!c) fails++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c || !d ? '' : ' — ' + d)); };
function grab(src, sig) {
  const i = src.indexOf(sig); if (i < 0) return null;
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  return null;
}

console.log('\nroute completion, from Scripts.html\n');

console.log('a failed reconciliation no longer runs the ceremony:');
ok('_finish is called only on ok',
   /if \(res && res\.ok\) \{ _finish\(res\); return; \}/.test(SRC));
ok('_finish\\(null\\) is gone from both paths', !/_finish\(null\)/.test(SRC));
const unconf = grab(SRC, 'function _completionUnconfirmed(');
ok('_completionUnconfirmed exists', !!unconf);
if (!unconf) { console.log('\ncannot continue'); process.exit(1); }
ok('it does not mark the route complete on the client',
   unconf.indexOf('markCurrentRouteCompletedOnClient') === -1);
ok('nor build the completion catalog',  unconf.indexOf('buildCompletionCatalog') === -1);
ok('nor auto-save a certificate',       unconf.indexOf('apiSaveCertificate') === -1);
ok('nor open the debrief',              unconf.indexOf('apiGetTrainingDebrief') === -1 &&
                                        unconf.indexOf('_finishAndShow') === -1);
ok('it stops the loading ticker',       /clearInterval\(_loadTick\)/.test(unconf));
ok('and reports, so the failure is not invisible',
   /_reportClientError\('completeRoute'/.test(unconf));

console.log('\nthe copy is true about what was lost:');
ok('it says the route is unconfirmed',  /Route not confirmed/.test(unconf));
ok('and that the answers are saved',    /Your answers are saved/.test(unconf));
ok('it does not claim progress was lost',
   !/progress (was|were|not) ?(lost|saved)/i.test(unconf) && !/lost/i.test(unconf));
ok('and promises no automatic reconciliation',
   !/will sync|automatically|come back/i.test(unconf));

console.log('\nthe retry it offers actually works:');
ok('it re-enters renderTrainingFinished',
   /window\.renderTrainingFinished\(\)/.test(unconf));
ok('which is exported',  /window\.renderTrainingFinished = renderTrainingFinished;/.test(SRC));
/* And re-running it cannot double-count: updateUserProgress derives
 * completedScenarios from the Attempts sheet rather than incrementing, and
 * updates the existing row rather than appending a second one. */
const upd = grab(A, 'updateUserProgress: function(');
ok('updateUserProgress derives the count, not increments it',
   !!upd && /var completedScenarios = Object\.keys\(completedScenarioMap\)\.length;/.test(upd));
ok('and updates the row in place when it exists',
   !!upd && /dbUpdateByRow_\('Progress', existing\.__rowNumber, progressData\);/.test(upd));

console.log('\nand the durable write really is per attempt:');
ok('apiSubmitAttempt appends to Attempts', /dbAppend_\('Attempts', attempt\);/.test(A));
ok('and updates progress there',           /ProgressService\.updateUserProgress\(user, scenario\);/.test(A));

console.log(fails ? ('\n' + fails + ' FAILING') : '\nall green');
process.exit(fails ? 1 : 0);
