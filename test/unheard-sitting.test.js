/* An examination that heard nothing must not award a band.
 *
 * A real sitting was marked 1 after the candidate answered every question aloud: no
 * recording reached the server, 24 of 26 answers were filed as "(no answer given)",
 * and the grader correctly concluded that someone who said nothing to everything is a
 * band 1. The grading was right; agreeing to grade at all was not. */
const fs = require('fs');
const S  = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};

/* Run the real counter against real-shaped histories. */
const src = S.slice(S.indexOf('  function _teaAnsweredCount()'), S.indexOf('  function _teaShowUnheard'));
const mk  = h => new Function('_t', src + 'return _teaAnsweredCount();')({ history: h });
const user = c => ({ role: 'user', content: c });
const exam = c => ({ role: 'assistant', content: c });

console.log('--- counting what actually arrived ---');
let r = mk([exam('Q1'), user('(no answer given)'), exam('Q2'), user('(no answer given)')]);
ok('a silent sitting counts no answers', r.answered === 0 && r.asked === 2);

r = mk([exam('Q1'), user('I fly the A320 out of Bogota'), exam('Q2'), user('(no answer given)')]);
ok('a spoken answer is counted',         r.answered === 1 && r.asked === 2);

/* This fed the counter '[replay report] 2 replays used' — a string this product
 * has never emitted. _scFinish pushes _teaReplayReport(), which returns
 * "[EXAM_COMPLETE | replays: N of 12 items heard twice (…) | COMPREHENSION_CAP: N]".
 * The test was green about a marker that does not exist, which is why the hole it
 * was written to guard survived and a pilot was marked band 1. Both forms are
 * asserted now, and the real one is taken verbatim from a saved sitting. */
const MARKER = '[EXAM_COMPLETE | replays: 2 of 12 items heard twice (part_2a_1, part_2a_3) ' +
               '| COMPREHENSION_CAP: 6 (no cap)]';
r = mk([exam('Q1'), user('(no answer given)'), user(MARKER)]);
ok('the end-of-exam marker is not an answer', r.asked === 1 && r.answered === 0);

r = mk([exam('Q1'), user('(no answer given)'), user('[replay report] 2 replays used')]);
ok('and neither is the older replay report', r.asked === 1 && r.answered === 0);

r = mk([exam('Q1'), user('   ')]);
ok('whitespace is not an answer',        r.asked === 0 && r.answered === 0);

console.log('--- the sitting that was marked band 1 ---');
/* Reconstructed from the saved JSON of the sitting a C1 pilot was awarded band 1
 * on: twenty-four questions, every answer "(no answer given)", and the marker
 * landing twice — once from _scFinish and once from the conversational finish.
 *
 * Before the fix this reported answered=2, so `answered === 0` was false and the
 * refusal never ran. Nothing was wrong with the count except what it counted. */
const real = [];
for (let i = 0; i < 24; i++) { real.push(exam('Q' + i)); real.push(user('(no answer given)')); }
real.push(user(MARKER));
real.push(user(MARKER));
r = mk(real);
ok('not one answer is counted',          r.answered === 0);
ok('and the marker is not part of asked', r.asked === 24);
ok('so the sitting is refused outright',  r.answered === 0);

console.log('--- the refusal is wired in before grading ---');
/* The whole function, matched by braces rather than a fixed 3000-character
 * window. The window broke the moment the transcript save above the check grew
 * a retry path — the check had not moved, it had simply been pushed out of
 * sight. A test must not fail because unrelated code above it got longer. */
function _grabFn(src, sig) {
  const i = src.indexOf(sig); if (i < 0) return '';
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  return '';
}
const fin = _grabFn(S, '  function _finishExam()');
ok('the check runs before either grader',
   fin.indexOf('_teaAnsweredCount()') < fin.indexOf('_t.segments.length > 0'));
ok('zero answers always refuses',        /_heard\.answered === 0 \|\|/.test(fin));
ok('and it returns rather than grading', /_teaShowUnheard\(_heard\);[\s\S]{0,30}return;/.test(fin));

console.log('--- nothing is saved, so no attempt is spent ---');
const refusal = S.slice(S.indexOf('  function _teaShowUnheard'), S.indexOf('  function _finishExam()'));
ok('the refusal saves no result',        !/_teaSaveConversationResult/.test(refusal));
ok('it says the attempt was not counted',/not been counted/.test(refusal));
ok('it does not blame the candidate',    /not a reflection of how/.test(refusal));
ok('it names the usual cause',           /microphone access/i.test(refusal));

console.log('--- a typed sitting is still gradeable ---');
r = mk([exam('Q1'), user('I fly the A320'), exam('Q2'), user('Cleared to land runway two seven')]);
ok('typed answers are answers',          r.answered === 2 && !(r.answered < r.asked / 2));

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
