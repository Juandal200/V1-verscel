/* A colour written as a number cannot follow the theme.
 *
 * Eighty-nine places in the app spelled out #ef4444, #eab308 or #22c55e — which
 * are not arbitrary colours. They are the EXACT dark-theme values of --red,
 * --yellow and --green. So on dark they looked perfect, and on light they stayed
 * dark-theme colours while everything around them turned to #b91c1c, #92400e and
 * #166534. Neon error text on paper.
 *
 * That is why it went unreported for so long: it was invisible on the theme
 * almost everyone uses, and only wrong on the one used for printing. The same
 * shape as the #990011 routes and the indigo radar.
 *
 * Two rules come out of it. A colour that has a token is written as the token.
 * And the places where a literal IS the right answer — the token definitions
 * themselves, and the stylesheet inlined into a printed page that carries no
 * tokens of its own — are named here so nobody "fixes" them later. */
const fs = require('fs');
const S = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
const C = fs.readFileSync(__dirname + '/../Styles.html', 'utf8');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
const Sc = strip(S), Cc = strip(C);

console.log('--- the tokens still hold the values, and still differ by theme ---');
ok('dark declares all three',
   /--green: #22c55e/.test(Cc) && /--yellow: #eab308/.test(Cc) && /--red: #ef4444/.test(Cc));
ok('light declares all three, and differently',
   /--green: #166534/.test(Cc) && /--yellow: #92400e/.test(Cc) && /--red: #b91c1c/.test(Cc));
ok('and the triplets exist for translucent forms',
   /--green-rgb:\s+34, 197, 94/.test(Cc) && /--red-rgb:\s+185, 28, 28/.test(Cc));

console.log('--- nothing else spells them out ---');
// The definitions are the only legitimate use, so they are subtracted first.
const defs = /--(?:red|green|yellow|accent)(?:-rgb)?\s*:\s*[^;]+;/g;
const bodyC = Cc.replace(defs, '');
// REPORT_TOKENS is inlined into a document.write page. That page has no theme
// and no tokens; these literals are what every var() in the report resolves to.
const rt = S.indexOf('var REPORT_TOKENS =');
const bodyS = Sc.slice(0, rt) + Sc.slice(Sc.indexOf("}';", rt) + 3);

[['#ef4444','--red'], ['#22c55e','--green'], ['#eab308','--yellow'], ['#0e65f4','--accent']]
  .forEach(([lit, tok]) => {
    ok(lit + ' appears nowhere but the definitions (use ' + tok + ')',
       !new RegExp(lit, 'i').test(bodyC) && !new RegExp(lit, 'i').test(bodyS));
  });
[['239\\s*,\\s*68\\s*,\\s*68','--red-rgb'],
 ['34\\s*,\\s*197\\s*,\\s*94','--green-rgb'],
 ['234\\s*,\\s*179\\s*,\\s*8','--yellow-rgb'],
 // A second green six points off the first, used to mean the same thing.
 ['22\\s*,\\s*163\\s*,\\s*74','--green-rgb']].forEach(([pat, tok]) => {
    ok('rgb(' + pat.replace(/\\s\*/g,'') + ') is written as ' + tok,
       !new RegExp('rgba?\\(\\s*' + pat, 'i').test(bodyC) &&
       !new RegExp('rgba?\\(\\s*' + pat, 'i').test(bodyS));
  });

console.log('--- and the swap actually happened, rather than the colour being deleted ---');
ok('the translucent forms are tokens now',
   (Cc.match(/rgba\(var\(--(?:red|green|yellow)-rgb\)/g) || []).length >= 20 &&
   (Sc.match(/rgba\(var\(--(?:red|green|yellow)-rgb\)/g) || []).length >= 20);

console.log('--- and what replaced them is valid CSS ---');
/* The first cut of this sweep matched the three digits of the triplet but not
 * the comma after them, and appended its own — so all one hundred and ten came
 * out as rgba(var(--red-rgb), ,0.4). Every one of those declarations is invalid
 * and silently discarded, which would have removed the colour rather than
 * tokenised it.
 *
 * The suite did not catch it, because it only asked whether the literal was
 * GONE. Gone and correct are different questions, and deleting the colour
 * answers the first one perfectly. So it now asks the second. */
function malformed(text) {
  const out = [];
  for (const m of text.matchAll(/rgba?\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)) {
    let depth = 0, cur = '', parts = [];
    for (const ch of m[1]) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
    }
    parts.push(cur);
    if (parts.some(x => !x.trim()) || parts.length < 2 || parts.length > 4) out.push(m[0]);
  }
  return out;
}
ok('no empty or doubled argument in any rgba() in the stylesheet',
   malformed(Cc).length === 0);
ok('nor in any inline style built by the client',
   malformed(Sc).length === 0);
ok('an alpha survived every swap',
   !/rgba\(var\(--[a-z]+-rgb\)\s*\)/.test(Cc + Sc));

console.log('--- the printed report keeps its own literals ---');
/* A document.write page inherits nothing. Every var() inside one resolves only
 * because REPORT_TOKENS declares it in the page's own :root — and a var() that
 * resolves to nothing does not fall back, it discards the whole declaration. */
const tokens = S.slice(rt, S.indexOf("}';", rt));
ok('it still declares the theme it needs',
   /--green:#166534/.test(tokens) && /--yellow:#92400e/.test(tokens) && /--red:#b91c1c/.test(tokens));
ok('it uses the LIGHT values, because paper is light',
   !/--red:#ef4444/.test(tokens));
// The triplets are deliberately absent, so nothing in a report may ask for one.
ok('it declares no -rgb triplets',      !/-rgb:/.test(tokens));
const pages = [...S.matchAll(/REPORT_TOKENS/g)].map(m => m.index)
  .filter(i => !S.slice(i-6, i).trim().endsWith('='))
  .map(i => S.slice(i, S.indexOf('</html>', i)));
ok('there are still two printed pages', pages.length >= 2);
ok('and none of them asks for a token it does not carry',
   pages.every(p => [...p.matchAll(/var\((--[a-z0-9-]+)/g)]
     .every(m => new RegExp(m[1] + '\\s*:').test(tokens))));

console.log('--- the two things in the report nobody could see ---');
/* --bg is #f2f1ec and the page is painted --panel, #fffefc. Used as an ink that
 * is 1.06:1: the same colour as the paper it sits on. */
ok('the headline figure is no longer painted the paper colour',
   !/'var\(--green\)' : 'var\(--bg\)'/.test(Sc) &&
   /'var\(--green\)' : 'var\(--text\)'/.test(Sc));
ok('and the print button is not white on white',
   !/background:var\(--bg\);color:#fff/.test(Sc) &&
   /background:var\(--accent\);color:var\(--accent-ink\)/.test(Sc));

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
