/* The home page draws the map.
 *
 * It used to be two clicks away inside a screen with no navigation entry of its
 * own — there is no Simulator button in the nav bar, so the only way to the map
 * was the ATC Simulator card and then a toggle. The map is the landing screen
 * now, and this is what holds that true.
 *
 * The change was a silent success: 78 suites green before it and 78 after,
 * because nothing had ever asked whether the home page drew anything. So the
 * home page's own drawing is run here, on a synthetic catalogue, and the parts
 * that can only be read — the ordering, the guard, the failure path — are read.
 */
const fs = require('fs');
const S  = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
let fails = 0;
const ok = (n, c) => { if (!c) fails++; console.log((c ? '  PASS  ' : '  FAIL  ') + n); };
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

const TIERS = [
  { num: 1, name: 'Foundation', levels: [1, 2, 3], examNum: 1, nextLevel: 4 },
  { num: 2, name: 'Advanced',   levels: [4, 5, 6], examNum: 2, nextLevel: 7 },
  { num: 3, name: 'Expert',     levels: [7, 8, 9], examNum: 3, nextLevel: 10 }
];
/* The real assignment, read out of the running catalogue: five countries, and
 * three of the nine levels sharing Australia. */
const COUNTRY = { 1:'IN', 2:'GB', 3:'AU', 4:'US', 5:'IN', 6:'CA', 7:'GB', 8:'AU', 9:'AU', 10:'US' };

/* The whole chain the home page runs, lifted from source. Nothing is retyped. */
const homeMap = (function () {
  const stubs = {
    _levelTiers: () => TIERS.slice(),
    _tierOf: n => TIERS.filter(t => t.levels.indexOf(n) >= 0)[0] || null,
    _vrPickEvents: () => ({}),
    _vrSlotTime: () => '19:00',
    _levelMeta: Object.fromEntries([1,2,3,4,5,6,7,8,9].map(n =>
      [n, { name: 'Level ' + n, tag: 'TAG' + n, description: 'desc ' + n, phases: ['A'] }]
    ).concat([[10, { groupKey: 'OPERATIONAL', name: 'Operational One' }]])),
    getCountryUi: c => ({ code: String(c).toLowerCase(),
      label: { IN:'India', GB:'United Kingdom', AU:'Australia', US:'USA', CA:'Canada' }[c] || String(c) }),
    getFlagHtml: () => '<svg class="lm-flag"></svg>',
    uiIcon: () => '<svg></svg>',
    uiIconInline: () => '<svg></svg>',
    safeText: v => String(v == null ? '' : v).replace(/[<>&]/g, ''),
    AppState: { training: {}, examStatus: [] },
    window: {},
    Object, Number, String, Math, JSON, Date, console
  };
  const src = [
    grab('var _LM_W = 1180'), grab('function _lmX(lon)'), grab('function _lmY(lat)'),
    'var _LM_LAND = ' + JSON.stringify({ uk: [-5, 50, -3, 54, -3, 58] }) + ';',
    grab('var _LM_PLACE = {'), grab('var _LM_CP = {'),
    grab('function _lmCountryOf(model)'), grab('function _lmPlace(model)'),
    grab('function _lmFlag(country, uid)'), grab('function _lmShortTag(meta)'),
    grab('function _lmBuildModels(levelByNum, tiers, vrEvents, firstPlanLockedLevel)'),
    grab('function _lmSurface(data)'),
    grab('function _lmOpsBlock(heroCard)'),
    grab('function _lmStageHtml(models, tiers, vrSlot)'),
    grab('function _lmHomeMapHtml(data, betweenHtml)'),
    grab('function _homeExamSquare()'),
    'return { map: _lmHomeMapHtml, square: _homeExamSquare };'
  ].join('\n');
  return new Function(...Object.keys(stubs), src)(...Object.values(stubs));
})();
const homeSquare = homeMap.square;
const drawHome = (cat) => homeMap.map(cat, homeSquare());
const home = strip(grab('function renderHome()'));

