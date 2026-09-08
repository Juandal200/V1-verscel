/* The examination screens had a palette of their own.
 *
 * Thirty-one hex literals across the exam surface, including a background of
 * #080c10 that the results screen painted in BOTH themes — so on the light theme
 * the result of an examination was a black island in a white app. Nobody
 * reported that. What they reported was the text on it.
 *
 * Against that ground four colours were below the minimum: section titles at
 * 3.1:1, sub-labels and band-0 markers at 2.2:1, the empty-state subtitle at
 * 4.2:1, and — worst placed of all — the disclaimer saying this is not an
 * official ICAO rating, at 3.9:1. The report-failure screen was worse: its
 * heading was 1.15:1 on the light theme, so the message telling a candidate
 * their report could not be produced was the least readable thing on the page.
 *
 * My first report on this cleared the results screen and blamed the plans modal.
 * I had measured the paywall overlay, found it fine at 12:1, and stopped —
 * without measuring the screen it sits on. */
const fs = require('fs');
const S = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
const C = fs.readFileSync(__dirname + '/../Styles.html', 'utf8');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
const Sc = strip(S), Cc = strip(C);

function lum(hex) {
  const c = [1,3,5].map(i => parseInt(hex.substr(i,2),16)/255)
    .map(v => v <= 0.04045 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4));
  return 0.2126*c[0] + 0.7152*c[1] + 0.0722*c[2];
}
const ratio = (a,b) => { const x=lum(a), y=lum(b);
  return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05); };

