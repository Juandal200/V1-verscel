/* One message slot, two operations, and no rule about who wins.
 *
 * A student requested an access code, received it, and was shown "Still
 * connecting… (attempt 2)". The code had arrived. The message was about something
 * else entirely, and read as though the request had failed.
 *
 * #loginMessage is one element with thirty-three writers. A session token with no
 * cached home data sends boot down a retry path — four attempts, twenty and thirty
 * second timeouts, up to a hundred and ten seconds of it — while the login form is
 * on screen. Nothing stopped that retry when the student signed in instead, and
 * nothing decided whose message mattered. Boot's writes are on timers, so they land
 * after the student's and overwrite them.
 *
 * Two rules now. A background message is dropped once the student has acted, and
 * the student acting stops the retry, because signing in fresh replaces the token
 * boot was trying to restore anyway. */
const fs = require('fs');
const S = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};

console.log('--- the student\'s message wins ---');
ok('the slot knows who is writing',
   /function setLoginMessage\(message, source\)/.test(S));
ok('and drops a background one once they have acted',
   /if \(source === 'boot' && _loginBusy\) return;/.test(S));
ok('every boot message says it is one',
   (S.match(/setLoginMessage\([^;]*'boot'\)/g) || []).length === 4);
// The student's own calls must NOT be tagged, or they would silence themselves.
const userCalls = (S.match(/setLoginMessage\('(Sending|Verifying|Access code|Enter|Server|The server is taking)[^;]*\)/g) || []);
ok('the student\'s own messages carry no source',
   userCalls.every(c => !/'boot'/.test(c)));

console.log('--- and their action stops the retry ---');
ok('there is a way to stop it',      /window\._abortBootRestore = function \(\)/.test(S));
ok('it clears the pending timer',    /_bootTimerRef\) \{ clearTimeout\(_bootTimerRef\)/.test(S));
ok('and marks the sequence done',    /_abortBootRestore = function \(\) \{\s*\n\s*_bootDone = true;/.test(S));
ok('requesting a code takes over',
   /_loginTakesOver\(\);\s*\n\s*setLoginMessage\('Sending access code/.test(S));
ok('so does verifying one',
   /_loginTakesOver\(\);\s*\n\s*setLoginMessage\('Verifying code/.test(S));
ok('taking over both silences and stops',
   /function _loginTakesOver\(\) \{\s*\n\s*_loginBusy = true;[\s\S]{0,140}_abortBootRestore\(\)/.test(S));
// A load that never started a restore must not throw on the way past.
ok('and does nothing when there was no restore to stop',
   /if \(window\._abortBootRestore\) window\._abortBootRestore\(\)/.test(S));

console.log('--- and it stops counting at the student ---');
// "attempt 2" is an internal retry number. It was on screen, in a slot the student
// reads for news about what THEY just did.
const code = S.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
ok('no attempt number reaches the screen',
   !/attempt ' \+ _bootAttempt/.test(code));
ok('the retry says one steady thing instead',
   /: 'Reconnecting\\u2026', 'boot'\)/.test(code));
ok('and the first attempt does not shout at all',
   /_bootAttempt === 1\s*\n?\s*\? 'Restoring session/.test(code));

console.log('--- what the retry always got right, and still does ---');
// It never sent someone back to the form for a slow server, and it said so.
ok('four attempts before giving up',   /_bootAttempt < 4/.test(S));
ok('and it never blames the session',  /Your session is still/.test(S));

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
