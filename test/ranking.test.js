/* A weekly table that printed career totals.
 *
 * The header says THIS WEEK'S RANKING · RESETS MONDAY. The server sorts by
 * weeklyXp and hands back a rank built from that order. Every number on the row
 * was mergedXp — the all-time total — so the table read as broken to anyone who
 * looked at it: first place showing 50 XP above fourth place showing 100.
 *
 * Neither number was wrong. They were answers to two different questions,
 * printed next to a rank that answered only the first.
 *
 * The tier grouping keeps using all-time XP, and should: a rank is earned over a
 * career, not reset every Monday. That is also why the global rank looks out of
 * order down the page — 3 in the Senior block, then 1, 2 and 4 in Junior. The
 * ranking is global; the blocks are by career tier. */
const fs = require('fs');
const S = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
const G = fs.readFileSync(__dirname + '/../GamificationUI.html', 'utf8');
const M = fs.readFileSync(__dirname + '/../Gamification.js', 'utf8');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
const Sc = strip(S), Gc = strip(G);
const lb = Sc.slice(Sc.indexOf('function _gamRenderLeaderboard'),
                    Sc.indexOf('function _gamRenderLeaderboard') + 5000);

console.log('--- the number matches the rank ---');
ok('the server still ranks on the week',
   /if \(b\.weeklyXp !== a\.weeklyXp\) return b\.weeklyXp - a\.weeklyXp;/.test(strip(M)));
ok('the headline score is the weekly one',
   /gam-lb-score[^']*'[\s\S]{0,60}\(p\.weeklyXp \|\| 0\) \+ ' XP/.test(lb));
ok('and the bar measures the same thing',
   /barW\s+= Math\.min\(100, Math\.round\(\(\(p\.weeklyXp \|\| 0\) \/ maxXp\)/.test(lb) &&
   /if \(\(p\.weeklyXp \|\| 0\) > maxXp\) maxXp = p\.weeklyXp;/.test(lb));
ok('the career total is still shown, quietly',
   /gam-lb-alltime[^']*'[\s\S]{0,60}\(p\.mergedXp \|\| 0\) \+ ' total/.test(lb) &&
   /\.gam-lb-alltime \{[\s\S]{0,200}font-size: 0\.62rem/.test(Gc));
// A tier is a career rank. It must NOT follow the weekly reset.
ok('the tier still comes from all-time XP',
   /_getTierFromXpKey\(p\.mergedXp \|\| 0\)/.test(lb) &&
   /_getTierFromXp\(p\.mergedXp \|\| 0\)/.test(lb));

console.log('--- and the podium needs no emoji ---');
ok('the crown and medals are gone',
   !/crowns\s*=/.test(Sc) && !/crownMkp/.test(Sc));
ok('nothing on the row is a pictograph',
   !/[\u{1F300}-\u{1FAFF}]/u.test(lb));
// The row already said it twice: the rank number is coloured by position and the
// avatar carries a ring in the same colour.
ok('the rank number still carries the position', /gam-lb-rank--' \+ globalRnk/.test(lb));
ok('and so does the avatar ring',                /gam-lb-avatar--' \+ globalRnk/.test(lb));

console.log('--- in colours that survive the light theme ---');
/* #ffd700 is 1.24:1 and #cd7f32 is 2.78:1 on the light ground, so first and
 * third place were the two least readable rows in their own table. This module
 * carries no [data-theme] rules at all, which is why nobody caught it. */
ok('gold and bronze literals are gone',
   !/#ffd700/i.test(Gc) && !/#cd7f32/i.test(Gc) &&
   !/255,\s*215,\s*0/.test(Gc) && !/205,\s*127,\s*50/.test(Gc));
ok('the ladder is kept, in tokens',
   /gam-lb-rank--1 \{ color: var\(--yellow\)/.test(Gc) &&
   /gam-lb-rank--2 \{ color: var\(--text\)/.test(Gc) &&
   /gam-lb-rank--3 \{ color: var\(--muted\)/.test(Gc));
ok('and the rings with it',
   /gam-lb-avatar--1 \{ border-color: rgba\(var\(--yellow-rgb\)/.test(Gc));
function lum(h){const c=[1,3,5].map(i=>parseInt(h.substr(i,2),16)/255)
  .map(v=>v<=0.04045?v/12.92:Math.pow((v+0.055)/1.055,2.4));
  return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2];}
const cr=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05);};
ok('first place is readable on both grounds',
   cr('#eab308','#0d0d0d') >= 4.5 && cr('#92400e','#f2f1ec') >= 4.5);
ok('and third place too',
   cr('#808080','#0d0d0d') >= 4.5 && cr('#5c5c58','#f2f1ec') >= 4.5);

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
