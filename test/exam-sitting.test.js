/* The five changes to how a sitting behaves, checked against the real source. */
const fs = require('fs');
const S  = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};
const between = (a,b) => S.slice(S.indexOf(a), S.indexOf(b));

console.log('--- 1. the paper is chosen, never assigned ---');
const picker = between('function _teaRenderVersionPicker', 'function _teaPickerNote');
ok('no "Any / Random" tile is offered',        !/opt\(''/.test(picker));
ok('Begin starts disabled',                    /id="teaBeginBtn" disabled/.test(S));
ok('Begin refuses to fire without a choice',   /_teaPickedVersion && window\._teaBeginScripted/.test(S));
ok('the choice is re-asserted on every render',/_teaSyncBeginBtn\(\)/.test(S));
ok('a fresh Begin screen forgets the last one',/window\._teaPickedVersion = '';[\s\S]{0,40}_teaSyncBeginBtn/.test(S));

console.log('--- 2+3. two allowances, counted differently ---');
const ui = between('function _scImagesFor', 'function _scNextStep');
ok('the recording can be replayed',            /id="scReplay"/.test(ui));
ok('the question can be repeated',             /id="scRepeat"/.test(ui));
ok('replay is offered on Part 2 questions',    /indexOf\('2'\) === 0/.test(ui));
ok('repeat is offered wherever there are words',/canAsk = step\.text/.test(ui));
const rpt = S.slice(S.indexOf("var rpt = _scEl('scRepeat')"), S.indexOf("var rep = _scEl('scReplay')"));
ok('repeating a question is never reported',   rpt.length > 0 && !/_t\.listens/.test(rpt));
ok('replaying the recording still is',         /_t\.listens\[rid\]/.test(ui));
ok('the old dead flag is gone',                !/step\.replayable\s*\?/.test(S));

console.log('--- 4. the microphone is taken once, in the gesture ---');
const begin = between('window._teaBeginScripted = function', 'var _startLoader');
ok('asked for inside the Begin click',         /_scPrimeMic\(\)/.test(begin));
ok('beside the audio unlock',                  begin.indexOf('_unlockAudio') < begin.indexOf('_scPrimeMic'));
ok('a step reuses the held stream',            /_scMicStream\(\)/.test(S));
ok('a step no longer stops the tracks',        !/stream\.getTracks\(\)\.forEach\(function \(t\) \{ t\.stop\(\); \}\);/.test(S));
ok('handed back when the paper ends',          /_scFinish[\s\S]{0,160}_scReleaseMic/.test(S));
ok('handed back if the candidate walks away',  /_teaStopAll = function[\s\S]{0,400}_scReleaseMic/.test(S));

console.log('--- 6. the picture is there before it is discussed ---');
ok('the prompt waits on the image',            /_scWhenImageReady\(step\.imageUrl, function \(\) \{[\s\S]{0,40}_scSpeak/.test(S));
ok('the next image is fetched in advance',     /_peek && _peek\.imageUrl\) _scPreloadImage/.test(S));
ok('a broken image cannot freeze the exam',    /setTimeout\(fire, 3000\)/.test(S));
ok('an already-loaded image does not wait',    /im\.complete && im\.naturalWidth > 0/.test(S));

console.log('--- 7. Part 3 keeps both photographs ---');
ok('images shown in Part 3 are remembered',    /_sc\.p3Images\.push\(step\.imageUrl\)/.test(S));
ok('a comparison question draws them all',     /_sc\.p3Images\.slice\(\)/.test(S));
ok('two are laid out side by side',            /grid-template-columns:1fr 1fr/.test(S));
ok('and captioned so they can be referred to', /Image ' \+ \(i \+ 1\)/.test(S));
ok('a new sitting starts with none',           /_sc\.p3Images = \[\];/.test(S));

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
