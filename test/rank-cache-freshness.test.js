/* The rank cache must not outlive the numbers it holds.
 *
 * getMyCompletedLevels is cached per user, and it returns lmsXp, weeklyXp,
 * streakDays and streakFreezes as well as the level count. The cache was cleared
 * only by ProgressService.updateUserProgress — so a student could earn XP and
 * keep seeing the old total until the entry expired on its own.
 *
 * That made the obvious performance fix wrong in isolation: raising the TTL to
 * cut the miss rate would have widened the staleness window rather than closing
 * it. Every writer clears it now, so the entry's life is bounded by writes
 * rather than by the clock, and the TTL can be long.
 *
 * The invalidations live in `finally` because both writers return from several
 * places, and a write that happened must invalidate even if something after it
 * threw. These run the real functions to prove that. */
'use strict';
const fs = require('fs');
const L = fs.readFileSync(__dirname + '/../LMSModuleService.js', 'utf8');
const G = fs.readFileSync(__dirname + '/../Gamification.js', 'utf8');
let fails = 0; const ok = (n, c, d) => { if (!c) fails++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c || !d ? '' : ' — ' + d)); };
function grab(src, sig) {
  const i = src.indexOf(sig); if (i < 0) return null;
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  return null;
}

console.log('\nthe rank cache is cleared by every writer\n');

/* Runs the real function with a recording invalidator, so "does it clear the
 * cache" is answered by calling it rather than by finding the word. */
function runXp(rows, amount) {
  const cleared = [];
  const stubs = {
    dbReadAll_: () => rows,
    dbUpdateByRow_: () => {}, dbAppend_: () => {},
    lmsGetTotalXp_: () => 0,
    _lmsGetMondayIso_: () => '2026-09-07',
    gamInvalidateCompletedLevels_: id => cleared.push(id),
  };
  const fn = new Function(...Object.keys(stubs), grab(L, 'function lmsAddXp_') + '\nreturn lmsAddXp_;')(...Object.values(stubs));
  const out = fn('u1', amount);
  return { out, cleared };
}

console.log('lmsAddXp_:');
let r = runXp([{ userId: 'u1', lmsXp: 100, weeklyXp: 20, weeklyResetAt: '2026-09-07', __rowNumber: 2 }], 25);
ok('an update clears the cache', r.cleared.length === 1 && r.cleared[0] === 'u1', JSON.stringify(r.cleared));
ok('and still returns the new total', r.out === 125, String(r.out));
r = runXp([], 25);
ok('a first-ever award clears it too', r.cleared.length === 1, JSON.stringify(r.cleared));
ok('and returns the amount', r.out === 25, String(r.out));
// No write, so nothing to invalidate — and it must not pretend otherwise.
r = runXp([], 0);
ok('awarding nothing writes nothing and clears nothing', r.cleared.length === 0, JSON.stringify(r.cleared));

/* The finally is the point: a throw after the write must still invalidate, or a
 * student's XP is on the sheet and their badge disagrees until the TTL runs out. */
console.log('\nand it clears even when something after the write throws:');
{
  const cleared = [];
  const stubs = {
    dbReadAll_: () => [{ userId: 'u1', lmsXp: 1, __rowNumber: 2 }],
    dbUpdateByRow_: () => { throw new Error('sheet blew up'); },
    dbAppend_: () => {}, lmsGetTotalXp_: () => 0,
    _lmsGetMondayIso_: () => '2026-09-07',
    gamInvalidateCompletedLevels_: id => cleared.push(id),
  };
  const fn = new Function(...Object.keys(stubs), grab(L, 'function lmsAddXp_') + '\nreturn lmsAddXp_;')(...Object.values(stubs));
  let threw = false;
  try { fn('u1', 25); } catch (e) { threw = true; }
  ok('the error still propagates', threw);
  ok('and the cache was cleared anyway', cleared.length === 1, JSON.stringify(cleared));
}

console.log('\nlmsUpdateStreak_ clears it on every branch:');
function runStreak(rows) {
  const cleared = [];
  const stubs = {
    dbReadAll_: () => rows, dbUpdateByRow_: () => {}, dbAppend_: () => {},
    _dcGetFreezes_: () => 0, _dcSetFreezes_: () => {},
    gamInvalidateCompletedLevels_: id => cleared.push(id),
  };
  const src = 'var _LMS_LAST_STREAK_EVENT_ = null;\n' + grab(L, 'function lmsUpdateStreak_') + '\nreturn lmsUpdateStreak_;';
  const fn = new Function(...Object.keys(stubs), src)(...Object.values(stubs));
  return { out: fn('u1'), cleared };
}
const iso = d => new Date(Date.now() - d * 86400000).toISOString();
[['no row yet', []],
 ['same day',   [{ userId: 'u1', streakDays: 3, lastActiveAt: iso(0), __rowNumber: 2 }]],
 ['next day',   [{ userId: 'u1', streakDays: 3, lastActiveAt: iso(1), __rowNumber: 2 }]],
 ['streak lost',[{ userId: 'u1', streakDays: 3, lastActiveAt: iso(5), __rowNumber: 2 }]],
].forEach(([label, rows]) => {
  const s = runStreak(rows);
  ok(label + ' clears the cache', s.cleared.length === 1, JSON.stringify(s.cleared));
});

console.log('\nand the TTL is now longer than the poll that reads it:');
const ttl = Number((G.match(/var GAM_COMPLETED_CACHE_SECS_\s*=\s*(\d+)/) || [])[1]);
ok('TTL is 1800s', ttl === 1800, String(ttl));
// The rank poll runs every 300s; a TTL below it would miss every single time.
ok('comfortably above the 300s rank poll', ttl >= 900, String(ttl));
ok('and within CacheService\'s six-hour maximum', ttl <= 21600, String(ttl));

console.log(fails ? ('\n' + fails + ' FAILING') : '\nall green');
process.exit(fails ? 1 : 0);
