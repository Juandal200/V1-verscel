/* Two typefaces, and a rule for which.
 *
 * There were five in play — Inter, Courier New, Consolas, Monaco and Georgia — across
 * fifteen hardcoded declarations, so the same kind of thing was set in a different
 * face depending on which file it was written in. A serif in an aviation interface is
 * the clearest symptom of that, and it was there only to stop an aeroplane character
 * rendering as a colour emoji.
 *
 * The distinction kept is the one a cockpit makes: what a PERSON reads, and what an
 * INSTRUMENT shows. */
const fs = require('fs');
const C  = fs.readFileSync(__dirname + '/../Styles.html', 'utf8');
const S  = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
const G  = fs.readFileSync(__dirname + '/../GamificationUI.html', 'utf8');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};

console.log('--- the faces are declared once ---');
ok('--font-ui exists',          /--font-ui:\s*Inter/.test(C));
ok('--font-instrument exists',  /--font-instrument:\s*ui-monospace/.test(C));
ok('the instrument stack is pinned, not generic',
   /--font-instrument:[^;]*Menlo[^;]*Consolas/.test(C));
ok('a type scale is declared',
   /--t-instrument:/.test(C) && /--t-body:/.test(C) && /--t-label:/.test(C));

console.log('--- nothing sets a face by hand ---');
// This read Styles.html only, and the client is where most of the interface is
// actually written. Eight declarations sat outside its view the whole time: six
// generic `monospace`, which is whatever face the platform happens to pick, and two
// Courier New — the one the pass was written to remove. The file it could not see
// is the file the miss was in.
// [^;]+ and not [^;'"]+ — a stack names its faces in quotes, so stopping at the
// first quote truncates "Segoe UI Emoji" to nothing.
const decls = [...(C + S + G).matchAll(/font-family:\s*([^;<}]+);/g)].map(m => m[1].trim());
ok('the scan reaches the client, not just the stylesheet', decls.length > 60);
const stray = decls.filter(d =>
  !/^var\(--font-(ui|instrument)\)$/.test(d) &&
  !/^inherit$/.test(d) &&
  // Country flags are emoji by nature: a flag IS the emoji, not a decoration
  // standing in for one, so it keeps the only stack that renders them.
  !/Color Emoji/.test(d));
if (stray.length) stray.forEach(d => console.log('      ' + d.slice(0, 60)));
ok('every declaration is a token, inherit, or the flag stack', stray.length === 0);
// \bserif\b, not "serif": the flag stack ends in sans-serif and was matching.
ok('no serif survives',
   !/font-family:[^;]*(Georgia|Times New Roman|(^|[\s,])serif\b)/.test(C + S + G));
ok('no Courier survives', !/font-family:[^;]*Courier/.test(C + S + G));
ok('and no bare `monospace`, which is whatever the platform picks',
   !/font-family:\s*monospace/.test(C + S + G));

console.log('--- a document that carries no tokens carries its own ---');
// _downloadProgressPdf and _downloadUnifiedProgressPdf open a blank window and
// document.write() into it. Nothing from the app's :root reaches there, so 59
// var() references resolved to nothing — which does not fail, it drops the
// declaration. Borders vanished, and with them a score's colour coding: good,
// borderline and failing all printed the same inherited black.
const printed = S.slice(S.indexOf('function _downloadProgressPdf'),
                        S.indexOf('function _renderProgressTab') + 1 || undefined);
ok('the printed reports declare a palette of their own',
   /var REPORT_TOKENS\s*=\s*\n?\s*':root\{'/.test(S));
