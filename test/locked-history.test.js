/* A server must not assume the client it is talking to is the one it was written
 * against.
 *
 * apiGetMyIcaoResults began sending scores:null for a locked sitting. Apps Script
 * deploys the instant it is pushed; the browser was still running whatever the
 * service worker had cached. bars() read scores[k] straight off it and the results
 * screen died with "null is not an object". The guard existed — in the build that had
 * not arrived yet. */
const fs = require('fs');
const S  = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
const T  = fs.readFileSync(__dirname + '/../TEAService.js', 'utf8');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};

console.log('--- what the server sends cannot break an older client ---');
const api = T.slice(T.indexOf('function apiGetMyIcaoResults'),
                    T.indexOf('function apiSaveIcaoTranscript'));
ok('no null band is sent',        !/band:\s*null/.test(api));
ok('no null scores are sent',     !/scores:\s*null/.test(api));
ok('a locked row carries zeros',  /pronunciation: 0, structure: 0, vocabulary: 0/.test(api));
// CHANGED 6 Sep 2026 — the band is given, the reasons are sold. Withholding the
// band too meant half an hour of speaking bought a padlock, and a free account's
// only attempt was spent finding that out.
ok('and the real band beside it',
   /band:    Number\(r\[idx\['Overall Band'\]\]\) \|\| 0,\n\s*locked:  true/.test(api));
// What must NOT travel is a descriptor score. That is the report, and the report
// is what is being sold.
ok('with every descriptor still zeroed',
   /pronunciation: 0, structure: 0, vocabulary: 0/.test(api));
ok('and still says it is locked', /locked:\s*true/.test(api));
ok('both branches read the same column for the version',
   (api.match(/version: String\(r\[idx\['Version'\]\] \|\| ''\)/g) || []).length === 2);

/* Drive the real bars() with what the server now sends. */
const barsSrc = S.slice(S.indexOf('    function bars(scores) {'), S.indexOf('    function when(iso) {'));
const bars = new Function('_TEA_DESCRIPTORS', '_lockedBars', '_teaBandColorFor',
  barsSrc + 'return bars;')(['pronunciation','structure','vocabulary','fluency','comprehension','interactions'],
                            () => '<!--locked-->', () => '#888');
console.log('--- the old client survives the new payload ---');
const zeros = { pronunciation:0, structure:0, vocabulary:0, fluency:0, comprehension:0, interactions:0 };
let threw = false; try { bars(zeros); } catch (e) { threw = true; }
ok('zeros render without throwing', !threw);
threw = false; try { bars(null); } catch (e) { threw = true; }
ok('and null is still guarded anyway', !threw);

console.log('--- a locked sitting reads as an offer, not a refusal ---');
const card = S.slice(S.indexOf('    function _lockedSittingCard(r)'), S.indexOf('    function bars(scores) {'));
// CHANGED 6 Sep 2026. The card used to blur the whole sitting behind a fabricated
// Band 4, so what a candidate saw of half an hour's work was a shape and a padlock.
// The band is theirs and is shown; the six bars are what the subscription buys.
ok('the band is shown, not blurred',  /_bandChipNumber\(band\)/.test(card));
ok('and it is the band they scored',  /var band = Number\(r\.band\) \|\| 0;/.test(card));
ok('the six bars are blurred',        /filter:blur\(6px\)[\s\S]{0,200}bars\(\{/.test(card));
ok('the offer names what is behind them', /See what made this band/.test(card));
ok('it offers the plans',            /openSubscriptionModal/.test(card));
ok('it shows when the exam was sat', /when\(r\.date\)/.test(card));
// Placeholders still, because a descriptor score is what is being sold — the bars
// behind the blur must not be the candidate's real ones.
ok('the bars behind the blur are placeholders', /pronunciation: 4/.test(card));
ok('the list routes locked rows to it', /if \(r\.locked\) return _lockedSittingCard\(r\);/.test(S));

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
