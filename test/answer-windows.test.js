/* A question with no time is a question nobody is asked.
 *
 * A step only opens the microphone when answerSeconds is above zero or it carries a
 * picture. That is right for a LINE — a transition is not answered — and right for
 * an AUDIO, which is listened to rather than answered. It was wrong for everything
 * else: a question row whose cell was blank, in a section with no default of its
 * own, inherited zero and was spoken and then skipped. The candidate was not told,
 * and the sitting was one question shorter than the paper it claimed to be.
 *
 * This runs the real resolution rather than reading it. Sixty seconds is the floor
 * for anything that asks; a row that explicitly says 0 is still honoured, because
 * that is how an author says "play this and move on". */
const fs = require('fs');
const P = fs.readFileSync(__dirname + '/../IcaoTestItemService.js', 'utf8');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};

const grab = (a, b) => P.slice(P.indexOf(a), P.indexOf(b));
const consts = grab('var ICAO_DEFAULT_ANSWER_SECS_', '// An explicit value in the sheet');
const fns    = grab('function _icaoRowSecs_', '/**\n * The whole sitting');
const secs   = new Function('Logger',
  consts + '\n' + fns + '\nreturn _icaoRowSecs_;')({ log() {} });

console.log('--- what never opens the mic ---');
ok('a transition',  secs({ itemType: 'LINE',  section: '1',  answerSeconds: '' }) === 0);
ok('a recording',   secs({ itemType: 'AUDIO', section: '2A', answerSeconds: '' }) === 0);

console.log('--- what does ---');
const cases = [
  ['an interview question',       { itemType: 'INTERVIEW', section: '1',  answerSeconds: '' }, 120],
  ['a picture',                   { itemType: 'IMAGE',     section: '3',  answerSeconds: '' }, 120],
  ['a 2A question',               { itemType: 'QUESTION',  section: '2A', answerSeconds: '' },  60],
  ['a 2B retell, which is longer',{ itemType: 'QUESTION',  section: '2B', answerSeconds: '' },  90],
  ['a 2C question',               { itemType: 'QUESTION',  section: '2C', answerSeconds: '' },  60],
];
cases.forEach(([label, row, want]) => {
  const got = secs(row);
  ok(`${label} gets ${want}s`, got === want);
});

console.log('--- and the cases that used to fall through to silence ---');
ok('a question in a section with no default of its own',
   secs({ itemType: 'QUESTION', section: '', answerSeconds: '' }) === 60);
ok('a question whose section is one nobody thought to list',
   secs({ itemType: 'QUESTION', section: '4', answerSeconds: '' }) === 60);
ok('an item type nobody thought to list',
   secs({ itemType: 'WHATEVER', section: '', answerSeconds: '' }) === 60);

console.log('--- the sheet still wins ---');
ok('an explicit 0 is honoured, because that is how you say "play and move on"',
   secs({ itemType: 'QUESTION', section: '2A', answerSeconds: '0' }) === 0);
ok('an explicit time beats the default',
   secs({ itemType: 'QUESTION', section: '2A', answerSeconds: '45' }) === 45);
ok('and is capped, so a typo cannot open the mic for three hours',
   secs({ itemType: 'QUESTION', section: '2A', answerSeconds: '9000' }) === 600);
ok('a structural default from the assembler beats the floor',
   secs({ itemType: 'QUESTION', section: '2A', answerSeconds: '' }, 30) === 30);

console.log('--- a paper that relies on the floor says so ---');
// A row using the floor is a row somebody forgot to fill in. It is logged the way
// a row carrying no voice already is, rather than being discovered mid-sitting.
ok('the floor is a named constant',   /var ICAO_MIN_ANSWER_SECS_ = 60;/.test(P));
ok('and using it is logged',
   /has no answerSeconds; ' \+\s*\n?\s*'using the ' \+ ICAO_MIN_ANSWER_SECS_/.test(P));
ok('there is something that lists them before a sitting, not during one',
   /function checkAnswerWindows\(\)/.test(P));
ok('and it builds the paper the way the exam does',
   /_icaoBuildScript_\(bank\)/.test(P.slice(P.indexOf('function checkAnswerWindows'))));

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
