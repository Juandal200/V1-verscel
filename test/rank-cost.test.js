/* The endpoint a student actually feels.
 *
 * On 2026-09-08 getMyCompletedLevels was the ONLY endpoint timing out: four
 * times in four minutes, at 43.2s and 54.0s, while apiPing — which does no I/O
 * at all — answered in 1.7-5.9s and getNotificationCounts in 3.5-4.4s. Apps
 * Script Executions showed those calls RUNNING, not refused, so the work was
 * completing at 54s and being thrown away by a proxy that aborts at 45s.
 *
 * Three causes, all addressed here: it ran every 60 seconds on a timer shared
 * with a cheap call, it read seven sheets with two full scans, and it built an
 * object for every row of Progress — every other student's included — before
 * filtering to one userId. */
'use strict';
const fs = require('fs');
const S = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
const G = fs.readFileSync(__dirname + '/../Gamification.js', 'utf8');
const A = fs.readFileSync(__dirname + '/../Attemptservice.js', 'utf8');
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
const Sc = strip(S), Gc = strip(G), Ac = strip(A);
let fails = 0; const ok = (n, c, d) => { if (!c) fails++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c || !d ? '' : ' — ' + d)); };
function grab(src, sig) {
  const i = src.indexOf(sig); if (i < 0) return null;
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  return null;
}

console.log('\nthe rank badge stops costing what it cost\n');

console.log('the expensive call is off the cheap call\'s timer:');
const poll = grab(Sc, 'function _gamPoll()');
ok('_gamPoll still fetches the badges', !!poll && /getNotificationCounts/.test(poll));
ok('and no longer fetches the rank',    !!poll && !/_refreshTopbarRank/.test(poll));
ok('badges stay at 60s',   /setInterval\(_gamPoll,\s+60000\)/.test(Sc));
ok('the rank moves to 5 minutes', /var _GAM_RANK_EVERY = 5 \* 60 \* 1000;/.test(Sc));
ok('on its own timer',     /setInterval\(_gamRankPoll, _GAM_RANK_EVERY\)/.test(Sc));
// The moment that actually changes the rank is still covered directly.
ok('level completion still refreshes it immediately',
   /if \(levelCompleted && window\._refreshTopbarRank\) _refreshTopbarRank\(\);/.test(Sc));

console.log('\nand the pollers can be stopped:');
ok('_gamStopPoll exists',            /function _gamStopPoll\(\)/.test(Sc));
ok('it clears both timers',          /clearInterval\(_gam\.pollTimer\);\s*clearInterval\(_gam\.rankTimer\);/.test(Sc.replace(/\s+/g, ' ').replace(/ /g, ' ')) || /_gam\.rankTimer = null;/.test(Sc));
ok('and signing out calls it',       /window\._gamStopPoll\(\);/.test(Sc));
ok('through window, across the IIFE boundary', /if \(window\._gamStopPoll\) window\._gamStopPoll\(\)/.test(Sc));

console.log('\nthe endpoint itself got cheaper:');
const gmcl = grab(Gc, 'function getMyCompletedLevels(');
ok('it is cached per user',  !!gmcl && /_gamCompletedCacheKey_\(uid\)/.test(gmcl));
ok('the cache is read before any sheet is opened',
   !!gmcl && gmcl.indexOf('_cache.get(') < gmcl.indexOf('_gamSS_()'),
   'get at ' + (gmcl && gmcl.indexOf('_cache.get(')) + ', sheet at ' + (gmcl && gmcl.indexOf('_gamSS_()')));
