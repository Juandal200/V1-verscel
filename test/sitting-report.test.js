/* Six things found by sitting the product rather than reading it.
 *
 * The mock test offers Repeat question and Replay recording, and using either one
 * left the candidate unable to answer. The simulator's XP arrived seconds after the
 * answer that earned it. The cockpit's Menu button opened and would not close. The
 * unfinished LMS modules were on a student's screen. The level map had no gap
 * before its checkpoint. And the country flags were visible on a Mac and absent on
 * Windows.
 *
 * Only one of them is a bug in the sense of something throwing. The rest are the
 * product telling a student something untrue about itself. */
const fs = require('fs');
const S = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
const C = fs.readFileSync(__dirname + '/../Styles.html', 'utf8');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};
// Comments describe the fix; they must never be what satisfies the check.
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');

console.log('--- a replay gives the turn back ---');
/* _scHoldForPlayback mutes the microphone while the examiner speaks and un-mutes
 * it correctly afterwards. What it never restored was the STATUS. _scSpeak sets
 * "Examiner speaking…", nothing set it back, and _setStatus makes the ring and the
 * mic yellow only for 'listening'. So after either replay the screen said it was
 * not your turn, and the candidate believed the two controls meant to help had
 * silenced them. They had not: the recorder never stopped. */
const hold = S.slice(S.indexOf('function _scHoldForPlayback'), S.indexOf('function _scAsk'));
ok('the hold still mutes the track',    /t\.enabled = !on/.test(hold));
ok('and still credits the time back',   /_sc\.deadline \+= \(Date\.now\(\) - _sc\.holdAt\)/.test(hold));
ok('and now returns the turn on release',
   /if \(!on\) _setStatus\('Your turn — speak now', 'listening'\)/.test(hold));
// 'listening' is the only state that turns the mic yellow, which is the signal the
// candidate was reading.
ok('listening is what makes it yellow',
   /var turn\s+= state === 'listening'/.test(S));

console.log('--- the XP arrives with the answer ---');
const submit = S.slice(S.indexOf('function submitScenarioAnswer'),
                       S.indexOf('function submitScenarioAnswer') + 7000);
ok('the chip flies on the client verdict',
   /if \(clientEval\.correct\) _showXpFloat\(25\);/.test(submit));
ok('nothing holds it for the round trip',
   !/res\.attempt\.correct\) \{\s*\n\s*_showXpFloat\(25\)/.test(submit));
ok('the server total still wins',       /lmsXpTotal/.test(submit));
ok('and a disagreement is recorded',    /XP shown on a client pass the server failed/.test(submit));

console.log('--- the menu closes again ---');
ok('there is a toggle',            /function toggleSimulatorFocusMode\(\)/.test(S));
ok('it only touches the class',
   /function toggleSimulatorFocusMode\(\)[\s\S]{0,200}classList\.toggle\('sim-focus-mode'\)/.test(S));
// The exit stops the engine, the ambience and the altitude alert. A toggle must
// not — its comment records that as the fourth time that bug was found.
const toggle = S.slice(S.indexOf('function toggleSimulatorFocusMode'),
                       S.indexOf('window.toggleSimulatorFocusMode'));
ok('and never tears the simulator down', !/simMediaStopAll/.test(toggle));
ok('the button calls the toggle, not the exit',
   /id="simFocusToggle"[\s\S]{0,120}onclick="toggleSimulatorFocusMode\(\)"/.test(S));
ok('its label says which way it goes',  /' Menu' : ' Hide menu'/.test(S));
ok('every real exit still stops the media',
   /function disableSimulatorFocusMode\(\)[\s\S]{0,300}simMediaStopAll/.test(S));

