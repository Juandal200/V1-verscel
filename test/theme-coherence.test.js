/* Both themes have to be readable.
 *
 * The stylesheet defines a light theme and a dark one, but hundreds of colours are
 * written into the markup by hand. Where a near-white text colour sat on a surface
 * that follows the theme, the light theme rendered pale text on a pale ground — the
 * onboarding tour, the install prompt and most admin screens. Where a control painted
 * itself a fixed dark, it stayed a black box on a pale page.
 *
 * The exam area is deliberately excluded: it paints its own dark ground on purpose,
 * and its text is tuned to that rather than to the theme. */
const fs = require('fs');
const S  = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
const C  = fs.readFileSync(__dirname + '/../Styles.html', 'utf8');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};

const lines = S.split('\n');
const EXAM = n => n > 23000 && n < 27600;   // the exam's own dark room
const LIGHT   = /color:\s*#(dde6f0|dde2e6|c8d8e8|f0f6ff|e6e6e6)\b/i;
const OWNDARK = /background[^;'"]*#(0[0-9a-f]|1[0-9a-f]|2[0-9a-f])[0-9a-f]{4}|background[^;'"]*rgba\(\s*(?:[0-9]|1[0-9]|2[0-9])\s*,/i;

console.log('--- both themes define the same tokens ---');
const dark  = C.slice(C.indexOf(':root {'), C.indexOf('[data-theme="light"]'));
const light = C.slice(C.indexOf('[data-theme="light"]'), C.indexOf('[data-theme="light"]') + 1600);
['--bg','--panel','--panel-soft','--line','--text','--muted','--accent','--accent-ink'].forEach(t => {
  ok('dark defines '  + t, dark.includes(t + ':'));
  ok('light defines ' + t, light.includes(t + ':'));
});
ok('text inverts between them',
   /--text:\s*#cacaca/i.test(dark) && /--text:\s*#1c1c1a/i.test(light));

console.log('--- no pale text on a surface that follows the theme ---');
const stranded = [];
lines.forEach((l, i) => {
  const n = i + 1;
  if (EXAM(n) || !LIGHT.test(l) || OWNDARK.test(l)) return;
  stranded.push(n);
});
if (stranded.length) console.log('    still stranded at: ' + stranded.slice(0, 8).join(', '));
ok('nothing outside the exam pins near-white text', stranded.length === 0);

console.log('--- no form control paints itself a fixed dark ---');
const controls = [];
lines.forEach((l, i) => {
  const n = i + 1;
  if (EXAM(n)) return;
  if (/<(input|select|textarea)[^>]*background:\s*#(0|1|2)[0-9a-f]{5}/i.test(l)) controls.push(n);
});
if (controls.length) console.log('    still dark at: ' + controls.join(', '));
ok('inputs and selects follow the theme', controls.length === 0);
ok('and their text follows it too',
   !/background:var\(--panel-soft\)[^"']*color:#(dde|c8d|f0f|e6e)/i.test(S));

console.log('--- the screens that were unreadable ---');
const tour = S.slice(S.indexOf('Welcome to ICAO Tr') - 400, S.indexOf('Welcome to ICAO Tr') + 3000);
ok('the onboarding tour uses themed text',  !LIGHT.test(tour));
const install = S.slice(S.indexOf('Add to Home S') - 300, S.indexOf('Add to Home S') + 200);
ok('the install prompt uses themed text',   !LIGHT.test(install));

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
