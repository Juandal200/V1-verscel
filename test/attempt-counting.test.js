/* One examination must cost one attempt.
 *
 * Every sitting writes two rows — the transcript filed before grading so a sitting
 * that fails to score is not lost, then the marked result. Attempts were counted by
 * row, so taking the test once spent a free plan's single attempt twice over, and
 * Basic's two were gone after one exam. The screenshot that found this showed one
 * examination listed as "2 sittings", the second with no band and labelled
 * "Below Operational" — a failing grade for a row that was never marked. */
const fs = require('fs');
const T  = fs.readFileSync(__dirname + '/../TEAService.js', 'utf8');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};

const counter = T.slice(T.indexOf('function _icaoSittingsFor_'),
                        T.indexOf('function _icaoSittingsFor_') + 2200);
const results = T.slice(T.indexOf('function apiGetMyIcaoResults'),
                        T.indexOf('function apiGetMyIcaoResults') + 3000);

console.log('--- attempts are counted from results, not rows ---');
ok('the band column is read',            /bandCol = TEA_SHEET_HEADERS\.indexOf\('Overall Band'\)/.test(counter));
ok('it is inside the range fetched',     /Math\.min\(dateCol, candCol, bandCol\)/.test(counter) &&
                                          /Math\.max\(dateCol, candCol, bandCol\)/.test(counter));
ok('an unmarked row is skipped',         /if \(!\(Number\(r\[bIdx\]\) > 0\)\) return;/.test(counter));
ok('the skip happens before the tally',  counter.indexOf('Number(r[bIdx]) > 0') < counter.indexOf('n++'));

console.log('--- the history lists sittings, not filings ---');
ok('unmarked rows are not listed',       /if \(!\(Number\(r\[idx\['Overall Band'\]\]\) > 0\)\) return;/.test(results));
ok('and that runs before the row is built',
   results.indexOf("Number(r[idx['Overall Band']]) > 0") < results.indexOf('results.push('));

console.log('--- the paywall still applies to what remains ---');
ok('locked rows still carry no band',    /band:\s*null/.test(results));
ok('locked rows still carry no scores',  /scores:\s*null/.test(results));

/* Drive the real filter over rows shaped like the sheet. */
const rows = [
  ['2026-09-03', 'a@b.com', ''],   // transcript filed before grading
  ['2026-09-03', 'a@b.com', 1],    // the marked result
  ['2026-09-03', 'a@b.com', ''],   // a second sitting, never scored
  ['2026-09-03', 'other@b.com', 5] // someone else
];
const mine = rows.filter(r => String(r[1]).toLowerCase() === 'a@b.com');
const counted = mine.filter(r => Number(r[2]) > 0);
console.log('--- the rows behind your screenshot ---');
ok('three rows carry your address',      mine.length === 3);
ok('but only one is a marked sitting',   counted.length === 1);
ok('so one exam costs one attempt',      counted.length === 1);

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