console.log('--- the modules are not on a student\'s screen ---');
ok('one place decides the role',   /function _currentRole\(\)/.test(S));
ok('and it honours viewAs',        /AppState\.viewAs \|\|/.test(S.slice(S.indexOf('function _currentRole'), S.indexOf('function _lmsVisible'))));
ok('the tab is gated',             /if \(_lmsVisible\(\)\) \{\s*\n\s*tabs\.push/.test(S));
ok('a lone tab draws nothing',     /if \(tabs\.length < 2\) return '';/.test(S));
// Four "← Modules" buttons and the nav also reach the hub. Hiding one tab is not
// hiding a feature.
ok('and the screen itself is gated too',
   /function renderLMSHub\(\) \{[\s\S]{0,300}if \(!_lmsVisible\(\)\) \{ renderSimulatorPlaceholder\(\); return; \}/.test(S));

console.log('--- the checkpoint has room around it ---');
ok('it sits inside the grid',
   /level-map-grid-pro">' \+ tierCards \+\s*\n\s*_buildExamCard\(tier\.examNum\) \+ '<\/div>'/.test(S));
ok('so the grid\'s own gap applies',  /\.level-map-grid-pro \{[\s\S]{0,140}gap: 18px/.test(C));
ok('and it spans the row',            /\.exam-card \{[\s\S]{0,200}grid-column: 1 \/ -1;/.test(C));
ok('in the palette, not an orange literal',
   !/rgba\(255,180,0/.test(C) && /rgba\(var\(--yellow-rgb\), 0\.35\)/.test(C));

console.log('--- a flag is a flag on every platform ---');
/* This started as a Windows bug: a regional-indicator pair has no glyph there, so
 * macOS drew a flag and Windows drew two letters. Both fallbacks were emoji, which
 * is a fallback that fails on the same platform as the thing it replaces, so those
 * were changed to a two-letter box.
 *
 * That fix made a second, older failure legible. The flags were <img> tags served
 * from flagcdn.com and the images were not arriving — and the emoji fallback had
 * been hiding it, because on a Mac it renders as a flag that looks exactly like
 * the image that failed. One failure, two fallbacks, two bug reports, months
 * apart.
 *
 * There is no request now. Fourteen flags live in the file. */
ok('nothing prints a country emoji directly',
   !/safeText\(getCountryUi\(country\)\.emoji/.test(S));
ok('and nothing fetches a flag from anywhere',
   !/flagcdn/.test(strip(S)));
ok('the fourteen countries in the table all have one',
   ['us','gb','in','au','ca','co','br','mx','es','fr','de','ie','nz','za']
     .every(c => new RegExp('\\n    ' + c + ": '<svg").test(S)));
// Every code COUNTRY_UI can hand out must be drawable, or the country silently
// falls through to the two-letter box.
const codes = [...S.slice(S.indexOf('var COUNTRY_UI = {'), S.indexOf('var AppState = {'))
                  .matchAll(/code: '([a-z]{2})'/g)].map(m => m[1]);
ok('and no country in the table is left without one',
   codes.length > 0 && [...new Set(codes)].every(c => new RegExp('\\n    ' + c + ": '<svg").test(S)));
ok('the box crops the way object-fit used to',
   /preserveAspectRatio="xMidYMid slice"/.test(S) &&
   /\.flag-img \{[\s\S]{0,160}overflow: hidden/.test(C));
ok('and the svg fills the size its class asked for',
   /\.flag-img > svg \{[\s\S]{0,120}width: 100%;\s*\n\s*height: 100%/.test(C));
// The two-letter box survives, but now only for a country we do not draw yet —
// there is no load left to fail.
ok('the unknown-country path is still a readable code',
   /return '<span class="' \+ cssClass \+ ' flag-code"/.test(S));
ok('which is styled to be readable',
   /\.flag-code \{[\s\S]{0,200}border: 1px solid var\(--line-strong\)/.test(C));
ok('every call site still goes through the one function',
   (S.match(/getFlagHtml\(/g) || []).length >= 12);
/* Mexico and Spain carry the plain field. Their real flags ship a coat of arms of
 * 143 KB and 153 KB — engraving about six pixels wide at the size these draw — so
 * the whole set is 11 KB instead of 300 KB. */
ok('and the set stays small enough to be worth inlining',
   (S.match(/var FLAG_SVG = \{[\s\S]*?\n  \};/) || [''])[0].length < 20000);

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
