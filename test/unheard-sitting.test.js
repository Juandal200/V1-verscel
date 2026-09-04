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

r = mk([exam('Q1'), user('(no answer given)'), user('[replay report] 2 replays used')]);
ok('the replay report is not an answer', r.asked === 1 && r.answered === 0);

r = mk([exam('Q1'), user('   ')]);
ok('whitespace is not an answer',        r.asked === 0 && r.answered === 0);

console.log('--- the real sitting: 26 turns, 24 unheard ---');
const real = [];
for (let i = 0; i < 26; i++) { real.push(exam('Q' + i)); real.push(user(i < 2 ? 'yes' : '(no answer given)')); }
r = mk(real);
ok('two answers out of twenty-six',      r.answered === 2 && r.asked === 26);
ok('that is under half, so it refuses',  r.answered < r.asked / 2);

console.log('--- the refusal is wired in before grading ---');
const fin = S.slice(S.indexOf('  function _finishExam()'), S.indexOf('  function _finishExam()') + 3000);
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
