/* Two drawings of one screen, and the ways a second one loses things.
 *
 * The world map is not a new feature. Everything it shows already existed in the
 * grid, so the risk is not that it fails — it is that it quietly shows less: a
 * level missing, a lock in the wrong state, or seven "Upgrade" buttons where
 * there should be exactly one.
 *
 * That last is the one most easily lost when a view is redrawn. Every level past
 * the plan carries lockedByPlan, and offering Upgrade on all of them implies
 * level 5 is one payment away. It is not — paying lifts the plan lock and the
 * progress lock still requires every level before it. Only the next level a
 * student could actually play is for sale.
 *
 * So both views read ONE computation. This gives that computation a synthetic
 * catalogue and checks the map draws exactly what the grid was given. */
const fs = require('fs');
const S = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
const code = strip(S);

function grab(sig) {
  const i = S.indexOf(sig);
  if (i < 0) throw new Error('not found: ' + sig);
  let d = 0;
  for (let k = S.indexOf('{', i); k < S.length; k++) {
    if (S[k] === '{') d++;
    else if (S[k] === '}') { d--; if (!d) return S.slice(i, k + 1); }
  }
}

/* ── the map renderer, lifted and run on a synthetic catalogue ────────────── */
const TIERS = [
  { num: 1, name: 'Foundation', levels: [1, 2, 3], examNum: 1, nextLevel: 4 },
  { num: 2, name: 'Advanced',   levels: [4, 5, 6], examNum: 2, nextLevel: 7 },
  { num: 3, name: 'Expert',     levels: [7, 8, 9], examNum: 3, nextLevel: 10 }
];
const COUNTRY = { 1:'US', 2:'GB', 3:'CO', 4:'CA', 5:'BR', 6:'IN', 7:'MX', 8:'AU', 9:'ZA' };

/* The free plan: level 1 done, everything else behind the plan. Exactly one
 * level — the next one — may say Upgrade. */
function models(planLockedAt) {
  return [1,2,3,4,5,6,7,8,9].map(function (n) {
    const done = n === 1;
    return {
      level: n, tier: TIERS.filter(t => t.levels.indexOf(n) >= 0)[0].num,
      locked: !done && n !== 1, isCompleted: done,
      planLock: n === planLockedAt,
      statusText: done ? 'Complete' : n === planLockedAt ? 'Upgrade' : 'Locked',
      statusClass: done ? 'ACTIVE' : 'BLOCKED',
      done: done ? 6 : 0, total: 6, regions: 6, pct: done ? 100 : 0, vr: null,
      item: { level: n, countries: [{ country: COUNTRY[n], completed: done }] }
    };
  });
}

function renderMap(ms) { return renderMapWith(ms, {}, ''); }
function renderMapWith(ms, extra, heroCard) {
  const stubs = {
    _levelMeta: Object.fromEntries([1,2,3,4,5,6,7,8,9].map(n =>
      [n, { name: 'Level ' + n, accent: COUNTRY[n] + ' ATC', tag: 'TAG' + n,
            description: 'desc ' + n, phases: ['A','B','C'] }])),
    getCountryUi: c => ({ code: String(c).toLowerCase() }),
    getFlagHtml: (c) => '<svg class="lm-flag"><path id="a"/><use href="#a"/></svg>',
    uiIconInline: () => '<svg></svg>',
    safeText: v => String(v == null ? '' : v).replace(/[<>&]/g, ''),
    _simTabStrip: () => '<nav></nav>',
    AppState: { training: {} },
    localStorage: { getItem: () => null, setItem() {} },
    window: {}, document: { querySelector: () => null },
    Date, Math, Number, String, Object, JSON, console,
  };
  const src = [
    grab('var _LM_W = 1180'), grab('function _lmX(lon)'), grab('function _lmY(lat)'),
    'var _LM_LAND = ' + JSON.stringify({ uk: [-5,50,-3,54,-3,58] }) + ';',
    grab('var _LM_PLACE = {').replace(/^var /, 'var '),
    grab('var _LM_CP = {'),
    grab('function _lmCountryOf(model)'), grab('function _lmPlace(model)'),
    grab('function _lmFlag(country, uid)'), grab('function _lmShortTag(meta)'),
    grab('function _lmRenderMap(models, tiers, heroBar, heroCard, vrSlot)'),
    'return _lmRenderMap;'
  ].join('\n');
  Object.assign(stubs, extra || {});
  return new Function(...Object.keys(stubs), src)(...Object.values(stubs))(ms, TIERS, '', heroCard || '', '19:00');
}

console.log('--- every level the grid computed is drawn ---');
const ms = models(2);
const html = renderMap(ms);
const drawn = [...html.matchAll(/openLevelCountries\((\d+)\)/g)].map(m => Number(m[1]));
ok('nine levels drawn',        drawn.length === 9);
ok('each exactly once',        new Set(drawn).size === 9);
ok('and they are 1 through 9', drawn.slice().sort((a,b)=>a-b).join() === '1,2,3,4,5,6,7,8,9');

