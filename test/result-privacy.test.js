/* Nothing announces the result out loud.
 *
 * The band was spoken on both finish paths while the report was blurred behind a
 * paywall, so the page was covered and the speaker was not — the single number being
 * charged for was the one thing given away. A closing line should not carry the
 * outcome regardless of plan: it is said in a room that may not be private. */
const fs = require('fs');
const S  = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};

console.log('--- the result is never spoken ---');
ok('no band in any spoken line',      !/overall ICAO band is/.test(S));
ok('the closing line just thanks',    /The examination is now complete\. Thank you\./.test(S));
ok('both finish paths use it',
   (S.match(/The examination is now complete\. Thank you\./g) || []).length === 2);

// Anything handed to speech that interpolates a band would reopen the hole.
const spoken = [...S.matchAll(/_teaSay\(([^;]{0,160})/g)].map(m => m[1]);
ok('no spoken string interpolates a band',
   !spoken.some(s => /\bband\b/i.test(s) && /\+/.test(s)));

console.log('--- the report on screen is still gated ---');
ok('the paywall check survives',      /function _teaResultsLocked/.test(S));
// CHANGED 6 Sep 2026 — the band is given, the reasons are sold.
//
// The band used to be withheld too, so half an hour of speaking bought a padlock
// and a free account's only attempt was spent discovering that. There was nothing
// in the result to be curious about and therefore nothing to buy. The overall band
// is the one number that means something on its own — it is what goes on a licence
// — so it is given. What is still withheld, and still withheld HERE rather than in
// CSS, is every REASON: the six descriptor scores and the examiner's words.
ok('and still blurs the reasons',    /_teaResultsLocked\(\)[\s\S]{0,900}filter:blur/.test(S));
ok('while the band is shown for real',
   /_teaResultsLocked\(\)[\s\S]{0,200}_renderBandHeaderOnly\(json\)/.test(S));

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