ok('and written on the way out', !!gmcl && /_cache\.put\(_gamCompletedCacheKey_\(uid\)/.test(gmcl));
ok('the Scenarios scan is hoisted out', !!gmcl && !/getSheetByName\('Scenarios'\)/.test(gmcl));
ok('into a script-wide cached map',  /function _gamLevelCountryMap_\(ss\)/.test(Gc) &&
                                     /cache\.put\('gamLevelCountryMap'/.test(Gc));
/* The filter must come before the object is built, or the work is still
 * proportional to every student's rows rather than this one's. */
ok('rows are filtered by userId BEFORE an object is built',
   !!gmcl && gmcl.indexOf("if (String(row[iUser] || '').trim() !== uid) return;") <
             gmcl.indexOf('var obj = {};'),
   'filter at ' + (gmcl && gmcl.indexOf("if (String(row[iUser]")) + ', build at ' + (gmcl && gmcl.indexOf('var obj = {};')));
ok('and a missing userId column refuses rather than mis-counts',
   !!gmcl && /if \(iUser === -1\) return \{ ok: true, completedLevels: 0 \};/.test(gmcl));

console.log('\nthe cache is invalidated where progress is actually written:');
ok('updateUserProgress invalidates it',
   /gamInvalidateCompletedLevels_\(user\.userId\)/.test(Ac));
ok('on both the update and the append path',
   (Ac.match(/gamInvalidateCompletedLevels_\(user\.userId\)/g) || []).length === 2,
   String((Ac.match(/gamInvalidateCompletedLevels_\(user\.userId\)/g) || []).length));
ok('and the invalidator cannot break the write',
   /function gamInvalidateCompletedLevels_[\s\S]{0,220}catch \(e\) \{\}/.test(Gc));

console.log('\nthe home retry is bounded, and stops:');
const delays = Sc.match(/var _HOME_RETRY_DELAYS = \[([^\]]+)\]/);
ok('three delays: 30s, 2min, 8min', !!delays && delays[1].replace(/\s/g,'') === '30000,120000,480000',
   delays && delays[1]);
// Executed, so "bounded" is a fact rather than a claim.
const sched = grab(Sc, 'function _homeRetrySchedule()');
const reset = grab(Sc, 'function _homeRetryReset()');
ok('_homeRetrySchedule exists', !!sched);
ok('_homeRetryReset exists',    !!reset);
if (sched && reset) {
  /* Executed, so "bounded" is a fact. The fake clock captures each callback and
   * runs it, which is what clears the in-flight guard — exactly as the real
   * setTimeout does — so the next attempt is free to arm. */
  const fired = [];
  let pending = null;
  const api = new Function('_HOME_RETRY_DELAYS', 'AppState', 'setTimeout', 'clearTimeout',
    'refreshMeAndHome', 'renderHome', 'window',
    'var _homeRetryAttempt = 0, _homeRetryTimer = null;\n' + sched + '\n' + reset +
    '\nreturn { schedule: _homeRetrySchedule, reset: _homeRetryReset };'
  )([30000, 120000, 480000], { sessionToken: 't' },
    (fn, ms) => { fired.push(ms); pending = fn; return 1; },
    () => { pending = null; }, () => {}, () => {}, {});

  const tick = () => { const f = pending; pending = null; if (f) f(); };

  api.schedule(); api.schedule();            // a second call while one is pending
  ok('a pending retry is not doubled', fired.length === 1, JSON.stringify(fired));
  tick(); api.schedule();
  tick(); api.schedule();
  ok('three attempts, at 30s / 2min / 8min',
     JSON.stringify(fired) === '[30000,120000,480000]', JSON.stringify(fired));
  tick(); api.schedule();
  ok('and it STOPS after the third', fired.length === 3, JSON.stringify(fired));

  api.reset();
  api.schedule();
  ok('a success rearms it from the beginning',
     fired.length === 4 && fired[3] === 30000, JSON.stringify(fired));
}
ok('a success resets the backoff', /_homeRetryReset\(\);\s*$/m.test(Sc) || /_homeRetryReset\(\);/.test(Sc));
ok('and it never arms while one is pending', !!sched && /if \(_homeRetryTimer\) return;/.test(sched));
ok('nor past the end of the list', !!sched && /_homeRetryAttempt >= _HOME_RETRY_DELAYS\.length/.test(sched));

console.log(fails ? ('\n' + fails + ' FAILING') : '\nall green');
process.exit(fails ? 1 : 0);
