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
/* The REAL assignment, read out of the running catalogue. Ten levels across five
 * countries — and this is the fixture that matters, because the first version of
 * this file gave every level its own country and so never exercised the case that
 * actually broke: cards keyed by country landing on identical coordinates, the
 * last drawn hiding the rest. Five of nine levels were visible in production and
 * every assertion here was green. */
const COUNTRY = { 1:'IN', 2:'GB', 3:'AU', 4:'US', 5:'IN', 6:'CA', 7:'GB', 8:'AU', 9:'AU' };
const COUNTRIES = ['IN', 'GB', 'AU', 'US', 'CA'];

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

/* The map is two functions now — the stage both screens draw, and the chrome the
 * levels screen wraps it in — so the assertions that read the map's SOURCE read
 * both. Grepping only _lmRenderMap would have gone quiet the moment the drawing
 * moved out of it, which is exactly what happened when it did. */
const MAP_SRC = strip(
  grab('function _lmStageHtml(models, tiers, vrSlot)') +
  grab('function _lmOpsBlock(heroCard)') +
  grab('function _lmRenderMap(models, tiers, heroBar, heroCard, vrSlot)')
);

function renderMap(ms) { return renderMapWith(ms, {}, ''); }
function lift(extra) {
  const stubs = {
    _levelMeta: Object.fromEntries([1,2,3,4,5,6,7,8,9].map(n =>
      [n, { name: 'Level ' + n, accent: COUNTRY[n] + ' ATC', tag: 'TAG' + n,
            description: 'desc ' + n, phases: ['A','B','C'] }])),
    getCountryUi: c => ({ code: String(c).toLowerCase(),
      label: { IN:'India', GB:'United Kingdom', AU:'Australia', US:'USA', CA:'Canada' }[c] || c }),
    getFlagHtml: (c) => '<svg class="lm-flag"><path id="a"/><use href="#a"/></svg>',
    uiIconInline: () => '<svg></svg>',
    safeText: v => String(v == null ? '' : v).replace(/[<>&]/g, ''),
    _simTabStrip: () => '<nav></nav>',
    _tierOf: n => TIERS.filter(t => t.levels.indexOf(n) >= 0)[0] || null,
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
    grab('function _examActionFor(examNum, status)'),
    grab('function _lmOpsBlock(heroCard)'),
    grab('function _lmStageHtml(models, tiers, vrSlot)'),
    grab('function _lmRenderMap(models, tiers, heroBar, heroCard, vrSlot)'),
    'return { map: _lmRenderMap, stage: _lmStageHtml };'
  ].join('\n');
  Object.assign(stubs, extra || {});
  return new Function(...Object.keys(stubs), src)(...Object.values(stubs));
}
function renderMapWith(ms, extra, heroCard) {
  return lift(extra).map(ms, TIERS, '', heroCard || '', '19:00');
}
/* The stage on its own, which is what the home page draws. */
function renderStage(ms, extra) {
  return lift(extra).stage(ms, TIERS, '19:00');
}

console.log('--- every level the grid computed is drawn ---');
const ms = models(2);
const html = renderMap(ms);
const drawn = [...html.matchAll(/openLevelCountries\((\d+)\)/g)].map(m => Number(m[1]));
ok('nine levels drawn',        drawn.length === 9);
ok('each exactly once',        new Set(drawn).size === 9);
ok('and they are 1 through 9', drawn.slice().sort((a,b)=>a-b).join() === '1,2,3,4,5,6,7,8,9');

