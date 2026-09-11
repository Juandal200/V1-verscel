/* A pinned element is pinned to the screen only while nothing above it becomes
 * its frame.
 *
 * position: fixed is measured from the viewport UNLESS an ancestor has a
 * transform, filter, perspective, backdrop-filter, paint/layout containment, or a
 * will-change naming one of those. Then it is measured from that ancestor, and
 * "fixed" quietly means "absolute".
 *
 * An animation counts too, and keeps counting after it ends. A fill-mode of
 * forwards or both leaves the animation in effect, and the browser treats an
 * element with an in-effect transform animation as if it had will-change:
 * transform. The page fade-in on #contentArea did exactly that: 0.24s, fill
 * both, sliding in from translateY(10px). Every navigation left #contentArea as
 * the frame for every fixed element inside it, until the next navigation.
 *
 * On a phone that was the answer bar. Its left:0 and right:0 landed on the page
 * gutters (12px in from each edge) and its bottom offset was measured from the
 * bottom of the content, 28px above where it belonged — both visible in the
 * 8:59 screenshots, and reproduced in Chrome from the shipped rules.
 *
 * So this walks the chain from the bar up to the screen, as the markup builds it,
 * and fails if any link can frame a fixed descendant — statically or by
 * animation. Opacity cannot, which is why the fade is kept.
 */
const fs = require('fs');
/* Comment-stripped: the notes beside these rules name the very properties this
 * forbids, and a check that fails on its own documentation is the pattern this
 * suite keeps hitting. */
const ST = fs.readFileSync(__dirname + '/../Styles.html', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const S  = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
const IX = fs.readFileSync(__dirname + '/../Index.html', 'utf8');
let fails = 0;
const ok = (n, c, d) => { if (!c) fails++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c || d === undefined ? '' : '   ' + d)); };

console.log('--- the chain, read from the source rather than assumed ---');
/* If the markup moves, the list below is wrong, and these say so before the
 * checks further down go quietly green about a chain that no longer exists. */
ok('the bar is inside .sim-priority-side, inside .sim-cockpit',
   /<section class="sim-cockpit">[\s\S]{0,6000}<aside class="sim-priority-side">[\s\S]{0,6000}<article class="sim-readback-priority-card">/.test(S));
ok('the cockpit is written into #contentArea',
   /byId\('contentArea'\)\.innerHTML =\s*'<div class="sim-paused-banner">[^\n]*\n\s*'<section class="sim-cockpit">/.test(S));
const ixOrder = ['class="app-shell"', 'id="appScreen" class="screen"', '<main class="main">', 'id="contentArea" class="content-grid"']
  .map(function (t) { return IX.indexOf(t); });
ok('#contentArea sits in main.main, in #appScreen.screen, in .app-shell',
   ixOrder.every(function (p, i) { return p > 0 && (i === 0 || p > ixOrder[i - 1]); }), ixOrder.join(' '));

const CHAIN = ['html', 'body', '.app-shell', '#appScreen', '.screen', '.main', '#contentArea',
               '.content-grid', '.sim-cockpit', '.sim-priority-side'];
function targetsChain(sel) {
  if (/::/.test(sel)) return null;   // a pseudo-element frames nothing
  const last = sel.trim().split(/\s*[\s>+~]\s*/).filter(Boolean).pop() || '';
  return CHAIN.find(function (a) {
    if (/^[a-z]/.test(a)) return new RegExp('^' + a + '(?![\\w-])').test(last);
    return new RegExp('(^|[^\\w-])' + a.replace('.', '\\.') + '(?![\\w-])').test(last);
  }) || null;
}

