/* The brand accent is defined once and used everywhere.
 *
 * It used to be #00d48e written out by hand in 223 places, which is why "no more
 * green" did not stick the last time it was asked for — there was nothing to change,
 * only 223 things. */
const fs = require('fs');
const C = fs.readFileSync(__dirname + '/../Styles.html', 'utf8');
const S = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};

console.log('--- the teal is gone from the source ---');
const teal = f => (f.match(/00d48e/gi)||[]).length + (f.match(/0\s*,\s*212\s*,\s*142/g)||[]).length;
ok('none left in the stylesheet', teal(C) === 0);
ok('none left in the client',     teal(S) === 0);

console.log('--- and defined once, in both themes ---');
const dark  = C.slice(C.indexOf(':root {'), C.indexOf('[data-theme="light"]'));
const light = C.slice(C.indexOf('[data-theme="light"]'), C.indexOf('[data-theme="light"]') + 1400);
['--accent:', '--accent-rgb:', '--accent-ink:'].forEach(t => {
  ok('dark theme defines '  + t, dark.indexOf(t)  >= 0);
  ok('light theme defines ' + t, light.indexOf(t) >= 0);
});
ok('the two themes differ',
   /--accent:\s*#ffffff/i.test(dark) && /--accent:\s*#14304d/i.test(light));

console.log('--- every use resolves ---');
const usesRgb = (C.match(/rgba\(var\(--accent-rgb\)/g)||[]).length +
                (S.match(/rgba\(var\(--accent-rgb\)/g)||[]).length;
const usesHex = (C.match(/var\(--accent\)/g)||[]).length +
                (S.match(/var\(--accent\)/g)||[]).length;
console.log('    var(--accent): ' + usesHex + '   rgba(var(--accent-rgb)): ' + usesRgb);
ok('the accent is actually used',        usesHex > 100);
ok('translucent forms use the triplet',  usesRgb > 50);
ok('no rgba() was handed a hex variable',
   !/rgba\(\s*var\(--accent\)\s*,/.test(C + S));

console.log('--- text on a solid accent flips with it ---');
ok('no near-black ink is pinned to an accent fill',
   !/background\s*:\s*var\(--accent\)[^;]*;\s*(?:border[^;]*;\s*)?color\s*:\s*(#07101e|#000000|#000\b)/i.test(C + S));
ok('--accent-ink is used for that',      /var\(--accent-ink\)/.test(C + S));

console.log('--- the levels ---');
// Levels are identified by number, name and icon — not by colour.
const levels = (S.match(/\n\s*\d+:\s*\{\s*gradient:[\s\S]*?tag:\s*'[^']+'/g)||[]);
ok('the nine levels are still there', levels.length === 9);
// They used to be asserted as DIFFERENT from each other, and that was right while the
// colour was meant to identify a level. It is not any more: nine gradients made the map
// read as nine products, and a level is identified by its number, its name and its
// icon, all of which are on the card. What is asserted now is the opposite — that they
// share one look — because a colour returning to one of them would be the regression.
ok('they share one look',
   new Set(levels.map(l => (l.match(/accent:\s*'([^']+)'/)||[])[1]).filter(Boolean)).size === 1);
ok('and that look is the brand token, not a colour of its own',
   /accent: 'var\(--accent\)'/.test(S));
// Correct, incorrect and warning have to stay distinguishable in a training app.
ok('feedback colours are untouched',
   /--green:/.test(C) && /--red:/.test(C) && /--yellow:/.test(C));

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
