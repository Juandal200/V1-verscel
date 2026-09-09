/* A tab nobody is looking at, asking the server for badges all day.
 *
 * Three timers reached doPost on a fixed cadence, regardless of what the student
 * was doing or whether the page was even on screen:
 *
 *   apiPing          every 120s   — to return {ok:true}
 *   getNotificationCounts   60s   — badge counts
 *   getMyCompletedLevels     5m   — the topbar rank
 *
 * executeAs is USER_DEPLOYING, so all thirty simultaneous-execution slots are
 * shared by every student at once. A backgrounded tab spending them is spending
 * somebody else's.
 *
 * The two polls run here for real, lifted out of Scripts.html, with the page
 * reported hidden — what the suite asserts is whether a request was made. */
const fs = require('fs');
const S = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
const C = fs.readFileSync(__dirname + '/../Código.js', 'utf8');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');

function grab(sig) {
  const i = S.indexOf(sig);
  if (i < 0) throw new Error('not found: ' + sig);
  let d = 0;
  for (let k = S.indexOf('{', i); k < S.length; k++) {
    if (S[k] === '{') d++;
    else if (S[k] === '}') { d--; if (!d) return S.slice(i, k + 1); }
  }
}

/* ── the real polls, on a page that reports itself hidden ─────────────────── */
function poller(visibility) {
  const calls = [];
  const chain = { withSuccessHandler(){return chain;}, withFailureHandler(){return chain;},
                  getNotificationCounts(){ calls.push('getNotificationCounts'); } };
  const stubs = {
    window: { AppState: { sessionToken: 'tok' } },
    AppState: { sessionToken: 'tok' },
    document: { visibilityState: visibility, addEventListener(){}, removeEventListener(){} },
    google: { script: { run: chain } },
    _gam: {},
    _refreshTopbarRank() { calls.push('getMyCompletedLevels'); },
    _gamUpdateNavBadge(){}, _gEl: () => null, _gamSyncBadge(){},
  };
  const src = [grab('function _gamPoll()'), 'var _GAM_RANK_EVERY = 5 * 60 * 1000;',
               grab('function _gamRankPoll()'), grab('function _gamOnVisible()'),
               'return { _gamPoll: _gamPoll, _gamRankPoll: _gamRankPoll,',
               '         _gamOnVisible: _gamOnVisible, _gam: _gam };'].join('\n');
  const api = new Function(...Object.keys(stubs), src)(...Object.values(stubs));
  return { calls, api };
}

console.log('--- a hidden tab asks for nothing ---');
let p = poller('hidden');
p.api._gamPoll();
p.api._gamRankPoll();
ok('the badge poll makes no request',  p.calls.indexOf('getNotificationCounts') === -1);
ok('the rank poll makes no request',   p.calls.indexOf('getMyCompletedLevels') === -1);
ok('and nothing at all reached the server', p.calls.length === 0);

console.log('--- a visible tab still works ---');
p = poller('visible');
p.api._gamPoll();
p.api._gamRankPoll();
ok('badges are fetched',   p.calls.indexOf('getNotificationCounts') >= 0);
ok('and so is the rank',   p.calls.indexOf('getMyCompletedLevels') >= 0);

console.log('--- coming back to the tab is a reason to poll ---');
// Guarding the timers without this would trade traffic for staleness: a student
// returning would see a stale badge for up to 60s and a stale rank for up to 5m.
p = poller('visible');
p.api._gamOnVisible();
ok('the badges refresh on return',
   p.calls.filter(c => c === 'getNotificationCounts').length === 1);
ok('and so does the rank, never having been fetched',
   p.calls.filter(c => c === 'getMyCompletedLevels').length === 1);
// Flipping between tabs must not turn the expensive one into a poll-per-switch.
p.api._gamOnVisible();
ok('a second return refreshes the badges again',
   p.calls.filter(c => c === 'getNotificationCounts').length === 2);
ok('but not the rank, whose five minutes have not passed',
   p.calls.filter(c => c === 'getMyCompletedLevels').length === 1);
// ...and it does resume once they have.
p.api._gam.lastRankAt = Date.now() - (5 * 60 * 1000) - 1;
p.api._gamOnVisible();
ok('the rank refreshes once the interval has actually elapsed',
   p.calls.filter(c => c === 'getMyCompletedLevels').length === 2);

console.log('--- and a hidden tab is not woken by the handler either ---');
p = poller('hidden');
p.api._gamOnVisible();
ok('nothing is requested', p.calls.length === 0);

console.log('--- the catch-up can be taken away again ---');
const code = strip(S);
ok('it is a named function, not an inline closure',
   /function _gamOnVisible\(\) \{/.test(code));
ok('registered when polling starts',
   /document\.addEventListener\('visibilitychange', _gamOnVisible\);/.test(code));
// Signing out has to end it too, or a hidden tab polls again the moment it is seen.
ok('and removed when polling stops',
   /document\.removeEventListener\('visibilitychange', _gamOnVisible\);/.test(code));
ok('the badge cadence is unchanged at 60s',
   /setInterval\(_gamPoll,\s*60000\)/.test(code));

console.log('--- the keep-warm ping is gone, on both sides ---');
ok('no apiPing on the server',        !/function apiPing/.test(C));
ok('nothing in the client calls it',  !/\.apiPing\(\)/.test(code));
ok('the timer is gone',               !/_aeroWarmTimer/.test(code));
ok('and so are its three functions',
   !/_aeroWarmPing/.test(code) && !/_aeroStartKeepWarm/.test(code) && !/_aeroStopKeepWarm/.test(code));
// It was reached from the load path and from a visibilitychange listener; both
// must go, or the deletion is a ReferenceError on every page load.
ok('no call site is left behind',
   !/_aeroWarmPing\(\)/.test(S) && !/_aeroStartKeepWarm\(\)/.test(S) && !/_aeroStopKeepWarm\(\)/.test(S));
ok('and the dead variable it drove went with it', !/_lastHiddenAt/.test(S));

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
