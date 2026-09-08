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

console.log('--- and you race the people you are racing ---');
/* The rank was a GLOBAL position printed inside blocks grouped by career tier,
 * so the page read 3, then 1, 2, 4 and looked broken. Worse than looking broken:
 * a Senior with two thousand XP behind him appeared BELOW a newcomer with fifty
 * who had had a busier week, and the newcomer's "first place" was first over
 * people who were never their competition.
 *
 * The tiers already are divisions. Career XP decides which one you are in; the
 * week decides where you finish inside it. */
ok('the rank is counted within the tier',
   /rankMap\[String\(p\.email \|\| ''\)\.toLowerCase\(\)\] = groups\[key\]\.length;/.test(lb));
ok('and the global map is gone',   !/globalRankMap/.test(Sc));
ok('the row reads its division rank', /var globalRnk = rankMap\[emailLc\]/.test(lb));
// Server order is weeklyXp DESC with career XP as tiebreaker, so counting
// positions as rows arrive within a group is already the right order.
ok('which relies on the server order it already had',
   /if \(b\.weeklyXp !== a\.weeklyXp\) return b\.weeklyXp - a\.weeklyXp;/.test(strip(M)));
ok('each division says what it is',
   /_GAM_TIER_RANGE = \{/.test(Sc) && /junior:\s*'under 1,000 XP'/.test(Sc) &&
   /_GAM_TIER_RANGE\[tier\.key\]/.test(lb));
// The thresholds printed must be the thresholds enforced.
ok('and the printed ranges match the code that sorts into them',
   /xp >= 8000\) return 'chief'/.test(Sc) && /chief:\s*'8,000\+ XP'/.test(Sc) &&
   /xp >= 3000\) return 'instructor'/.test(Sc) && /instructor: '3,000/.test(Sc) &&
   /xp >= 1000\) return 'senior'/.test(Sc) && /senior:\s*'1,000/.test(Sc));

console.log('--- the module has nothing left that ignores the theme ---');
const gm = G.replace(/\/\*[\s\S]*?\*\//g, '');
ok('no hex literal',    !/#[0-9a-fA-F]{6}\b/.test(gm));
ok('no rgb literal',    !/rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}/.test(gm));
/* Both remaining emoji were written as HTML entities, which is why every emoji
 * sweep missed them — and why a colour audit read &#127942; as the hex colour
 * #127942. Six valid hex digits. */
ok('and no entity-encoded emoji', !/&#1[0-9]{4,5};/.test(gm));
/* Anchor on the markup, not the name. `gam-search-icon` is a CSS selector eight
 * hundred lines before it is an attribute, and a window measured from the first
 * match lands in the stylesheet. */
ok('the trophy is drawn',    /<\/svg>Ranking/.test(gm) && /M7\.5 3\.5h9v5a4\.5/.test(gm));
ok('the magnifier is drawn', /gam-search-icon">[\s\S]{0,300}<circle cx="10\.5"/.test(gm));
ok('the hero keeps its depth without a navy literal',
   /rgba\(var\(--accent-rgb\), 0\.07\)[\s\S]{0,120}var\(--panel\) 0%, var\(--bg\) 100%/.test(gm));

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
