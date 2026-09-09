/* One read scope for a route completion.
 *
 * updateUserProgress reads Attempts and Progress IN FULL, and apiFinalizeRoute
 * called it once per scenario — so an eight-phase route paid sixteen full-sheet
 * reads to produce one Progress row, and the cost grew with the Attempts sheet.
 * dbReadAll_ has a per-execution cache, _DB_SCOPE, and nothing on this path armed
 * it.
 *
 * The write-through behaviour is what makes this safe, and it is asserted here
 * rather than assumed: dbAppend_ pushes the new row into a live scope with its
 * __rowNumber and dbUpdateByRow_ merges an updated row back, so an iteration
 * still sees what the previous one wrote. dbDeleteByRow_ drops the cache instead,
 * because deleting shifts every __rowNumber. If any of that changes, a route
 * completion starts reading stale rows and this file should be the thing that
 * says so. */
'use strict';
const fs = require('fs');
const A = fs.readFileSync(__dirname + '/../Attemptservice.js', 'utf8');
const D = fs.readFileSync(__dirname + '/../DatabaseService.js', 'utf8');
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
let fails = 0; const ok = (n, c, d) => { if (!c) fails++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c || !d ? '' : ' — ' + d)); };
function grab(src, sig) {
  const i = src.indexOf(sig); if (i < 0) return null;
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  return null;
}

console.log('\nroute completion reads each sheet once\n');

const fin = strip(grab(A, 'function apiFinalizeRoute') || '');
ok('apiFinalizeRoute exists', !!fin);
ok('it opens a read scope', /dbWithReadScope_\(function \(\) \{/.test(fin));
// The scope must cover the loop, not sit beside it.
ok('and the loop is inside it',
   fin.indexOf('dbWithReadScope_') < fin.indexOf('scenarioIds.forEach'),
   'scope at ' + fin.indexOf('dbWithReadScope_') + ', loop at ' + fin.indexOf('scenarioIds.forEach'));
ok('the guard clauses stay outside it, so a bad payload costs no scope',
   fin.indexOf('No scenarios given') < fin.indexOf('dbWithReadScope_'));

console.log('\nthe scope is only useful because writes keep it coherent:');
const app = strip(grab(D, 'function dbAppend_') || '');
const upd = strip(grab(D, 'function dbUpdateByRow_') || '');
const del = strip(grab(D, 'function dbDeleteByRow_') || '');
ok('dbAppend_ writes through to a live scope',
   /_DB_SCOPE\[sheetName\]\.push\(copy\)/.test(app));
ok('carrying the new __rowNumber',  /copy\.__rowNumber = sheet\.getLastRow\(\)/.test(app));
ok('dbUpdateByRow_ merges the row back',
   /Number\(cached\[i\]\.__rowNumber\) === Number\(rowNumber\)/.test(upd));
// Deletion cannot be written through — every later __rowNumber shifts.
ok('dbDeleteByRow_ drops the cache instead', /_DB_SCOPE/.test(del) && !/push\(/.test(del));

console.log('\nnesting is tolerated, so this cannot disturb apiSubmitAttempt:');
const scope = strip(grab(D, 'function dbWithReadScope_') || '');
ok('only the outermost scope clears',
   /var outer = _DB_SCOPE;/.test(scope) && /if \(!outer\) dbEndReadScope_\(\)/.test(scope));
ok('apiSubmitAttempt still opens its own', /dbWithReadScope_\(function\(\) \{ return self\._submitAttempt_/.test(strip(A)));

console.log('\nand the reads it collapses are still the ones that were expensive:');
const upg = strip(grab(A, 'updateUserProgress: function(') || '');
ok('updateUserProgress reads Attempts in full', /dbReadAll_\('Attempts'\)/.test(upg));
ok('and Progress in full',                      /dbReadAll_\('Progress'\)/.test(upg));

console.log(fails ? ('\n' + fails + ' FAILING') : '\nall green');
process.exit(fails ? 1 : 0);