['--text','--muted','--green','--yellow','--red','--line','--accent','--font-ui'].forEach(t => {
  ok('and it defines ' + t, new RegExp(t + ':').test(S.slice(S.indexOf('var REPORT_TOKENS'),
                                                             S.indexOf('var REPORT_TOKENS') + 700)));
});
const writes = [...S.matchAll(/'<style>([^']*)/g)].map(m => m[1]);
const naked = writes.filter(w => /var\(--/.test(w) && !/REPORT_TOKENS/.test(w));
ok('no generated document styles itself with tokens it does not carry',
   naked.length === 0);

console.log('--- values that change are monospaced and tabular ---');
['.sim-instr-value', '.tea-timer', '#scClock'].forEach(sel => {
  const re = new RegExp(sel.replace('.', '\\.').replace('#', '#') + '[\\s\\S]{0,700}?font-family: var\\(--font-instrument\\)');
  ok(sel + ' uses the instrument face', re.test(C));
});
ok('digits are tabular, so a column does not shift',
   /font-variant-numeric:\s*tabular-nums/.test(C));

console.log('--- the plan cards are drawn, not typed ---');
// Eleven colour emoji — a rocket, a robot, an ambulance — each drawn by a different
// designer at a different weight in a different palette, on the page where somebody
// decides whether to pay. They were the loudest thing on a screen that is otherwise
// black, white and one accent.
const shop = S.slice(S.indexOf('var featureList ='), S.indexOf('var featureList =') + 2200);
const emojiInShop = [...shop.matchAll(/&#(1\d{5});/g)].map(m => m[1]);
if (emojiInShop.length) console.log('    ' + emojiInShop.join('  '));
ok('no colour emoji left in the plan features', emojiInShop.length === 0);
ok('every feature names an icon instead',
   (shop.match(/uiIcon\('/g) || []).length >= 11);
const set = S.slice(S.indexOf('var UI_ICONS = {'), S.indexOf('function uiIcon'));
const names = [...set.matchAll(/^\s{4}([a-z]+):/gm)].map(m => m[1]);
console.log('    ' + names.join('  '));
ok(`${names.length} icons in the set`, names.length >= 12);
ok('every icon the cards ask for exists',
   [...shop.matchAll(/uiIcon\('([a-z]+)'/g)].every(m => names.includes(m[1])));
// 1.6 at 24 is the same optical weight as the interface's 700 text at 0.82rem,
// which is what lets an icon sit in a line rather than on top of it. The one
// exception is the score chart's baseline, which is an axis rule and not an icon.
const strokes = [...S.matchAll(/stroke-width="([\d.]+)"/g)].map(m => m[1]);
console.log('    stroke weights: ' + [...new Set(strokes)].join('  '));
ok('the icons are one stroke weight',
   /stroke-width="1\.6"/.test(S) &&
   strokes.filter(w => w !== '1.6' && w !== '1').length === 0);
ok('and the share glyph is not written out a second time at another weight',
   (S.match(/M12 16V3/g) || []).length === 1);
ok('and take the colour of the line they sit in, so they follow the theme',
   /stroke="currentColor"/.test(S) && !/<svg[^>]*stroke="#/.test(S));
// A drawing carries no meaning to a screen reader, and the words beside it already do.
ok('they are hidden from assistive technology', /aria-hidden="true"/.test(set + S.slice(S.indexOf('function uiIcon'), S.indexOf('function uiIcon') + 700)));

console.log('--- the accent is a flag, not two lines of text ---');
// "INDIAN ATC" wrapped and pushed the Replay button off centre. A flag says it at
// a glance and in one line, and getFlagHtml falls back to the character if the
// image will not load.
ok('the badge serves a flag',
   /getFlagHtml\(country, 'flag-badge'\)/.test(S));
ok('with the nationality beside it, since a flag alone is a quiz',
   /atc-accent-name/.test(S) && /replace\(\/\\s\*ATC\$\/, ''\)/.test(S));
ok('and the country is still named for a screen reader', /meta\.label \+ '/.test(S));

console.log('--- the aircraft is drawn, not typed ---');
ok('no aeroplane character remains', !/&#9992;/.test(S));
ok('a drawn mark replaces it',       /class="aero-mark"/.test(S));
ok('it takes the colour around it',  /\.aero-mark[\s\S]{0,200}fill:\s*currentColor/.test(C));

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
