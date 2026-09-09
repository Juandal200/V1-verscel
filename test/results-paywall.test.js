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
// Bounded by the next function, not a character count. A fixed-length slice has
// silently truncated three of these tests today and reported the code as broken when
// only the window was.
const api = T.slice(T.indexOf('function apiGetMyIcaoResults'),
                    T.indexOf('function apiSaveIcaoTranscript'));
ok('the endpoint asks whether this plan may read',  /getUserAccessStatus_\(user\)\.status/.test(api));
// CHANGED 6 Sep 2026 — the band is given, the reasons are sold.
//
// The band used to be withheld too, so half an hour of speaking bought a padlock
// and a free account's only attempt was spent discovering that. There was nothing
// in the result to be curious about and therefore nothing to buy. The overall band
// is the one number that means something on its own — it is what goes on a licence
// — so it is given. What is still withheld, and still withheld HERE rather than in
// CSS, is every REASON: the six descriptor scores and the examiner's words.
// Zeros rather than nulls for the descriptors: a null crashed every client that had
// not yet received the guard for it, and Apps Script deploys hours before the
// browser does.
ok('a locked row carries the real band',
   /locked:  true,[\s\S]{0,120}version:/.test(api) &&
   /band:    Number\(r\[idx\['Overall Band'\]\]\) \|\| 0,\n\s*locked:  true/.test(api));
ok('and every descriptor is still zeroed',          /pronunciation: 0, structure: 0, vocabulary: 0/.test(api));
ok('no descriptor score leaves the server for a free account',
   !/pronunciation: Number[\s\S]{0,400}locked:\s*true/.test(api));
ok('nothing null is sent to an older client',       !/band:\s*null/.test(api) && !/scores:\s*null/.test(api));
ok('it still says the sitting happened',            /date:\s*String\(r\[idx\['Date'\]\]/.test(api));
ok('the locked branch returns before the full one',
   api.indexOf('locked:  true') < api.lastIndexOf("scores: {"));

console.log('--- the history shows the band and gates the bars ---');
// CHANGED 6 Sep 2026. The chip used to draw a padlock because there was no number
// to put in it — the band was withheld too. There is one now, so a free row reads
// like a paid one down to the label, and only the six bars are behind the gate.
ok('the chip just draws the band',        /function bandChip\(b\) \{/.test(S));
ok('and no longer takes a locked flag',   !/function bandChip\(b, locked\)/.test(S));
ok('nor is one passed to it',             !/bandChip\(r\.band, r\.locked\)/.test(S));
ok('no row says "Result locked" any more', !/'Result locked'/.test(S));
const card = S.slice(S.indexOf('function _lockedSittingCard'),
                     S.indexOf('function bars(scores)'));
ok('a free sitting shows its real band',  /_bandChipNumber\(band\)/.test(card));
ok('with the band it actually scored',    /var band = Number\(r\.band\) \|\| 0;/.test(card));
ok('and no invented Band 4 behind a blur', !/_bandChipNumber\(4\)/.test(card));
ok('the six bars are what is gated',      /filter:blur\(6px\)[\s\S]{0,200}bars\(\{/.test(card));
ok('and the offer names what is behind them',
   /See what made this band/.test(card));
ok('the descriptor rails render empty',   /function _lockedBars/.test(S));
ok('missing scores fall back to empty rails', /function bars\(scores\) \{[\s\S]{0,60}if \(!scores\) return _lockedBars\(\)/.test(S));

console.log('--- and it is said before, not after ---');
// A free candidate sat twenty-five to thirty minutes, speaking the whole way, and
// was handed a padlock — having spent the only attempt a free account gets to find
// that out. Nothing on the briefing screen warned them.
const begin = S.slice(S.indexOf('This is a full ICAO aviation English proficiency exam'),
                      S.indexOf('id="teaBeginBtn"'));
ok('the briefing tells a free candidate what they will get',
   /_teaResultsLocked\(\)/.test(begin) && /On the free plan/.test(begin));
ok('it names the band as the thing they keep',   /overall ICAO band/.test(begin));
ok('and the six descriptors as the thing they buy',
   /six descriptor scores/.test(begin));
ok('it says how long the exam takes',            /30 minutes/.test(begin));
ok('and that the free plan allows one sitting',  /one sitting/.test(begin));
ok('a paying candidate is not shown any of it',
   begin.indexOf('_teaResultsLocked()') < begin.indexOf('On the free plan'));

console.log('--- the blur is presentation; the gate is on the server ---');
/* THIS BLOCK USED TO RUN _teaRedactScores, WHICH NO LONGER EXISTS.
 *
 * It built a zeroed copy of the six descriptors for display — which meant the
 * real numbers had already been serialised to the browser and were sitting in
 * the response. The paywall was a drawing of a gate. D-1 deleted it and moved
 * the withholding into api/tea-pipeline.mjs and api/tea.mjs, before the response
 * is written (CLAUDE.md rule 5: never fix by hiding).
 *
 * So the assertions moved with the behaviour. What is checked HERE is that the
 * client no longer redacts and no dead path remains to reintroduce; that the
 * server actually withholds is asserted where it happens, by execution, in
 * test/report-access.test.js — not duplicated here. */
const Sc = S.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
ok('the client no longer carries a redactor',
   !/function _teaRedactScores/.test(Sc));
ok('nor calls one',                 !/_teaRedactScores\(/.test(Sc));
ok('the locked view renders what the server sent, unmodified',
   /filter:blur\(7px\)[\s\S]{0,320}_renderScoreJSON\(json, \{ bandHeader: false \}\)/.test(Sc));
ok('the unlocked report is untouched',
   /: '<div class="tea-score-box">' \+ _renderScoreJSON\(json\)/.test(Sc));
// The blur is decoration over an already-empty payload. If it ever became the
// only thing standing between a free candidate and the numbers, that is the bug
// D-1 fixed, arriving again.
ok('and the blur is not load-bearing — it is aria-hidden presentation',
   /filter:blur\(7px\)[\s\S]{0,120}aria-hidden="true"/.test(Sc));

console.log('--- the server is where the numbers stop ---');
const TEA  = fs.readFileSync(__dirname + '/../api/tea.mjs', 'utf8');
const PIPE = fs.readFileSync(__dirname + '/../api/tea-pipeline.mjs', 'utf8');
ok('the pipeline withholds before the response is written',
   /withholdDescriptors\(student_view\)/.test(PIPE));
ok('and marks the response so the client knows',
   /descriptorsWithheld: true/.test(PIPE));
ok('the conversational path withholds in the message',
   /function withholdInMessage/.test(TEA));
ok('both keep the band, which is the hook',
   /overall_band/.test(TEA) && !/overall_band: 0/.test(TEA));

console.log('--- and the result is still never spoken ---');
ok('no band in any spoken line', !/overall ICAO band is/.test(S));

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
