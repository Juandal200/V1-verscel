/* Borders, spacing of letters, and the speed things move at.
 *
 * The colour and type passes read Styles.html and Scripts.html. GamificationUI.html
 * is neither, and it is included in the page — so it kept sixteen colours of its own,
 * named Inter directly, sized twenty-six things and carried the retired teal in
 * forty-three places. Every sweep reported success while the squadron screen sat
 * outside all of it. That file is in ALL now, which is the actual fix; the rest of
 * this is what the sweeps found once it was.
 *
 * The other half is what nothing had ever looked at:
 *
 *   var(--border) and var(--surface-2) were defined only in three module .html files
 *   that nothing includes — the modules are rendered by renderEnginesModule() and its
 *   siblings in Scripts.html instead. An unresolvable var() does not fall back to
 *   anything; the declaration is discarded and the property is left unset, so
 *   border-style became none and background became transparent. Sixteen elements had
 *   no border and ten admin inputs were invisible fields on a dark ground, and a
 *   browser reports none of it.
 *
 *   175 border definitions, of which one hairline written fifty different ways.
 *   53 letter-spacings, including 0.06em and .06em counted as two.
 *   87 transitions for 105 uses — very nearly one bespoke speed per element, which
 *   is what makes an interface feel unsettled without anyone being able to say why.
 *
 * These are ceilings, not targets. Raising one is allowed; raising it without
 * noticing is what this stops. */
const fs = require('fs');
const path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const C = R('Styles.html'), S = R('Scripts.html'), G = R('GamificationUI.html');
const ALL = C + S + G;
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};

const values = re => [...ALL.matchAll(re)].map(m => m[1].trim().replace(/\s*!important/, ''));
const distinct = re => new Set(values(re));

