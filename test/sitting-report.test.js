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
/* A regional-indicator pair has no glyph on Windows: macOS draws a flag, Windows
 * draws two letters or two boxes. Twelve call sites already used getFlagHtml, which
 * serves an SVG. Two printed the character directly — and so did BOTH fallbacks,
 * which is the part that mattered, because a fallback that fails on the same
 * platform as the thing it replaces is not a fallback. */
ok('nothing prints a country emoji directly',
   !/safeText\(getCountryUi\(country\)\.emoji/.test(S));
ok('the image fallback is a country code',
   /flag-code[^']*'\s*\+\s*safeText\(\(meta\.code \|\| '\?\?'\)/.test(S));
ok('and so is the no-image path',
   /return '<span class="' \+ cssClass \+ ' flag-code"/.test(S));
ok('which is styled to be readable',
   /\.flag-code \{[\s\S]{0,200}border: 1px solid var\(--line-strong\)/.test(C));
ok('the twelve that were already right are untouched',
   (S.match(/getFlagHtml\(/g) || []).length >= 12);

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
