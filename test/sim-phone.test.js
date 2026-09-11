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
  /* Selectors compared EXACTLY, not by regex.
   *
   * Two earlier versions of this escaped an already-escaped selector and matched
   * nothing. And a regex for ".sim-readback-priority-card" also matches the tail
   * of "body.sim-focus-mode .sim-readback-priority-card", so the unscoped rule
   * would have read the scoped rule's value and reported it as its own. */
  const want = selector.trim();
  const out = [];
  const re = /@media\s*\(\s*max-width:\s*768px\s*\)\s*\{/g;
  let m;
  while ((m = re.exec(ST))) {
    let d = 1, i = m.index + m[0].length;
    while (d && i < ST.length) { if (ST[i] === '{') d++; else if (ST[i] === '}') d--; i++; }
    const block = ST.slice(m.index + m[0].length, i);
    const rr = /([^{}]+)\{([^}]*)\}/g;
    let r;
    while ((r = rr.exec(block))) {
      const sels = r[1].split(',').map(function (x) { return x.trim().replace(/\s+/g, ' '); });
      if (sels.indexOf(want) !== -1) out.push(r[2]);
    }
  }
  return out;
}

function lastValue(selector, prop) {
  /* Whitespace collapsed first: a calc() wrapped across two lines is one
   * declaration, and `.` does not cross a newline — so the multi-line
   * padding-bottom read as absent until this was added. */
  const decls = phoneRules(selector).join(';').split(';')
    .map(function (d) { return d.replace(/\s+/g, ' ').trim(); });
  let found = null;
  decls.forEach(function (d) {
    const mm = d.match(new RegExp('^' + prop + '\\s*:\\s*(.+)$'));
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

console.log('--- and it does not reserve room for a bar that is not there ---');
/* The simulator turns focus mode on as it renders, and focus mode hides the
 * mobile bottom navigation. The pinned bar was still offset 50px above the
 * bottom edge for it — an empty strip under "Practice again" while the bottom of
 * the ATC card was sliced off by the bar's top edge.
 *
 * Scoped to focus mode, not removed: the Focus button can turn it off, and then
 * the navigation really is there. */
ok('focus mode hides the bottom navigation',
   /body\.sim-focus-mode\s+\.mobile-bottom-nav[^{]*\{[^}]*display:\s*none/.test(ST));
ok('and the simulator enables focus mode as it renders',
   /renderScenarioStageImmersive[\s\S]{0,200}enableSimulatorFocusMode\(\)/.test(S));

const focusBottom = lastValue('body.sim-focus-mode .sim-readback-priority-card', 'bottom');
ok('in focus mode the bar sits on the bottom edge', !!focusBottom, 'no rule');
ok('with no phantom 50px',
   !!focusBottom && !/\b50px/.test(focusBottom), String(focusBottom));
ok('but the safe area is still respected',
   !!focusBottom && /safe-area-inset-bottom/.test(focusBottom));

/* The unscoped rule keeps the 50px, for when Focus is switched off. */
const plainBottom = lastValue('.sim-readback-priority-card', 'bottom');
ok('outside focus mode the navigation is still allowed for',
   !!plainBottom && /\b50px/.test(plainBottom), String(plainBottom));

const focusPad = lastValue('body.sim-focus-mode .sim-cockpit', 'padding-bottom');
/* \b50px, not 50px. The fallback in var(--answer-h, 150px) CONTAINS the
 * substring "50px", so a plain search reported a phantom reserve that had
 * already been removed. */
ok('and the scroll reserve drops the same 50px',
   !!focusPad && !/\b50px/.test(focusPad), String(focusPad));
ok('while still reserving room for the bar itself',
   !!focusPad && /--answer-h/.test(focusPad));

console.log('--- Back moves into the header, and the altitude fits ---');
/* The app-wide Back is a full row above the cockpit — 68px on a phone, which is
 * the difference between the altitude fitting above the pinned bar and sitting
 * behind it. The cockpit carries its own Back, calling the same function. */
ok('the header carries a Back',
   /<div class="sim-cockpit-header">'[\s\S]{0,1500}class="btn secondary sim-header-back" onclick="goSmartBack\(\)"/.test(S));
ok('and it is the same exit the row uses',  /btn\.onclick = goSmartBack;/.test(S));
ok('the icon it asks for is drawn',          /^\s{4}back:\s+'</m.test(S));
ok('on a phone in focus mode it is shown',
   /^inline-flex/.test(lastValue('body.sim-focus-mode .sim-cockpit-header .sim-header-back', 'display') || ''));
const hideRow = lastValue('body.sim-focus-mode #contentArea:has(> .sim-cockpit) > #globalSmartBackButton', 'display');
ok('and the row is hidden only while the cockpit is on screen', /^none/.test(hideRow || ''), String(hideRow));
/* Not on focus mode alone. renderScenarioStageImmersive turns focus mode on
 * BEFORE it knows there is a scenario, and on failure draws an error panel with
 * focus mode still on — a rule keyed on focus mode alone would take Back away
 * from exactly that panel. */
ok('because focus mode is on before the cockpit exists',
   /enableSimulatorFocusMode\(\);[\s\S]{0,400}showContentError\('No scenarios available/.test(S));
const offPhone = ST.replace(/@media[^{]*\{(?:[^{}]|\{[^}]*\})*\}/g, '');
ok('off the phone it is not shown', /\.sim-header-back\s*\{[^}]*display:\s*none/.test(offPhone));

const altDisplay = lastValue('.sim-instrument--solo', 'display');
ok('the altitude is one row on a phone',    /^grid\b/.test(altDisplay || ''), String(altDisplay));
/* Ground phases hide the altitude with an inline display:none on the ROW, and
 * only an !important display on the row could beat that. */
ok('ground phases still hide it on the row',
   /card\.closest\('\.sim-instruments-row'\)[\s\S]{0,160}\.style\.display = on \? '' : 'none'/.test(S));
ok('and no phone rule forces the row visible',
   !/!important/.test(lastValue('.sim-instruments-row', 'display') || ''));

/* The cockpit's height subtracted 128px — the top bar and the bottom
 * navigation — and focus mode hides the navigation. */
const focusMax = lastValue('body.sim-focus-mode .sim-cockpit', 'max-height');
ok('in focus mode the cockpit stops subtracting the hidden navigation',
   !!focusMax && !/\b128px/.test(focusMax), String(focusMax));
ok('but still subtracts the top bar and both safe areas',
   !!focusMax && /\b78px/.test(focusMax) && /safe-area-inset-top/.test(focusMax) &&
   /safe-area-inset-bottom/.test(focusMax), String(focusMax));

console.log('--- with a verdict, the bar is a result, not an input ---');
/* Once marked, the read-back is locked until Practice again redraws the card, so
 * Speak has nothing to speak into and the verdict is what matters. The bar was
 * laid out as an input regardless — Speak, a two-line box, two stacked buttons,
 * then the verdict in heading type — and reached 426px, half the screen, over
 * the clearance. */
ok('the verdict marks the card as a result, where the answer is locked',
   /input\.disabled = true;[\s\S]{0,1200}\.sim-readback-priority-card'\)[\s\S]{0,80}classList\.add\('has-verdict'\)/.test(S));
/* Not in setImmersiveFeedback: that also carries "ATC transmission playing" and
 * a dozen other messages that are not a verdict. */
ok('and not for every message in the verdict panel',
   !/function setImmersiveFeedback[\s\S]{0,700}has-verdict/.test(S));
ok('Practice again redraws the card, which is what takes it off',
   /function retryCurrentScenario\(\)[\s\S]{0,300}renderScenarioStageImmersive\(\)/.test(S));
const RES = '.sim-readback-priority-card.has-verdict ';
ok('Speak goes while the answer is locked',
   /^none\b/.test(lastValue(RES + '#simMicBtn', 'display') || ''));
ok('what was said shrinks to one line',
   /^40px/.test(lastValue(RES + '.sim-readback-priority-input', 'max-height') || ''));
ok('Practice again and Next share a row',
   /^row\b/.test(lastValue(RES + '.sim-action-row', 'flex-direction') || ''));
ok('the verdict and the score share a line',
   /^flex\b/.test(lastValue(RES + '.sim-feedback-box', 'display') || ''));
ok('none of it reaches the desktop', !/has-verdict/.test(offPhone));

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