// Every rule, innermost first, wherever it sits.
const rules = [];
(function walk(src) {
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(src))) rules.push({ sel: m[1].trim().replace(/\s+/g, ' '), body: m[2] });
})(ST);
const keyframes = {};
(function () {
  const re = /@keyframes\s+([\w-]+)\s*\{/g;
  let m;
  while ((m = re.exec(ST))) {
    let d = 1, i = m.index + m[0].length;
    while (d && i < ST.length) { if (ST[i] === '{') d++; else if (ST[i] === '}') d--; i++; }
    keyframes[m[1]] = ST.slice(m.index + m[0].length, i - 1);
  }
})();

const FRAMING = /(?:^|;|\s)(transform|perspective|filter|backdrop-filter|-webkit-backdrop-filter|contain|container-type|will-change)\s*:\s*([^;]+)/g;
function framingDecls(body) {
  const out = [];
  let m;
  FRAMING.lastIndex = 0;
  while ((m = FRAMING.exec(body))) {
    const prop = m[1], val = m[2].replace(/!important/, '').trim();
    if (/^(none|auto|normal|initial|unset)$/.test(val)) continue;
    if (prop === 'contain' && !/layout|paint|strict|content/.test(val)) continue;
    if (prop === 'will-change' && !/transform|perspective|filter/.test(val)) continue;
    out.push(prop + ': ' + val);
  }
  return out;
}

console.log('--- nothing in the chain frames a fixed element ---');
const staticHits = [], animHits = [];
rules.forEach(function (r) {
  r.sel.split(',').forEach(function (one) {
    const link = targetsChain(one);
    if (!link) return;
    framingDecls(r.body).forEach(function (d) { staticHits.push(one.trim() + ' { ' + d + ' }'); });
    const an = r.body.match(/animation(?:-name)?\s*:\s*([^;]+)/g) || [];
    an.forEach(function (decl) {
      decl.replace(/^animation(?:-name)?\s*:/, '').split(/[\s,]+/).forEach(function (tok) {
        if (!keyframes[tok]) return;
        const bad = keyframes[tok].match(/(?:^|[;{\s])(transform|perspective|filter|backdrop-filter)\s*:\s*(?!none\b)[^;}]+/g);
        if (bad) animHits.push(one.trim() + ' animates ' + tok + ': ' + bad.map(function (b) { return b.trim(); }).join(' | '));
      });
    });
  });
});
ok('no static transform, filter, perspective or containment on it', staticHits.length === 0,
   '\n        ' + staticHits.join('\n        '));
ok('and no animation on it moves or filters anything', animHits.length === 0,
   '\n        ' + animHits.join('\n        '));

/* The same thing done from script would pass every check above.
 *
 * Each style write is traced to what the variable holds. Two earlier versions
 * were wrong in opposite directions, and are the reason it is done this way:
 *
 *   - Looking for "contentArea" on the same line missed the navigation code,
 *     which holds the element as `ca` — ca.style.transform = … sailed through a
 *     check written to catch exactly that.
 *   - Treating every variable ever assigned the element as the element flagged
 *     `el.style.transform` in the install banner, a different `el` in a
 *     different function thirty thousand lines away.
 *
 * So: the nearest assignment above the write decides, and a function parameter
 * of the same name stops the search — that is a different variable, and not
 * ours to know. */
const JS_LINES = S.split('\n');
const PROPS = '(?:transform|webkitTransform|filter|perspective|willChange|contain)\\s*=';
const CSS_PROPS = 'setProperty\\(\\s*[\'"](?:transform|filter|perspective|will-change|contain)[\'"]';
const CHAIN_EL = /(?:byId|document\.getElementById)\(\s*['"]contentArea['"]\s*\)|document\.querySelector\(\s*['"]\.(?:sim-cockpit|sim-priority-side)['"]\s*\)/;
const DIRECT = new RegExp('(?:' + CHAIN_EL.source + ')\\.style\\.(?:' + PROPS + '|' + CSS_PROPS + ')');
const NAMED  = new RegExp('([\\w$]+)\\.style\\.(?:' + PROPS + '|' + CSS_PROPS + ')');
function holdsChainElement(name, from) {
  const n = name.replace(/\$/g, '\\$');
  const assign = new RegExp('(?:^|[^.\\w$])' + n + '\\s*=(?![=>])\\s*(.*)$');
  const param  = new RegExp('function\\s*[\\w$]*\\s*\\([^)]*(?:^|[^\\w$])' + n + '(?![\\w$])[^)]*\\)');
  for (let j = from; j >= 0; j--) {
    const a = JS_LINES[j].match(assign);
    if (a) return CHAIN_EL.test(a[1]);
    if (param.test(JS_LINES[j])) return false;
  }
  return false;
}
let examined = 0;
const jsHits = [];
JS_LINES.forEach(function (l, i) {
  if (DIRECT.test(l)) { examined++; jsHits.push(i + 1 + ': ' + l.trim()); return; }
  const m = l.match(NAMED);
  if (!m) return;
  examined++;
  if (holdsChainElement(m[1], i - 1)) jsHits.push(i + 1 + ': ' + l.trim());
});
console.log('    ' + examined + ' style writes examined');
ok('nor does any script set one on #contentArea or the cockpit', examined > 0 && jsHits.length === 0,
   '\n        ' + jsHits.map(function (l) { return l.slice(0, 120); }).join('\n        '));

console.log('--- the fade itself is still there ---');
/* The fix is to stop the fade from moving the page, not to stop it fading. */
ok('#contentArea.nav-in still runs contentReveal',
   /#contentArea\.nav-in\s*\{[^}]*animation:\s*contentReveal\b/.test(ST));
ok('and contentReveal still fades',
   !!keyframes.contentReveal && /opacity:\s*0/.test(keyframes.contentReveal) && /opacity:\s*1/.test(keyframes.contentReveal));

console.log(fails ? '\n' + fails + ' FAILING' : '\nAll fixed-frame assertions passed.');
process.exit(fails ? 1 : 0);
