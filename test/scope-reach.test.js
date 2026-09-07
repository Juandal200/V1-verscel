/* A call site has to be able to see what it is calling.
 *
 * Scripts.html is thirty thousand lines in twelve top-level IIFEs. A function
 * declared in one of them is invisible to the others, and JavaScript says nothing
 * about it until the line actually runs — so a helper called from the wrong closure
 * ships green, passes every string-matching test, and throws the first time a
 * student reaches that screen.
 *
 * It has now happened twice. safeText and byId were exported after the first time,
 * with a note above them explaining why. Then the emoji sweep put uiIcon calls in
 * three later IIFEs and none of them could see it. The First Flight tour was the
 * one that mattered: renderHome sends any student who has not completed it straight
 * there and returns, so every new account signed in, threw "uiIcon is not defined",
 * and had no way past — reloading did the same thing.
 *
 * typography.test.js had checked that every icon NAME asked for existed. It did.
 * That was true and completely beside the point, because a string search cannot see
 * scope. This can. */
const fs = require('fs');
const S = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};

const lines = S.split('\n');

/* Top-level IIFEs, by their unindented opener and closer. Nested ones are indented
 * and therefore belong to the block that contains them, which is what we want —
 * scope flows inward. */
const opens  = lines.map((l, i) => /^\(function\s*\(\s*\)\s*\{/.test(l) ? i + 1 : 0).filter(Boolean);
const closes = lines.map((l, i) => /^\}\)\(\);\s*$/.test(l) ? i + 1 : 0).filter(Boolean);
const blocks = opens.map(o => [o, closes.find(c => c > o) || lines.length])
                    // The outermost pair wraps the others; keep the innermost span
                    // for each opener and drop exact duplicates of a range.
                    .filter(([o, c], i, all) => !all.some(([o2, c2], j) => j !== i && o2 > o && c2 === c));

console.log('--- the file is ' + blocks.length + ' top-level scopes ---');
ok('more than one, which is why this matters', blocks.length > 1);

/* Helpers worth checking: declared once, called from more than one place. Only
 * plain declarations — a var holding a function is a different question. */
// A Map, not an object literal. A function called "constructor" or "toString"
// would otherwise collide with Object.prototype and the lookup returns something
// that is not an array.
const declared = new Map();
blocks.forEach(([o, c], bi) => {
  const body = lines.slice(o - 1, c).join('\n');
  for (const m of body.matchAll(/^\s{0,4}function ([A-Za-z_$][\w$]*)\s*\(/gm)) {
    if (!declared.has(m[1])) declared.set(m[1], []);
    declared.get(m[1]).push(bi);
  }
});

const globals = new Set([...S.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=/g)].map(m => m[1]));

const unreachable = [];
blocks.forEach(([o, c], bi) => {
  const body = lines.slice(o - 1, c).join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
  // (?<![.\w$]) — \b matches after a dot, so loader.stop() and osc.start() read as
  // calls to any local function of that name. Four of the first six findings were
  // method calls on objects, which is a check crying wolf about its own regex.
  for (const m of body.matchAll(/(?<![.\w$])([a-zA-Z_$][\w$]*)\s*\(/g)) {
    const name = m[1];
    const homes = declared.get(name);
    if (!homes) continue;                       // not one of ours, or a method
    if (homes.includes(bi)) continue;           // declared right here
    if (globals.has(name)) continue;            // reachable through window
    // Where it is, so the failure names a line rather than a fact.
    const at = o + body.slice(0, m.index).split('\n').length - 1;
    unreachable.push(name + ' at line ~' + at + ' (declared in scope ' + homes.join(',') + ')');
  }
});

console.log('--- every call can reach what it calls ---');
if (unreachable.length) {
  [...new Set(unreachable)].slice(0, 12).forEach(u => console.log('        ' + u));
}
ok(`${[...new Set(unreachable)].length} calls that would throw at runtime`,
   unreachable.length === 0);

console.log('--- an inline handler can reach what it names ---');
/* onclick="_dcSubmitAnswer()" is evaluated in GLOBAL scope, not in the closure the
 * markup was written in. So a function declared inside an IIFE and named in an
 * attribute throws the moment somebody presses the button — and nothing reports it
 * until a student does.
 *
 * Nine were found this way, none of them from the icon work: the daily challenge
 * could not be opened, played, answered or submitted, and the printed report's
 * download button did nothing. */
const declaredNames = new Set([...S.matchAll(/^\s{0,4}function ([A-Za-z_$][\w$]*)\s*\(/gm)].map(m => m[1]));
const handlerNames = new Set();
for (const m of S.matchAll(/on(?:click|change|input|submit|keydown|keyup|focus|blur)=\\?["']([^"']{0,300})/g)) {
  for (const f of m[1].matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) handlerNames.add(f[1]);
}
const orphanHandlers = [...handlerNames].filter(h => declaredNames.has(h) && !globals.has(h));
if (orphanHandlers.length) console.log('        ' + orphanHandlers.join('  '));
ok(`${orphanHandlers.length} inline handlers naming something unreachable`,
   orphanHandlers.length === 0);
console.log('    ' + handlerNames.size + ' distinct functions named in attributes, all reachable');
// The daily challenge was entirely inert. Named so a regression is recognisable.
['openDailyChallenge', '_dcPlayAudio', '_dcSelectOpt', '_dcSubmitAnswer',
 '_downloadUnifiedProgressPdf'].forEach(nm => {
  ok(nm + ' is reachable from an attribute', globals.has(nm));
});

console.log('--- the two that caused it ---');
ok('uiIcon is on window',       /window\.uiIcon\s+= uiIcon;/.test(S));
ok('uiIconInline is on window', /window\.uiIconInline\s+= uiIconInline;/.test(S));
// The ones exported after the first time this happened. They must stay exported.
['safeText', 'byId', '_renderTopbarRank'].forEach(nm => {
  ok(nm + ' is still exported', new RegExp('window\\.' + nm + '\\s+= ' + nm + ';').test(S));
});

console.log('--- and the screen it locked ---');
// renderHome sends a student who has not finished the tour there and RETURNS, so
// anything that throws inside it is not a broken screen, it is a broken account.
ok('the First Flight gate still returns rather than falling through',
   /!AppState\.user\.firstFlightDone\) \{[\s\S]{0,200}renderFirstFlight\(\);\s*\n\s*return;/.test(S));
ok('and the tour can now draw its own first step',
   /function _s0\(\)[\s\S]{0,300}uiIcon\('plane', 30\)/.test(S));

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
