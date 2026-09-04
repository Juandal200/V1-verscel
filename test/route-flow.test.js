/* Two costs a student paid on every phase of every route.
 *
 * The summary: apiSubmitAttempt rebuilt the whole progress row on each answer — a
 * full read of the Attempts sheet plus two script locks — and the client disables
 * "Next exercise" until it answers, so an eight-phase route spent eight of those
 * waits in front of a disabled "Saving…" button, growing slower as the sheet filled.
 *
 * The microphone: the stream was torn down after every answer, so each phase asked
 * for it again. Desktop and Android remember the grant; an installed iOS web app does
 * not, and the student was asked at taxi, at take-off, and at every phase after. */
const fs = require('fs');
const S = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
const A = fs.readFileSync(__dirname + '/../Attemptservice.js', 'utf8');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};

console.log('--- an answer writes the attempt and nothing more ---');
const submit = A.slice(A.indexOf('dbAppend_(\'Attempts\', attempt)'), A.indexOf('var progress = ProgressService.updateUserProgress'));
ok('the attempt is still written immediately', /dbAppend_\('Attempts', attempt\)/.test(submit));
ok('the summary is skipped when deferred',     /payload\.deferProgress === true/.test(submit));
ok('and it returns before the expensive part', /deferred: true/.test(submit));
ok('the client asks for that',                 /deferProgress:\s*true/.test(S));

console.log('--- the summary is rebuilt once, at the end ---');
ok('there is an endpoint for it',        /function apiFinalizeRoute/.test(A));
const fin = A.slice(A.indexOf('function apiFinalizeRoute'));
ok('it reads the scenarios once for the route', /readSheetObjectsV5Hard_\('Scenarios'\)/.test(fin));
ok('it updates progress per scenario',   /ProgressService\.updateUserProgress\(user, sc\)/.test(fin));
ok('it settles XP for the whole route',  /lmsAddXp_\(user\.userId, 25 \* correct\)/.test(fin));
ok('a missing scenario does not stop it',/missing\.push\(id\)/.test(fin));
ok('the client calls it before the debrief',
   S.indexOf('apiFinalizeRoute') > 0 &&
   S.indexOf('apiFinalizeRoute') < S.indexOf('apiGetTrainingDebrief'));
ok('and the debrief opens even if it fails',
   /apiFinalizeRoute[\s\S]{0,400}withFailureHandler\(function \(\) \{\}\)/.test(S) ||
   /withFailureHandler\(function \(\) \{\}\)[\s\S]{0,400}apiFinalizeRoute/.test(S));

console.log('--- the microphone is asked for once per route ---');
ok('a held stream is reused',          /function _gMicReuse/.test(S));
ok('the request goes through it',      /_gMicReuse\(\)\s*\n\s*\.then\(function\(stream\)/.test(S));
ok('the promise is kept, not just the stream', /if \(_gMicPromise\) return _gMicPromise;/.test(S));
ok('an answer no longer stops the tracks',
   !/_gMicActive = false;\s*\n\s*stream\.getTracks\(\)\.forEach\(function\(t\) \{ t\.stop\(\); \}\);/.test(S));
// Scoped to the function rather than to a character count. The guarantee is that
// leaving releases the microphone, not that the call sits within 300 characters of
// the opening brace — a comment added above it should not read as a regression.
const teardown = S.slice(S.indexOf('function simMediaStopAll'),
                         S.indexOf('function simMediaStopAll') + 2500);
ok('leaving the simulator releases it', /_gMicRelease/.test(teardown));
ok('and clears the keyboard offset it set',
   /setProperty\('--kb', '0px'\)/.test(teardown));
ok('releasing clears both the stream and the promise',
   /_gMicStream = null; _gMicPromise = null;/.test(S));

/* Drive the real reuse helper. */
const src = S.slice(S.indexOf('  function _gMicReuse()'), S.indexOf('  // Leaving the route hands the microphone back'));
let calls = 0;
const nav = { mediaDevices: { getUserMedia: () => { calls++; return Promise.resolve({ active: true, getTracks: () => [] }); } } };
const mk = new Function('navigator', 'var _gMicStream=null,_gMicPromise=null;' + src + 'return _gMicReuse;')(nav);
console.log('--- and asking twice makes one request ---');
Promise.all([mk(), mk(), mk()]).then(() => {
  ok('three taps, one permission request', calls === 1);
  return mk();
}).then(() => {
  ok('a later phase reuses it without asking', calls === 1);
  console.log(fails?('\n'+fails+' FAILING'):'\nall green');
  process.exit(fails?1:0);
});
