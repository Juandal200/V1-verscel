/* A completed examination cannot be destroyed by the screen that shows it.
 *
 * A candidate finished the ICAO mock test. Something threw while the report was
 * being drawn, the global error boundary caught it and offered a reload, and the
 * reload signed her out. Signing back in, the sitting was gone — not a wrong band,
 * not a partial record: nothing at all, on a thirty-minute examination.
 *
 * Two independent faults, and both had to be true for the work to be lost:
 *
 *   _teaFinalize drew the report BEFORE saving it, so a throw in the render meant
 *   the save never ran.
 *
 *   Three handlers read `!res || res.code === 'SESSION_ERROR' || ...` under a
 *   comment saying "only clear the session if the server explicitly rejected the
 *   token" — and `!res` is precisely the case where the server said nothing. A
 *   timeout was being treated as a rejected login.
 *
 * Reported as F-0008 and F-0009. */
const fs = require('fs');
const S = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};

console.log('--- the result is kept before it is shown ---');
// Both markers, searched FORWARD from the first — 'var summary = ' occurs earlier
// in the file for something unrelated, so an absolute indexOf ran the slice
// backwards and matched nothing. A test that slices to an empty string fails
// loudly here, which is luck; the same mistake elsewhere would have passed.
const finStart = S.indexOf('if (jsonData && jsonData.student_view) {');
const fin = S.slice(finStart, S.indexOf('var summary = ', finStart));
ok('the save comes first',
   fin.indexOf('_teaSaveConversationResult(jsonData)') < fin.indexOf('_showReportScreen(jsonData)'));
ok('and the render cannot take it with it',
   /try \{\s*\n\s*_showReportScreen\(jsonData\);\s*\n\s*\} catch \(e\) \{/.test(fin));
ok('a failed render says the result is safe, rather than that something broke',
   /_teaShowReportFallback\(jsonData, e\)/.test(fin));
const fb = S.slice(S.indexOf('function _teaShowReportFallback'),
                   S.indexOf('function _teaSaveConversationResult'));
ok('the fallback names the band, which is in hand', /overall_band/.test(fb));
ok('and points at where the saved sitting will be', /_teaMyResults/.test(fb));

console.log('--- and written down before it is sent ---');
// A save is a network call and a network call can be lost. Thirty minutes of exam
// should not depend on one request surviving.
ok('it goes to localStorage first',
   /localStorage\.setItem\(TEA_PENDING_KEY/.test(S));
ok('cleared only when the server confirms',
   /withSuccessHandler\(function\(res\) \{\s*\n[\s\S]{0,120}removeItem\(TEA_PENDING_KEY\)/.test(S));
ok('and deliberately kept when it fails',
   /kept locally/.test(S) && !/withFailureHandler\(function\(e\) \{\s*\n\s*localStorage\.removeItem\(TEA_PENDING_KEY/.test(S));
ok('something resends it on the next load',
   /function _teaResendPendingResult\(\)/.test(S));
ok('wired into entering the app, where a token exists to send with',
   /showScreen\('appScreen'\);[\s\S]{0,400}_teaResendPendingResult\(\)/.test(S));
ok('a corrupt draft is discarded rather than retried forever',
   /if \(!payload \|\| !payload\.student_view\) \{[\s\S]{0,120}removeItem\(TEA_PENDING_KEY\)/.test(S));

console.log('--- silence from the server is not a rejected login ---');
ok('one definition answers it',  /function _serverRejectedToken\(res\)/.test(S));
ok('no answer is not an answer', /if \(!res\) return false;/.test(S));
ok('only an explicit code counts',
   /return res\.code === 'SESSION_ERROR' \|\| res\.code === 'AUTH_ERROR';/.test(S));
// Comments stripped: the note explaining this fault quotes the expression it
// replaced, which is the third time a check has caught its own documentation.
const code = S.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
ok('and the three copies are gone',
   !/!res \|\| res\.code === 'SESSION_ERROR'/.test(code));
// Three handlers had their own copy. One definition means they cannot drift apart.
ok('all three call it',
   (S.match(/isAuthError = _serverRejectedToken\(res\)/g) || []).length === 3);
ok('a transient failure keeps the session and says so',
   (S.match(/Could not reach server\. Check your connection and refresh\./g) || []).length >= 2);

console.log('--- one set of answer controls at a time (F-0006) ---');
/* The exam shell was built for the CONVERSATIONAL sitting and carries its own
 * input bar: a microphone and a textarea reading "Speak via mic or type and press
 * Enter...". The scripted exam draws its OWN controls above it — a textarea,
 * Submit answer, Replay recording, Repeat question, Next — and nothing hid the bar
 * underneath.
 *
 * So a candidate sat looking at two microphones, two text boxes and two ways to
 * submit, one of which did nothing. Reported as buttons overlapping; it was two
 * different exams' interfaces on one page. */
ok('a scripted sitting says so',      /function _teaScriptedMode\(on\)/.test(S));
ok('and hides the conversational bar',
   /bar\.style\.display = on \? 'none' : ''/.test(S));
ok('every scripted screen declares it',
   /function _scStage\(html\) \{[\s\S]{0,200}_teaScriptedMode\(true\);/.test(S));
// The fallback to live grading is the one case that genuinely needs the bar back.
ok('unlocking clears the flag as well as showing the bar',
   /function _unlockExamUI\(\)[\s\S]{0,400}_t\._scripted = false;/.test(S));

console.log('--- and the action row is a row ---');
const ask = S.slice(S.indexOf('var canAsk = step.text'), S.indexOf('var canAsk = step.text') + 1600);
ok('the buttons no longer space themselves',
   !/id="scReplay" style="margin-right/.test(ask) && !/id="scRepeat" style="margin-right/.test(ask));
ok('a container owns the spacing',  /<div class="btn-row"/.test(ask));
const C2 = fs.readFileSync(__dirname + '/../Styles.html', 'utf8');
ok('and it wraps rather than running off the side',
   /\.btn-row \{[\s\S]{0,140}flex-wrap: wrap;/.test(C2));

console.log('--- the boot path already knew this, and still does ---');
// Four attempts with backoff, and it says out loud that the session is still good.
ok('boot retries rather than giving up',   /_bootAttempt < 4/.test(S));
ok('and never blames the session for it',  /Your session is still/.test(S));

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
