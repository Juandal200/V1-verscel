/* A price on information has to be enforced where the information is.
 *
 * The gate was a CSS blur on one screen. The bands were sent to the browser anyway,
 * and the results history drew them in plain text with no blur at all — so the gate
 * held only for someone who did not look. Three leaks were found one at a time: the
 * spoken announcement, the results history, and the blur itself, which was a picture
 * of a gate over real numbers sitting in the DOM. */
const fs = require('fs');
const S  = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
const T  = fs.readFileSync(__dirname + '/../TEAService.js', 'utf8');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};

console.log('--- the numbers never leave the server ---');
const api = T.slice(T.indexOf('function apiGetMyIcaoResults'), T.indexOf('function apiGetMyIcaoResults') + 2600);
ok('the endpoint asks whether this plan may read',  /getUserAccessStatus_\(user\)\.status/.test(api));
ok('a locked row carries a null band',              /band:\s*null/.test(api));
ok('and no descriptor scores at all',               /scores:\s*null/.test(api));
ok('it still says the sitting happened',            /date:\s*String\(r\[idx\['Date'\]\]/.test(api));
ok('the locked branch returns before the real one',
   api.indexOf('band:   null') < api.indexOf("band:    Number(r[idx['Overall Band']])"));

console.log('--- the history draws a lock, not a zero ---');
ok('the chip takes the locked flag',      /function bandChip\(b, locked\)/.test(S));
ok('both rows pass it',                   (S.match(/bandChip\(r\.band, r\.locked\)/g)||[]).length === 2);
ok('a locked row says so in words',       /r\.locked \? 'Result locked'/.test(S));
ok('the descriptor rails render empty',   /function _lockedBars/.test(S));
ok('missing scores fall back to empty rails', /function bars\(scores\) \{[\s\S]{0,60}if \(!scores\) return _lockedBars\(\)/.test(S));

console.log('--- the blurred report has nothing behind it ---');
ok('the blur renders a redacted copy',    /filter:blur\(7px\)[\s\S]{0,700}_renderScoreJSON\(_teaRedactScores\(json\)\)/.test(S));
ok('the unlocked report is untouched',    /: '<div class="tea-score-box">' \+ _renderScoreJSON\(json\)/.test(S));

// Run the real redactor and prove nothing survives it.
const src = S.slice(S.indexOf('  function _teaRedactScores(json)'), S.indexOf('  function _renderScoreJSON(json)'));
const redact = new Function(src + 'return _teaRedactScores;')();
const real = { student_view: {
  overall_band: 5, pronunciation: 5, structure: 4,
  vocabulary: { score: 6, feedback: 'wide range' },
  fluency: 5, comprehension: 4, interactions: 5, summary: 'A strong candidate.'
}, admin_view: { transcript: 'Ex: ... Ca: I fly the A320 ...' } };
const out = redact(real);
ok('the overall band is gone',   out.student_view.overall_band === 0);
ok('every descriptor is zeroed',
   ['pronunciation','structure','fluency','comprehension','interactions']
     .every(k => out.student_view[k] === 0));
ok('object-shaped scores keep their shape but lose the number',
   out.student_view.vocabulary.score === 0 && out.student_view.vocabulary.feedback === '');
ok('the written summary is gone',       out.student_view.summary === '');
ok('the transcript never reaches it',   !JSON.stringify(out).includes('A320'));
ok('nothing from the real report survives',
   !/\b[4-6]\b/.test(JSON.stringify(out).replace(/"overall_band":0/, '')));

console.log('--- and the result is still never spoken ---');
ok('no band in any spoken line', !/overall ICAO band is/.test(S));

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
