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

/* ── A name that exists nowhere at all ──────────────────────────────────────
 *
 * The check above skips a call whose name it has never seen declared — `if
 * (!homes) continue` — because most of those are setTimeout, parseInt and
 * method calls its regex could not tell apart. That skip is also a hole, and an
 * invented function falls straight through it: `_gamRefresh()` shipped, reached
 * production and crashed the Crew tab with "_gamRefresh is not defined", while
 * this suite reported all green.
 *
 * Underscore-prefixed names close it without the wolf-crying. Nothing in the
 * browser or in any library here starts with one, so a leading underscore means
 * "ours" — and if it is ours and declared nowhere, it is a typo or an
 * invention. Declarations are gathered loosely on purpose: a plain function, a
 * var holding one, an object property. Over-collecting risks missing a real
 * fault; under-collecting reports a false one, and a check that cries wolf gets
 * switched off. */
const declLoose = new Set();
for (const m of S.matchAll(/function ([A-Za-z_$][\w$]*)\s*\(/g))            declLoose.add(m[1]);
for (const m of S.matchAll(/(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=/g))  declLoose.add(m[1]);
for (const m of S.matchAll(/([A-Za-z_$][\w$]*)\s*[:=]\s*function/g))        declLoose.add(m[1]);
const onWindow = new Set([...S.matchAll(/window\.([A-Za-z_$][\w$]*)/g)].map(m => m[1]));

const srcNoComments = S.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
const invented = new Set();
for (const m of srcNoComments.matchAll(/(?<![.\w$])(_[A-Za-z_$][\w$]*)\s*\(/g)) {
  if (!declLoose.has(m[1]) && !onWindow.has(m[1])) invented.add(m[1]);
}

console.log('--- our own names all exist ---');
if (invented.size) [...invented].forEach(n => console.log('        ' + n + ' is called and declared nowhere'));
ok(`${invented.size} underscore-prefixed calls with no declaration anywhere`,
   invented.size === 0);

/* ── An export that never runs ───────────────────────────────────────────────
 *
 * window.X = X only happens when the line is reached. Both halves of the quiz
 * music were assigned inside _renderModuleDetail, which runs when somebody opens
 * an LMS module — so anywhere else in the app window._lmsStartQuizMusic was
 * undefined, the Squadron duel's typeof guard returned quietly, and the music
 * was never asked to play. Three attempts went into why it was silent before
 * anyone asked whether it was being called.
 *
 * An assignment to window belongs where it runs unconditionally: at the top
 * level of its IIFE, not nested inside a function somebody has to visit first.
 * Indentation is the test because that is what the rest of this suite uses to
 * find top-level scope, and it is what actually distinguishes the two cases. */
console.log('--- every window export is reachable at load ---');
/* Function DECLARATIONS only, not declLoose. That set also holds every var, so
 * `window._lmsQuizAudioCtx = ctx` matched through its right-hand side and the
 * report filled with state assignments — seventeen findings, one of them real.
 * A check that buries its one true finding in sixteen false ones has not
 * reported anything. */
const declFn = new Set([...S.matchAll(/function ([A-Za-z_$][\w$]*)\s*\(/g)].map(m => m[1]));
const nested = [];
S.split('\n').forEach((line, i) => {
  const m = /^(\s*)window\.([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\s*;/.exec(line);
  if (!m) return;
  /* Only FUNCTIONS. `window._bootstrapLoaded = true` is a state flag set from
   * wherever the state changes, and being nested is the whole point of it —
   * flagging those made this report six faults and no real ones, which is how a
   * check gets switched off. The right-hand side has to name a function this
   * file declares. */
  if (!declFn.has(m[3])) return;
  /* Two spaces is the IIFE's own level. Deeper means it sits inside something. */
  if (m[1].length > 2) nested.push(m[2] + ' at line ' + (i + 1) + ' (indent ' + m[1].length + ')');
});
if (nested.length) nested.forEach(n => console.log('        ' + n));
ok(`${nested.length} window exports nested inside a function`, nested.length === 0);

console.log('--- nothing is declared twice in one scope ---');
/* Two function declarations of the same name in the same scope is not a duplicate.
 * It is a decision the parser makes silently: the last one wins and the first
 * never runs.
 *
 * analyticsLogEvent was declared twice, two thousand lines apart, in the same
 * IIFE. The dead one built its own payload and posted it; the live one delegates
 * to AnalyticsEngine. Nothing broke — the survivor was the better of the two — but
 * forty lines of code that looked load-bearing had never executed, and an edit to
 * them would have done nothing at all.
 *
 * no-duplicate-functions.test.js already holds this for the SERVER, where Apps
 * Script shares one global scope. The client had no such check, and it is thirty
 * thousand lines. */
const declPos = [];
lines.forEach((l, i) => {
  const m = /^ {2}function ([A-Za-z_$][\w$]*)\s*\(/.exec(l);   // exactly two spaces: IIFE level
  if (m) declPos.push([i + 1, m[1]]);
});
const byScope = new Map();
declPos.forEach(([ln, name]) => {
  const b = blocks.find(([o, c]) => ln > o && ln < c);
  const key = (b ? b.join('-') : 'top') + '|' + name;
  if (!byScope.has(key)) byScope.set(key, []);
  byScope.get(key).push(ln);
});
const shadowed = [...byScope.entries()].filter(([, v]) => v.length > 1);
if (shadowed.length) {
  shadowed.forEach(([k, v]) => console.log('        ' + k.split('|')[1] + ' at ' + v.join(', ')));
}
ok(`${shadowed.length} functions shadowed by a later declaration`, shadowed.length === 0);
console.log('    ' + declPos.length + ' functions at IIFE level, each declared once');

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
/* It used to assert that _s0 could draw its aeroplane. The aeroplane was removed on
 * request (2026-09-19, a decorative mark over the heading); what the check stood for
 * — uiIcon reachable from outside its IIFE — is the window export asserted above. */
ok('and the tour\'s first step no longer draws the decorative aeroplane',
   !/function _s0\(\)[\s\S]{0,300}uiIcon\('plane'/.test(S));

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
