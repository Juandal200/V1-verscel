/* Refreshing looked like being signed out.
 *
 * The session was never lost. loginScreen carried `active` in the markup, so
 * every load PAINTED a sign-in form, and the app only replaced it once two
 * megabytes of script had parsed, DOMContentLoaded had fired and the cached home
 * data had been read. On a phone that is invisible — an installed app is resumed,
 * not reloaded. On a desktop it is a sign-in form on every refresh, which is
 * indistinguishable from having been signed out, so students signed in again
 * because the screen asked them to.
 *
 * Underneath it, the cache that makes the restore instant was never written at
 * sign-in: it sat behind `if (res.mergedXp !== undefined)` and
 * verifyOtpAndCreateSession returns { ok, sessionToken, user, home } — no
 * mergedXp, ever. So the branch had never run, and every refresh took the slow
 * path with the form still on screen. */
const fs = require('fs');
const S = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
const C = fs.readFileSync(__dirname + '/../Styles.html', 'utf8');
const I = fs.readFileSync(__dirname + '/../Index.html', 'utf8');
const A = fs.readFileSync(__dirname + '/../Authservice.js', 'utf8');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
const Sc = strip(S), Cc = strip(C);
const Ic = I.replace(/<!--[\s\S]*?-->/g, '');

console.log('--- the decision is made before the first paint ---');
ok('an inline script runs in the body',   /localStorage\.getItem\('icao_session_token'\)/.test(Ic));
ok('it checks both stores',               /sessionStorage\.getItem\('icao_session_token'\)/.test(Ic));
ok('and marks the document',              /setAttribute\('data-booting-session', '1'\)/.test(Ic));
// It must run before the markup it affects, or the form paints first anyway.
ok('before the login section it hides',
   Ic.indexOf('data-booting-session') < Ic.indexOf('id="loginScreen"'));
// Storage throws outright in some privacy modes; a boot hint must never be fatal.
ok('and cannot throw the page down',      /try \{[\s\S]{0,260}\} catch \(e\) \{\}/.test(Ic));

console.log('--- and the stylesheet acts on it ---');
ok('the form is hidden',  /html\[data-booting-session\] #loginScreen \{ display: none !important; \}/.test(Cc));
ok('the shell is shown',  /html\[data-booting-session\] #appScreen\s+\{ display: flex !important;/.test(Cc));
// .screen.active supplies flex-direction only via #appScreen.active, which is not
// set yet at this point.
ok('and stacks the way the app screen must',
   /html\[data-booting-session\] #appScreen[^}]*flex-direction: column/.test(Cc));

console.log('--- the hint yields to the first real decision ---');
ok('showScreen clears it',
   /function showScreen\(screenId\) \{[\s\S]{0,140}removeAttribute\('data-booting-session'\)/.test(Sc));
// Whichever way it goes: into the app, or back to the form when the server says
// the session is genuinely finished.
ok('so entering the app clears it',       /function enterApplication\(\)[\s\S]{0,80}showScreen\('appScreen'\)/.test(Sc));
ok('and so does being sent back to login',
   /showScreen\('loginScreen'\)/.test(Sc));

console.log('--- and the shell is never empty, or a dead end ---');
/* Showing the app shell instead of a sign-in form was right. The shell being
 * EMPTY was not: a slow restore put a student in front of a topbar and nothing
 * else, which is worse than the form it replaced. Worse still, every path that
 * gives up wrote its explanation into a login form that data-booting-session was
 * hiding — so a rejected session, or four failed attempts, left an empty shell
 * with the reason invisible behind it and no way forward. */
ok('the content area ships with something in it',
   /id="contentArea"[\s\S]{0,400}class="boot-placeholder"/.test(Ic));
ok('it says what is happening',   /Restoring your session/.test(Ic));
// No attribute controls it: it lives inside contentArea, so it is invisible while
// the app screen is hidden, and the first render to set innerHTML removes it.
ok('and nothing has to remember to clear it',
   !/data-booting-session[^\n]{0,60}boot-placeholder/.test(Cc));
ok('it is styled to fill the shell', /\.boot-placeholder \{[\s\S]{0,220}min-height: 50vh/.test(Cc));

console.log('--- every dead end can still reach the form ---');
ok('a rejected session reveals it',
   /if \(!appScreen \|\| !appScreen\.classList\.contains\('active'\)\) \{[\s\S]{0,700}showScreen\('loginScreen'\);\s*\n\s*setLoginMessage\(message\);/.test(Sc));
ok('and so does giving up after four attempts',
   (Sc.match(/showScreen\('loginScreen'\);\s*\n\s*setLoginMessage\('The server is not responding/g) || []).length === 2);
// showScreen is what strips the override, so revealing the form and clearing the
// hint are the same act — they cannot drift apart.
ok('revealing the form is what clears the hint',
   /function showScreen\(screenId\) \{[\s\S]{0,140}removeAttribute\('data-booting-session'\)/.test(Sc));

console.log('--- the cache is written when the session is created ---');
ok('the login response really has no mergedXp',
   !/mergedXp/.test(A.slice(A.indexOf('verifyOtpAndCreateSession'),
                            A.indexOf('verifyOtpAndCreateSession') + 4000)));
const login = Sc.slice(Sc.indexOf('AppState.sessionToken  = res.sessionToken;'),
                       Sc.indexOf('AppState.sessionToken  = res.sessionToken;') + 1400);
ok('the token is stored in both places',
   /localStorage\.setItem\('icao_session_token'/.test(login) &&
   /sessionStorage\.setItem\('icao_session_token'/.test(login));
ok('and the cache no longer sits behind a field that never arrives',
   /\}\s*\n\s*_aeroSaveCache\(\);\s*\n\s*\n\s*enterApplication\(\);/.test(login));
ok('it still runs before the app is entered',
   login.indexOf('_aeroSaveCache();') < login.indexOf('enterApplication();'));

console.log('--- and what made the restore worth caching is unchanged ---');
ok('the cache still refuses another account\'s data',
   /if \(c\.token !== AppState\.sessionToken\) return null;/.test(Sc));
/* The cache no longer expires WITH the session, and that is the point.
 *
 * Matching the two at thirty days sounded tidy and meant "never expires" in
 * practice: a student who opens the app daily is never near it, and one who does
 * not was shown month-old XP, streak and plan status as if it were current. The
 * session is still thirty days — staying signed in is a different question from
 * how long stale numbers may be presented as live. */
ok('the home cache expires in a week',
   /_HOME_CACHE_TTL = 7 \* 24 \* 60 \* 60 \* 1000/.test(Sc));
ok('which is shorter than the session, deliberately',
   !/_HOME_CACHE_TTL = 30 \* 24 \* 60 \* 60 \* 1000/.test(Sc));
ok('and the server session is still thirty days',
   /SESSION_TTL_SECONDS: 2592000/.test(fs.readFileSync(__dirname + '/../ConfigService.js', 'utf8')));

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
