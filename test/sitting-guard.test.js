/* Half an hour of examination, lost to one mis-tap.
 *
 * The ICAO sitting runs inside the ordinary app shell. Unlike the simulator it
 * never calls enableSimulatorFocusMode, so Home, Progress, Crew and Shop stay
 * live on both the desktop and the mobile bar for the whole exam — eight buttons,
 * one tap each, none of them asking. A candidate mid-sitting hit one and the
 * answers, the recordings and the half-hour went with it. _t is a plain in-memory
 * object: there is no draft and no resume.
 *
 * Every one of those eight routes through _navTo, so that is where the question
 * is asked. This runs the real guards. */
const fs = require('fs');
const S = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
const IDX = fs.readFileSync(__dirname + '/../Index.html', 'utf8');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};

function grab(sig) {
  const i = S.indexOf(sig);
  if (i < 0) throw new Error('not found: ' + sig);
  let d = 0;
  for (let k = S.indexOf('{', i); k < S.length; k++) {
    if (S[k] === '{') d++;
    else if (S[k] === '}') { d--; if (!d) return S.slice(i, k + 1); }
  }
}

/* ── the predicate and the question, on a given exam state ────────────────── */
function guards(state, answer) {
  const asked = [];
  const win = { confirm(msg) { asked.push(msg); return answer; } };
  const src = [
    grab('window._teaSittingInProgress = function ()'),
    grab('window._teaConfirmLeave = function ()'),
    'return { live: window._teaSittingInProgress, ask: window._teaConfirmLeave };',
  ].join('\n');
  const api = new Function('window', '_t', '_sc', 'Number', src)(
    win, state._t || {}, state._sc || {}, Number);
  return { api, asked, win };
}
const LIVE  = { _t: { _started: true }, _sc: {} };
const IDLE  = { _t: {}, _sc: {} };

console.log('--- when there is something to lose ---');
ok('a scripted sitting is live',
   guards({ _t: {}, _sc: { running: true } }).api.live() === true);
ok('a conversational sitting is live', guards(LIVE).api.live() === true);
// _lockExamUI fires before grading. Leaving here loses the result of a sitting
// that was fully given — the worst moment of the lot.
ok('so is a sitting being marked',
   guards({ _t: { _finishing: true }, _sc: {} }).api.live() === true);
ok('and one on its fallback grading attempt',
   guards({ _t: { _awaitingFinalReport: 2 }, _sc: {} }).api.live() === true);

console.log('--- when there is not ---');
ok('the Begin screen is not a sitting', guards(IDLE).api.live() === false);
/* _t._examDone is NOT the test for "safe to leave" — it means the answering phase
 * is over and the input bar is locked, and grading runs after it. Keying off it
 * would have waved the student out during marking. */
ok('nor is the answering phase merely being over',
   guards({ _t: { _examDone: true, _finishing: true }, _sc: {} }).api.live() === true);
ok('the report being on screen is what makes it safe',
   guards({ _t: { _studentView: { overall_band: 4 }, _started: true },
            _sc: { running: true } }).api.live() === false);

console.log('--- the question is only asked when it is owed ---');
let g = guards(IDLE, false);
ok('an idle app is never interrupted', g.api.ask() === true && g.asked.length === 0);
// ask() first, then count. Checking the tally before calling the thing that
// prompts asserted nothing, and the count was zero for the honest reason.
g = guards(LIVE, false);
const cancelled = g.api.ask();
ok('a live sitting is asked once',      g.asked.length === 1);
ok('and "cancel" means do not leave',   cancelled === false);
g = guards(LIVE, true);
const confirmed = g.api.ask();
ok('"leave anyway" means leave',        confirmed === true);
ok('and it too asked exactly once',     g.asked.length === 1);
ok('the wording names what is lost, not "are you sure"',
   /answers and recordings are lost/.test(g.asked[0]) && !/[Aa]re you sure/.test(g.asked[0]));

/* ── the real _navTo, with a sitting underneath it ────────────────────────── */
function navTo(live, answer) {
  const out = { rendered: 0, asked: 0 };
  const el = { classList: { add(){}, remove(){} }, offsetWidth: 0 };
  const win = {
    _teaConfirmLeave() { out.asked++; return live ? answer : true; },
    scrollTo(){},
  };
  const stubs = {
    window: win, AppState: { accessStatus: {} }, byId: () => el,
    setTimeout: (fn) => { fn(); return 1; }, clearTimeout(){},
    requestAnimationFrame(){}, _navToTimer: null,
  };
  const nav = new Function(...Object.keys(stubs),
    grab('window._navTo = function(fn)') + '\nreturn window._navTo;')(...Object.values(stubs));
  nav(function () { out.rendered++; });
  return out;
}

console.log('--- navigating away from a live sitting ---');
let r = navTo(true, false);
ok('the guard is consulted',            r.asked === 1);
ok('and cancelling does NOT navigate',  r.rendered === 0);
r = navTo(true, true);
ok('confirming does navigate',          r.rendered === 1);
r = navTo(false, false);
ok('with no sitting, nothing is asked of the student', r.rendered === 1);

/* ── the in-exam exit ─────────────────────────────────────────────────────── */
function exitToHome(answer) {
  const out = { stopped: 0, home: 0 };
  const win = {
    _teaConfirmLeave: () => answer,
    _teaStopAll() { out.stopped++; },
    renderHome() { out.home++; },
    location: { reload() {} },
  };
  const fn = new Function('window',
    grab('window._teaExitToHome = function()') + '\nreturn window._teaExitToHome;')(win);
  fn();
  return out;
}
console.log('--- the exam\'s own Back to Home ---');
let e = exitToHome(false);
ok('cancelling leaves the sitting running', e.stopped === 0 && e.home === 0);
e = exitToHome(true);
ok('confirming stops the sitting properly', e.stopped === 1);
// _teaStopAll releases the microphone and hands the exam hold back. Skipping it
// would leave the recording light on and lock the next attempt for 45 minutes.
ok('and only then goes home',               e.home === 1);

console.log('--- every nav button routes through the guard ---');
/* An inventory, not a spot check. A new nav button added straight to a render
 * function would skip _navTo and this guard with it, and nothing else in the
 * suite would notice. */
const navButtons = [...IDX.matchAll(/class="(?:nav-item|mob-nav-btn)[^"]*"[^>]*onclick="([^"]+)"/g)]
  .map(m => m[1]);
const viaGuard = navButtons.filter(c => /^_navTo\(/.test(c));
const direct   = navButtons.filter(c => !/^_navTo\(/.test(c));
ok('there are nav buttons to check',    navButtons.length >= 8);
ok('student navigation all goes through _navTo', viaGuard.length >= 8);
/* Admin and Analytics call their renderers directly. Deliberately left alone —
 * routing them through _navTo is an edit outside this ticket, and it is filed.
 * Pinned so a THIRD unguarded button cannot appear unnoticed. */
ok('exactly the two known admin buttons bypass it, and no more',
   direct.length === 2 && direct.every(c => /renderAdminNav|renderAdminAnalytics/.test(c)));

console.log('--- back, reload, close ---');
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
const code = strip(S);
ok('beforeunload is bound to the same predicate',
   /addEventListener\('beforeunload', function \(e\) \{\s*\n\s*if \(!window\._teaSittingInProgress\(\)\) return;/.test(code));
ok('and asks the browser in the only way it accepts',
   /e\.preventDefault\(\);\s*\n\s*e\.returnValue = '';/.test(code));
// There is no pushState anywhere, so back leaves the site rather than navigating.
ok('the app still has no history routing to hook instead',
   !/pushState|addEventListener\('popstate'/.test(code));

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
