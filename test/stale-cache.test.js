/* Never present stale data as current.
 *
 * The home screen renders from cache whenever there is anything cached — right,
 * because a student should not stare at a spinner while the server is slow. What
 * was wrong is that restoring from localStorage stamped the data with
 * Date.now(), commented "treat as fresh so renderHome skips skeleton". Combined
 * with a 30-day TTL and a refresh that failed in silence, a student could be
 * shown month-old XP, streak and plan status as though it were this morning's.
 *
 * The functions are lifted and run. */
'use strict';
const fs = require('fs');
const S  = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
const C  = fs.readFileSync(__dirname + '/../Styles.html', 'utf8');
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

console.log('\nstale home data, from Scripts.html\n');

console.log('the cache expires in a week, not a month:');
const ttl = (SRC.match(/var _HOME_CACHE_TTL = ([^;]+);/) || [])[1] || '';
ok('_HOME_CACHE_TTL is 7 days', /7\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/.test(ttl), ttl.trim());
ok('and 30 days is gone', !/30\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/.test(ttl));

console.log('\nrestoring from cache carries the real age:');
ok('_homeDataFreshAt takes cachedAt, not Date.now()',
   /_homeDataFreshAt = Number\(_startCache\.cachedAt\) \|\| 0;/.test(SRC));
ok('the old "treat as fresh" stamp is gone',
   !/_homeDataFreshAt = Date\.now\(\); \/\/ treat as fresh/.test(S));
// A real refresh must still mark it current, or the notice never clears.
ok('a successful refresh still stamps it now',
   /_homeDataFreshAt     = Date\.now\(\);/.test(SRC));
ok('and clears the failure flag', /_homeRefreshFailedAt = 0;/.test(SRC));

console.log('\nthe notice appears only when data is old AND a refresh failed:');
const notice = grab('function _staleNoticeHtml(');
const age    = grab('function _ageText(');
ok('_staleNoticeHtml is declared', !!notice);
ok('_ageText is declared', !!age);
if (!notice || !age) { console.log('\ncannot continue'); process.exit(1); }

function render(opts) {
  const now = 2000000000000;
  return new Function('_homeRefreshFailedAt', '_homeDataFreshAt', 'window', 'Date', 'uiIconInline',
    age + '\n' + notice + '\nreturn _staleNoticeHtml();'
  )(opts.failedAt, opts.freshAt, { _homeRetryPending: !!opts.retrying },
    { now: () => now }, () => '<svg/>');
}
const NOW = 2000000000000;
ok('working normally, it renders nothing',
   render({ failedAt: 0, freshAt: NOW - 60000 }) === '');
ok('failed but the data is current, it still renders nothing',
   render({ failedAt: NOW, freshAt: NOW - 5000 }) === '');
ok('no idea how old the data is, it renders nothing',
   render({ failedAt: NOW, freshAt: 0 }) === '');

const stale = render({ failedAt: NOW, freshAt: NOW - 2 * 3600 * 1000 });
ok('stale and failed, it says how old',  /Showing data from 2h ago/.test(stale), stale);
ok('and offers a retry',                 /home-stale-retry/.test(stale));
const retrying = render({ failedAt: NOW, freshAt: NOW - 2 * 3600 * 1000, retrying: true });
ok('while retrying it says so instead',  /Reconnecting/.test(retrying) && !/Retry</.test(retrying), retrying);

console.log('\nthe ages read the way a person would say them:');
const A = new Function(age + '\nreturn _ageText;')();
[[30000, 'just now'], [5 * 60000, '5 min ago'], [90 * 60000, '1h ago'],
 [26 * 3600 * 1000, 'yesterday'], [3 * 86400 * 1000, '3 days ago']
].forEach(([ms, want]) => ok('' + ms + 'ms -> "' + want + '"', A(ms) === want, A(ms)));

console.log('\nit is a caveat, not an error — no colour, tokens only:');
const css = C.slice(C.indexOf('.home-stale-note {'), C.indexOf('.home-stale-note {') + 700)
             .replace(/\/\*[\s\S]*?\*\//g, '');
ok('the rule exists', css.length > 0);
ok('no hex literals',        !/#[0-9a-fA-F]{3,8}/.test(css));
ok('no raw rgb literals',    !/rgba?\((?!var)/.test(css));
ok('it uses the muted token', /color:\s*var\(--muted\)/.test(css));
ok('and no red, green or yellow', !/--red|--green|--yellow/.test(css));

console.log(fails ? ('\n' + fails + ' FAILING') : '\nall green');
process.exit(fails ? 1 : 0);