console.log('--- the lock state matches, level by level ---');
let mismatched = [];
ms.forEach(function (m) {
  const want = m.isCompleted ? 'complete' : m.planLock ? 'upgrade' : m.locked ? 'locked' : 'current';
  if (!new RegExp('lm-card lm-card--' + want + '[^>]*openLevelCountries\\(' + m.level + '\\)').test(html)
   && !new RegExp('lm-card--' + want + '[\\s\\S]{0,400}?openLevelCountries\\(' + m.level + '\\)').test(html)) {
    mismatched.push(m.level + ' wanted ' + want);
  }
});
ok('every card carries the state the model gave it', mismatched.length === 0);
if (mismatched.length) console.log('        ' + mismatched.join(' · '));

console.log('--- exactly one level is for sale ---');
/* _planLock is "next up AND behind the plan". Seven identical Upgrade buttons
 * is the failure this guards, and a redraw is exactly when it comes back. */
const upgrades = (html.match(/lm-chip--upgrade/g) || []).length;
ok('one Upgrade chip, not seven', upgrades === 1);
ok('and it is the level the model marked',
   new RegExp('lm-card--upgrade[\\s\\S]{0,600}?openLevelCountries\\(2\\)').test(html));
// Move the plan lock and it must move with it.
const html7 = renderMap(models(7));
ok('move the plan lock and the Upgrade moves too',
   (html7.match(/lm-chip--upgrade/g) || []).length === 1 &&
   new RegExp('lm-card--upgrade[\\s\\S]{0,600}?openLevelCountries\\(7\\)').test(html7));

console.log('--- the map goes to openLevelCountries and nowhere else ---');
/* That function writes selectedLevelData, which five "back" buttons in the
 * simulator read, and carries the two-lock branch that offers the plans modal
 * rather than a dead end. A map calling startCountryTraining directly would skip
 * both. */
