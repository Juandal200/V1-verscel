/* Two globes, one geometry.
 *
 * The duel's loading screen draws the same world map as the boot screen, and it
 * does it from a second copy of the code — asked for deliberately, so that the
 * screen every session starts with was not put at risk to fill a two-second wait
 * inside a modal.
 *
 * A comment asking the two to stay in step would be worth nothing; this file is
 * the executable version of that request. It lifts the region between the
 * AERO-GEO-SHARED markers out of both files, strips comments and whitespace, and
 * compares what is left. Move a coastline vertex, change the tilt, add a
 * landmass in one file and this goes red.
 *
 * Comments are stripped rather than compared because the two files do not share
 * a language: LoadingScreen.html is commented in Spanish and Scripts.html is
 * read by english-only.test.js. Prose is allowed to differ. Code is not.
 *
 * WHY THE LENGTH ASSERTIONS ARE HERE
 *
 * The obvious way for this test to fail at its job is not a false alarm, it is
 * silence: an extractor that matches nothing compares an empty string with an
 * empty string and reports parity. Doing nothing and succeeding would be the
 * same observable. So the block is required to be there, to be long, and to
 * still contain the data it exists to protect.
 */
const fs = require('fs');
const LS = fs.readFileSync(__dirname + '/../LoadingScreen.html', 'utf8');
const S  = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
let fails = 0;
const ok = (n, c, d) => { if (!c) fails++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c || !d ? '' : '   ' + d)); };

const START = 'AERO-GEO-SHARED-START';
const END   = 'AERO-GEO-SHARED-END';

const count = (hay, needle) => hay.split(needle).length - 1;

function block(src) {
  const a = src.indexOf(START);
  const b = src.indexOf(END);
  if (a < 0 || b < 0 || b < a) return '';
  return src.slice(src.indexOf('\n', a) + 1, src.lastIndexOf('\n', b));
}

/* Comments out, then every run of whitespace out. Block comments first: the
 * coastline rows carry an inline one each, and taking line comments first would
 * leave their bodies behind. */
function code(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^[ \t]*\/\/.*$/gm, ' ')
    .replace(/\s+/g, '');
}

const bootBlock = block(LS);
const duelBlock = block(S);

console.log('--- the markers are there, once each ---');
ok('LoadingScreen.html opens the shared region exactly once', count(LS, START) === 1,
   'found ' + count(LS, START));
ok('and closes it exactly once', count(LS, END) === 1, 'found ' + count(LS, END));
ok('Scripts.html opens it exactly once', count(S, START) === 1, 'found ' + count(S, START));
ok('and closes it exactly once', count(S, END) === 1, 'found ' + count(S, END));

console.log('--- and the region is really the geometry ---');
ok('the boot block was found and is substantial', bootBlock.length > 6000,
   bootBlock.length + ' chars');
ok('the duel block was found and is substantial', duelBlock.length > 6000,
   duelBlock.length + ' chars');
ok('it still carries the coastlines', /Madagascar/.test(bootBlock) && /Madagascar/.test(duelBlock));
ok('the projection', /function runs\(/.test(bootBlock) && /function runs\(/.test(duelBlock));
ok('the orbit', /function orbitAt\(/.test(bootBlock) && /function orbitAt\(/.test(duelBlock));
ok('and the aircraft', /var PLANE =/.test(bootBlock) && /var PLANE =/.test(duelBlock));

console.log('--- the two are the same code ---');
const a = code(bootBlock), b = code(duelBlock);
let where = 'identical';
if (a !== b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  where = 'first difference at char ' + i + '\n         boot: ' +
          JSON.stringify(a.slice(Math.max(0, i - 30), i + 40)) + '\n         duel: ' +
          JSON.stringify(b.slice(Math.max(0, i - 30), i + 40));
}
ok('boot and duel geometry match, comments and whitespace aside', a === b, where);

console.log('--- and the copy does not collide with the original ---');
/* FLAG_SVG's bug: two elements with one id, and the second <use> silently draws
 * the first one's art. The boot loader owns these two names. */
const duelModule = (S.match(/var _duelGlobe = \(function \(\)[\s\S]*?\n  \}\(\)\);/) || [''])[0];
ok('the duel module was found', duelModule !== '');
ok("it does not reuse the boot loader's art id",
   duelModule !== '' && !/'aeroLsArt'|#aeroLsArt/.test(duelModule));
ok("nor its gradient id",
   duelModule !== '' && !/'aeroLsAtmo'|#aeroLsAtmo/.test(duelModule));
/* The duel copy has no gradient of its own to name: the atmosphere is 2.1 R
 * wide and this window is 0.57 R tall, so it was dropped rather than cropped.
 * Only the art id is shared ground, and it is the one <use> reaches for. */
ok('and it prefixes the one id it does have', /'gamDuelGlobeArt'/.test(duelModule));
ok('which is what its halo points at', /'#' \+ ART_ID/.test(duelModule));

console.log(fails ? '\n' + fails + ' FAILING' : '\nAll duel-globe-parity assertions passed.');
process.exit(fails ? 1 : 0);