console.log('--- the exam screens use the app\'s colours ---');
const GONE = ['#080c10','#5d7186','#4a6280','#3a4a5a','#161f2b','#c8d8e8','#5b7690','#dde2e6','#8fa3bb'];
GONE.forEach(h => ok(h + ' is gone', !new RegExp(h, 'i').test(Sc)));
ok('the screen no longer paints its own ground',
   !/background:#0[0-9a-f]{5}/i.test(Sc));

console.log('--- one band ladder, not two ---');
/* _teaBandColor and _bandOf each had their own copy in private hex. Two ladders
 * written as literals drifted into disagreeing about what a band looks like. */
const ladders = Sc.match(/b >= 5 \? 'var\(--accent\)' : b === 4 \? 'var\(--green\)' : b > 0 \? 'var\(--red\)' : 'var\(--muted\)'/g) || [];
ok('the ladder is accent, green, red, muted', ladders.length >= 1);
ok('and no ladder is still written in hex',
   !/b === 4 \? '#/.test(Sc) && !/s === 4 \? '#/.test(Sc));
ok('a descriptor never assessed reads as muted, not as a failure',
   /na \? 'var\(--muted\)'/.test(Sc));

console.log('--- and every replacement clears the floor ---');
const T = { muted: ['#808080','#5c5c58'], text: ['#cacaca','#1c1c1a'],
            green: ['#2ea55c','#166534'], red: ['#ef4444','#b91c1c'] };
const BG = ['#0d0d0d','#f2f1ec'];
Object.keys(T).forEach(k => {
  ok('--' + k + ' clears 4.5:1 on both grounds',
     ratio(T[k][0], BG[0]) >= 4.5 && ratio(T[k][1], BG[1]) >= 4.5);
});

console.log('--- the admin dimension hues are deliberately left ---');
// Six colours a reader must tell apart, drawn only inside the admin block, which
// now has a role check in front of it.
ok('dimColor still has its own palette', /PRONUNCIATION:'#e05252'/.test(Sc));
ok('and it is still inside the gated block',
   Sc.indexOf("if (av && _teaMayReadAdminReport())") < Sc.indexOf("PRONUNCIATION:'#e05252'"));

console.log('--- disabled is a colour, not a fade ---');
/* opacity: 0.55 put the label at 4.18:1 on dark and 3.82:1 on light. Opacity is
 * also multiplicative, so a faded button inside a faded card faded twice — which
 * is how .exam-play-btn at 0.35 disappeared entirely. */
const btn = Cc.slice(Cc.indexOf('.btn:disabled {'), Cc.indexOf('.btn:disabled {') + 260);
ok('the button states its colours',
   /background: var\(--panel\)/.test(btn) && /color: var\(--muted\)/.test(btn));
ok('and no longer fades',            !/opacity/.test(btn));
ok('it still reads as unpressable',  /cursor: not-allowed/.test(btn));
ok('the label now clears the floor',
   ratio('#808080','#121212') >= 4.5 && ratio('#5c5c58','#fffefc') >= 4.5);
['admin-student-view-btn','hf-play-btn','exam-play-btn'].forEach(cls => {
  ok(cls + ' stopped inventing its own fade',
     !new RegExp('\\.' + cls + ':disabled \\{[^}]*opacity').test(Cc));
});

console.log('--- a locked card keeps its words ---');
const lock = Cc.slice(Cc.indexOf('.level-card-pro.is-locked {'),
                      Cc.indexOf('.level-card-pro.is-locked {') + 400);
ok('the card no longer dims itself whole', !/^\s*opacity: 0\.66/m.test(lock));
ok('only the imagery fades',
   /\.level-card-pro\.is-locked img,[\s\S]{0,140}opacity: 0\.55/.test(Cc));

console.log('--- the level map is the app\'s colours ---');
/* The operational card was amber — #f59e0b, in no palette — with an amber wash,
 * an amber icon tile and a yellow eyebrow, on a product that is black, white and
 * navy. Thirty-six literals of it across the map, the priority banners and the
 * exam badges. */
ok('no amber literal is left anywhere',
   !/245,\s*158,\s*11/.test(Sc) && !/245,\s*158,\s*11/.test(Cc) &&
   !/251,\s*146,\s*60/.test(Sc) && !/251,\s*146,\s*60/.test(Cc));
ok('the operational card carries the accent',
   /\.level-card-ops \{[\s\S]{0,300}border-color: rgba\(var\(--accent-rgb\), 0\.38\)/.test(Cc));
ok('and its eyebrow is not a shout',
   /\.ops-eyebrow \{[\s\S]{0,80}color: var\(--muted\)/.test(Cc));
ok('its title takes the theme\'s ink, not white',
   !/\.ops-lvl-title \{[\s\S]{0,160}color: #fff/.test(Cc));
ok('the rest became the palette\'s yellow, not a new colour',
   (Cc.match(/rgba\(var\(--yellow-rgb\)/g) || []).length >= 20);

console.log('--- and its marks are drawn ---');
// A padlock, a tick and a target rendered in three typefaces at three weights
// next to instrument text — and on Windows some of them not at all.
ok('the operational icons are drawn',
   /uiIcon\('locked', 30\)/.test(Sc) && /uiIcon\('passed', 30\)/.test(Sc) &&
   /uiIcon\('target', 30\)/.test(Sc));
ok('and none of the four is still an emoji',
   !/olIcon\s+= OPS_COMING_SOON \? '\\uD83D/.test(Sc));

console.log('--- a locked checkpoint keeps its explanation ---');
// Dimming the card took "Complete Levels 7-9 to unlock" — the line explaining
// WHY it is locked — down with it.
ok('the card is not faded whole',
   !/\.exam-card\.exam-card-locked \{[\s\S]{0,120}opacity: 0\.7/.test(Cc));
ok('the dashed border carries the meaning',
   /\.exam-card\.exam-card-locked \{[\s\S]{0,140}border-style: dashed/.test(Cc));
ok('and its badge is legible',  !/color: #555/.test(Cc));

console.log('--- and nothing ships in Spanish ---');
const SP = /\b(Cargando|Completa|Bloqueado|Desbloquea\w*|Debes|Necesitas|Guardando|Enviando|Continuar|Comenzar|Correcto|Incorrecto|Siguiente|anterior)\b/i;
ok('no Spanish prose in the client', !SP.test(Sc.replace(/<!--[\s\S]*?-->/g, '')));
ok('nor in the stylesheet',          !SP.test(Cc));

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
