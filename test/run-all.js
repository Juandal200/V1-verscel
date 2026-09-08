/* Everything that can be checked without a browser, a phone or a human.
 * Run before every push: npm test
 *
 * The suite list used to be written out by hand here, and it drifted: seven suites in
 * tests/ — grader, audioQueue, ttsDigits, feedbackCard, autoplayUx, aircraftTypePrefix
 * and telephonyDesignators — were never added to it, so nothing ran them. They all
 * passed when finally invoked, which is the point: a test nobody runs tells you
 * nothing, and it fails silently by never being called.
 *
 * So the list is discovered rather than remembered. Anything named *.test.js in either
 * directory runs. Adding a suite is now writing the file. */
const { execFileSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const DIRS = [__dirname, path.join(__dirname, '..', 'tests')];

const suites = DIRS.flatMap(dir => {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.test.js'))
    .sort()
    .map(f => ({ label: path.relative(path.join(__dirname, '..'), path.join(dir, f)).replace(/\\/g, '/'),
                 file:  path.join(dir, f) }));
});

let bad = 0;
for (const s of suites) {
  try { execFileSync(process.execPath, [s.file], { stdio: 'pipe' });
        console.log('  PASS  ' + s.label); }
  catch (e) { bad++; console.log('  FAIL  ' + s.label + '\n' + (e.stdout || '').toString()); }
}
console.log(bad ? '\n' + bad + ' suite(s) failing of ' + suites.length
                : '\nall ' + suites.length + ' suites green');
process.exit(bad ? 1 : 0);
