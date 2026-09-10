/* The computation both drawings of the level screen read.
 *
 * level-map-parity runs the real map renderer, but it builds its models by hand —
 * so it is green about the DRAWING and says nothing about where those models come
 * from. That was fine while the computation lived inside the grid's own loop and
 * could not be reached from anywhere else. It is its own function now, because the
 * home page needs the state of a level without drawing the grid, and a function
 * two screens read is a function that has to be tested directly.
 *
 * The rule that matters most here is the plan lock. Every level past the plan
 * carries lockedByPlan, so a naive reading offers "Unlock" on all of them and
 * implies level 5 is one payment away. It is not: paying lifts the plan lock and
 * the progress lock still requires every level before it. Exactly one level — the
 * next one a student could actually play — is for sale.
 */
const fs = require('fs');
const S  = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
let fails = 0;
const ok = (n, c) => { if (!c) fails++; console.log((c ? '  PASS  ' : '  FAIL  ') + n); };

function grab(sig) {
  const i = S.indexOf(sig);
  if (i < 0) throw new Error('not found: ' + sig);
  let d = 0;
  for (let k = S.indexOf('{', i); k < S.length; k++) {
    if (S[k] === '{') d++;
    else if (S[k] === '}') { d--; if (!d) return S.slice(i, k + 1); }
  }
}

/* Lifted from source. Nothing about the computation is retyped here — a copy
 * would be green about a product that may no longer exist. */
const build = new Function('Number', 'String',
  grab('function _lmBuildModels(levelByNum, tiers, vrEvents, firstPlanLockedLevel)') +
  '\nreturn _lmBuildModels;'
)(Number, String);

const TIERS = [
  { num: 1, name: 'Foundation', levels: [1, 2, 3], examNum: 1, nextLevel: 4 },
  { num: 2, name: 'Advanced',   levels: [4, 5, 6], examNum: 2, nextLevel: 7 },
  { num: 3, name: 'Expert',     levels: [7, 8, 9], examNum: 3, nextLevel: 10 }
];

/* The real assignment, read out of the running catalogue. */
const COUNTRY = { 1:'IN', 2:'GB', 3:'AU', 4:'US', 5:'IN', 6:'CA', 7:'GB', 8:'AU', 9:'AU' };

function catalog(shape) {
  const by = {};
  [1,2,3,4,5,6,7,8,9].forEach(n => {
    const s = (shape && shape[n]) || {};
    by[n] = {
      level: n,
      locked: s.locked === undefined ? true : s.locked,
      lockedByPlan: !!s.lockedByPlan,
      countries: (s.countries === undefined)
        ? [{ country: COUNTRY[n], completed: !!s.done }]
        : s.countries
    };
    if (s.totalCountries !== undefined) by[n].totalCountries = s.totalCountries;
  });
  return by;
}

const by = (models) => Object.fromEntries(models.map(m => [m.level, m]));

console.log('--- every level in the ladder, once, in order ---');
const all = build(catalog({}), TIERS, {}, 0);
ok('nine models',            all.length === 9);
ok('one per level',          new Set(all.map(m => m.level)).size === 9);
ok('in ladder order',        all.map(m => m.level).join() === '1,2,3,4,5,6,7,8,9');
ok('each carries its tier',  all.every(m => m.tier === TIERS.filter(t => t.levels.indexOf(m.level) >= 0)[0].num));
ok('and the catalogue row',  all.every(m => m.item && Number(m.item.level) === m.level));

console.log('--- a level the sheet does not publish is skipped, not invented ---');
/* Not filled in with a placeholder: a level that is not in the catalogue is a
 * fact about the sheet, and the screens that ask are expected to say so. */
const gap = catalog({});
delete gap[5];
const gapped = build(gap, TIERS, {}, 0);
ok('eight models, not nine',  gapped.length === 8);
ok('and five is the missing one', gapped.map(m => m.level).indexOf(5) === -1);
ok('the tier it sat in still reports the other two',
   gapped.filter(m => m.tier === 2).map(m => m.level).join() === '4,6');

console.log('--- exactly one level is for sale ---');
/* The free plan: level 1 played, everything above it behind the plan. */
const free = catalog({
  1: { locked: false, done: true },
  2: { lockedByPlan: true }, 3: { lockedByPlan: true }, 4: { lockedByPlan: true },
  5: { lockedByPlan: true }, 6: { lockedByPlan: true }, 7: { lockedByPlan: true },
  8: { lockedByPlan: true }, 9: { lockedByPlan: true }
});
const paid = build(free, TIERS, {}, 2);
ok('eight levels carry lockedByPlan', Object.keys(free).filter(k => free[k].lockedByPlan).length === 8);
ok('but exactly one says Upgrade',    paid.filter(m => m.statusText === 'Upgrade').length === 1);
ok('and it is level 2',               paid.filter(m => m.statusText === 'Upgrade')[0].level === 2);
ok('exactly one carries planLock',    paid.filter(m => m.planLock).length === 1);
ok('level 5 reads Locked, not Upgrade', by(paid)[5].statusText === 'Locked');

