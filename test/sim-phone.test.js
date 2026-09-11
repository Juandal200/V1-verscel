/* The simulator on a phone: the pinned answer bar must not cover the exercise.
 *
 * Everything the student acts with is inside one position:fixed bar at the bottom
 * — the read-back box, Speak, Practice again, the verdict and the rating widget.
 * It had no height ceiling, so once an attempt was marked it grew past the
 * viewport and covered the ATC clearance and the Climb/Descend controls. Fixed
 * elements cannot be scrolled clear, so there was no way to reach them.
 *
 * And the rule meant to keep the empty verdict panel out of that bar was
 * `.sim-feedback-box:empty` — :empty means no children AND no text, and the box
 * ships with placeholder text in it. It never matched once.
 */
const fs = require('fs');
/* Comment-stripped, for two reasons. The rule that explains :empty now quotes
 * it, so a check forbidding the string fails on the note documenting it — the
 * eighth time a comment has broken a check beside it here. And the selector
 * matcher below anchors on the previous rule's closing brace, which a comment
 * sitting between two rules hides. */
const ST_RAW = fs.readFileSync(__dirname + '/../Styles.html', 'utf8');
const ST = ST_RAW.replace(/\/\*[\s\S]*?\*\//g, '');
const S  = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
let fails = 0;
const ok = (n, c, d) => { if (!c) fails++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c || !d ? '' : '   ' + d)); };

/* The declarations that actually win, in source order, for one selector inside
 * the phone breakpoint. Reading the LAST one is the point: this whole screen is
 * decided by order and !important, and picking the first match is how a rule
 * gets "fixed" somewhere it never applied. */
function phoneRules(selector) {
  const out = [];
  const re = /@media\s*\(\s*max-width:\s*768px\s*\)\s*\{/g;
  let m;
  while ((m = re.exec(ST))) {
    let d = 1, i = m.index + m[0].length;
    while (d && i < ST.length) { if (ST[i] === '{') d++; else if (ST[i] === '}') d--; i++; }
    const block = ST.slice(m.index + m[0].length, i);
    /* Escaped ONCE. The first version took an already-escaped selector and
     * escaped it again, so `\.sim-` became `\\.sim-` and matched nothing — five
     * assertions failed against correct CSS. */
    const rr = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'g');
    /* r[1], not r[2]: dropping the prefix group moved the body to the first
     * capture, and pushing undefined made six rules look like none. */
    let r; while ((r = rr.exec(block))) out.push(r[1]);
  }
  return out;
}
function lastValue(selector, prop) {
  const decls = phoneRules(selector).join(';').split(';');
  let found = null;
  decls.forEach(function (d) {
    const mm = d.match(new RegExp('^\\s*' + prop + '\\s*:\\s*(.+)$'));
    if (mm) found = mm[1].trim();
  });
  return found;
}

console.log('--- the empty verdict panel is actually hidden ---');
ok('the markup carries the is-empty class',
   /id="simFeedbackBox" class="sim-feedback-box is-empty"/.test(S));
/* :empty cannot match an element with text in it. */
ok('and the phone rule no longer uses :empty', !/\.sim-feedback-box:empty/.test(ST));
ok('it targets the class instead',              /\.sim-feedback-box\.is-empty\s*\{/.test(ST));
ok('and hides it',
   /\.sim-feedback-box\.is-empty\s*\{[^}]*display:\s*none\s*!important/.test(ST));

console.log('--- the pinned bar cannot cover the exercise ---');
const mh = lastValue('.sim-readback-priority-card', 'max-height');
ok('it has a maximum height',        !!mh, 'none');
ok('and it is at most half the screen',
   !!mh && /^([1-4]?\d|50)vh/.test(mh.replace(/\s*!important/, '')), String(mh));
/* lastValue strips the property name, so the value here is "auto !important" —
 * matching against "overflow-y: auto" looked for a name that had already been
 * removed. */
ok('what does not fit scrolls inside it',
   /^auto\b/.test(lastValue('.sim-readback-priority-card', 'overflow-y') || ''));

console.log('--- and it hides what it covers ---');
/* An overlay is opaque or it is not an overlay. --panel is rgba(18,18,18,0.97):
 * fine for a card in the flow, wrong for something fixed over the content. */
const bg = lastValue('.sim-readback-priority-card', 'background');
ok('the winning background is set',  !!bg, 'none');
ok('and it is not the translucent panel token',
   !!bg && !/--panel\b/.test(bg), String(bg));
ok('--panel really is translucent',  /--panel:\s*rgba\([^)]*0\.9\d\)/.test(ST));
ok('--bg is a solid colour',         /--bg:\s*#[0-9a-f]{6}\s*;/i.test(ST));

console.log('--- and none of it reaches the desktop ---');
/* Every one of these lives inside the phone breakpoint. A max-height on the
 * desktop card would clip the feedback it is supposed to show. */
const desktop = ST.replace(/@media[^{]*\{(?:[^{}]|\{[^}]*\})*\}/g, '');
ok('no max-height outside a media query',
   !/\.sim-readback-priority-card[^{}]*\{[^}]*max-height/.test(desktop));
ok('no overflow-y either',
   !/\.sim-readback-priority-card[^{}]*\{[^}]*overflow-y/.test(desktop));

console.log(fails ? '\n' + fails + ' FAILING' : '\nAll sim-phone assertions passed.');
process.exit(fails ? 1 : 0);
