/* A route's score has to be able to tell two students apart.
 *
 * It took the BEST score per phase per run. A student cannot advance without answering
 * correctly, correct means every keyword, and every keyword means a score of 100 — so
 * the best score for any completed phase was always 100, every finished route averaged
 * 100, and the number always agreed with whoever was looking at it.
 *
 * The first answer is the only one that measures comprehension. Everything after it
 * measures persistence, which progressPct already records. */
const fs = require('fs');
const A  = fs.readFileSync(__dirname + '/../Attemptservice.js', 'utf8');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};

/* Run the real bucketing and the real statistics, on rows shaped like the sheet. */
const bucket = A.slice(A.indexOf('    var sessions = {};'), A.indexOf('    var maxCovered'));
const run = new Function('attempts', 'tsMs_', bucket + '; return { sessions: sessions, sessionStats: sessionStats };');
const tsMs_ = v => new Date(v).getTime();

const at = (sid, session, score, correct, t) =>
  ({ scenarioId: sid, sessionId: session, score, correct, createdAt: '2026-09-05T10:' + t + ':00Z' });

console.log('--- Ana: eight phases, right first time ---');
const ana = [];
for (let i = 1; i <= 8; i++) ana.push(at('P' + i, 'ana-run', 100, true, String(i).padStart(2, '0')));
let r = run(ana, tsMs_);
let s = r.sessionStats[0];
console.log(`    covered ${s.covered}  avg ${s.avg}  firstTry ${s.firstTryPct}%`);
ok('scores 100', s.avg === 100);
ok('and 100% first try', s.firstTryPct === 100);

console.log('--- Bruno: same route, phase 3 took four goes and phase 6 took two ---');
const bruno = [
  at('P1','b',100,true ,'01'), at('P2','b',100,true ,'02'),
  at('P3','b', 40,false,'03'), at('P3','b', 60,false,'04'),
  at('P3','b', 80,false,'05'), at('P3','b',100,true ,'06'),
  at('P4','b',100,true ,'07'), at('P5','b',100,true ,'08'),
  at('P6','b', 75,false,'09'), at('P6','b',100,true ,'10'),
  at('P7','b',100,true ,'11'), at('P8','b',100,true ,'12'),
];
r = run(bruno, tsMs_);
s = r.sessionStats[0];
console.log(`    covered ${s.covered}  avg ${s.avg}  firstTry ${s.firstTryPct}%`);
ok('still counts eight phases, not twelve attempts', s.covered === 8);
// (100+100+40+100+100+75+100+100) / 8 = 89.375 → 89
ok('scores his FIRST answers, not his best', s.avg === 89);
ok('and reports 6 of 8 right first time', s.firstTryPct === 75);

console.log('--- the two are now distinguishable ---');
ok('Ana outscores Bruno', 100 > s.avg);

console.log('--- a retry cannot rewrite the record ---');
// The old rule took the best per phase, which for a completed phase is always 100.
const bestPerPhase = {};
bruno.forEach(a => { bestPerPhase[a.scenarioId] = Math.max(bestPerPhase[a.scenarioId] || 0, a.score); });
const oldAvg = Math.round(Object.values(bestPerPhase).reduce((x, y) => x + y, 0) / 8);
console.log(`    under the old rule Bruno also scored ${oldAvg}`);
ok('which is exactly the problem this fixes', oldAvg === 100 && s.avg < 100);

console.log('--- a second run of the same route still scores ---');
// attemptNumber counts LIFETIME attempts at a scenario, so on a rerun nothing is
// attempt 1. Ordering by time within the session is what keeps this working.
const rerun = [];
for (let i = 1; i <= 8; i++) rerun.push(
  Object.assign(at('P' + i, 'b2', 100, true, String(20 + i)), { attemptNumber: 3 }));
r = run(bruno.concat(rerun), tsMs_);
const second = r.sessionStats.find(x => x.avg === 100);
ok('a clean rerun scores 100 despite no attempt-1 rows', !!second);

console.log('--- the code says so too ---');
ok('the bucket takes the first writer',  /if \(sessions\[key\]\[sid\] === undefined\) \{/.test(A));
ok('ordered by time, not attemptNumber', /sort\(function ?\(a, b\) \{[\s\S]{0,80}tsMs_\(a\.createdAt\)/.test(A));
ok('first-try share comes from the run that set the score',
   /bestRun \? bestRun\.firstTryPct : 0/.test(A));
ok('the coverage gate is untouched',     /st\.covered < qualifyingCover/.test(A));

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