console.log('--- every token a rule asks for is a token that exists ---');
const defined = new Set([...C.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(m => m[1]));
// A module scopes its own tokens to its own subtree; those count as defined too.
[...G.matchAll(/(--[a-z0-9-]+)\s*:/g)].forEach(m => defined.add(m[1]));
// var(--x, something) is the deliberate pattern for a token the client sets at
// runtime — a tier colour, the keyboard height. The fallback is what makes it safe.
// A bare var(--x) that resolves to nothing is the bug: the whole declaration is
// discarded and the property is left unset.
const asked = new Set([...ALL.matchAll(/var\((--[a-z0-9-]+)\s*\)/g)].map(m => m[1]));
const missing = [...asked].filter(t => !defined.has(t));
if (missing.length) console.log('        ' + missing.join('  '));
ok('no rule points at a token that was never declared', missing.length === 0);
// The three module files are not included by Index.html and not resolved by build.js,
// so anything they declare reaches nothing. They are where --border used to look
// defined. Kept only so this stays true if one is ever wired in.
['EnginesModule', 'HumanFactorsModule', 'NonRoutineModule'].forEach(m => {
  ok(m + '.html is still unreferenced, so its tokens are still not a source',
     !new RegExp("include\\(['\"]" + m).test(R('Index.html')));
});

console.log('--- one hairline, in two weights ---');
const borders = distinct(/border(?:-(?:top|right|bottom|left))?:\s*([^;"'}<]+)/g);
// A border naming a hue is saying something — correct, wrong, selected, a rank.
// A colour whose three channels sit within fourteen of each other is a grey, and a
// grey in a border is the hairline, whichever of the five families it came from.
const isGrey = v => {
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(v);
  if (m) { const c = [+m[1], +m[2], +m[3]]; return Math.max(...c) - Math.min(...c) <= 14; }
  return /#(?:([0-9a-f])\1\1|([0-9a-f]{2})\2\2)\b/i.test(v);
};
// A border can also be a shape: width:0 plus three thick borders is how a triangle
// is drawn, and there the colour is the fill, not a rule.
const stray = [...borders].filter(v => isGrey(v) && !/^\d\dpx/.test(v));
if (stray.length) console.log('    ' + stray.slice(0, 6).join('   '));
ok(`${stray.length} borders still writing out a grey (was ~120, ceiling 0)`, stray.length === 0);
const tokened = [...borders].filter(v => /var\(--line(-strong)?\)/.test(v));
console.log('    ' + tokened.length + ' definitions name the hairline token');
ok('and the hairline is what most borders are', tokened.length >= 10);
ok('both weights are defined, in both themes',
   (C.match(/--line-strong:/g) || []).length === 2 && (C.match(/--line:/g) || []).length >= 2);
ok('no border is painted with a surface token',
   !/border[^;:]*:\s*[^;"'}]*var\(--panel\)/.test(ALL));
ok('and none carries a dead fallback for a token that is now always defined',
   !/var\(--line\s*,/.test(ALL));

console.log('--- the pinned answer leaves room for itself ---');
// The answer bar is fixed to the bottom of a phone, and the cockpit reserved a flat
// 150px for it. The bar is 118px empty and 162 once the textarea has grown, and it
// sits 50px above the bottom — so the reserve was short by eighty to a hundred and
// ten pixels and the card behind it could never scroll clear of it.
ok('the reserve is measured, not guessed',
   /--answer-h/.test(C) && /padding-bottom: calc\(var\(--answer-h/.test(C));
ok('and it counts the navigation the bar sits above',
   /var\(--answer-h[^)]*\)\s*\+\s*50px/.test(C));
ok('something measures it', /function _simTrackAnswerHeight\(\)/.test(S));
ok('and keeps measuring while the textarea grows', /new ResizeObserver\(apply\)/.test(S));
ok('with a path for Safari versions that lack one', /bar\.addEventListener\('input', apply\)/.test(S));
ok('it starts when the cockpit draws', /_simTrackAnswerHeight\(\);/.test(S));

console.log('--- a grid that becomes a flex column resets its alignment ---');
// .sim-cockpit is a two-column grid on a desktop, with align-items: start to
// top-align the columns. The phone rule turns it into a flex column and did not
// touch align-items — where the same value stops meaning "align to the top" and
// starts meaning "shrink to your content and sit on the left". So the header and
// the flight rail took the width of the words "Exercise 1 of 8" plus two buttons,
// about 78% of the screen, while the cards below reached the edge because their
// text happens to be longer. Two elements disagreeing with a whole screen, from
// one property that changed meaning under them.
const rules = [...C.matchAll(/([^{}@]+)\{([^{}]*)\}/g)]
  .map(m => [m[1].trim().split('\n').pop().trim(), m[2]]);
const gridStart = new Set(rules
  .filter(([, b]) => /display:\s*grid/.test(b) && /align-items:\s*(start|flex-start|end)/.test(b))
  .map(([sel]) => sel));
const trapped = rules.filter(([sel, b]) =>
  gridStart.has(sel) && /display:\s*flex/.test(b) &&
  /flex-direction:\s*column/.test(b) && !/align-items:/.test(b)).map(([sel]) => sel);
if (trapped.length) console.log('    ' + trapped.join('  '));
ok('no grid becomes a flex column still carrying its grid alignment', trapped.length === 0);
// Anchored on what the rule contains rather than on the breakpoint above it:
// there is more than one @media (max-width: 768px) in the file, and the first one
// is nowhere near this. The dvh height is unique to the phone cockpit.
const dvh = C.indexOf('max-height: calc(100dvh');
const cockpitRule = C.slice(C.lastIndexOf('.sim-cockpit {', dvh), dvh);
ok('the cockpit stretches its children explicitly',
   /align-items: stretch;/.test(cockpitRule));

console.log('--- eight steps of letter-spacing ---');
const ls = distinct(/letter-spacing:\s*([^;"'}<]+)/g);
console.log('    ' + [...ls].sort().join('  '));
ok(`${ls.size} values (was 53, ceiling 10)`, ls.size <= 10);
ok('all of them in em, so they scale with the text',
   [...ls].every(v => /em$/.test(v) || v === '0' || /^var\(/.test(v)));
ok('nothing is spaced two ways at once', !/letter-spacing:\s*\.\d/.test(ALL));

console.log('--- three speeds and one curve ---');
const tr = values(/transition:\s*([^;"'}<]+)/g).join(' ');
const durations = new Set([...tr.matchAll(/(?:^|[\s,])(\d*\.?\d+)s\b/g)].map(m => m[1]));
console.log('    ' + [...durations].sort((a, b) => a - b).join('  '));
/* Above a second the duration is the information: a bar filling over the time a
 * student has to answer is the clock, not a decoration.
 *
 * 0.5s is the same argument BELOW a second, which the original rule did not
 * anticipate. .sc-clock-ring animates its conic-gradient between ticks of a
 * countdown that runs on setInterval(tick, 500) — so the duration is the tick,
 * and 0.4s would finish early and leave the ring still for 100ms out of every
 * 500, a visible stutter once a second. It is also `linear`, deliberately: a
 * clock that eases is lying about the rate time passes.
 *
 * So the ceiling is four, and the fourth is named with its reason. The point of
 * the rule is that a NEW arbitrary speed is caught, and it still is. */
const quick = [...durations].filter(d => parseFloat(d) <= 1);
ok(`${quick.length} speeds under a second (was 87 definitions, ceiling 4)`, quick.length <= 4);
ok('and they are the four that were chosen',
   quick.every(d => ['0.15', '0.25', '0.4', '0.5'].includes(d)));
// The exception has to stay an exception: one rule, tied to the tick it matches.
const halfSecond = (C.match(/transition:[^;"'}<]*0\.5s/g) || []);
ok('0.5s is used exactly once, by the countdown ring', halfSecond.length === 1,
   halfSecond.join(' | '));
ok('and it is linear, because a clock that eases misreports the rate',
   /\.sc-clock-ring \{[\s\S]{0,320}transition: background 0\.5s linear;/.test(C));
ok('the curve is defined once', /--ease:\s*cubic-bezier/.test(C));
const curves = [...tr.matchAll(/cubic-bezier\([^)]*\)/g)].map(m => m[0]);
// A spring overshoots on purpose. The 1.56 is the bounce.
ok('the only curve written out is the spring',
   curves.every(c => c.includes('1.56')));
ok('everything else names the token', (tr.match(/var\(--ease\)/g) || []).length > 150);

console.log('--- the squadron screen is inside the system now ---');
ok('no teal anywhere in it',
   !/00d48e|00f5a8/i.test(G) && !/0\s*,\s*212\s*,\s*142/.test(G));
ok('it does not name a typeface of its own', !/font-family:\s*Inter/.test(G));
ok('and asks for the one the app uses', /font-family:\s*var\(--font-ui\)/.test(G));
const gamSizes = new Set([...G.matchAll(/font-size:\s*([\d.]+rem)/g)].map(m => m[1]));
console.log('    ' + [...gamSizes].sort().join('  '));
ok(`${gamSizes.size} font sizes (was 26, ceiling 9)`, gamSizes.size <= 9);
const APP_SCALE = ['0.62rem','0.72rem','0.82rem','0.9rem','1rem','1.15rem','1.35rem','1.6rem','2rem'];
ok('every one of them is on the app\'s scale',
   [...gamSizes].every(v => APP_SCALE.includes(v)));
const gamRadii = new Set([...G.matchAll(/border-radius:\s*([\d.]+px)/g)].map(m => m[1]));
console.log('    ' + [...gamRadii].sort().join('  '));
ok(`${gamRadii.size} radii (was 13, ceiling 5)`, gamRadii.size <= 5);
ok('its own tokens are aliases of the app\'s, not colours of their own',
   !/--gam-(bg|surface|card|border|green|orange|red|text|muted)[^;]*:\s*(#|rgba)/.test(G));

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
