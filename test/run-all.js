/* Everything that can be checked without a browser, a phone or a human.
 * Run before every push: npm test
 *
 * The suite list used to be written out by hand here, and it drifted: seven suites
 * were never added to it, so nothing ran them. They all passed when finally
 * invoked, which is the point — a test nobody runs tells you nothing, and it fails
 * silently by never being called.
 *
 * So the list is discovered rather than remembered: anything named *.test.js in
 * this directory runs, and adding a suite is writing the file.
 *
 * Those seven lived in a second directory, tests/, and being in a directory of
 * their own let them keep a different method: each pasted a copy of the functions
 * under test into itself instead of importing anything. Four of the copies had
 * drifted from the product and every one of the seven was green. They lift from
 * source now and they live here, so there is one directory and one method. */
const { execFileSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const DIRS = [__dirname];

const suites = DIRS.flatMap(dir => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.test.js'))
    .sort()
    .map(f => ({ label: path.relative(path.join(__dirname, '..'), path.join(dir, f)).replace(/\\/g, '/'),
                 file:  path.join(dir, f) }));
});

/* One directory, and something that says so out loud.
 *
 * Narrowing DIRS re-creates the condition this file was written to fix: a suite
 * dropped into tests/ would be picked up by nobody and fail silently by never
 * being called. Discovery cannot find a directory it no longer looks in, so the
 * check has to be explicit. */
const STRAY = path.join(__dirname, '..', 'tests');
if (fs.existsSync(STRAY)) {
  const orphans = fs.readdirSync(STRAY).filter(f => f.endsWith('.test.js'));
  if (orphans.length) {
    console.log('  FAIL  ' + orphans.length + ' suite(s) are in tests/, which nothing runs:');
    orphans.forEach(f => console.log('          tests/' + f));
    console.log('        The two directories were merged — move them to test/.');
    process.exit(1);
  }
}

let bad = 0;
for (const s of suites) {
  try { execFileSync(process.execPath, [s.file], { stdio: 'pipe' });
        console.log('  PASS  ' + s.label); }
  catch (e) { bad++; console.log('  FAIL  ' + s.label + '\n' + (e.stdout || '').toString()); }
}
console.log(bad ? '\n' + bad + ' suite(s) failing of ' + suites.length
                : '\nall ' + suites.length + ' suites green');
process.exit(bad ? 1 : 0);
