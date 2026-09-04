/* Both themes readable, and the palette stated once.
 *
 * The stylesheet always defined a light theme and a dark one, but the colours were
 * written into the markup by hand — 315 of them in the client alone — and a
 * hand-written colour cannot invert. The light theme was pale text on a pale ground
 * across the onboarding tour, the install prompt, the subscription price and most
 * admin screens, and its own feedback colours failed contrast.
 *
 * The simulator cockpit and the exam paint their own dark rooms on purpose and are
 * excluded: their text is tuned to that ground rather than to the theme. */
const fs = require('fs');
const S  = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
const C  = fs.readFileSync(__dirname + '/../Styles.html', 'utf8');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};

function lum(h){const n=parseInt(h.slice(1),16);const r=(n>>16&255)/255,g=(n>>8&255)/255,b=(n&255)/255;
  const f=c=>c<=.03928?c/12.92:Math.pow((c+.055)/1.055,2.4);return .2126*f(r)+.7152*f(g)+.0722*f(b);}
const cr=(a,b)=>{const A=lum(a),B=lum(b);return (Math.max(A,B)+.05)/(Math.min(A,B)+.05);};
function toks(block){const o={};for(const m of block.matchAll(/(--[a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g))o[m[1]]=m[2];return o;}
const dark  = toks(C.slice(C.indexOf(':root {'), C.indexOf('[data-theme="light"]')));
const light = toks(C.slice(C.indexOf('[data-theme="light"]'), C.indexOf('[data-theme="light"]') + 2400));

console.log('--- every token is readable on its own ground ---');
[['dark', dark], ['light', light]].forEach(([name, set]) => {
  const bg = set['--bg'];
  ['--text','--muted','--green','--yellow','--red','--accent'].forEach(t => {
    const r = cr(set[t], bg);
    ok(`${name} ${t} ${set[t]} = ${r.toFixed(1)}:1`, r >= 4.5);
  });
});
ok('the accent inverts between themes',      dark['--accent'] !== light['--accent']);
ok('text inverts between themes',            dark['--text']   !== light['--text']);
ok('the feedback colours differ per theme',  dark['--green']  !== light['--green']);

console.log('--- nothing in the client pins a colour to one theme ---');
const EXAM = n => n > 23000 && n < 27600;   // the exam's own dark room
let stranded = [];
for (const m of S.matchAll(/style="([^"]*)"/g)) {
  const line = S.slice(0, m.index).split('\n').length;
  if (EXAM(line) || /background\s*:/.test(m[1])) continue;
  for (const c of m[1].matchAll(/color:\s*(#[0-9a-fA-F]{6})/g)) stranded.push(line + ':' + c[1]);
}
if (stranded.length) console.log('    ' + stranded.slice(0, 6).join('  '));
ok('no hand-written text colour on a themed surface', stranded.length === 0);

console.log('--- form controls follow the theme ---');
ok('none paints itself a fixed dark',
   !/<(input|select|textarea)[^>]*background:\s*#(0|1|2)[0-9a-f]{5}/i.test(S));
ok('none pins pale text inside a themed control',
   !/background:var\(--panel-soft\)[^"']*color:#(dde|c8d|f0f|e6e)/i.test(S));

console.log('--- the screens that were unreadable in light mode ---');
const near = (needle, span) => S.slice(Math.max(0, S.indexOf(needle) - 400), S.indexOf(needle) + span);
const PALE = /color:\s*#(dde6f0|dde2e6|c8d8e8|f0f6ff|e6e6e6|ffffff)\b/i;
ok('the onboarding tour',      !PALE.test(near('Welcome to ICAO Tr', 3000)));
ok('the install prompt',       !PALE.test(near('Add to Home S', 200)));
ok('the subscription price',   !PALE.test(near('font-size:2rem;font-weight:900', 200)));
ok('the shop plan card',       !PALE.test(near('shopPlanNames', 400)));

console.log('--- the brand accent is still stated once ---');
ok('no teal survives anywhere',
   !/00d48e/i.test(S + C) && !/0\s*,\s*212\s*,\s*142/.test(S + C));
ok('the nine level identities survive',
   (S.match(/\n\s*\d+:\s*\{\s*gradient:[\s\S]*?tag:\s*'[^']+'/g) || []).length === 9);

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
