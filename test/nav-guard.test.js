/* A response knows which screen asked for it.
 *
 * setActiveNav bumps _navToken on every change of tab, and about thirty async
 * handlers capture it and bail if it has moved. The simulator — the busiest flow
 * in the product — never adopted it. So: tap a level, tap Shop before the route
 * loads, and the scenario list renders onto the Shop, Begin Route button and all.
 *
 * The guard is not applied everywhere, and should not be. An admin who saves a
 * module and sees it re-render is on the screen they saved from. What matters is
 * the flow a student actually walks: pick a level, fly it, finish it. Those six
 * are held here; the rest are listed so the gap is visible and shrinks on purpose
 * rather than by accident.
 *
 * One distinction worth keeping: on submitScenarioAnswer the guard is on the
 * RENDER, not on the handler. That response carries the attempt, the XP and the
 * confirmation that opens the next phase — an answer already given must be
 * recorded whatever screen the student is looking at. Only the drawing is gated. */
const fs = require('fs');
const S = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};

const fnBody = name => {
  const i = S.indexOf('function ' + name + '(');
  if (i < 0) return '';
  const next = S.indexOf('\n  function ', i + 10);
  return S.slice(i, next > 0 ? next : i + 12000);
};

console.log('--- the flow a student walks ---');
// renderModuleDetail is the one that FETCHES. _renderModuleDetail is the renderer
// it hands the result to — it takes data and draws it, so there is nothing for it
// to be stale about. The guard belongs on whoever asked the server, and naming the
// wrong one of the pair is how a check can look thorough and hold nothing.
const CRITICAL = ['startCountryTraining', 'renderScenarioRoute', 'submitScenarioAnswer',
                  'renderTrainingFinished', 'renderLMSHub', 'renderModuleDetail'];
CRITICAL.forEach(name => {
  ok(name + ' captures the token', /_navToken/.test(fnBody(name)));
});

console.log('--- the route loader, which is where it bit ---');
const start = fnBody('startCountryTraining');
ok('the token is taken after setActiveNav, not before',
   start.indexOf("setActiveNav('Simulator')") < start.indexOf('var _navTok = _navToken'));
ok('the route response checks it',      /_navToken !== _navTok\) return;\s*\/\/ the student is somewhere else/.test(start));
ok('so does the level config',          (start.match(/_navToken !== _navTok/g) || []).length >= 4);
ok('and the failure handler too',
   /withFailureHandler\(function \(err\) \{\s*\n\s*if \(_navToken !== _navTok\) return;/.test(start));
// A timeout that fires after you left tells you the simulator failed on a screen
// that never asked for it.
ok('the fifteen-second timeout checks it as well',
   /_routeLoadTimer = null;\s*\n\s*if \(_navToken !== _navTok\) return;/.test(start));

console.log('--- an answer is recorded even if you walk away ---');
const submit = fnBody('submitScenarioAnswer');
ok('the token is captured', /var _submitTok = _navToken;/.test(submit));
ok('the feedback card is gated on it',
   /if \(_navToken === _submitTok &&\s*\n\s*Number\(AppState\.training\.currentIndex/.test(submit));
ok('the XP chip is gated on it',
   /if \(_navToken === _submitTok &&[\s\S]{0,160}_showXpFloat\(25\)/.test(submit));
// The state must NOT be gated. Dropping this loses an answer the student gave.
ok('but the attempt is still synced whatever screen they are on',
   /withSuccessHandler\(function\(res\) \{\s*\n\s*if \(!res \|\| !res\.ok\) return;\s*\n[\s\S]{0,120}syncTrainingProgressFromAttempt\(res\);/.test(submit));

console.log('--- the debrief does not arrive somewhere else ---');
const fin = fnBody('renderTrainingFinished');
ok('the token is captured',        /var _finishTok = _navToken;/.test(fin));
ok('the loader checks it',         /if \(_navToken !== _finishTok\) return;\s*\n\s*byId\('contentArea'\)/.test(fin));
ok('and so does the debrief',      /if \(_navToken !== _finishTok\) return;\s*\n\s*\/\/ Streak bump/.test(fin));

console.log('--- how far the gap still runs ---');
/* Every function that fetches and then renders. The guarded set grows and this
 * number falls; what it must never do is fall silently, which is what happened
 * when the simulator was written without it. */
const fns = [...S.matchAll(/\n  function ([A-Za-z_$][\w$]*)\s*\(/g)].map(m => [m.index, m[1]]);
fns.push([S.length, '<end>']);
const RENDER = /\b(render[A-Z]\w*|_render[A-Z]\w*|showContentError)\s*\(/;
const unguarded = [];
for (let i = 0; i < fns.length - 1; i++) {
  const body = S.slice(fns[i][0], fns[i + 1][0]);
  if (!body.includes('google.script.run')) continue;
  if (!RENDER.test(body)) continue;
  if (body.includes('_navToken')) continue;
  unguarded.push(fns[i][1]);
}
console.log('    ' + unguarded.length + ' fetch-then-render functions still unguarded');
ok('none of them is on the student\'s path',
   CRITICAL.every(n => !unguarded.includes(n)));
// The renderers those six hand their results to are pure: they draw what they are
// given. Listed so it is clear they were considered rather than missed.
ok('and the renderers they feed take data rather than fetching it',
   !/google\.script\.run/.test(fnBody('_renderModuleDetail').slice(0, 400)));
// A ceiling, not a target. It was 82 when this was written. Lowering it is the
// work; raising it without noticing is what this stops.
ok(`${unguarded.length} unguarded (ceiling 78)`, unguarded.length <= 78);

console.log('--- and the two cards line up ---');
const C = fs.readFileSync(__dirname + '/../Styles.html', 'utf8');
ok('the shop button is pushed to the bottom',
   /\.shop-card > \.btn:last-child \{ margin-top: auto; \}/.test(C));
ok('and the icon beside it is drawn, not an emoji',
   /shop-card-icon">' \+ uiIcon\('climb'/.test(S) && !/shop-card-icon">\u{1F680}/u.test(S));

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
