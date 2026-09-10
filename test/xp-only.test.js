/* The tour is gone, and the rank is XP.
 *
 * getActiveTour() was a getter with a batch job inside it: on an expired tour it
 * closed the old one, snapshotted every user one appendRow at a time, awarded
 * commendations and opened the next — inline, in whichever student's request
 * arrived first after Monday 19:00 UTC, wrapped in an empty catch so it could not
 * be seen. That is the 49.157s cold start.
 *
 * It sat behind TWO student paths, not one: the rank badge on every boot, and the
 * rankings tab. Removing either alone would have left the other open, which is
 * what this file exists to keep true.
 */
const fs = require('fs');
const G  = fs.readFileSync(__dirname + '/../Gamification.js', 'utf8');
const T  = fs.readFileSync(__dirname + '/../TourService.js',  'utf8');
const C  = fs.readFileSync(__dirname + '/../Código.js',       'utf8');
let fails = 0;
const ok = (n, c) => { if (!c) fails++; console.log((c ? '  PASS  ' : '  FAIL  ') + n); };
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');

function grab(src, sig) {
  const i = src.indexOf(sig);
  if (i < 0) throw new Error('not found: ' + sig);
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
}

console.log('--- no student path reaches the weekly batch ---');
/* Checked on stripped source, because three of these functions now carry comments
 * explaining what they used to call — and a comment breaking the check written
 * beside it has happened five times in this repository already. */
[['getMyCompletedLevels', G], ['getWeeklyLeaderboard', T],
 ['getCareerLeaderboard', T], ['getMyCareerStats', T]].forEach(function (pair) {
  const body = strip(grab(pair[1], 'function ' + pair[0] + '('));
  ok(pair[0] + ' does not call getActiveTour', body.indexOf('getActiveTour') === -1);
});
ok('the VR bonus does not either',
   strip(grab(C, 'function _vrApplyLevelCompletionBonus_(')).indexOf('getActiveTour') === -1);
ok('and Gamification.js no longer reaches TourService at all',
   strip(G).indexOf('TourService') === -1);

console.log('--- the rank counts everything, for good ---');
const completed = strip(grab(G, 'function getMyCompletedLevels('));
ok('no tour window is applied',   !/tourStart/.test(completed));
ok('and no date filter survives', !/updatedAt|completedAt/.test(completed));

console.log('--- the week key kept its shape, so earned bonuses stay earned ---');
/* VRBonusLog holds keys written as TOUR_2026_W37 by TourService._tourId. If the
 * new key spelled the week differently, none of them would match and every
 * student would be handed every bonus a second time. So the two are run against
 * the same dates and compared. */
function withDate(src, expr, ms) {
  const FakeDate = function (v) {
    return arguments.length ? new (Date.bind.apply(Date, [null, v]))() : new Date(ms);
  };
  FakeDate.now = () => ms;
  FakeDate.UTC = Date.UTC;
  FakeDate.prototype = Date.prototype;
  return new Function('Date', 'Math', src + '\nreturn (' + expr + ');')(FakeDate, Math);
}
const OLD = grab(T, 'function _isoWeek(d)') + grab(T, 'function _tourId(d)');
const NEW = grab(C, 'function _vrWeekKey_()');

[Date.UTC(2026, 8, 10), Date.UTC(2026, 0, 1), Date.UTC(2025, 11, 31),
 Date.UTC(2026, 5, 15), Date.UTC(2027, 2, 1)].forEach(function (ms) {
  const before = withDate(OLD, '_tourId(new Date())',  ms);
  const after  = withDate(NEW, '_vrWeekKey_()',        ms);
  ok('same key on ' + new Date(ms).toISOString().slice(0, 10) + ' → ' + after, before === after);
});
ok('and it is the shape already in the sheet', /^TOUR_\d{4}_W\d{2}$/.test(withDate(NEW, '_vrWeekKey_()', Date.UTC(2026, 8, 10))));