console.log('--- one anchor per country, and nothing placed by hand ---');
ok('five anchors, one per country', (html.match(/class="lm-anchor/g) || []).length === 5);
ok('five pins',                     (html.match(/class="lm-pin /g) || []).length === 5);
ok('five panels',                   (html.match(/class="lm-pop"/g) || []).length === 5);
/* Nothing is positioned independently any more, so nothing can collide. Cards
 * used to be placed from a table: keyed by country they hid each other's levels,
 * and grouped by country they hid each other. */
ok('no card carries its own coordinates', !/lm-card[^-]/.test(html));
ok('and the leader lines are gone with them', !/lm-leader/.test(html));

console.log('--- the map says something before anything is clicked ---');
/* A field of bare flags would say less than the grid it offers to replace. */
ok('every pin names its country',   (html.match(/class="lm-pin-chip"/g) || []).length === 5);
ok('and shows how far through it is', (html.match(/class="lm-pin-count"/g) || []).length === 5);
/* The first version of the first line here had no .test(html) — a bare regex
 * literal, which is truthy, so it asserted nothing at all and would have passed
 * against any output whatsoever. It also expected 3/3 where the fixture completes
 * only level 1, so it was wrong twice over and green. */
ok('Australia reads 0 of its 3',    /Australia<span class="lm-pin-count">0\/3</.test(html));
ok('the United Kingdom reads 0 of 2', /United Kingdom<span class="lm-pin-count">0\/2</.test(html));
// And the counts move with the data rather than being decoration.
const allAu = models(2);
[2, 7, 8].forEach(i => { allAu[i].isCompleted = true; allAu[i].locked = false; });
ok('finish Australia and it reads 3/3',
   /Australia<span class="lm-pin-count">3\/3</.test(renderMap(allAu)));

console.log('--- the pin is reachable by keyboard ---');
/* It was a div, which no keyboard could reach, and the ticket asked for buttons
 * for exactly that reason. */
ok('the pin is a button',           (html.match(/<button type="button" class="lm-pin/g) || []).length === 5);
ok('it says whether it is open',    (html.match(/aria-expanded="false"/g) || []).length === 5);
ok('and it says what it is',        /aria-label="Australia — 0 of 3 levels complete"/.test(html));

console.log('--- panels near an edge open inward ---');
/* .lm-stage-wrap clips, so a country at the bottom right would open into nothing.
 * Decided at render from the pin's quadrant rather than measured in the browser. */
ok('Australia opens leftward and upward',
   /class="lm-anchor lm-anchor--left lm-anchor--up" data-country="AU"/.test(html));
ok('the United States opens rightward and downward',
   /class="lm-anchor" data-country="US"/.test(html));
ok('India opens leftward, not upward',
   /class="lm-anchor lm-anchor--left" data-country="IN"/.test(html));
// Australia holds four in the catalogue; level 10 is the Operational block and
// is not among the models the map is given.
const auCard = html.slice(html.indexOf('Australia'));
const auLevels = [...auCard.slice(0, auCard.indexOf('</div>') + 6)
  .matchAll(/openLevelCountries\((\d+)\)/g)].map(m => Number(m[1]));
ok('Australia lists 3, 8 and 9',    auLevels.join() === '3,8,9');
ok('and its rows are in level order', auLevels.slice().sort((a,b)=>a-b).join() === auLevels.join());

console.log('--- the lock state matches, level by level ---');
let mismatched = [];
ms.forEach(function (m) {
  const want = m.isCompleted ? 'complete' : m.planLock ? 'upgrade' : m.locked ? 'locked' : 'current';
  if (!new RegExp('lm-row lm-row--' + want + '"[^>]*openLevelCountries\\(' + m.level + '\\)').test(html)) {
    mismatched.push(m.level + ' wanted ' + want);
  }
});
ok('every row carries the state the model gave it', mismatched.length === 0);
if (mismatched.length) console.log('        ' + mismatched.join(' · '));

console.log('--- the tier is on every row ---');
/* Grouping by country mixes them: Australia holds a Foundation level and two
 * Expert ones. Without this the map would stop saying something the grid makes
 * obvious just by having sections. */
ok('every row names its tier',
   (html.match(/class="lm-row-tier"/g) || []).length === 9);
ok('Foundation, Advanced and Expert all appear',
   /Foundation/.test(html) && /Advanced/.test(html) && /Expert/.test(html));

console.log('--- exactly one level is for sale ---');
/* _planLock is "next up AND behind the plan". Seven identical Upgrade buttons
 * is the failure this guards, and a redraw is exactly when it comes back. */
const upgrades = (html.match(/lm-chip--upgrade/g) || []).length;
ok('one Upgrade chip, not seven', upgrades === 1);
ok('and it is the level the model marked',
   /lm-row lm-row--upgrade"[^>]*openLevelCountries\(2\)/.test(html));
/* Marked on the country card too. Grouping buried the one level for sale as the
 * second row of a card that was otherwise finished. */
ok('the country holding it says so',       /lm-card-sale/.test(html));
ok('and only that country does',           (html.match(/lm-card-sale/g) || []).length === 1);
// Move the plan lock and it must move with it.
const html7 = renderMap(models(7));
ok('move the plan lock and the Upgrade moves too',
   (html7.match(/lm-chip--upgrade/g) || []).length === 1 &&
   /lm-row lm-row--upgrade"[^>]*openLevelCountries\(7\)/.test(html7));

console.log('--- the map goes to openLevelCountries and nowhere else ---');
/* That function writes selectedLevelData, which five "back" buttons in the
 * simulator read, and carries the two-lock branch that offers the plans modal
 * rather than a dead end. A map calling startCountryTraining directly would skip
 * both. */
const mapFn = MAP_SRC;
ok('every card calls it',        /onclick="openLevelCountries\(/.test(mapFn));
ok('and nothing calls past it',
   !/startCountryTraining|renderCountryTrainingHub|apiGetTrainingRoute/.test(mapFn));

console.log('--- a level with no coordinates is shown, not guessed at ---');
const orphan = models(2);
orphan[5].item.countries = [{ country: 'ZZ', completed: false }];   // level 6, nowhere
const oh = renderMap(orphan);
ok('it is not silently dropped',   /lm-unplaced/.test(oh));
ok('and only one country is missing', (oh.match(/class="lm-anchor/g) || []).length === 4);
ok('it is still reachable',        /lm-unplaced-card[^>]*openLevelCountries\(6\)/.test(oh));
ok('and it is NOT placed on the map', !/lm-anchor[\s\S]{0,900}?openLevelCountries\(6\)/.test(oh));
// Level 6 is Canada's only level, so removing it removes the whole card.
ok('the other four countries still are', (oh.match(/class="lm-anchor/g) || []).length === 4);

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
const mapSrc = MAP_SRC;
ok('the checkpoint reads the same source the grid card reads',
   /AppState\.examStatus/.test(mapSrc));
['passed', 'replay_required', 'failed_once', 'locked'].forEach(function (st) {
  ok('it knows the ' + st + ' state', new RegExp("'" + st + "'").test(mapSrc));
});
ok('and the fifth, ready to sit', /READY TO SIT/.test(mapSrc));
ok('a score is shown where there is one', /info\.score/.test(mapSrc));

console.log('--- and a checkpoint on the map can be sat ---');
/* It was a div. The map stated five checkpoint states at the top of the home page
 * and offered none of them: a student on level 4 read READY TO SIT and had to
 * scroll past the Operational block to a card that had quietly renamed itself.
 *
 * The map does not decide where a checkpoint leads — _examActionFor answers that
 * for the grid's card too, and this renders the real map against the real table
 * for each of the five states rather than asserting the strings twice. */
const examAction = new Function('Number',
  grab('function _examActionFor(examNum, status)') + '\nreturn _examActionFor;')(Number);

function mapWithExam(status) {
  /* Both, because the map guards on window.AppState and then reads AppState
   * bare. Stubbing only the bare one left every checkpoint reading 'locked' and
   * made four assertions fail against a fixture, not a product. */
  const st = { training: {}, examStatus: [
    { examNum: 1, status: status, score: 72 },
    { examNum: 2, status: 'locked' },
    { examNum: 3, status: 'locked' }
  ] };
  return renderMapWith(models(2), { AppState: st, window: { AppState: st } }, '');
}
/* The OPENING TAG of checkpoint 1's button, attributes and all. Slicing to the
 * first "Checkpoint 1" instead stopped at the aria-label, which sits before the
 * action — so every comparison below ran against a string that could not contain
 * the thing it was looking for, and five assertions failed for a reason that had
 * nothing to do with the product. */
function cp1(html) {
  const open = html.lastIndexOf('<button', html.indexOf('Checkpoint 1'));
  return html.slice(open, html.indexOf('>', open) + 1);
}

/* The five the server actually emits. computeExamStatus_ in Codigo.js returns
 * 'locked', 'passed', 'available', 'failed_once' or 'replay_required' and nothing
 * else — the first draft of this test invented '' for "ready", which the map
 * folds to 'locked', so it failed against a fixture rather than a product. */
ok('the mark is a button', /<button type="button" class="lm-cp /.test(mapWithExam('available')));
['available', 'failed_once', 'passed', 'replay_required', 'locked'].forEach(function (st) {
  const want = examAction(1, st);
  const got  = cp1(mapWithExam(st));
  ok('an ' + st + ' checkpoint does what the grid card does', got.indexOf(want) !== -1);
});
/* Recorded, not fixed. The map folds any falsy status to 'locked'; the grid card
 * leaves it alone, so _examActionFor's fallthrough would offer the exam. The two
 * therefore disagree about a status the server cannot produce. If that ever stops
 * being true, this line is where it will be noticed. */
ok('a status the server does not emit reads as locked on the map',
   /\sdisabled[\s>]/.test(cp1(mapWithExam(''))));
/* Disabled, not merely styled: a locked checkpoint must be unreachable by
 * keyboard as well as by mouse. */
ok('and a locked one is disabled',        /\sdisabled[\s>]/.test(cp1(mapWithExam('locked'))));
ok('while an available one is not',       !/\sdisabled[\s>]/.test(cp1(mapWithExam('available'))));
ok('every checkpoint is labelled for a screen reader',
   (mapWithExam('available').match(/aria-label="Checkpoint \d/g) || []).length === 3);
ok('three marks, no more',
   (mapWithExam('available').match(/class="lm-cp lm-cp--/g) || []).length === 3);

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
/* A pin is marked complete only when EVERY level in that country is finished.
 * Canada holds level 6 alone, so it is the one that can be; the fixture's default
 * completes only level 1, which is India, where level 5 is not. */
const caDone = models(2);
caDone[5].isCompleted = true; caDone[5].locked = false;
ok('a country whose levels are all finished is marked complete',
   (renderMap(caDone).match(/lm-pin--complete/g) || []).length === 1);
ok('and India, with level 5 outstanding, is not',
   !/lm-pin--complete[\s\S]{0,200}India/.test(renderMap(caDone)));

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
ok('every row still says which level it is',
   (html.match(/lm-row-lvl">LEVEL \d/g) || []).length === 9);

console.log('--- the map country comes from the sheet ---');
const LS = fs.readFileSync(__dirname + '/../LevelService.js', 'utf8');
ok('apiGetLevelMeta emits mapCountry', /mapCountry:\s*String\(r\.mapCountry/.test(LS));
ok('and the client reads it',          /meta\.mapCountry/.test(code));
ok('falling back to the level\'s own country', /\|\| \(\(model\.item\.countries \|\| \[\]\)\[0\]/.test(code));

console.log('--- the stage is the map, and the chrome is not part of it ---');
/* The home page draws the stage and nothing else. It is not the levels screen: it
 * has no tab strip to sit under and no grid to go back to, and a "Grid view"
 * button there would throw a student onto a different screen entirely, because
 * _lmSetView repaints the levels screen.
 *
 * So the boundary is asserted from both sides. Removing the switch from
 * _lmRenderMap broke nothing at all until these lines existed — the suite had
 * plenty to say about reaching the map and nothing about getting back. */
const stageOnly = renderStage(models(2));
ok('the stage draws the map',        /class="lm-stage"/.test(stageOnly));
ok('and the tier bar above it',      /class="lm-tiers"/.test(stageOnly));
ok('it carries no tab strip',        !/<nav>/.test(stageOnly));
ok('and no way back to the grid',    !/lm-switch/.test(stageOnly));
ok('and no Operational block',       !/OPERATIONAL CLEARANCE/.test(stageOnly));

const chrome = renderMap(models(2));
ok('the levels screen keeps its tab strip', /<nav>/.test(chrome));
ok('and its way back to the grid',          /lm-switch/.test(chrome));
ok('which sets the view to grid',           /_lmSetView\('grid'\)/.test(chrome));
ok('drawn exactly once',                    (chrome.match(/lm-switch-btn/g) || []).length === 1);
ok('and the stage it wraps is drawn once',  (chrome.match(/class="lm-stage"/g) || []).length === 1);

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
