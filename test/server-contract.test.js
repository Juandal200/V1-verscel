/* Does the client read fields the server never sends?
 *
 * This is the shape of the version B accent bug: the exam step carried no `country`,
 * the client read `sc.country`, and a silent `|| 'USA'` turned the undefined into a
 * confident American voice. Nothing threw. It shipped, was rendered, and was only
 * caught by a human noticing the accent was wrong.
 *
 * A field that is read but never sent is almost always either a bug or dead code,
 * and it costs nothing to be told about it. */
const fs = require('fs');
const R  = f => fs.readFileSync(__dirname + '/../' + f, 'utf8');

function producedBy(src, fnName) {
  const i = src.indexOf('function ' + fnName);
  if (i < 0) throw new Error('producer not found: ' + fnName);
  const body = src.slice(i, i + 4000);
  const ret  = body.indexOf('return {');
  const keys = new Set();
  let depth = 0;
  for (let p = ret + 7; p < body.length; p++) {
    const c = body[p];
    if (c === '{') depth++;
    else if (c === '}') { if (--depth === 0) break; }
    else if (depth === 1) {
      const m = /^\s*([A-Za-z_$][\w$]*)\s*:/.exec(body.slice(p, p + 60));
      if (m && (body[p - 1] === ',' || body[p - 1] === '{' || body[p - 1] === '\n')) keys.add(m[1]);
    }
  }
  return keys;
}

function readsIn(src, from, to, vars) {
  const region = src.slice(src.indexOf(from), src.indexOf(to));
  const found  = new Map();
  for (const v of vars) {
    const re = new RegExp('\\b' + v + '\\.([A-Za-z_$][\\w$]*)', 'g');
    let m; while ((m = re.exec(region))) {
      if (!found.has(m[1])) found.set(m[1], region.slice(Math.max(0, m.index - 60), m.index + 40).split('\n').pop().trim());
    }
  }
  return found;
}

const S = R('Scripts.html');
const sent = producedBy(R('IcaoTestItemService.js'), 'stepOf');
// Added client-side after the step arrives, so absent from stepOf by design.
const CLIENT_ADDED = new Set(['atcText', 'phaseName', 'country']);

const read  = readsIn(S, 'function _renderIcaoTestScenario', 'function icaoTestSubmitAnswer', ['sc', 'next', 'step']);
const holes = [...read.keys()].filter(k => !sent.has(k) && !CLIENT_ADDED.has(k));

console.log('  server sends : ' + [...sent].sort().join(', '));
console.log('  client reads : ' + [...read.keys()].sort().join(', '));
if (holes.length) {
  console.log('\n  READ BUT NEVER SENT:');
  holes.forEach(k => console.log('    ' + k + '   <- ' + read.get(k)));
  process.exit(1);
}
console.log('\n  no field is read that the server does not send');
