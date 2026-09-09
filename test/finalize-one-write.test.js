/* One lock per route completion, not one per phase.
 *
 * updateUserProgress derives everything from scenario.level, scenario.country and
 * the Attempts sheet — the scenario id never enters the calculation. A route is
 * one level and one country, so calling it once per phase computed the SAME
 * progressData eight times and wrote the same Progress row eight times.
 *
 * Each of those calls takes its own dbWithScriptLock_, and that lock is
 * project-wide: LockService.getScriptLock(), shared by 40 write paths, with no
 * per-user alternative because the web app deploys as executeAs: USER_DEPLOYING.
 * Eight acquire/release cycles per completion is what set the ceiling on
 * concurrent students, and it grew with the Attempts sheet.
 *
 * This RUNS apiFinalizeRoute against stubs and counts the calls. Reading the
 * source would only show that a loop exists. */
'use strict';
const fs = require('fs');
const A = fs.readFileSync(__dirname + '/../Attemptservice.js', 'utf8');
let fails = 0; const ok = (n, c, d) => { if (!c) fails++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c || !d ? '' : ' — ' + d)); };
function grab(src, sig) {
  const i = src.indexOf(sig); if (i < 0) return null;
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  return null;
}

const body = grab(A, 'function apiFinalizeRoute');
console.log('\nroute completion takes one lock per (level, country)\n');
ok('apiFinalizeRoute lifted', !!body);
if (!body) { console.log('cannot continue'); process.exit(1); }

function run(scenarios, ids, opts) {
  opts = opts || {};
  const calls = [];            // one entry per updateUserProgress call
  let scopes = 0;
  const stubs = {
    AuthService: { requireRole: () => ({ userId: 'u1', email: 'a@b.c' }) },
    readSheetObjectsV5Hard_: () => scenarios,
    ProgressService: {
      normalizeCountry_: c => String(c || '').trim().toUpperCase(),
      updateUserProgress: (user, sc) => {
        calls.push({ level: sc.level, country: sc.country });
        if (opts.throwOn && opts.throwOn(sc)) throw new Error('write failed');
        return { level: sc.level, country: sc.country, completed: true };
      },
    },
    dbWithReadScope_: fn => { scopes++; return fn(); },
    lmsAddXp_: () => 100, lmsUpdateStreak_: () => 3, lmsTakeStreakEvent_: () => null,
    Logger: { log() {} },
    apiError_: (src, err) => ({ ok: false, error: err.message }),
  };
  const fn = new Function(...Object.keys(stubs), body + '\nreturn apiFinalizeRoute;')(...Object.values(stubs));
  const res = fn('tok', { scenarioIds: ids, correctCount: 8 });
  return { res, calls, scopes };
}

// A real route: eight phases, one level, one country.
const route = [];
for (let i = 1; i <= 8; i++) route.push({ scenarioId: 'S' + i, level: 1, country: 'USA' });
const ids = route.map(s => s.scenarioId);

console.log('a normal eight-phase route:');
let r = run(route, ids);
ok('writes ONCE, not eight times', r.calls.length === 1, r.calls.length + ' calls');
ok('and opens exactly one read scope', r.scopes === 1, String(r.scopes));
ok('for the route\'s own level and country',
   r.calls[0].level === 1 && r.calls[0].country === 'USA', JSON.stringify(r.calls[0]));
// `done` must still count SCENARIOS, or the response contract drifts.
ok('finalized still counts scenarios, not groups', r.res.finalized === 8, String(r.res.finalized));
ok('nothing reported missing', r.res.missing.length === 0);
ok('and it still returns ok with the computed progress',
   r.res.ok === true && !!r.res.progress);

console.log('\na list spanning two levels still writes once per pair:');
const mixed = [
  { scenarioId: 'A1', level: 1, country: 'USA' },
  { scenarioId: 'A2', level: 1, country: 'USA' },
  { scenarioId: 'B1', level: 2, country: 'UK'  },
];
r = run(mixed, ['A1', 'A2', 'B1']);
ok('two writes for two pairs', r.calls.length === 2, r.calls.length + ' calls');
ok('finalized counts all three scenarios', r.res.finalized === 3, String(r.res.finalized));

console.log('\ncountry matching goes through normalizeCountry_ on both sides:');
r = run([{ scenarioId: 'C1', level: 1, country: 'usa' },
         { scenarioId: 'C2', level: 1, country: 'USA' }], ['C1', 'C2']);
ok('"usa" and "USA" are one group', r.calls.length === 1, r.calls.length + ' calls');

console.log('\nan unknown id is reported, not written:');
r = run(route, ids.concat(['GHOST']));
ok('GHOST is in missing', r.res.missing.indexOf('GHOST') !== -1, JSON.stringify(r.res.missing));
ok('and still only one write',  r.calls.length === 1, String(r.calls.length));
ok('finalized excludes it',     r.res.finalized === 8, String(r.res.finalized));

console.log('\na failed write does not count its scenarios as finalised:');
r = run(mixed, ['A1', 'A2', 'B1'], { throwOn: sc => sc.level === 2 });
ok('the surviving pair still writes', r.calls.length === 2);
ok('and finalized drops to the pair that succeeded', r.res.finalized === 2, String(r.res.finalized));
ok('the route still returns ok — attempts are already safe', r.res.ok === true);

console.log(fails ? ('\n' + fails + ' FAILING') : '\nall green');
process.exit(fails ? 1 : 0);
