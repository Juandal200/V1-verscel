/* Email carries the brand where the stylesheet cannot follow it.
 *
 * Mail clients strip custom properties, and most strip <style> as well, so not one
 * token in Styles.html reaches a message. Every email therefore chose its colours
 * where it was written, and eight service files drifted apart: sixteen places still
 * painted #00d48e — the teal the app itself retired — two different values were both
 * "body copy", and the greys used for the tagline and the legal footnote sat at
 * 2.99:1 and 2.03:1 against the card, which is why those lines read as a smudge.
 *
 * The progress report had a second problem of its own. It sized twelve things in rem,
 * and rem does not resolve in Outlook or in several webmail clients — the message
 * arrives at whatever size the client happens to pick.
 *
 * This renders every email body for real and looks at the HTML that comes out. */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};

/* ---- the palette, read from the source rather than restated here ---- */
const CFG = fs.readFileSync(path.join(root, 'ConfigService.js'), 'utf8');
const decl = CFG.slice(CFG.indexOf('var EMAIL_PALETTE_ = {'), CFG.indexOf('\n};', CFG.indexOf('var EMAIL_PALETTE_ = {')) + 3);
const PALETTE = new Function(decl + '; return EMAIL_PALETTE_;')();

const lum = h => { const n = parseInt(h.slice(1), 16);
  const c = [n>>16&255, n>>8&255, n&255].map(v => { v/=255; return v<=.03928 ? v/12.92 : Math.pow((v+.055)/1.055, 2.4); });
  return .2126*c[0] + .7152*c[1] + .0722*c[2]; };
const cr = (a, b) => (Math.max(lum(a), lum(b)) + .05) / (Math.min(lum(a), lum(b)) + .05);

console.log('--- the palette is stated once, and legible ---');
ok('ConfigService defines it', !!PALETTE && !!PALETTE.card);
// Everything that carries words has to be readable on the card it is painted on.
[['text', 4.5], ['muted', 4.5], ['faint', 4.5], ['accent', 4.5],
 ['green', 4.5], ['amber', 4.5], ['red', 4.5]].forEach(([k, min]) => {
  const r = cr(PALETTE[k], PALETTE.card);
  ok(`${k} ${PALETTE[k]} = ${r.toFixed(2)}:1 on the card`, r >= min);
});
ok('ink is readable on the accent it sits on',
   cr(PALETTE.ink, PALETTE.accent) >= 4.5);
