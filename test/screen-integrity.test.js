/* A screen that loaded correctly must not be destroyed by something behind it.
 *
 * A student opened the level map, watched it render, touched nothing for twenty
 * seconds, and then watched it be replaced by "The training server took too long
 * to answer. Please try again." That screen fires several calls in parallel; one
 * of them gave up at the proxy's 45-second limit long after the map was already
 * on screen. There was nothing to try again. They had not asked for anything.
 *
 * A guard for this already existed and was too narrow: it asked whether an
 * EXAMINATION or a ROUTE was running. On the level map it answered no, so the
 * error was free to take the screen.
 *
 * The question is not "is this student busy". It is "did they ask for this". */
const fs = require('fs');
const S = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
const Sc = strip(S);
const g = Sc.slice(Sc.indexOf('function _isMidActivity'), Sc.indexOf('function handleServerError'));

console.log('--- waiting for a screen, or reading one ---');
ok('the guard inspects what is on screen',   /byId\('contentArea'\)/.test(g));
// Everything the app paints while a screen is still on its way.
['app-spinner-wrap', 'skeleton-card', 'completion-loading-shell', 'boot-placeholder']
  .forEach(c => ok('a ' + c + ' means they are still waiting', new RegExp(c).test(g)));
ok('content that is not a loader means they are reading',
   /if \(!waiting && area\.children\.length\) return true;/.test(g));

console.log('--- and what it always protected, it still protects ---');
ok('an examination in progress',  /byId\('teaCards'\) \|\| byId\('pilotReadback'\)/.test(g));
ok('and the cockpit',             /classList\.contains\('sim-focus-mode'\)/.test(g));
// Storage and DOM access both throw in edge cases; a guard must never be the
// thing that takes the screen down.
ok('it cannot throw',             /catch \(e\) \{\}\s*\n\s*return false;/.test(g));

console.log('--- the rule lives where every caller passes ---');
/* It was in handleServerError first, which covered one of the forty-three routes
 * to this function. Every other caller reaches showContentError directly. */
const sce = Sc.slice(Sc.indexOf('function showContentError'),
                     Sc.indexOf('function showContentError') + 900);
ok('showContentError asks before it replaces anything',
   sce.indexOf('_isMidActivity()') < sce.indexOf('contentArea.innerHTML'));
ok('and says it out loud instead',   /_gToast\(message, 'err'\)/.test(sce));
ok('or at least records it',         /console\.error\('\[suppressed during activity\]', message\)/.test(sce));
ok('the screen is only replaced after the guard passes',
   /if \(_isMidActivity\(\)\) \{[\s\S]{0,220}return;\s*\n\s*\}\s*\n\s*contentArea\.innerHTML/.test(sce));

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
