/* Three things a student could see were wrong, and one they could not.
 *
 * The loading bar changed size while it loaded. The time trained on the progress
 * report never moved. The level ten routes were black on black. None of them
 * threw, so none of them was in a log — they were all reported by looking.
 *
 * The one nobody reported is the interesting one: the campus timer was written
 * correctly, wired to one code path out of three, and the report read a different
 * number entirely. */
const fs = require('fs');
const S = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
const C = fs.readFileSync(__dirname + '/../Styles.html', 'utf8');
const G = fs.readFileSync(__dirname + '/../Código.js',   'utf8');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};

// Comments describe the fix; they must never be what satisfies the check.
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
const Sc = strip(S), Gc = strip(G), Cc = strip(C);

console.log('--- the campus timer starts for every student ---');
ok('there is exactly one call',
   (Sc.match(/^\s*_startActiveTimeTracker\(\);/gm) || []).length === 1);
/* The call used to be the line after renderHome(), and renderHome() is only
 * reached by falling past two returns. Ordering is the whole fix, so it is the
 * thing the test measures. */
const call  = Sc.indexOf('_startActiveTimeTracker();');
const first = Sc.indexOf('window.renderFirstFlight();');
const resum = Sc.indexOf('startCountryTraining(simState.country, simState.level);');
ok('the First Flight gate is still a return',
   /window\.renderFirstFlight\(\);\s*\n\s*return;/.test(Sc));
ok('the saved-route restore is still a return',
   /startCountryTraining\(simState\.country, simState\.level\);\s*\n\s*return;/.test(Sc));
ok('and the timer starts before the first of them', call > 0 && call < first);
ok('and before the second',                          call > 0 && call < resum);
ok('renderHome no longer starts it',
   !/renderHome\(\);\s*\n\s*_startActiveTimeTracker\(\)/.test(Sc));

console.log('--- and it still counts what it always counted ---');
const trk = S.slice(S.indexOf('function _startActiveTimeTracker'),
                    S.indexOf('function _startActiveTimeTracker') + 2200);
ok('five minutes idle stops the count',  /IDLE_LIMIT\s+= 5 \* 60 \* 1000/.test(trk));
ok('browsing counts, not just answering',
   /'mousemove','mousedown','keydown','scroll','touchstart','click'/.test(trk));
ok('a failed sync puts the seconds back', /_accumulated \+= secs;/.test(trk));
ok('and closing the tab does not lose them', /sendBeacon/.test(trk));

