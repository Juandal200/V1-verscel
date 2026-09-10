/* Ninety-two per cent of the heaviest file in the project was two pictures.
 *
 * ConfigService.js was 366,555 bytes and 339,364 of them were base64: a 680x395
 * logo and a 256x256 avatar, returned as data URLs. The logo was embedded three
 * times in the initial document and the avatar once, so roughly 751 KB of base64
 * shipped inside the HTML.
 *
 * Gzip barely touched it — underneath is an already-compressed PNG, so it only
 * recovered base64's own expansion — and none of it was cacheable, because it
 * lived inside the HTML. sw.js is network-first for navigation on purpose, so
 * that weight was paid on every single open, for a logo drawn at 64-200px.
 *
 * They are files now, with content-hashed names. This asserts they stay files,
 * that the names in ConfigService.js still match the bytes on disk, and that the
 * seven emails which genuinely need the bytes still get them. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

console.log('--- no picture is a literal any more ---');
/* The threshold is 10 KB, not zero. A tiny inline SVG is a legitimate way to
 * write an icon; a quarter of a megabyte of PNG is not. */
const LIMIT = 10 * 1024;
function sourceFiles(dir, out) {
  out = out || [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git', 'brand'].includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) sourceFiles(full, out);
    else if (/\.(js|mjs|html|json)$/.test(e.name)) out.push(full);
  }
  return out;
}
const offenders = [];
for (const f of sourceFiles(ROOT)) {
  const src = fs.readFileSync(f, 'utf8');
  for (const m of src.matchAll(/data:image\/[a-z+.-]+[;,][^"'`\s)]*/gi)) {
    if (m[0].length > LIMIT) offenders.push(path.relative(ROOT, f) + ' (' + m[0].length + ' bytes)');
  }
}
ok('no source file carries a data:image over 10 KB', offenders.length === 0);
if (offenders.length) offenders.forEach(o => console.log('        ' + o));

console.log('--- the names in code match the bytes on disk ---');
/* The filename carries a hash of its own contents, so a changed picture gets a
 * new URL and the old one stays cached harmlessly. That only holds while the
 * constant and the file agree, and nothing else would notice if they stopped. */
const CFG = read('ConfigService.js');
for (const [constName, label] of [['BRAND_LOGO_FILE_', 'logo'], ['BRAND_AVATAR_FILE_', 'avatar']]) {
  const m = CFG.match(new RegExp('var ' + constName + "\\s*=\\s*'([^']+)'"));
  ok(constName + ' is declared', !!m);
  if (!m) continue;
  const rel = m[1].replace(/^\//, '');
  const file = path.join(ROOT, rel);
  ok(label + ': the file exists', fs.existsSync(file));
  if (!fs.existsSync(file)) continue;
  const bytes = fs.readFileSync(file);
  const want = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 8);
  const got = (rel.match(/\.([0-9a-f]{8})\.png$/) || [])[1];
  ok(label + ': the filename hash matches its contents', got === want);
  // A PNG's IHDR is always first: 8-byte signature, 4 length, 4 type, then w,h.
  const w = bytes.readUInt32BE(16), h = bytes.readUInt32BE(20);
  ok(label + ': it is still the same picture (' + w + 'x' + h + ')',
     label === 'logo' ? (w === 680 && h === 395) : (w === 256 && h === 256));
}

console.log('--- the initial document asks for a URL ---');
const IDX = read('Index.html');
ok('three logo placeholders',   (IDX.match(/<\?!= getLogoUrl\(\) \?>/g) || []).length === 3);
ok('and one avatar',            (IDX.match(/<\?!= getPilotAvatarUrl\(\) \?>/g) || []).length === 1);
ok('none of them is the old data-url getter', !/getLogoDataUrl/.test(IDX));
/* doGet serves this same template through HtmlService, so the placeholder is
 * evaluated in TWO places — Apps Script at runtime and build.js for Vercel. Both
 * must resolve, or one front door loses its logo. */
ok('Apps Script can still resolve it', /function getLogoUrl\(\)/.test(CFG));
const BUILD = read('build.js');
ok('and so can the build',      /<\\\?!=\\s\*getLogoUrl/.test(BUILD) || /getLogoUrl/.test(BUILD));
ok('the build reads the name from ConfigService, not a second copy',
   /brandFile\('BRAND_LOGO_FILE_'\)/.test(BUILD) && /brandFile\('BRAND_AVATAR_FILE_'\)/.test(BUILD));
ok('and copies the files into dist', /dist\/brand|path\.join\(DIST, 'brand'\)/.test(BUILD));

console.log('--- the emails still get the bytes ---');
/* An email is read outside the app, so a URL into the app is no use to it.
 * These seven inline the picture with MailApp's inlineImages and genuinely need
 * a Blob. */
const MAIL = ['Userservice.js', 'TourService.js', 'Código.js'];
let blobCalls = 0, guarded = 0;
for (const f of MAIL) {
  const src = read(f);
  blobCalls += (src.match(/getLogoBlob_\(\)/g) || []).length;
  guarded   += (src.match(/inlineImages: \w+ \? \{ aerocommsLogo: \w+ \} : \{\}/g) || []).length;
  ok(f + ' no longer decodes base64 by hand',
     !/getLogoDataUrl\(\)\.split\(','\)\[1\]/.test(src));
}
ok('all seven callers use the one helper', blobCalls === 7);
// A brand image is not worth failing a password email over.
ok('and every one sends without the logo if the fetch fails', guarded === 7);
ok('the helper returns null rather than throwing',
   /function getLogoBlob_\(\)[\s\S]{0,700}return null;/.test(CFG));
ok('and it fetches the same file the browser gets',
   /UrlFetchApp\.fetch\(getLogoUrl\(\)/.test(CFG));

console.log('--- what was deliberately left alone ---');
/* Gamification 213 and 383 put the image straight into an email's htmlBody,
 * which mail clients discard. Renamed only, so they do not call a function that
 * no longer exists; the defect underneath has its own ticket. */
const GAM = read('Gamification.js');
ok('the two htmlBody images follow the rename', (GAM.match(/getLogoUrl\(\)/g) || []).length === 2);
ok('and none of them calls the deleted getter', !/getLogoDataUrl/.test(GAM));

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
