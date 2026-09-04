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
ok('and a band of zero',          /band:\s*0,/.test(api));
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
ok('the card is blurred',            /filter:blur\(7px\)/.test(card));
ok('it says the result is ready',    /Your result is ready/.test(card));
ok('it offers the plans',            /openSubscriptionModal/.test(card));
ok('it shows when the exam was sat', /when\(r\.date\)/.test(card));
ok('the numbers behind it are placeholders, not the candidate\'s',
   /_bandChipNumber\(4\)/.test(card) && /pronunciation: 4/.test(card));
ok('the list routes locked rows to it', /if \(r\.locked\) return _lockedSittingCard\(r\);/.test(S));

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
