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
const dark0 = C.slice(C.indexOf(':root {'), C.indexOf('[data-theme="light"]'));
const light0 = C.slice(C.indexOf('[data-theme="light"]'), C.indexOf('[data-theme="light"]') + 2400);
const dark  = toks(dark0);
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
// The exam's own dark room, bounded by what it CONTAINS rather than by line numbers.
// A hardcoded line number moves every time anything above it grows — this test failed
// twice for edits that had nothing to do with it, which teaches you to ignore it.
const EXAM_FROM = S.indexOf('function _examNext');
const EXAM_TO   = S.indexOf('function _unlockExamUI');
const examStart = S.slice(0, EXAM_FROM).split('\n').length;
const examEnd   = S.slice(0, EXAM_TO).split('\n').length;
const EXAM = n => n > examStart && n < examEnd;
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

console.log('--- the lift inverts, the scrim does not ---');
// 216 backgrounds were rgba(255,255,255,0.0x): a white film over a dark panel. It is
// the commonest surface in the app and it could not invert, so on the light theme a
// white film over an off-white ground was nothing at all and every panel lost its
// edge. A scrim is the opposite — it darkens what is under it, in either theme.
ok('the lift is white on dark and black on light',
   /--lift-rgb:\s*255,\s*255,\s*255/.test(dark0) && /--lift-rgb:\s*0,\s*0,\s*0/.test(light0));
ok('the scrim is black in both',
   /--scrim-rgb:\s*0,\s*0,\s*0/.test(dark0) && /--scrim-rgb:\s*0,\s*0,\s*0/.test(light0));