const mapFn = strip(grab('function _lmRenderMap(models, tiers, heroBar, heroCard, vrSlot)'));
ok('every card calls it',        /onclick="openLevelCountries\(/.test(mapFn));
ok('and nothing calls past it',
   !/startCountryTraining|renderCountryTrainingHub|apiGetTrainingRoute/.test(mapFn));

console.log('--- a level with no coordinates is shown, not guessed at ---');
const orphan = models(2);
orphan[5].item.countries = [{ country: 'ZZ', completed: false }];   // level 6, nowhere
const oh = renderMap(orphan);
ok('it is not silently dropped',   /lm-unplaced/.test(oh));
ok('it is still reachable',        /lm-unplaced-card[^>]*openLevelCountries\(6\)/.test(oh));
ok('and it is NOT placed on the map', !/lm-card[^>]*openLevelCountries\(6\)/.test(oh));
ok('the other eight still are',    (oh.match(/lm-card lm-card--/g) || []).length === 8);

console.log('--- nine flags on one screen keep their own references ---');
/* FLAG_SVG entries define short ids and reference them: us defines a..e, gb
 * defines a and b, and #a resolves against the FIRST in document order. */
const ids = [...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
ok('no id is used twice', ids.length > 0 && new Set(ids).size === ids.length);
ok('and every reference is namespaced with its own card',
   [...html.matchAll(/href="#([^"]+)"/g)].every(m => ids.includes(m[1])));

console.log('--- the inventory the grid draws, drawn here too ---');
/* Three of these were missing when the map first shipped, which is the failure
 * the inventory exists to prevent: not a view that breaks, a view that quietly
 * shows less than the one it replaces. */
const vr = models(2);
vr[0].vr = { type: 'double', icon: '<svg></svg>', label: 'DOUBLE XP', desc: 'Twice the XP' };
const vh = renderMap(vr);
ok('a reward event is drawn on the level that has it', /lm-vr-badge[\s\S]{0,80}DOUBLE XP/.test(vh));
/* The wording depends on the level's state, exactly as the grid's banner does:
 * a finished level is offered a replay for bonus XP, a locked one is told to
 * unlock first, and only a level you can actually play gets the description. */
ok('a completed level is offered the replay', /Replay for bonus XP/.test(vh));
const vr2 = models(2);
vr2[3].vr = vr[0].vr;                       // level 4, locked
ok('a locked level is told to unlock first',
   /Unlock to claim this clearance/.test(renderMap(vr2)));
const vr3 = models(2);
vr3[3].locked = false; vr3[3].vr = vr[0].vr;
ok('and a playable one gets the description', /Twice the XP/.test(renderMap(vr3)));
ok('and when it closes',         /CLOSES 19:00/.test(vh));
ok('and a level without one gets no banner',
   (vh.match(/lm-vr-badge/g) || []).length === 1);

/* _buildExamCard reads AppState.examStatus and has five branches. The map drew
 * two of its own invention, so a candidate with one attempt left was told the
 * checkpoint was simply open. */
const mapSrc = strip(grab('function _lmRenderMap(models, tiers, heroBar, heroCard, vrSlot)'));
ok('the checkpoint reads the same source the grid card reads',
   /AppState\.examStatus/.test(mapSrc));
['passed', 'replay_required', 'failed_once', 'locked'].forEach(function (st) {
  ok('it knows the ' + st + ' state', new RegExp("'" + st + "'").test(mapSrc));
});
ok('and the fifth, ready to sit', /READY TO SIT/.test(mapSrc));
ok('a score is shown where there is one', /info\.score/.test(mapSrc));

/* The Operational group renders below the grid's tiers. A sheet that publishes
 * one would have shown it on the grid and not here. */
const oh2 = renderMapWith(models(2), {}, '<article>OPS CARD</article>');
ok('the Operational block is drawn when there is one', /OPS CARD/.test(oh2));
ok('under the same divider the grid uses',   /OPERATIONAL CLEARANCE/.test(oh2));
ok('and nothing is drawn when there is not', !/OPERATIONAL CLEARANCE/.test(renderMap(models(2))));

console.log('--- nothing draws a route between countries ---');
/* The route drew a line from each stop to the next. Consecutive levels sit on
 * different continents, so those lines crossed the map in every direction and
 * read as noise rather than sequence. */
const mapBody = strip(grab('function _lmRenderMap(models, tiers, heroBar, heroCard, vrSlot)'));
ok('no line is drawn between one country and the next',
   !/lm-edge-done/.test(html) && !/seq\[i \+ 1\]/.test(mapBody));

console.log('--- but every card is tied to its own pin ---');
/* Nine cards scattered over a map with nothing joining them to a country is
 * unreadable, and it is the failure the original ticket warned about. */
const leaders = (html.match(/class="lm-leader/g) || []).length;
ok('one leader per placed level', leaders === 9);
ok('a finished level\'s leader is marked as such', /lm-leader--done/.test(html));
ok('and a level with no place gets no leader',
   (renderMap(orphan).match(/class="lm-leader/g) || []).length === 8);

console.log('--- the header does not fight itself ---');
/* tag is a category word here — LevelService's own defaults use 'Operational' —
 * and the sheet puts the level's full name in it, so "LEVEL 6" and "Weather
 * Operations" wrapped into two jammed columns inside 216px. */
const shortTag = new Function(grab('function _lmShortTag(meta)') + '\nreturn _lmShortTag;')();
/* A LONG tag that is not the name. The first version of this used a tag equal to
 * the name, so the second guard caught it and removing the length guard changed
 * nothing — the red proof passed and proved the assertion was decoration. */
ok('a long tag is dropped',        shortTag({ tag: 'Weather Operations', name: 'Level Six' }) === '');
ok('so is one that repeats the name', shortTag({ tag: 'En-Route', name: 'En-Route' }) === '');
ok('a short code is kept',         shortTag({ tag: 'KJFK', name: 'ATC Basics' }) === 'KJFK');
ok('and nothing is invented when there is no tag', shortTag({ name: 'x' }) === '');
// The rendered header carries the level number whatever the tag does.
ok('every card still says which level it is',
   (html.match(/lm-card-head[\s\S]{0,40}?LEVEL \d/g) || []).length === 9);

console.log('--- the map country comes from the sheet ---');
const LS = fs.readFileSync(__dirname + '/../LevelService.js', 'utf8');
ok('apiGetLevelMeta emits mapCountry', /mapCountry:\s*String\(r\.mapCountry/.test(LS));
ok('and the client reads it',          /meta\.mapCountry/.test(code));
ok('falling back to the level\'s own country', /\|\| \(\(model\.item\.countries \|\| \[\]\)\[0\]/.test(code));

console.log('--- the entry point is unchanged ---');
ok('renderLevelMap keeps its signature', /function renderLevelMap\(data\) \{/.test(code));
ok('and all five call sites still reach it',
   (code.match(/renderLevelMap\(/g) || []).length >= 5);
ok('the branch is inside, not a second screen',
   /if \(_lmViewIsMap\(\) && _lmWideEnough\(\)\) \{[\s\S]{0,200}_lmRenderMap/.test(code));
ok('below 1100px the grid renders and no toggle is offered',
   /window\.innerWidth >= 1100/.test(code));
ok('the choice is remembered',   /localStorage\.setItem\(_lmViewKey\(\)/.test(code));
ok('and it is instrumented, so the question can be answered with a number',
   /levelmap_view/.test(code));

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
