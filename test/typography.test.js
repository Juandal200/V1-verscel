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

console.log('--- the aircraft is drawn, not typed ---');
ok('no aeroplane character remains', !/&#9992;/.test(S));
ok('a drawn mark replaces it',       /class="aero-mark"/.test(S));
ok('it takes the colour around it',  /\.aero-mark[\s\S]{0,200}fill:\s*currentColor/.test(C));

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
