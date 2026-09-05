/* Everything that can be checked without a browser, a phone or a human.
 * Run before every push: node test/run-all.js */
const { execFileSync } = require('child_process');
const suites = ['audio-cache.test.js', 'exam-accent.test.js', 'server-contract.test.js',
                'speed-ramp.test.js', 'exam-audio-cache.test.js', 'gas-proxy.test.js', 'sim-teardown.test.js', 'exam-sitting.test.js', 'exam-regressions.test.js', 'palette.test.js', 'result-privacy.test.js', 'unheard-sitting.test.js', 'results-paywall.test.js', 'attempt-counting.test.js', 'locked-history.test.js', 'plan-coherence.test.js', 'theme-coherence.test.js', 'route-flow.test.js', 'single-source.test.js', 'english-only.test.js', 'no-duplicate-functions.test.js', 'typography.test.js', 'design-system.test.js'];
let bad = 0;
for (const s of suites) {
  try { execFileSync(process.execPath, [__dirname + '/' + s], { stdio: 'pipe' });
        console.log('  PASS  ' + s); }
  catch (e) { bad++; console.log('  FAIL  ' + s + '\n' + (e.stdout || '').toString()); }
}
console.log(bad ? '\n' + bad + ' suite(s) failing' : '\nall suites green');
process.exit(bad ? 1 : 0);