function catalogue(shape) {
  return { levels: [1,2,3,4,5,6,7,8,9,10].map(n => {
    const s = (shape && shape[n]) || {};
    return {
      level: n,
      locked: s.locked === undefined ? n !== 1 : s.locked,
      lockedByPlan: !!s.lockedByPlan,
      countries: [{ country: COUNTRY[n], completed: !!s.done }]
    };
  })};
}

console.log('--- the home page draws the map ---');
const html = drawHome(catalogue({ 1: { locked: false, done: true } }));
ok('there is a stage',            /class="lm-stage"/.test(html));
ok('and a tier bar above it',     /class="lm-tiers"/.test(html));
ok('five pins, one per country',  (html.match(/class="lm-pin /g) || []).length === 5);
ok('every pin names its country', (html.match(/class="lm-pin-chip"/g) || []).length === 5);
ok('nine levels are reachable',   new Set([...html.matchAll(/openLevelCountries\((\d+)\)/g)]
                                    .map(m => Number(m[1]))).size === 9);
ok('all three checkpoints',       (html.match(/class="lm-cp /g) || []).length === 3);

console.log('--- Operational Level sits below it ---');
/* The mock-test square is described as sitting above Operational Level on this
 * page, so Operational Level has to BE on this page. */
ok('under the same divider the grid uses', /OPERATIONAL CLEARANCE/.test(html));
ok('and the card itself',                  /level-card-ops/.test(html));

console.log('--- and none of the levels screen comes with it ---');
/* _lmSetView repaints the LEVELS screen. On the home page that button would not
 * switch a view — it would replace the page the student is standing on. */
ok('no way back to a grid that is not here', !/lm-switch/.test(html));
ok('no _lmSetView anywhere in it',           !/_lmSetView/.test(html));
ok('and no tab strip',                       !/sim-subtab/.test(html));

console.log('--- the mock test is a square at the foot of the map ---');
/* "A little square on the right side above operational level, but on the bottom
 * of the map." Between the stage and the Operational divider, right-aligned. */
const iStage = html.indexOf('class="lm-stage"');
const iSq    = html.indexOf('home-exam-square');
const iOps   = html.indexOf('OPERATIONAL CLEARANCE');
ok('the square is drawn',        iSq > -1);
ok('below the map',              iSq > iStage);
ok('and above Operational Level', iSq < iOps);
ok('it says which exam it is',   /ICAO TEST/.test(html));
ok('and opens that exam',        /_navTo\(renderTeaExam\)/.test(html));
/* A button, not a div. The pins on this same page were divs once and no keyboard
 * could reach any of them. */
ok('it is a button',             /<button type="button" class="home-exam-square"/.test(html));
ok('with a label for a screen reader', /aria-label="ICAO practice test/.test(html));
ok('drawn exactly once',         (html.match(/home-exam-square/g) || []).length === 1);

/* It is NOT part of the map. The levels screen draws the same stage and must not
 * grow an exam square in the middle of it. */
ok('the levels screen does not get one',
   grab('function _lmRenderMap(models, tiers, heroBar, heroCard, vrSlot)').indexOf('_homeExamSquare') === -1);
ok('and the stage builder knows nothing about it',
   grab('function _lmStageHtml(models, tiers, vrSlot)').indexOf('home-exam') === -1);

console.log('--- one door to the exam, not two ---');
/* The full card leaves the row where the square is drawn. Below 1100px there is
 * no map and no square, so the card stays — taking it out there would remove the
 * exam from the home page on every phone. */
ok('the card row asks the width',
   /simCard \+ \(_lmWideEnough\(\) \? '' : teaCard\) \+ streakCard/.test(home));
ok('the square is drawn only where the map is',
   home.indexOf('_homeExamSquare()') > home.indexOf('if (_lmWideEnough()) (function()'));

console.log('--- the map is the first thing on the page ---');
const composition = home.match(/byId\('contentArea'\)\.innerHTML\s*=\s*([^;]+);/);
ok('the composition is one expression', !!composition);
const order = composition ? composition[1] : '';
ok('the map is in it',            /mapSection/.test(order));
ok('before the daily challenge',  order.indexOf('mapSection') < order.indexOf('dcBannerHtml'));
ok('before the cards',            order.indexOf('mapSection') < order.indexOf('cardsRow'));
ok('and before the modules',      order.indexOf('mapSection') < order.indexOf('modulesSection'));

console.log('--- above 1100px only ---');
/* Below it the grid is what renders on the levels screen, and the home page is
 * the card row it has always been. A world map at 390px is nine pins in one
 * corner, and this app is a phone app first. */
ok('the section is gated',        /_lmWideEnough\(\)\s*\?[\s\S]{0,400}homeMapArea/.test(home));
ok('and so is the fetch',         /if \(_lmWideEnough\(\)\) \(function\(\)/.test(home));

console.log('--- it does not pay for the catalogue twice ---');
ok('a fresh session catalogue is used', /_homeMapCacheRead\(_HOME_SECTION_TTL\)/.test(home));
ok('and the fetch only runs without one',
   home.indexOf('_homeMapCacheRead') < home.indexOf('apiGetTrainingCatalogV5_HARD'));

console.log('--- and never shows a stale one as current ---');
/* The catalogue carries completion state. Left to age out for ten minutes it
 * would show a country the student finished two minutes ago as unfinished, which
 * is the app misreporting their own progress. So it is REPLACED wherever a
 * fresher one appears rather than waiting for the clock. */
const all = strip(S);
ok('written when a route completes',
   /buildCompletionCatalog\(AppState\.training\.catalog\);[\s\S]{0,200}_homeMapCacheWrite\(catalog\)/.test(all));
ok('and when the levels screen fetches one',
   /AppState\.training\.catalog = catalog;\s*_homeMapCacheWrite\(catalog\);/.test(all));
/* Three writers and one reader, plus the two declarations. More writers than
 * that means a fourth place learned the catalogue and did not say so. */
ok('three writers',  (all.match(/_homeMapCacheWrite\(/g) || []).length === 4);
ok('and one reader', (all.match(/_homeMapCacheRead\(/g)  || []).length === 2);

console.log('--- a failure is visible and reported ---');
/* The two sections below this one set display:none when their fetch fails, which
 * makes a broken home page and an empty one the same observable. Nothing reaches
 * the developer, and nothing reaches the student either. */
/* Sliced from the RAW body, not the stripped one: the comments are half of what
 * this section is, and the marker used to slice it was itself a comment. */
const homeRaw = grab('function renderHome()');
const mapLoader = homeRaw.slice(
  homeRaw.indexOf('if (_lmWideEnough()) (function()'),
  homeRaw.indexOf('.apiGetTrainingCatalogV5_HARD')
);
ok('the map section is found',      mapLoader.length > 200);
ok('it does not hide itself',       !/display\s*=\s*'none'/.test(mapLoader));
ok('it says so on the screen',      /Could not load your levels/.test(mapLoader));
ok('it offers a way to retry',      /Try again/.test(mapLoader));
ok('and it reaches the developer',  /_reportClientError\('homeMap'/.test(mapLoader));

console.log('--- the identities load before the card that names them ---');
/* renderLevelMap holds the same guard. Drawing before _levelMeta arrives puts an
 * Operational card on the page with no name on it. */
ok('_levelMeta is waited for', /_levelMeta === null[\s\S]{0,120}_loadLevelMeta/.test(mapLoader));
ok('and the stage is fitted after it is written', /_lmFitStage\(\)/.test(mapLoader));

console.log(fails ? '\n' + fails + ' FAILING' : '\nAll home-map assertions passed.');
process.exit(fails ? 1 : 0);