ok('and the lift is what surfaces are made of now',
   ((S + C).match(/rgba\(var\(--lift-rgb\)/g) || []).length > 200);
// A lift only works over a surface that follows the theme. Over a room that paints
// its own fixed dark ground it would flip to black on black.
const fixedDark = [];
for (const m of C.matchAll(/([.#][^{}\n]{0,80})\{([^{}]{0,800})\}/g)) {
  if (!/var\(--lift-rgb\)/.test(m[2])) continue;
  const bg = /background(?:-color)?\s*:\s*#([0-9a-fA-F]{6})\b/.exec(m[2]);
  if (bg) { const n = parseInt(bg[1], 16);
    if (0.2126*(n>>16) + 0.7152*(n>>8&255) + 0.0722*(n&255) < 40) fixedDark.push(m[1].trim()); }
}
if (fixedDark.length) console.log('    ' + fixedDark.slice(0, 5).join('  '));
ok('no lift sits on a room that stays dark either way', fixedDark.length === 0);
// The nine level cards shared one gradient, written out nine times, and it was a dark
// charcoal — so in light mode the level map was nine dark cards on a warm ground.
ok('the level cards are made of panel tokens',
   /LEVEL_CARD_SURFACE = 'linear-gradient\(145deg, var\(--panel\), var\(--panel-soft\)\)'/.test(S));
ok('and every level uses it', (S.match(/LEVEL_CARD_SURFACE/g) || []).length >= 11);

console.log('--- a theme block writes its own value, and is left to ---');
// Inside [data-theme="light"] the author has ALREADY chosen the light colour. A
// token that inverts flips it a second time, so the sweep turned four rules from
// white to black: the top bar, the secondary button, the bottom navigation and the
// login card's inner highlight. A literal is the honest value inside a theme block.
const lightBlocks = [...C.matchAll(/(\[data-theme="light"\][^{}]{0,120})\{([^{}]{0,700})\}/g)];
const flipped = lightBlocks.flatMap(m =>
  [...m[2].matchAll(/rgba\(var\(--lift-rgb\)[^)]*\)/g)].map(c => m[1].trim().slice(0, 46)));
if (flipped.length) console.log('    ' + flipped.slice(0, 5).join('  '));
ok('nothing inside a light-theme block uses a token that inverts', flipped.length === 0);

console.log('--- a field is paper in either theme ---');
// Every text input is a light box on a dark ground, which is the right inversion:
// you can see what you have typed. Written as rgba(232,232,232,0.96) at each field
// it read as a white film, and the lift pass gave it a token that flips — a black
// box with a black placeholder in it on the light theme.
ok('--field is declared in both themes',
   /--field:/.test(dark0) && /--field:/.test(light0));
ok('and it does not invert: paper is light either way',
   /--field:\s*rgba\(2\d\d, 2\d\d, 2\d\d/.test(dark0) &&
   /--field:\s*rgba\(2\d\d, 2\d\d, 2\d\d/.test(light0));
ok('its ink is stated rather than borrowed from --muted',
   /--field-ink:/.test(dark0) && /--field-ink:/.test(light0));
// --muted on that ground is #808080 on near-white: 3.28:1, in every input.
const fieldInk = (dark0.match(/--field-ink:\s*(#[0-9a-fA-F]{6})/) || [])[1];
const fieldBg  = '#e8e8e8';
ok(`ink on paper is ${cr(fieldInk, fieldBg).toFixed(1)}:1`, cr(fieldInk, fieldBg) >= 4.5);
['.input', '.textarea', '.sim-readback-input'].forEach(sel => {
  // The unscoped rule, not [data-theme="light"] .input, which comes first in the file.
  const i = C.search(new RegExp('(?:^|\\n)\\s*\\' + sel + '\\s*\\{'));
  ok(sel + ' is paper', i > 0 && /var\(--field\)/.test(C.slice(i, i + 400)));
});

console.log('--- the feedback colours have triplets, so they can be translucent ---');
/* --accent had an -rgb triplet from the day it was made; --green, --yellow and
 * --red never did. So every faint success wash and error tint in the app had to be
 * written as a literal, because there was no token to write instead — which is why
 * there were hundreds of them and why none of them followed the theme.
 *
 * The progress tab alone carried eighteen: Tailwind's green, Tailwind's red,
 * Tailwind's blue for a selection that should have been the accent, and a slate
 * for a neutral wash that should have been a lift. */
['--green-rgb', '--yellow-rgb', '--red-rgb'].forEach(t => {
  ok(t + ' is declared in both themes', new RegExp(t + ':').test(dark0) &&
                                        new RegExp(t + ':').test(light0));
});
// A triplet has to match the hex it belongs to, or a solid and a translucent form
// of the same token are different colours.
const trip = (block, name) => (block.match(new RegExp('--' + name + '-rgb:\\s*([\\d, ]+);')) || [])[1];
const hex  = (block, name) => (block.match(new RegExp('--' + name + ':\\s*(#[0-9a-fA-F]{6})')) || [])[1];
[['green', dark0], ['yellow', dark0], ['red', dark0],
 ['green', light0], ['yellow', light0], ['red', light0]].forEach(([n, blk]) => {
  const h = hex(blk, n), t = trip(blk, n);
  const asRgb = h && [1,3,5].map(i => parseInt(h.slice(i, i+2), 16)).join(', ');
  ok(`--${n}-rgb matches --${n}`, !!t && t.trim() === asRgb);
});

console.log('--- and the progress tab uses them ---');
const prog = (C.match(/\.prog-[a-z-]+[^{]*\{[^}]*\}/g) || []).join('');
const lits = prog.match(/rgba?\(\s*\d[\d\s,.]*\)/g) || [];
if (lits.length) console.log('    ' + [...new Set(lits)].slice(0, 5).join('  '));
ok('no colour literal left in it', lits.length === 0);
ok('and no stray hex either',      !/#990011/.test(C));

console.log('--- a canvas reads its tokens, it cannot be given them ---');
// ctx.fillStyle = 'var(--muted)' is not a colour. The assignment is rejected in
// silence and the context keeps what it had — black, on the first pass — so the
// flight phase rail drew its labels and its dots black on black, and the only
// thing visible was the one line still using a literal: a navy #23324f belonging
// to nothing. Third place a colour sweep put tokens where tokens cannot go, after
// the emails and the printed reports.
// Strip comments first: the note explaining this fault quotes the fault.
const code = S.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
const canvasToks = [...code.matchAll(/ctx\.(?:fill|stroke|shadowColor)[A-Za-z]*\s*=\s*([^;]+);/g)]
  .map(m => m[1]).filter(v => /var\(--/.test(v));
if (canvasToks.length) console.log('    ' + canvasToks.slice(0, 4).join('  '));
ok('no canvas is handed a token it cannot resolve', canvasToks.length === 0);
ok('it reads them off the root instead',
   /function _canvasTokens\(\)/.test(S) && /getComputedStyle\(document\.documentElement\)/.test(S));
ok('and every one has a fallback, since a token can be missing',
   (S.slice(S.indexOf('function _canvasTokens'), S.indexOf('function _canvasTokens') + 900)
     .match(/\|\|\s*['"]/g) || []).length >= 7);
ok('the rail no longer paints a navy of its own', !/#23324f/i.test(code));
ok('and its label uses the instrument face, not Consolas by name',
   !/Consolas, monospace';/.test(code));

console.log('--- the brand accent is still stated once ---');
ok('no teal survives anywhere',
   !/00d48e/i.test(S + C) && !/0\s*,\s*212\s*,\s*142/.test(S + C));
ok('the nine level identities survive',
   (S.match(/\n\s*\d+:\s*\{\s*gradient:[\s\S]*?tag:\s*'[^']+'/g) || []).length === 9);

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