console.log('--- the weekly board still means "since Monday" ---');
const monday = withDate(grab(T, 'function _thisWeekStart_()'), '_thisWeekStart_()', Date.UTC(2026, 8, 10));
ok('it lands on a Monday',        monday.getUTCDay() === 1);
ok('at midnight UTC',             monday.getUTCHours() === 0 && monday.getUTCMinutes() === 0);
ok('and it is in the past',       monday.getTime() <= Date.UTC(2026, 8, 10));
/* Run on a Monday it must return THAT Monday, not the one before — the boundary
 * case, and the one an off-by-one hides. */
const onMonday = withDate(grab(T, 'function _thisWeekStart_()'), '_thisWeekStart_()', Date.UTC(2026, 8, 7, 9));
ok('on a Monday it returns that Monday', onMonday.toISOString().slice(0, 10) === '2026-09-07');

console.log('--- double XP was a property of a tour, so it is gone ---');
ok('the weekly board never claims it',
   /isDoubleXp\s*=\s*false/.test(strip(grab(T, 'function getWeeklyLeaderboard('))));

/* ── and the screens agree with the server ────────────────────────────────
 *
 * The server stopped sending medallions, activeTour, totalCp, toursCompleted and
 * maxStreak. A client still reading them renders "undefined CP" and a bar of NaN
 * width — which is not an error anywhere, just a wrong screen. So the contract is
 * checked from the client's side too.
 */
const S  = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
const UI = fs.readFileSync(__dirname + '/../GamificationUI.html', 'utf8');
const client = strip(S);

console.log('--- the client reads nothing the server stopped sending ---');
[['medallions', /res\.medallions/], ['activeTour', /res\.activeTour/],
 ['totalCp', /totalCp/], ['toursCompleted', /toursCompleted/],
 ['maxStreak', /maxStreak/], ['streakBonusPct', /streakBonusPct/]].forEach(function (p) {
  /* renderAdminTour is the one screen still allowed to speak of tours; it goes
   * with the weekly emails. Everything else must be clean. */
  const withoutAdmin = client.replace(/function renderAdminTour\(\)[\s\S]*?\n  \}\n/, '');
  ok('no student screen reads ' + p[0], !p[1].test(withoutAdmin));
});

console.log('--- the board is denominated in XP ---');
const career = strip(grab(S, 'function _gamRenderCareerBoard(res)'));
/* Matched without a closing quote: the source reads `p.totalXp + ' XP</span>'`,
 * so a pattern ending in `' XP'` finds nothing and fails against correct code —
 * which is what the first version of these two lines did. */
ok('the score reads XP',        /p\.totalXp \+ ' XP/.test(career));
ok('and the subtitle counts levels', /p\.completedLevels \+ ' levels/.test(career));
ok('the bar scales on XP',      /p\.totalXp \/ maxXp/.test(career));
ok('and nothing says CP',       !/ CP/.test(career));

console.log('--- the banner space is used, not left empty ---');
/* Deleting the tour banner and leaving the hole would have made the panel look
 * broken rather than changed. The element and its styling are the banner's own. */
ok('an XP banner exists',       /function _gamRenderXpBanner\(res\)/.test(client));
ok('it writes into the same slot', /_gEl\('gamTourBanner'\)/.test(client));
/* Twice: the definition and the call. The first version of this line matched
 * `_gamRenderXpBanner(res)` anywhere, which the DEFINITION also contains — so
 * deleting the call left it green. An assertion that cannot fail is worse than
 * no assertion, because it looks like cover. */
ok('and it is actually called',
   (client.match(/_gamRenderXpBanner\(res\)/g) || []).length === 2);

console.log('--- the dead widgets are gone, markup and styling with them ---');
['_gamRenderTourBanner', '_gamRenderMedallions', '_gamMedallionColor',
 '_gamUpdateStreakChip'].forEach(function (fn) {
  ok(fn + ' is gone', S.indexOf(fn) === -1);
});
ok('the medallion strip is out of the markup', UI.indexOf('gamMedallions') === -1);
ok('and its stylesheet with it',               UI.indexOf('gam-medallion') === -1);
ok('the CP legend is gone',                    UI.indexOf('gamLbLegendCp') === -1);
/* Both boards are XP now; they differ in the window, not the unit. */
ok('the XP legend stays',                      UI.indexOf('gamLbLegendXp') !== -1);

console.log(fails ? '\n' + fails + ' FAILING' : '\nAll xp-only assertions passed.');
process.exit(fails ? 1 : 0);