console.log('--- the ladder decides which one, not the level ---');
/* firstPlanLockedLevel arrives as an argument precisely because no single level
 * can work it out. Move it and the sale moves with it. */
const later = build(free, TIERS, {}, 6);
ok('one for sale still',       later.filter(m => m.planLock).length === 1);
ok('and now it is level 6',    later.filter(m => m.planLock)[0].level === 6);
ok('level 2 has stopped being for sale', by(later)[2].planLock === false);
console.log('--- and nothing is for sale when nothing is behind the plan ---');
ok('zero Upgrades', build(catalog({}), TIERS, {}, 0).filter(m => m.statusText === 'Upgrade').length === 0);

console.log('--- complete means every country done, however the sheet spells it ---');
const spellings = build(catalog({
  1: { locked: false, countries: [{ country:'IN', completed: true  }, { country:'GB', completed: true }] },
  2: { locked: false, countries: [{ country:'GB', completed: 1     }, { country:'AU', completed: 1    }] },
  3: { locked: false, countries: [{ country:'AU', completed: 'TRUE'}, { country:'US', completed:'true'}] },
  4: { locked: false, countries: [{ country:'US', completed: true  }, { country:'CA', completed:false }] },
  5: { locked: false, countries: [] }
}), TIERS, {}, 0);
const sp = by(spellings);
ok('booleans count',            sp[1].isCompleted === true && sp[1].done === 2);
ok('the number 1 counts',       sp[2].isCompleted === true && sp[2].done === 2);
ok('TRUE and true count',       sp[3].isCompleted === true && sp[3].done === 2);
ok('one of two is not complete', sp[4].isCompleted === false && sp[4].done === 1);
/* Zero of zero is not a finished level. It is a level with no countries, and
 * calling it Complete would tick something the student never did. */
ok('no countries is not complete', sp[5].isCompleted === false);
ok('and its percentage is zero',   sp[5].pct === 0);

console.log('--- progress is the fraction of countries done ---');
ok('two of two is 100', sp[1].pct === 100 && sp[1].total === 2);
ok('one of two is 50',  sp[4].pct === 50);
/* Rounded, because a bar cannot be 33.33% wide and the number is also printed. */
const thirds = by(build(catalog({
  1: { locked: false, countries: [{completed:true},{completed:false},{completed:false}] }
}), TIERS, {}, 0));
ok('one of three is 33', thirds[1].pct === 33);

console.log('--- an empty countries list falls back to the count column ---');
/* Some rows carry the total without carrying the rows, and a level showing 0
 * regions when the sheet says 6 is the map claiming the level is empty. */
const fallback = by(build(catalog({
  1: { locked: false, countries: [], totalCountries: 6 }
}), TIERS, {}, 0));
ok('total comes from the column', fallback[1].total === 6);
ok('regions agrees with total',   fallback[1].regions === 6);
ok('and it is not complete',      fallback[1].isCompleted === false);

console.log('--- the status words and the status class ---');
const states = by(build(catalog({
  1: { locked: false, done: true },
  2: { locked: false },
  3: { locked: true },
  4: { locked: true, lockedByPlan: true }
}), TIERS, {}, 4));
ok('done reads Complete',      states[1].statusText === 'Complete' && states[1].statusClass === 'ACTIVE');
ok('open reads Unlocked',      states[2].statusText === 'Unlocked' && states[2].statusClass === 'PENDING');
ok('shut reads Locked',        states[3].statusText === 'Locked'   && states[3].statusClass === 'BLOCKED');
ok('for sale reads Upgrade',   states[4].statusText === 'Upgrade');
/* A level for sale is still locked. The class is what the card colours itself
 * from, and painting it PENDING would show an unplayable level as available. */
ok('but is still BLOCKED',     states[4].statusClass === 'BLOCKED');

console.log('--- unlocked:false locks a level as surely as locked:true ---');
/* Two spellings of one fact, both live in the catalogue. */
const two = by(build({ 1: { level:1, unlocked: false, countries: [] } },
                     [{ num:1, name:'Foundation', levels:[1] }], {}, 0));
ok('unlocked:false is locked', two[1].locked === true);

console.log('--- the VR event rides along, or does not ---');
const vr = by(build(catalog({ 1:{locked:false}, 2:{locked:false} }), TIERS,
                    { 2: { type: 'gold', icon: '*', label: 'DOUBLE XP' } }, 0));
ok('a level with an event carries it', vr[2].vr && vr[2].vr.label === 'DOUBLE XP');
ok('a level without one carries null', vr[1].vr === null);
ok('and no events at all is safe',     by(build(catalog({}), TIERS, null, 0))[1].vr === null);

console.log(fails ? '\n' + fails + ' FAILING' : '\nAll level-model assertions passed.');
process.exit(fails ? 1 : 0);
