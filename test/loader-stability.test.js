/* The loading bar must not change size while it is loading.
 *
 * Reported three times, and each report was about a different axis of the same
 * fault — a block sized by whichever of three rotating messages was on screen.
 *
 *   1. The bar MOVED (vertically): the h2 grew from one line to two and shoved
 *      the bar and the hint down. Fixed by reserving two lines of height.
 *   2. The bar RESTARTED: every renderRadarLoader began at 0%, and the simulator
 *      entry renders more than one in sequence. Fixed by carrying _radarPct.
 *   3. The bar SHRANK AND EXPANDED (horizontally): .completion-loading-text had
 *      max-width and no width, and .completion-loading-shell is a column flex
 *      with align-items:center — which makes a child shrink-to-fit its content.
 *      "Checking exam and placement status…" is 48 characters and hit the 420px
 *      clamp; "Preparing the level map…" is 24 and collapsed to about half.
 *      .completion-loading-bar is width:100% of that block.
 *
 * All three are the same shape: the container follows the text. These assert
 * that it cannot, on either axis. */
'use strict';
const fs = require('fs');
const C = fs.readFileSync(__dirname + '/../Styles.html', 'utf8');
const S = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
const Cs = C.replace(/\/\*[\s\S]*?\*\//g, '');
let fails = 0; const ok = (n, c, d) => { if (!c) fails++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c || !d ? '' : ' — ' + d)); };
const rule = (sel) => {
  const i = Cs.indexOf(sel + ' {');
  return i < 0 ? '' : Cs.slice(i, Cs.indexOf('}', i) + 1);
};

console.log('\nthe radar loader holds its size\n');

const text  = rule('.completion-loading-text');
const bar   = rule('.completion-loading-bar');
const h2    = rule('.completion-loading-text h2');
const shell = rule('.completion-loading-shell');

console.log('horizontally — the block does not follow the sentence:');
ok('the text block declares a width',   /width:\s*100%/.test(text), text.replace(/\s+/g, ' '));
ok('and still caps at 420px',           /max-width:\s*420px/.test(text));
// Without the width, align-items:center in a column flex shrink-to-fits it.
ok('the shell is still a centred column', /flex-direction:\s*column/.test(shell) &&
                                          /align-items:\s*center/.test(shell));
ok('the bar is a share of that block',  /width:\s*100%/.test(bar) && /max-width:\s*320px/.test(bar));
ok('and stays centred inside it',       /margin:\s*0 auto/.test(bar));

console.log('\nvertically — the heading reserves its second line:');
ok('two lines of room are held',        /min-height:\s*2\.7em/.test(h2));
ok('and the text still wraps into them',/overflow-wrap:\s*anywhere/.test(h2));
// display:flex here stopped the longest messages wrapping; grid centres and wraps.
ok('centred with grid, not flex',       /display:\s*grid/.test(h2) && !/display:\s*flex/.test(h2));

console.log('\nand the fill only ever advances:');
const loader = S.slice(S.indexOf('function renderRadarLoader'),
                       S.indexOf('function renderRadarLoader') + 3400);
ok('each tick closes a share of what is left',
   /pct = _radarPct = pct \+ \(90 - pct\) \* 0\.18;/.test(loader));
ok('a new loader starts where the last one was',
   /var pctStart = _radarPct;/.test(loader) && /style="width:' \+ pctStart \+ '%"/.test(loader));
ok('and an older loader cannot write to a newer bar',
   /if \(myGen !== _radarGen\) \{ clearInterval\(t\); return; \}/.test(loader));

console.log(fails ? ('\n' + fails + ' FAILING') : '\nall green');
process.exit(fails ? 1 : 0);
