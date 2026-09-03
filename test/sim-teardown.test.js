/* Leaving the simulator must stop the simulator.
 *
 * Four separate exits have now been found that left the engine loop, the ambience
 * or the altitude alert running over the top of another screen. The guarantee this
 * checks is structural: no route out of focus mode drops the class on its own. */
const fs = require('fs');
const S  = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};

const removals = [...S.matchAll(/classList\.remove\(\s*['"]sim-focus-mode['"]\s*\)/g)]
  .map(m => S.slice(0, m.index).split('\n').length);

console.log('  drops the class at line(s): ' + removals.join(', '));
ok('exactly one place drops the focus class', removals.length === 1);

const fn = S.slice(S.indexOf('function disableSimulatorFocusMode'),
                   S.indexOf('function getScenarioAtcTextSafe'));
ok('that place is disableSimulatorFocusMode', /function disableSimulatorFocusMode/.test(fn));
ok('and it stops the media',                  /simMediaStopAll/.test(fn));

const back = S.slice(S.indexOf('function goSmartBack'), S.indexOf('function goSmartBack') + 900);
ok('the Back button leaves through that function', /disableSimulatorFocusMode\(\)/.test(back));
ok('and no longer drops the class itself',        !/classList\.remove\(['"]sim-focus-mode/.test(back));

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
