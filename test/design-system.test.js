/* Uniformity in colour, type and form.
 *
 * The three had drifted the same way and for the same reason: every screen was styled
 * where it was written rather than against a system, so the same thing got a slightly
 * different value each time. Seven font sizes inside 0.16rem, forty corner radii, and
 * 119 distinct shadows for 134 uses — very nearly one bespoke shadow per element.
 *
 * None of those differences is perceptible on its own. Together they are exactly what
 * makes an interface read as assembled rather than designed, because nothing sits at
 * the same height, the same size, or the same corner as anything else.
 *
 * These limits are ceilings, not targets. Raising one is allowed; raising it without
 * noticing is what this stops. */
const fs = require('fs');
const C = fs.readFileSync(__dirname + '/../Styles.html', 'utf8');
const S = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
const ALL = C + S;
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};

const distinct = (re, clean = v => v) =>
  new Set([...ALL.matchAll(re)].map(m => clean(m[1].trim().replace(' !important', ''))));

console.log('--- type ---');
const sizes = distinct(/font-size:\s*([^;"'}]+)/g);
// clamp() is responsive sizing, which is a different thing from an arbitrary value.
const fixedSizes = [...sizes].filter(v => !/clamp|calc|var\(/.test(v));
console.log('    ' + fixedSizes.sort().join('  '));
ok(`${fixedSizes.length} fixed font sizes (was 159, ceiling 12)`, fixedSizes.length <= 12);
ok('all of them are rem, so they scale with the reader',
   fixedSizes.every(v => /rem$/.test(v)));

const weights = distinct(/font-weight:\s*([^;"'}]+)/g);
const fixedWeights = [...weights].filter(v => /^\d+$/.test(v));
ok(`${fixedWeights.length} font weights (was 11, ceiling 5)`, fixedWeights.length <= 5);
ok('no weight between 400 and 600, which nothing renders differently',
   !fixedWeights.includes('500'));

console.log('--- form ---');
const radii = distinct(/border-radius:\s*([^;"'}]+)/g);
// Multi-value radii are shapes — a tab, a pill with one square end — not sizes.
const simpleRadii = [...radii].filter(v => /^[\d.]+(px|%)$/.test(v));
console.log('    ' + simpleRadii.sort((a,b)=>parseFloat(a)-parseFloat(b)).join('  '));
ok(`${simpleRadii.length} single-value radii (was 40, ceiling 10)`, simpleRadii.length <= 10);

const shadows = distinct(/box-shadow:\s*([^;"'}]+)/g);
const elevation = [...shadows].filter(v =>
  !/^none/.test(v) && !/inset/.test(v) && !/^0\s+0\s/.test(v) && !/var\(--shadow/.test(v));
if (elevation.length) elevation.slice(0, 5).forEach(v => console.log('      ' + v.slice(0, 62)));
ok('every elevation shadow is a token', elevation.length === 0);
ok('three elevations are defined',
   /--shadow-1:/.test(C) && /--shadow-2:/.test(C) && /--shadow-3:/.test(C));
// A glow says active or alarming. That is meaning, not depth, so it keeps its colour.
ok('glows are left alone', [...shadows].some(v => /^0\s+0\s/.test(v)));

console.log('--- colour ---');
const hexes = new Set([...ALL.matchAll(/#[0-9a-fA-F]{6}\b/g)].map(m => m[0].toLowerCase()));
ok(`${hexes.size} distinct hex colours (was 153 in the stylesheet alone, ceiling 60)`,
   hexes.size <= 60);
ok('the eight tokens carry the work',
   (ALL.match(/var\(--(bg|panel|line|text|muted|accent|green|yellow|red)\)/g) || []).length > 900);

console.log('--- tokens are used for what they are ---');
// The colour sweep bucketed by luminance calibrated against the DARK theme, so a light
// surface became var(--text) — correct on dark and inverted on light — and a mid-grey
// used as text became var(--line), which is twelve per cent opacity. 117 pieces of text
// were briefly invisible. Neither showed up as an error: invalid CSS is dropped, and
// unreadable CSS is not invalid.
const misuse = [
  ['text painted with a surface token', /(?<!-)color:\s*var\(--(line|bg|panel)\)/g],
  ['a surface painted with a text token', /background:\s*var\(--(text|muted)\)/g],
];
misuse.forEach(([label, re]) => {
  const n = (ALL.match(re) || []).length;
  if (n) console.log('      ' + n + ' found');
  ok('no ' + label, n === 0);
});

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
