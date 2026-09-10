/* A verdict the student never asked for, and a badge that never stopped loading.
 *
 * Two things reported from a live route on 2026-09-09.
 *
 * ONE. Pressing Enter while the microphone is recording is meant to stop it and
 * wait: the transcript has to arrive before there is anything to send. That
 * request was recorded in _sendAfterTranscript and cleared in exactly one place —
 * _simOnTranscript, on the success path. The recorder has five ways to finish
 * without ever reaching it: silence, an echo, no API key, a Whisper error, a
 * network failure. So the flag stayed armed, and the next transcript to arrive —
 * possibly a phase later, after Practice again had rebuilt the card — submitted
 * itself the instant it landed. The student saw an incorrect verdict on an answer
 * they were still writing.
 *
 * The silence gate did not create that. It made it the common case, because
 * silence is common and it added two more exits that deliver nothing.
 *
 * TWO. The accent badge was written only when a voice resolved, so any path that
 * never got there left "loading…" beside the Replay button for the whole phase.
 *
 * Both run here for real, lifted from source. */
const fs = require('fs');
const S = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
const code = strip(S);

function grab(sig) {
  const i = S.indexOf(sig);
  if (i < 0) throw new Error('not found: ' + sig);
  let d = 0;
  for (let k = S.indexOf('{', i); k < S.length; k++) {
    if (S[k] === '{') d++;
    else if (S[k] === '}') { d--; if (!d) return S.slice(i, k + 1); }
  }
}

/* ── the pending-send machinery, executed ─────────────────────────────────── */
function sim(recording) {
  // State the lifted code writes into. It lives in an object because the
  // functions run inside a new Function, which cannot see this closure.
  const st = { sent: [], stopped: false };
  const stubs = {
    byId: () => ({ textContent: '' }),
    immersiveSendReadback() { st.sent.push('submit'); },
    _simSetStatus() {},
    window: {
      isMicRecording: () => recording,
      startMicInput() { st.stopped = true; },
    },
  };
  const src = [
    'var _sendAfterTranscript = false;',
    grab('function _simSubmitReadback()'),
    grab('window._simOnTranscript = function()'),
    grab('window._micPhase = function (textareaId, phase)'),
    'return { enter: _simSubmitReadback, transcript: window._simOnTranscript,',
    '         phase: window._micPhase, armed: function(){ return _sendAfterTranscript; },',
    '         sent: st.sent, stopped: function(){ return st.stopped; } };',
  ].join('\n');
  return new Function(...Object.keys(stubs), 'st', src)(...Object.values(stubs), st);
}

console.log('--- Enter while recording still waits for the transcript ---');
let a = sim(true);
a.enter();
ok('it does not submit straight away',  a.sent.length === 0);
ok('it stops the recorder',             a.stopped() === true);
ok('and records that a send is pending', a.armed() === true);
a.phase('pilotReadback', 'done');
a.transcript();
ok('the transcript then submits it',    a.sent.length === 1);
ok('and the request is spent',          a.armed() === false);
a.transcript();
ok('a second transcript does not submit again', a.sent.length === 1);

console.log('--- a take that delivers nothing cancels the request ---');
// The reported bug: silence, then the NEXT answer submitted itself.
let b = sim(true);
b.enter();
ok('the request is armed',              b.armed() === true);
b.phase('pilotReadback', '');           // silence, echo, no key, error, network
ok('and the empty take disarms it',     b.armed() === false);
b.transcript();
ok('so nothing is submitted',           b.sent.length === 0);
// ...and the student can still send, by asking again.
b.phase('pilotReadback', 'done');
b.transcript();
ok('a later transcript alone still does not submit', b.sent.length === 0);

console.log('--- Enter with the microphone idle submits directly ---');
let c = sim(false);
c.enter();
ok('no waiting, no recorder',           c.sent.length === 1 && c.stopped() === false);

console.log('--- and no other screen can disarm it ---');
let d = sim(true);
d.enter();
d.phase('examReadbackInput', '');
ok('a different textarea is ignored',   d.armed() === true);

console.log('--- the recorder reports which kind of ending it was ---');
ok('a delivered transcript is "done"',  /_emitPhase\(textareaId, 'done'\)/.test(code));
ok('and every other exit is empty',
   (code.match(/_emitPhase\(textareaId, ''\)/g) || []).length >= 4);
// If 'done' were emitted before the transcript branch, every ending would look
// like a delivery and the flag would never clear.
const then = code.slice(code.indexOf(".then(function(data) {"));
ok('"done" is emitted inside the success branch, not above it',
   then.indexOf("_emitPhase(textareaId, 'done')") > then.indexOf('if (data.ok && data.transcript)'));

/* ── the accent badge, executed ───────────────────────────────────────────── */
console.log('--- the flag is drawn from the scenario, not from the audio ---');
function badge(country) {
  const stubs = {
    getCountryUi: c => (String(c).toUpperCase() === 'INDIA'
      ? { code: 'in', accent: 'Indian ATC', label: 'India' }
      : { code: '', accent: 'International ATC', label: 'Unknown country' }),
    getFlagHtml: (c, cls) => '<span class="' + cls + '">[' + c + ']</span>',
    safeText: v => String(v == null ? '' : v).replace(/[<>&]/g, ''),
  };
  return new Function(...Object.keys(stubs),
    grab('function _atcAccentBadgeHtml(country)') + '\nreturn _atcAccentBadgeHtml;'
  )(...Object.values(stubs))(country);
}
const ind = badge('INDIA');
ok('a known country gets its flag',   /flag-badge/.test(ind) && /\[INDIA\]/.test(ind));
ok('and the accent without the word ATC', />Indian</.test(ind) && !/Indian ATC/.test(ind));
ok('an unknown country still renders',    /flag-badge/.test(badge('')));
ok('with a readable accent rather than nothing', />International</.test(badge('')));

console.log('--- and the card draws it at render time ---');
const card = code.slice(code.indexOf('sim-radio-card'), code.indexOf('sim-readback-priority-card'));
ok('the badge is built by the helper',  /_atcAccentBadgeHtml\(scenario\.country\)/.test(card));
ok('and never ships the placeholder',   !/loading…/.test(card) && !/>loading/.test(card));
// One implementation, two callers — the two-copies rule applied before editing.
ok('the voice path uses the same helper',
   (code.match(/_atcAccentBadgeHtml\(/g) || []).length === 3);
// A caller with no country used to replace the flag with the word "Text only".
ok('a caller with no country falls back to the scenario',
   /if \(!country\) \{\s*\n\s*try \{ var _sc = getCurrentScenarioSim\(\); country = _sc && _sc\.country; \}/.test(code));

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