// faint replaced two greys that were 2.99:1 and 2.03:1. Those must not come back.
ok('neither failing grey survives anywhere',
   !/#4a6280|#2d4a63/i.test(CFG));

console.log('--- the report sheet is legible too ---');
const R = PALETTE.report;
ok('the report palette exists', !!R && !!R.sheet);
[['text', R.sheet], ['body', R.sheet], ['faint', R.sheet],
 ['good', R.sheet], ['warn', R.sheet], ['bad', R.sheet]].forEach(([k, on]) => {
  const r = cr(R[k], on);
  ok(`report ${k} ${R[k]} = ${r.toFixed(2)}:1 on the sheet`, r >= 4.5);
});
ok('the notice block reads on its own tint', cr(R.noticeInk, R.noticeBg) >= 4.5);
// The report is the app in light mode, so its colours are the light theme's.
const STYLES = fs.readFileSync(path.join(root, 'Styles.html'), 'utf8');
const lightBlock = STYLES.slice(STYLES.indexOf('[data-theme="light"]'),
                                STYLES.indexOf('[data-theme="light"]') + 2400);
const lightTok = n => (lightBlock.match(new RegExp('--' + n + ':\\s*(#[0-9a-fA-F]{6})')) || [])[1];
[['text', 'text'], ['faint', 'muted'], ['good', 'green'], ['warn', 'yellow'],
 ['bad', 'red'], ['header', 'accent'], ['page', 'bg']].forEach(([r, t]) => {
  ok(`report ${r} is the app's light --${t}`, R[r] === lightTok(t));
});

/* ---- render every email body for real ----
 * Each is a chain of string concatenations over locals the surrounding function
 * supplies. Those locals are stubbed; the colours are not, so what comes back is
 * the real HTML with the real palette in it. */
const SERVICES = ['Authservice.js', 'Gamification.js', 'TourService.js', 'Userservice.js', 'Código.js'];
const stub = new Proxy(function () {}, {
  // Calling it, indexing it and concatenating it all have to work, because these
  // expressions do all three: ScriptApp.getService().getUrl(), stats.completedLevels,
  // and '...' + name. It answers to everything and reads as 'X'.
  apply: () => stub,
  get: (t, k) => (k === Symbol.toPrimitive || k === 'toString' || k === 'valueOf')
    ? () => 'X' : stub
});

function render(expr) {
  const real = { EC_: PALETTE, EMAIL_PALETTE_: PALETTE, R: PALETTE.report };
  const scope = new Proxy(real, {
    has: () => true,
    get: (t, k) => {
      // `with` asks for this first, and treats every key present on whatever comes
      // back as out of scope. A stub here answers "yes" to everything and sends the
      // whole expression to the global scope, where none of it exists.
      if (k === Symbol.unscopables) return undefined;
      return k in t ? t[k] : stub;
    }
  });
  // Some bodies call this.escapeHtml_ — inside a service object literal, `this` is
  // that object. Left unbound it is the global, and the call throws.
  return new Function('S', 'with (S) { return (' + expr + '); }').call(stub, scope);
}

/* Find each _emailWrap_( ... ) argument by balancing parentheses. */
function bodies(src) {
  const out = [];
  let i = -1;
  while ((i = src.indexOf('_emailWrap_(', i + 1)) >= 0) {
    let d = 0, j = i + '_emailWrap_'.length, q = null;
    for (; j < src.length; j++) {
      const c = src[j];
      if (q) { if (c === '\\') j++; else if (c === q) q = null; continue; }
      if (c === "'" || c === '"') { q = c; continue; }
      if (c === '(') d++;
      else if (c === ')' && --d === 0) break;
    }
    const arg = src.slice(i + '_emailWrap_('.length, j).trim();
    // _buildWeeklyEmail_(...) is a call, not a body — its HTML is assembled from
    // a dozen locals inside the helper. The static scan below covers that one.
    if (arg && !/^_build\w+Email_\(/.test(arg)) out.push(arg);
  }
  return out;
}

console.log('--- every wrapped email renders ---');
let rendered = 0, allHtml = '';
SERVICES.forEach(f => {
  const src = fs.readFileSync(path.join(root, f), 'utf8');
  bodies(src).forEach((expr, n) => {
    let html;
    try { html = render(expr); }
    catch (e) { ok(`${f} body ${n + 1} renders`, false); console.log('        ' + e.message); return; }
    rendered++; allHtml += html;
    ok(`${f} body ${n + 1} renders (${html.length} chars)`, typeof html === 'string' && html.length > 40);
  });
});
/* Eight since the weekly reset email was deleted with the tours it reported on.
 * Lowering this number is allowed; lowering it without noticing is what the count
 * exists to stop. */
ok('all eight inline email bodies were found', rendered === 8);

console.log('--- and what comes out is the palette, nothing else ---');
ok('no teal in any rendered email', !/00d48e/i.test(allHtml) && !/0\s*,\s*212\s*,\s*142/.test(allHtml));
// A colour written by hand is one that cannot follow the brand when it moves.
const known = new Set(Object.values(PALETTE).filter(v => typeof v === 'string').map(v => v.toLowerCase()));
// &#9992; is an aeroplane, not a colour. Only a hex inside a CSS declaration counts.
const stray = [...new Set([...allHtml.matchAll(/(?::\s*|\s)(#[0-9a-fA-F]{3,8})\b/g)].map(m => m[1].toLowerCase()))]
  // The photographic backdrop behind the logo is black on purpose: the mark is
  // cut out against it, and it is the one place a literal is the honest answer.
  .filter(h => !known.has(h) && !/^#(000|fff|111|222)$/.test(h));
if (stray.length) console.log('        ' + stray.join('  '));
ok('no colour outside the palette', stray.length === 0);
ok('no unresolved reference leaked into the HTML', !/EC_\.|EMAIL_PALETTE_/.test(allHtml));

console.log('--- and no email file writes a colour by hand ---');
// Rendering reaches eight of the nine bodies. This reaches all of them, plus every
// helper that builds a fragment, by reading the source instead of running it.
const TIER = /#(ffd700|c0c0c0|cd7f32|daa520|990011|1a0305|1a1400|0d0a00)\b/i;
SERVICES.forEach(f => {
  const src = fs.readFileSync(path.join(root, f), 'utf8');
  const bad = [];
  src.split('\n').forEach((l, i) => {
    if (!/style\s*=|color\s*:|background\s*:|border[a-z-]*\s*:/.test(l)) return;
    if (/setBackground\(|setFontColor\(/.test(l)) return;          // a spreadsheet cell
    for (const m of l.matchAll(/(?::\s*|\s)(#[0-9a-fA-F]{3,6})\b/g)) {
      const h = m[1].toLowerCase();
      if (known.has(h) || /^#(000|fff|111|222)$/.test(h) || TIER.test(h)) continue;
      bad.push((i + 1) + ':' + h);
    }
  });
  if (bad.length) console.log('        ' + bad.slice(0, 8).join('  '));
  ok(f + ' writes no colour of its own', bad.length === 0);
});

console.log('--- rem is gone from the report ---');
const COD = fs.readFileSync(path.join(root, 'Código.js'), 'utf8');
const report = COD.slice(COD.indexOf('function apiAdminSendProgressReport'),
                         COD.indexOf('function _formatTimeSec_'));
const rems = [...report.matchAll(/font-size:\s*[\d.]+rem/g)].map(m => m[0]);
if (rems.length) console.log('        ' + rems.join('  '));
ok('the report sizes in px, which every client resolves', rems.length === 0);
ok('and it paints from the report palette', /var R = EMAIL_PALETTE_\.report;/.test(report));
ok('the stat cell does too', /var R = EMAIL_PALETTE_\.report;/.test(
   COD.slice(COD.indexOf('function _emailStatCell_'), COD.indexOf('function _he('))));

console.log('--- the sheet headers are left alone ---');
// setBackground() paints a spreadsheet cell, not an email. It is navy on purpose
// and has nothing to do with this palette.
ok('setBackground still gets a literal', /setBackground\('#0f172a'\)/.test(COD));

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
