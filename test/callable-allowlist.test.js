/* Everything the client calls, the server is allowed to run.
 *
 * doPost gates by name. A call whose action is not in that list comes back as
 * {"ok":false,"error":"Not allowed: <name>"} — an object with no message and no
 * code, which is nothing like the shape every other failure in Gamification.js
 * returns. So the screen said "Could not start the challenge" with nothing after
 * it, and five rounds of diagnosis went into the server's own code, which was
 * fine the whole time and was never reached.
 *
 * The duel renamed three entry points. sendChallenge and acceptChallenge left
 * Gamification.js; createChallenge, getChallengePaper and submitChallengeResult
 * arrived. The list in Código.js kept the two dead names and never learned the
 * three live ones.
 *
 * This is the shape CLAUDE.md calls a seam: a table in one file naming values
 * that have to exist in another, with nothing obliging them to agree. It has bit
 * this project before, and the answer there was the same as here — compare the
 * two tables rather than remember to. More care does not close a seam.
 *
 * Note what it is NOT: a test that the function works. It only says the call can
 * reach it. Both halves were correct in isolation and the seam between them was
 * not.
 */
const fs = require('fs');
const S = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
const C = fs.readFileSync(__dirname + '/../Código.js', 'utf8');
let fails = 0;
const ok = (n, c, d) => { if (!c) fails++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c || !d ? '' : '   ' + d)); };

/* The chain is google.script.run[.withSuccessHandler(..)][.withFailureHandler(..)]
 * .theActualFunction(..). Only the last name is an action; the handlers are
 * client-side plumbing and are never sent. */
const PLUMBING = new Set(['withSuccessHandler', 'withFailureHandler', 'withUserObject']);

/* Walked with balanced parentheses, not with a window.
 *
 * The first version took a few thousand characters after each google.script.run
 * and collected every `.name(` in them, which swept up removeChild, then, catch,
 * getItem and a hundred others — a check reporting 127 faults where there was
 * one. A handler argument is a function body full of its own parentheses and
 * semicolons, so the chain has to be walked rather than guessed at: read a
 * segment, skip its arguments by counting brackets and stepping over strings,
 * and stop at the first thing that is not another link. */
function chainNames(src, start) {
  var i = start, names = [];
  while (i < src.length) {
    while (i < src.length && /\s/.test(src[i])) i++;
    if (src[i] !== '.') break;
    i++;
    var m = /^[A-Za-z_$][\w$]*/.exec(src.slice(i));
    if (!m) break;
    names.push(m[0]);
    i += m[0].length;
    while (i < src.length && /\s/.test(src[i])) i++;
    if (src[i] !== '(') break;
    var depth = 0, q = null;
    for (; i < src.length; i++) {
      var ch = src[i];
      if (q) {
        if (ch === '\\') i++;
        else if (ch === q) q = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') { q = ch; continue; }
      if (ch === '(') depth++;
      else if (ch === ')') { depth--; if (!depth) { i++; break; } }
    }
  }
  return names;
}

const called = new Set();
for (const m of S.matchAll(/google\.script\.run/g)) {
  const names = chainNames(S, m.index + 'google.script.run'.length);
  for (let i = names.length - 1; i >= 0; i--) {
    if (!PLUMBING.has(names[i])) { called.add(names[i]); break; }
  }
}

/* The gate has two halves and reading only one of them is how this check first
 * reported 144 faults where there was one. Anything shaped apiXxx and not ending
 * in an underscore is allowed by pattern; everything else has to be named. The
 * named list is the half that drifts, and it is the half the duel broke. */
const named = new Set([...C.matchAll(/action === '([A-Za-z_$][\w$]*)'/g)].map(m => m[1]));
const byPattern = n => /^api[A-Z]/.test(n) && !/_$/.test(n);
const allowed = n => named.has(n) || byPattern(n);

console.log('--- the allowlist is where doPost says it is ---');
ok('doPost gates by action name', /Not allowed: ' \+ action/.test(C));
ok('and it allows apiXxx by pattern, which this check has to model too',
   /\/\^api\[A-Z\]\/\.test\(action\)/.test(C));
ok(`${named.size} actions are named one by one`, named.size > 0);

console.log('--- every call the client makes can get through it ---');
console.log('    ' + called.size + ' distinct calls found in Scripts.html');
const blocked = [...called].filter(n => !allowed(n));
if (blocked.length) blocked.forEach(n => console.log('        ' + n + ' is called and not allowed'));
ok(`${blocked.length} calls doPost would refuse`, blocked.length === 0);

console.log('--- the list names nothing that has gone ---');
/* A dead entry is not a fault — the proxy simply never sends it — but it is how
 * the list drifts out of step unnoticed, and both dead names here were the two
 * the duel replaced. */
const G = fs.readFileSync(__dirname + '/../Gamification.js', 'utf8');
const ALL_SERVER = fs.readdirSync(__dirname + '/..')
  .filter(f => f.endsWith('.js') && f !== 'build.js' && f !== 'shim.js' && f !== 'sw.js')
  .map(f => fs.readFileSync(__dirname + '/../' + f, 'utf8')).join('\n');
const orphans = [...named].filter(n => !new RegExp('function ' + n + '\\s*\\(').test(ALL_SERVER));
if (orphans.length) orphans.forEach(n => console.log('        ' + n + ' is allowed and declared nowhere'));
ok(`${orphans.length} allowed actions with no function behind them`, orphans.length === 0);

console.log(fails ? '\n' + fails + ' FAILING' : '\nAll callable-allowlist assertions passed.');
process.exit(fails ? 1 : 0);