console.log('--- time trained is time on the campus ---');
ok('one place defines it',        /function campusSeconds_\(userId\)/.test(Gc));
ok('and it reads the tracker\'s own sheet',
   /dbFindOne_\('UserActivity', 'userId'/.test(Gc.slice(Gc.indexOf('function campusSeconds_'))));
ok('both reports use it',
   (Gc.match(/var totalTimeSec = campusSeconds_\(publicUser\.userId\);/g) || []).length === 2);
/* The old figure was the sum of responseTimeSec — typing time. A mock test wrote
 * to TEA Results and contributed none of it, and Attemptservice clamps anything
 * over an hour to zero, so stepping away counted as no time at all. */
ok('neither report sums response time any more',
   !/totalTimeSec = attempts\.reduce/.test(Gc));
ok('and the label says what the number is',
   (Sc.match(/'Time on the campus'/g) || []).length === 2 &&
   !/'Total training time'/.test(Sc));

console.log('--- and no route pretends to own a share of it ---');
// One campus figure cannot be divided between six routes without inventing six
// figures, so the column is gone rather than filled.
ok('the per-route split is gone',   !/timeByRoute/.test(Gc));
ok('so is the column it fed',       !/Time Spent<\/th>/.test(Gc));
ok('the debrief keeps its own honest measure',
   /Active response time/.test(S) && /p\.totalTimeSec \+= Number\(row\.responseTimeSec/.test(Gc));

console.log('--- the loader stops resizing itself ---');
const h2 = Cc.slice(Cc.indexOf('.completion-loading-text h2 {'),
                    Cc.indexOf('.completion-loading-bar {'));
/* Messages run from seventeen to forty-eight characters. At 1.35rem in a 420px
 * column that is one line or two, so the heading grew and shrank every 900ms and
 * pushed the bar and the hint with it. Two lines are reserved whether they are
 * used or not. */
ok('two lines are reserved',        /min-height: 2\.7em/.test(h2));
ok('and a short one is centred in them',
   /align-items: center/.test(h2) && /justify-content: center/.test(h2));

console.log('--- the fill advances, it does not lurch ---');
const rl = Sc.slice(Sc.indexOf('function renderRadarLoader'),
                    Sc.indexOf('function renderRadarLoader') + 3000);
ok('no random step',               !/Math\.random\(\) \* 10 \+ 3/.test(rl));
ok('a fixed share of what is left', /pct = pct \+ \(90 - pct\) \* 0\.18/.test(rl));
ok('it still stops short of the end so stop() can finish it',
   /fill\.style\.width = '100%'/.test(rl));

console.log('--- and only one loader owns the bar ---');
/* This is the fault that was actually reported, twice, and that neither earlier
 * fix touched. Every loader writes to one element id and keeps its own pct in a
 * closure. The interval stopped itself only when NO fill element existed — so the
 * moment a second loader rendered, a fill element existed again and the first
 * interval carried on writing ITS percentage to the new bar. Two timers, two
 * numbers, 900ms apart, one element: the bar jumped backwards and forwards.
 *
 * A progress bar that goes backwards is two progress bars. */
ok('a loader takes a number on the way in',
   /var _radarGen = 0;/.test(Sc) && /var myGen = \+\+_radarGen;/.test(Sc));
ok('and stops the moment a newer one starts',
   /if \(myGen !== _radarGen\) \{ clearInterval\(t\); return; \}/.test(rl));
// The guard has to run before anything is written, or it writes and then stops.
ok('it checks before it touches the bar',
   rl.indexOf('myGen !== _radarGen') < rl.indexOf("fill.style.width = pct"));
ok('a vanished screen still stops it',
   /if \(!fill\) \{ clearInterval\(t\); return; \}/.test(rl));
ok('the delayed text swap checks too',
   /setTimeout\(function\(\) \{\s*\n\s*if \(myGen !== _radarGen\) return;/.test(rl));
/* stop() is held in a local variable and called from async handlers that can land
 * long after the screen they belonged to has gone. */
ok('and a stale stop does not drive another screen to 100%',
   /stop: function\(\) \{[\s\S]{0,320}if \(myGen !== _radarGen\) return;[\s\S]{0,120}width = '100%'/.test(Sc));

console.log('--- and the message actually fades ---');
// The transition on opacity has been declared for as long as the loader has
// existed and had never once fired: textContent swaps in the same frame.
ok('it fades out first',           /el\.style\.opacity = '0';/.test(rl));
ok('swaps while invisible',        /e2\.textContent = msgs\[i\];/.test(rl));
ok('then back in',                 /e2\.style\.opacity = '1';/.test(rl));
ok('and gives up if the screen moved on', /if \(!e2\) return;/.test(rl));
ok('the fade fits inside one tick',
   /\}, 250\);/.test(rl) && /transition: opacity 0\.25s/.test(h2));

console.log('--- the radar is the app\'s colour, not indigo ---');
/* The wash, three rings, both stops of the sweep and the aircraft's halo were
 * all #6366f1, and so were the bar's track and glow. Eight literals of a colour
 * that is in no theme, on the one screen a student stares at while waiting —
 * which is why the loader kept reading as purple on a black-and-white product. */
const radar = Cc.slice(Cc.indexOf('.completion-loading-radar {'),
                       Cc.indexOf('.completion-loading-fill {') + 400);
ok('no indigo left anywhere in the loader', !/99\s*,\s*102\s*,\s*241/.test(radar));
ok('all eight are the accent',
   (radar.match(/rgba\(var\(--accent-rgb\)/g) || []).length === 7 &&
   /color: var\(--accent\)/.test(radar));
ok('including the aircraft\'s halo',
   /drop-shadow\(0 0 14px rgba\(var\(--accent-rgb\), 0\.7\)\)/.test(radar));
ok('the track and the fill glow with it',
   /background: rgba\(var\(--accent-rgb\), 0\.15\)/.test(radar) &&
   /box-shadow: 0 0 10px rgba\(var\(--accent-rgb\), 0\.5\)/.test(radar));

console.log('--- Chief Pilot is visible on the dark theme ---');
function lum(hex) {
  const c = [1,3,5].map(i => parseInt(hex.substr(i,2),16)/255)
    .map(v => v <= 0.04045 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4));
  return 0.2126*c[0] + 0.7152*c[1] + 0.0722*c[2];
}
const ratio = (a,b) => { const x=lum(a), y=lum(b);
  return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05); };
ok('the 2.1:1 crimson is gone',    !/#990011/.test(Sc) && !/153\s*,\s*0\s*,\s*17/.test(Sc));
ok('all four sites moved',         (Sc.match(/#e0384a/g) || []).length === 4);
ok('and both glows with them',     (Sc.match(/rgba\(224,56,74,/g) || []).length === 2);
ok('it clears 4.3:1 on the dark panel',  ratio('#e0384a', '#121212') >= 4.3);
ok('and on the light one',               ratio('#e0384a', '#fffefc') >= 4.3);
// It has to stay a literal: four call sites append hex alpha to it.
ok('the hex-alpha call sites still get a hex',
   /tier\.color \+ '20;/.test(Sc) && /tier\.color \+ '50"/.test(Sc) && /#e0384a/.test(Sc));
ok('the legend no longer dims itself below that',
   !/text-transform: uppercase;\s*\n\s*opacity: 0\.85;/.test(
      Cc.slice(Cc.indexOf('.prog-tier-labels span'), Cc.indexOf('.prog-tier-labels span') + 300)));

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
