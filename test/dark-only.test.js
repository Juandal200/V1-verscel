/* Light mode is not offered, for now.
 *
 * Not deleted: 127 [data-theme="light"] rules stay in Styles.html and five test
 * suites assert against them. What is gone is every way to SELECT it — the boot
 * script that set the attribute before first paint, the top-bar button, the
 * avatar-menu item and toggleTheme itself. Turning it back on is restoring six
 * lines, not rewriting a stylesheet.
 *
 * The distinction matters because "eliminate for now" and "delete" are different
 * instructions, and the reversible reading is the one that keeps five suites
 * green.
 */
const fs = require('fs');
const S  = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
const I  = fs.readFileSync(__dirname + '/../Index.html',   'utf8');
const ST = fs.readFileSync(__dirname + '/../Styles.html',  'utf8');
let fails = 0;
const ok = (n, c, d) => { if (!c) fails++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c || !d ? '' : '   ' + d)); };

console.log('--- nothing can select the light theme ---');
/* Quote-agnostic, and run against source with the HTML comments stripped.
 *
 * The first version matched only the single-quoted form, so restoring the boot
 * script with double quotes slipped past it. The second forbade the string
 * anywhere — and the comment explaining why the boot script was removed contains
 * it, so the check failed on the very note that documents it. Seventh time a
 * comment has broken the check written beside it in this repository. */
const Ihtml = I.replace(/<!--[\s\S]*?-->/g, '');
ok('the boot script no longer sets data-theme',
   !/setAttribute\(\s*['"]data-theme['"]/.test(Ihtml) && !/data-theme/.test(Ihtml));
ok('no toggle button in the top bar',   !/themeToggleBtn/.test(I) && !/themeToggleBtn/.test(S));
ok('no toggleTheme function',           !/toggleTheme/.test(S));
ok('and nothing reads the stored preference',
   !/aerocomms-theme/.test(S) && !/aerocomms-theme/.test(I));
/* setAttribute is the only way in. If a future change reads the media query
 * instead, that is a second door and this is where it gets noticed. */
ok('and it does not follow the OS setting either',
   !/prefers-color-scheme/.test(I) && !/prefers-color-scheme/.test(S));

console.log('--- but the stylesheet is untouched, so it can come back ---');
const rules = (ST.match(/\[data-theme="light"\]/g) || []).length;
ok('the light rules are still there', rules >= 120, String(rules));

console.log('--- and the icons that only served it are gone ---');
/* An icon drawn and never used is dead weight, and typography.test.js counts
 * exactly that. They come back with the toggle if it does. */
ok('no sun icon',  !/\bsun:\s*'/.test(S));
ok('no moon icon', !/\bmoon:\s*'/.test(S));

console.log('--- every script block still parses ---');
/* build.js does not parse JavaScript. Removing the icons cut a multi-line entry
 * in half and left two orphan continuation lines; the build reported success and
 * the bundle was broken. A suite that lifts and runs code caught it, which is
 * luck rather than design — so it is checked here on purpose. */
const blocks = [...S.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
ok('there are script blocks to check', blocks.length >= 1, String(blocks.length));
let broken = [];
blocks.forEach(function (b, i) {
  try { new Function(b); } catch (e) { broken.push('block ' + i + ': ' + e.message); }
});
ok('all of them parse', broken.length === 0, broken.join(' | '));

console.log(fails ? '\n' + fails + ' FAILING' : '\nAll dark-only assertions passed.');
process.exit(fails ? 1 : 0);
