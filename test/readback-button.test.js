/* "Evaluating…" for thirty seconds after the score was on screen.
 *
 * A student sent a read-back, the verdict rendered in about two seconds, and the
 * Send button stayed disabled and labelled "Evaluating…" until a thirty-second
 * timer let it go. Nothing was broken. The screen just said it was, for
 * twenty-eight seconds, immediately after telling them they were right.
 *
 * That timer was the ONLY thing that reset it — the branch that renders the
 * verdict never did — and when it fired it got the button wrong twice over:
 *
 *   it looked the button up as `.big-action`, the first element in the document
 *   with that class, and the verdict renderer fills #simActionRow with more
 *   .big-action buttons a few lines earlier;
 *   and it restored the label "Send read-back" onto a button whose label has
 *   been "Send" since it was drawn.
 *
 * The reset runs here for real, against a document laid out the way it is at the
 * moment the verdict appears. */
const fs = require('fs');
const vm = require('vm');
const S = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');

/* ── the two real functions, lifted ───────────────────────────────────────── */
function grab(sig) {
  const i = S.indexOf(sig);
  if (i < 0) throw new Error('not found: ' + sig);
  let d = 0;
  for (let k = S.indexOf('{', i); k < S.length; k++) {
    if (S[k] === '{') d++;
    else if (S[k] === '}') { d--; if (!d) return S.slice(i, k + 1); }
  }
}
const SRC = [grab('function _sendReadbackBtn()'), grab('function _resetSendReadbackBtn()')].join('\n');

/* ── the DOM as it stands when the verdict lands ──────────────────────────── */
function button(id, cls, label, onclick) {
  return { id, className: cls, textContent: label, disabled: false, _a: onclick ? { onclick } : {},
           setAttribute(k, v) { this._a[k] = v; },
           getAttribute(k) { return k in this._a ? this._a[k] : null; } };
}
function docWith(nodes) {
  const matches = (n, sel) => {
    if (sel === '.big-action') return /\bbig-action\b/.test(n.className);
    const m = sel.match(/^\.big-action\[onclick\*="(.+)"\]$/);
    return m ? /\bbig-action\b/.test(n.className) && String(n._a.onclick||'').includes(m[1]) : false;
  };
  return {
    getElementById: id => nodes.find(n => n.id === id) || null,
    querySelector: sel => nodes.find(n => matches(n, sel)) || null,
  };
}
function reset(nodes) {
  const ctx = vm.createContext({ document: docWith(nodes) });
  vm.runInContext(SRC + '\n_resetSendReadbackBtn();', ctx);
}

console.log('--- the verdict gives the button back ---');
/* Document order at that moment: the Send button is drawn at line 8865 and
 * #simActionRow at 8876, and by the time the reset runs the row has been filled
 * with a "Next exercise" button that also carries .big-action. */
const send = button('simSendReadbackBtn', 'btn primary big-action', 'Evaluating…', 'immersiveSendReadback()');
const next = button('', 'btn primary big-action', 'Next exercise', 'goToNextScenario()');
reset([send, next]);
ok('the send button is enabled again',   send.disabled === false);
ok('and carries its own label',          send.textContent === 'Send');
ok('the next-exercise button is untouched',
   next.textContent === 'Next exercise' && next.disabled === false);

console.log('--- and it is the right button even when the row came first ---');
// The lookup must not depend on which .big-action the browser reaches first.
const first = button('', 'btn primary big-action', 'Saving…', 'nothing()');
const late  = button('simSendReadbackBtn', 'btn primary big-action', 'Evaluating…', 'immersiveSendReadback()');
reset([first, late]);
ok('the send button is still the one that is reset', late.textContent === 'Send' && !late.disabled);
ok('and the earlier one is left alone',  first.textContent === 'Saving…');

console.log('--- the label restored is the label it had ---');
// immersiveSendReadback stashes it before overwriting, so a future rename of the
// button in markup cannot desynchronise from a literal buried in the reset.
const renamed = button('simSendReadbackBtn', 'big-action', 'Evaluating…', 'immersiveSendReadback()');
renamed.setAttribute('data-idle-label', 'Transmit');
reset([renamed]);
ok('a remembered label wins over the default', renamed.textContent === 'Transmit');
ok('the send path remembers it before overwriting',
   /if \(!sendBtn\.getAttribute\('data-idle-label'\)\) \{\s*\n\s*sendBtn\.setAttribute\('data-idle-label', sendBtn\.textContent\);/.test(S));
ok('and never restores the old wrong literal', !/'Send read-back'/.test(S));

console.log('--- a missing button is not an error ---');
reset([button('', 'btn secondary', 'Retry', 'retryCurrentScenario()')]);
ok('nothing throws when there is no send button', true);

console.log('--- both halves look it up the same way ---');
const code = strip(S);
ok('there is one lookup',                /function _sendReadbackBtn\(\) \{/.test(code));
ok('the send path uses it',              /var sendBtn = _sendReadbackBtn\(\);/.test(code));
ok('the reset path uses it',             /var btn = _sendReadbackBtn\(\);/.test(code));
// The bare .big-action lookup is what let the two disagree about which element
// they meant. Neither of them may use it again.
ok('and neither reaches for a bare .big-action',
   !/document\.querySelector\('\.big-action'\)/.test(code));

console.log('--- the verdict calls it, not only the timer ---');
ok('the safety net is still armed',
   /setTimeout\(function\(\) \{\s*\n\s*_resetSendReadbackBtn\(\);\s*\n\s*\}, 30000\);/.test(code));
// It must be called where the verdict is painted, not merely somewhere in the file.
const verdictTail = code.slice(code.indexOf("setImmersiveFeedback(html, ok ? 'success' : 'danger', true);"));
ok('and the verdict branch calls it too',
   /_resetSendReadbackBtn\(\);/.test(verdictTail.slice(0, 400)));
ok('before it locks the input',
   verdictTail.indexOf('_resetSendReadbackBtn();') <
   verdictTail.indexOf('if (input) input.disabled = true;'));
ok('so the reset has more than one caller',
   (code.match(/_resetSendReadbackBtn\(\)/g) || []).length >= 3);

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
