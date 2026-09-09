/* A background failure that leaves no trace is a failure you find out about from
 * a screenshot.
 *
 * On the 8th, getMyCompletedLevels timed out four times in four minutes and
 * apiGetAppBootstrap once. The only record was a browser console. The home
 * refresh is deliberately silent ON SCREEN — the student is looking at something
 * else and did not ask for it — but it was also silent in the record, and
 * apiLogClientEvent already existed to carry exactly this.
 *
 * These check the wiring by reading the paths, and the throttle by running it. */
'use strict';
const fs = require('fs');
const S  = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
const SRC = S.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
let fails = 0; const ok = (n, c, d) => { if (!c) fails++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c || !d ? '' : ' — ' + d)); };

function grab(sig) {
  const i = SRC.indexOf(sig); if (i < 0) return null;
  let d = 0;
  for (let k = SRC.indexOf('{', i); k < SRC.length; k++) {
    if (SRC[k] === '{') d++; else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(i, k + 1); }
  }
  return null;
}

console.log('\nsilent background failures now leave a record\n');

console.log('the reporter exists and reaches the sheet:');
const rep = grab('function _reportBackgroundFailure(');
ok('_reportBackgroundFailure is declared', !!rep);
ok('it goes through the existing client-error reporter',
   rep && /window\._reportClientError\(/.test(rep));
ok('which writes to ClientEvents via apiLogClientEvent',
   /apiLogClientEvent\(AppState\.sessionToken, \{/.test(SRC) &&
   /eventType: 'client_error'/.test(SRC));
ok('and it is exported, because the boot path is a different scope',
   /window\._reportBackgroundFailure = _reportBackgroundFailure;/.test(SRC));

console.log('\nboth silent paths report:');
const refresh = grab('function refreshMeAndHome(');
ok('the silent branch of refreshMeAndHome reports',
   refresh && /_reportBackgroundFailure\('homeBackgroundRefresh'/.test(refresh));
ok('and so does its transport failure handler',
   refresh && (refresh.match(/_reportBackgroundFailure\('homeBackgroundRefresh'/g) || []).length === 2,
   refresh ? String((refresh.match(/_reportBackgroundFailure\('homeBackgroundRefresh'/g) || []).length) : '0');
// The cache-restore bootstrap discarded ok:false with a bare `return`.
ok('the cache-restore refresh no longer discards ok:false in silence',
   /_reportBackgroundFailure\('bootstrapRestoreRefresh'/.test(SRC));
ok('on both its handlers',
   (SRC.match(/_reportBackgroundFailure\('bootstrapRestoreRefresh'/g) || []).length === 2,
   String((SRC.match(/_reportBackgroundFailure\('bootstrapRestoreRefresh'/g) || []).length));
// Still silent on screen: this must not have grown a showContentError.
ok('and still says nothing on screen', refresh && !/showContentError/.test(
     refresh.slice(refresh.indexOf('silent'), refresh.indexOf('silent') + 400)));

console.log('\nthe throttle holds, because these failures arrive in runs:');
const reported = [];
const run = new Function('window', 'Date',
  'var _bgFailReportedAt = 0;\n' + rep + '\nreturn _reportBackgroundFailure;'
)({ _reportClientError: (s, e) => reported.push(s + ':' + e.message) },
  { now: () => Date._t });
Date._t = 1000000;
run('homeBackgroundRefresh', 'timeout');
run('homeBackgroundRefresh', 'timeout');
run('homeBackgroundRefresh', 'timeout');
ok('four timeouts in four minutes produce one row', reported.length === 1,
   String(reported.length));
ok('and it carries the reason', reported[0] === 'homeBackgroundRefresh:timeout', reported[0]);
Date._t += 10 * 60 * 1000 + 1;
run('homeBackgroundRefresh', 'timeout again');
ok('ten minutes later a second row is allowed, so a long outage is visible',
   reported.length === 2, String(reported.length));

console.log(fails ? ('\n' + fails + ' FAILING') : '\nall green');
process.exit(fails ? 1 : 0);
