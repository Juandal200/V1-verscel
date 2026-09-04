/* What is on sale is stated in one place, and everything that shows a plan reads it.
 *
 * Basic and Full replaced 15 días / 1 mes / 3 meses. The server moved; two screens did
 * not. The Shop advertised "Sprint · Training · Full Course" from COP 20,000 — three
 * plans nobody could buy at a price neither of the real ones costs — and the admin
 * price form edited those same retired keys, so an administrator could set three
 * prices, be told they saved, and change nothing anyone could purchase. */
const fs = require('fs');
const S = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
const C = fs.readFileSync(__dirname + '/../Código.js', 'utf8');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};

console.log('--- the catalogue is the single source ---');
const cat = C.slice(C.indexOf('var _PLAN_CATALOG_'), C.indexOf('var _PLAN_DAYS'));
ok('it holds exactly the plans on sale', /basic:/.test(cat) && /full:/.test(cat));
ok('and no retired plan',                !/15d:/.test(cat) && !/'3m':/.test(cat));

console.log('--- the shop reads it rather than repeating it ---');
const shop = S.slice(S.indexOf('function _shopFillPlanCard'), S.indexOf('function purchaseStreakFreeze'));
ok('the shop asks the server for plans',   /apiGetWompiPlans/.test(shop));
ok('names come from the response',         /plans\.map\(function \(p\) \{ return p\.label; \}\)/.test(shop));
ok('the price is the cheapest real one',   /reduce\(function \(a, b\) \{ return b\.cents < a\.cents \? b : a; \}\)/.test(shop));
ok('it is actually called after render',   /_shopFillPlanCard\(\);/.test(S));
ok('no retired plan names remain',         !/Sprint · Training · Full Course/.test(S));
ok('no hardcoded shop price remains',      !/From COP 20,000/.test(S));
ok('a failed lookup invents nothing',      /withFailureHandler[\s\S]{0,220}names\.textContent = ''/.test(shop));

console.log('--- the admin edits what is sold ---');
const save = S.slice(S.indexOf('function adminSubSavePrices'), S.indexOf('function adminSubGrant'));
ok('the form has a Basic field',      /id="subPriceBasic"/.test(S));
ok('and a Full field',                /id="subPriceFull"/.test(S));
ok('the retired fields are gone',     !/subPrice15d|subPrice1m|subPrice3m/.test(S));
ok('it sends the keys the server takes', /\{ basic: basic \* 100, full: full \* 100 \}/.test(save));
ok('and refuses a giveaway price',    /basic < 100 \|\| full < 100/.test(save));

console.log('--- the server still settles payments begun before the change ---');
ok('legacy keys are still honoured for settlement', /'15d': 15, '1m': 30, '3m': 90/.test(C));
ok('and still map to an entitlement',               /'15d': 'FULL', '1m': 'FULL', '3m': 'FULL'/.test(C));
ok('but the sale list is only the current two',     /\['basic', 'full'\]\.map/.test(C));

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
