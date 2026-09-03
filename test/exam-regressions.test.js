/* Six faults introduced while fixing the sitting, and the guarantees that replace
 * them. Every one of these passed a green suite before it was found, because the
 * suite tested what I meant rather than what the code did. */
const fs = require('fs');
const S  = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
const I  = fs.readFileSync(__dirname + '/../IcaoTestItemService.js', 'utf8');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};
const slice = (a,b) => S.slice(S.indexOf(a), S.indexOf(b));

console.log('--- 1. nobody is locked out of a working exam ---');
// NOT 'window._teaRetryVersions' as the end bound: that string appears first inside
// an onclick attribute, well before the function it names, and silently cut the
// slice in half.
const picker = slice('function _teaRenderVersionPicker', 'function _teaPickerNote');
ok('a lone ready paper is taken, not demanded', /ready\.length === 1[\s\S]{0,80}_teaSelectVersion\(ready\[0\]\.bank\)/.test(picker));
ok('only a truly empty list is a failure',      /!res\.versions\.length\)/.test(picker));
ok('a failed list offers a retry',              /_teaRetryVersions\(\)/.test(picker));
ok('the retry actually re-runs the lookup',     /_teaRetryVersions = function[\s\S]{0,200}_teaRenderVersionPicker\(\)/.test(S));
ok('no route still promises a random draw',     !/drawn at random\.'\)/.test(S) || !/Beginning now draws one at random/.test(S));

console.log('--- 2. a replay is not recorded as the answer ---');
const hold = slice('function _scHoldForPlayback', 'function _scAsk');
ok('the microphone track is disabled',          /t\.enabled = !on/.test(hold));
ok('the answer clock is held',                  /_sc\.deadline \+= \(Date\.now\(\) - _sc\.holdAt\)/.test(hold));
const ask = slice("var rpt = _scEl('scRepeat')", 'function _scNextStep');
ok('repeat holds before speaking',              /_scHoldForPlayback\(true\);[\s\S]{0,80}_scSpeak\(step/.test(ask));
ok('repeat releases after speaking',            /_scSpeak\(step, function \(\) \{[\s\S]{0,60}_scHoldForPlayback\(false\)/.test(ask));
ok('replay holds too',                          /_scHoldForPlayback\(true\);[\s\S]{0,120}_scSpeak\(_sc\.lastRecording/.test(ask));
ok('replay releases too',                       /_scSpeak\(_sc\.lastRecording[\s\S]{0,80}_scHoldForPlayback\(false\)/.test(ask));

console.log('--- 3. the exam is sat at one speed for everyone ---');
ok('the ramp can be switched off per call',     /_playAtcAudio\(res, atcText, country, andThen, opts\)/.test(S));
ok('and is, on the exam path',                  /_playAtcAudio\(res, sc\.atcText, country, _onDone, \{ levelRamp: false \}\)/.test(S));
ok('the simulator keeps its ramp',              /_atcPlaybackRate\(0\) \*[\s\S]{0,120}_atcLevelFactor\(res\.speakingRate\)/.test(S));

console.log('--- 4. a refused microphone is announced, not discovered ---');
ok('the flag is finally read',                  /function _teaShowMicNotice/.test(S));
ok('announced the moment it is refused',        /_sc\.micDenied = true; _teaShowMicNotice\(\)/.test(S));
ok('and again as the sitting opens',            /_teaShowVersionBadge\(_sc\.bank, bank\);[\s\S]{0,40}_teaShowMicNotice\(\)/.test(S));
ok('it says the sitting will be typed',         /will be typed/.test(S));

console.log('--- 5. one picture to describe, two to compare ---');
ok('the client keys off an explicit flag',      /step\.compare && \(_sc\.p3Images \|\| \[\]\)\.length > 1/.test(S));
ok('not off a section number',                  !/String\(step\.section \|\| ''\) === '3' && \(_sc\.p3Images/.test(S));
ok('the server states which steps compare',     /compare: opts\.compare === true/.test(I));
ok('"similar" is one of them',                  /line_p3_similar[\s\S]{0,140}compare: true/.test(I));
ok('"different" is the other',                  /line_p3_different[\s\S]{0,140}compare: true/.test(I));
ok('a describe step carries no compare flag',   !/line_p3_describe[\s\S]{0,120}compare: true/.test(I));

console.log('--- 6. the microphone is asked for once ---');
ok('the promise is kept, not just the stream',  /_sc\.micPromise = navigator\.mediaDevices\.getUserMedia/.test(S));
ok('a waiting step joins it',                   /if \(_sc\.micPromise\) return _sc\.micPromise;/.test(S));

console.log('--- the contract still holds ---');
const sent = new Set([...I.slice(I.indexOf('function stepOf'), I.indexOf('function say')).matchAll(/^\s{8}([A-Za-z_$][\w$]*)\s*:/gm)].map(m=>m[1]));
ok('the client reads step.compare and the server sends it', sent.has('compare'));
ok('the server still sends voice and lang',     sent.has('voice') && sent.has('lang'));

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
