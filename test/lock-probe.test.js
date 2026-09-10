/* Measuring the thing that actually limits us.
 *
 * Every concurrent-user ceiling this project has quoted has been arithmetic: 30
 * simultaneous executions divided by a median call time. That arithmetic measures
 * the wrong resource. executeAs is USER_DEPLOYING, so all 41 dbWithScriptLock_
 * sites queue on ONE mutex — concurrency there is 1, not 30 — and how long it is
 * held has never been measured.
 *
 * Nothing in this repository can run Apps Script, so the measurement has to ship
 * as a button. What CAN be checked here is that the button is safe to press
 * against production and that it measures the login path the way the login path
 * actually behaves.
 */
const fs = require('fs');
const C  = fs.readFileSync(__dirname + '/../Código.js',   'utf8');
const A  = fs.readFileSync(__dirname + '/../Authservice.js', 'utf8');
const S  = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
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

const probe = strip(grab(C, 'function apiAdminMeasureLock(sessionToken)'));

console.log('--- the probe is admin-only ---');
ok('it requires a role',        /requireRole\(sessionToken, \['ADMIN'\]\)/.test(probe));
ok('and that role is ADMIN alone', !/INSTRUCTOR|STUDENT/.test(probe));

console.log('--- and safe to press against production ---');
/* The panel says "read-only, writes nothing". That sentence is a promise made to
 * whoever clicks it on a live database, so it is checked rather than trusted. */
ok('it appends nothing',    !/dbAppend_\(/.test(probe));
ok('it updates nothing',    !/dbUpdateByRow_\(/.test(probe));
ok('it deletes nothing',    !/dbDeleteByRow_\(/.test(probe));
ok('it sends no mail',      !/MailApp\.|GmailApp\./.test(probe));
ok('it calls nothing out',  !/UrlFetchApp\./.test(probe));

console.log('--- it measures the login path the way login performs it ---');
/* apiVerifyLoginCode reads and filters the whole LoginCodes sheet INSIDE the
 * lock. A probe that read it outside would measure latency and report it as
 * contention, which is the mistake the whole exercise exists to correct. */
const insideLock = probe.slice(probe.indexOf('loginHold'), probe.indexOf('function timedRead'));
ok('LoginCodes is read inside the lock',
   /dbWithScriptLock_\(function \(\) \{\s*loginRows = dbReadAll_\('LoginCodes'\)/.test(insideLock));
ok('and the real login path does the same',
   /dbWithScriptLock_\(function\(\) \{[\s\S]{0,200}dbReadAll_\('LoginCodes'\)/.test(strip(A)));
/* Attempts and Progress are latency, not contention. Timing them under the lock
 * would inflate the one number the capacity arithmetic consumes. */
ok('the growing scans are timed outside it',
   !/dbWithScriptLock_[\s\S]{0,200}dbReadAll_\('Attempts'\)/.test(probe));

console.log('--- it reports the one number the arithmetic needs ---');
ok('a floor, measured with an empty callback', /lockFloorMs/.test(probe));
ok('the LoginCodes row count',                 /rows: loginRows/.test(probe));
ok('and a total hold for one login verify',    /holdForOneLoginVerify/.test(probe));
/* Four acquisitions per verify, one of which carries the sheet read. */
ok('built from four acquisitions, not one',
   /floorStats\.median \* 3\) \+ loginStats\.median/.test(probe));

console.log('--- and there is a way to press it ---');
const client = strip(S);
ok('the panel has the section',   /Backend Capacity/.test(client));
ok('with a button',               /onclick="adminMeasureLock\(\)"/.test(client));
ok('the handler exists',          /function adminMeasureLock\(\)/.test(client));
ok('and is exported',             /window\.adminMeasureLock\s*=/.test(client));
ok('it calls the endpoint',       /\.apiAdminMeasureLock\(AppState\.sessionToken\)/.test(client));
/* Thirteen acquisitions is nothing on an idle project and a queue on a busy one.
 * Better written on the button than discovered during a class. */
ok('and the button says not to run it mid-class',
   /do not run it while a class is training/i.test(S));
ok('a failure is visible rather than silent',
   /Could not run the measurement/.test(client));

console.log(fails ? '\n' + fails + ' FAILING' : '\nAll lock-probe assertions passed.');
process.exit(fails ? 1 : 0);
