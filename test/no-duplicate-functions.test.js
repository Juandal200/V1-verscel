/* Every server function has one definition.
 *
 * Apps Script puts every .gs file into one global scope, so two functions sharing a
 * name are not two functions — the one loaded last wins and the other is unreachable,
 * silently, with no error anywhere.
 *
 * It bit twice in one afternoon. I added repairSheetHeaders to Attemptservice.gs while
 * Código.gs already had one, so running it gave the other function's behaviour and
 * looked like the file had not deployed. And mergeObjects_ existed in two files with
 * different null handling, so whether passing a null threw depended on file order.
 *
 * build.js is excluded: it runs in Node during the Vercel build and is never pushed. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};

const NOT_PUSHED = new Set(['build.js']);

const seen = {};
fs.readdirSync(ROOT)
  .filter(f => f.endsWith('.js') && !NOT_PUSHED.has(f))
  .forEach(f => {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of src.matchAll(/^function ([A-Za-z_$][\w$]*)\s*\(/gm)) {
      (seen[m[1]] = seen[m[1]] || new Set()).add(f);
    }
  });

const dupes = Object.entries(seen).filter(([, files]) => files.size > 1);

console.log('--- one name, one definition ---');
if (dupes.length) {
  dupes.forEach(([name, files]) => {
    console.log('      ' + name + '  →  ' + [...files].join(', '));
  });
  console.log('      Apps Script keeps whichever loads last. The others are unreachable.');
}
ok(`no duplicate top-level function names (${Object.keys(seen).length} functions checked)`,
   dupes.length === 0);

console.log('--- the two that caused this ---');
const attempt = fs.readFileSync(path.join(ROOT, 'Attemptservice.js'), 'utf8');
const codigo  = fs.readFileSync(path.join(ROOT, 'Código.js'), 'utf8');
ok('only Código.gs defines repairSheetHeaders',
   /^function repairSheetHeaders\(/m.test(codigo) && !/^function repairSheetHeaders\(/m.test(attempt));
ok('the other one has its own name',
   /^function relabelSheetHeadersToSchema\(/m.test(attempt));

const lms  = fs.readFileSync(path.join(ROOT, 'LMSModuleService.js'), 'utf8');
const user = fs.readFileSync(path.join(ROOT, 'Userservice.js'), 'utf8');
ok('mergeObjects_ is defined once',
   /^function mergeObjects_\(/m.test(user) && !/^function mergeObjects_\(/m.test(lms));
ok('and it is the one that survives a null',
   /Object\.keys\(base \|\| \{\}\)/.test(user));

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
