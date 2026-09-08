/* One database, resolved in one place.
 *
 * The QA environment cannot exist until this passes. An environment switch works by
 * changing which spreadsheet a request resolves to — and that only holds if there is
 * exactly one place where the resolving happens. Today there are ten, they disagree
 * about which property names count, and four of them end in a hardcoded ID that no
 * property can override:
 *
 *   getDatabaseId_          five copies in Código.js, one in TTSService.js
 *   getDatabaseIdV5Hard_    a seventh, spelled differently
 *   inline chains           Código.js twice, Setupdatabasefix.js once
 *   bare literals           fetchLMSData, saveLMSScore and setupLMSSheets never
 *                           consult a property at all — and two of those three are
 *                           in the doPost allowlist, so they serve live traffic
 *
 * Every one of those is a route around the switch. Point a QA deployment at a QA
 * spreadsheet with these in place and most writes still land in production, silently:
 * no error, no log line, and nothing on screen to say a real student's row just moved.
 *
 * So the counting is done here rather than being remembered. The maxima below are the
 * TARGET state, not the current one — this suite is expected to fail until Phase 1 of
 * the QA split lands, and its output is that phase's definition of done. Raising a
 * number is allowed; doing it silently is not.
 */
const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/* The Apps Script sources — everything clasp pushes. build.js, shim.js and sw.js run
 * on Vercel or in the browser and are listed in .claspignore, so they are not GAS.
 *
 * _EnvReport.js is exempt because its entire purpose is to name the hardcoded ids and
 * open them, to find out what they point at. It is temporary Phase 0 discovery, and
 * the last invariant below fails while it is still in the tree. */
const NOT_GAS = ['build.js', 'shim.js', 'sw.js', '_EnvReport.js'];
const GAS = fs.readdirSync(ROOT)
  .filter(f => f.endsWith('.js') && !NOT_GAS.includes(f))
  .map(f => ({ name: f, src: fs.readFileSync(path.join(ROOT, f), 'utf8') }));

/* The Vercel serverless functions. */
const API_DIR = path.join(ROOT, 'api');
const API = fs.readdirSync(API_DIR)
  .filter(f => f.endsWith('.mjs'))
  .map(f => ({ name: 'api/' + f, src: fs.readFileSync(path.join(API_DIR, f), 'utf8') }));

let fails = 0;
const ok = (n, c) => { if (!c) fails++; console.log((c ? '  PASS  ' : '  FAIL  ') + n); };

/* Count matches across a file set, returning the per-file tally so a failure names
 * the files to open rather than only a number. */
function tally(files, re, skip) {
  const hits = [];
  let total = 0;
  files.forEach(f => {
    if (skip && skip.includes(f.name)) return;
    const n = (f.src.match(re) || []).length;
    if (n) { hits.push(f.name + ' ×' + n); total += n; }
  });
  return { total, hits };
}

function invariant(what, files, re, max, why, skip) {
  const { total, hits } = tally(files, re, skip);
  const good = total <= max;
  ok(`${String(total).padStart(2)} / max ${max}  ${what}`, good);
  if (!good) {
    console.log('           why it matters: ' + why);
    console.log('           found in: ' + hits.join(', '));
  }
}

console.log('--- one place resolves a spreadsheet ---');

invariant(
  'openById calls outside DatabaseService.js',
  GAS, /SpreadsheetApp\.openById\(/g, 0,
  'the environment switch lives in dbGetSpreadsheet_. A call that opens an id from ' +
  'anywhere else has already decided which database it wants, and no switch can ' +
  'reach it',
  ['DatabaseService.js']
);

invariant(
  'duplicate resolver implementations',
  GAS, /getDatabaseId_\s*:\s*function|function\s+getDatabaseIdV5Hard_/g, 0,
  'ten copies is how the four property names came to disagree. One resolver, or the ' +
  'next person fixes nine of them'
);

console.log('--- one property name means one database ---');

invariant(
  'reads of the legacy alias property names',
  GAS, /getProperty\(\s*['"](?:DATABASE_SPREADSHEET_ID|ICAO_DB_SPREADSHEET_ID|SPREADSHEET_ID)['"]\s*\)/g, 0,
  'a QA switch that sets DB_SPREADSHEET_ID_QA is defeated by any alias still ' +
  'resolving to production. Setupdatabasefix.js writes all four to the same value, ' +
  'so today they only look equivalent by accident'
);

invariant(
  'hardcoded spreadsheet ids',
  GAS, /['"]1[A-Za-z0-9_-]{41,45}['"]/g, 0,
  'a literal id is a fallback that ignores every property, including the QA one. ' +
  'Missing configuration must throw, the way DatabaseService.js already does — a ' +
  'loud failure in QA is worth more than a working QA that writes production'
);

console.log('--- one place resolves a Drive folder ---');

invariant(
  'folder lookups outside driveFolder_',
  GAS, /DriveApp\.getFoldersByName\(/g, 0,
  'both deployments run as the same account unless deployed separately, so a ' +
  'name-based lookup returns the same folder for both. IcaoTestItemService trashes ' +
  'the previous file when it regenerates, which makes a shared folder destructive',
  ['DatabaseService.js']
);

console.log('--- the proxy points where its environment says  (Phase 4) ---');

invariant(
  'hardcoded Apps Script urls in api/',
  API, /script\.google\.com\/macros/g, 0,
  'GAS_URL must come from the environment and throw when absent. tea-pipeline.mjs ' +
  'already reads the env var but falls back to the production literal, which fails ' +
  'open — straight into production'
);

console.log('--- discovery scaffolding is cleaned up ---');

/* _EnvReport.js answers Phase 0 and is then dead weight that names two production
 * spreadsheet ids in the source. Deleting it is part of finishing, not an afterthought. */
const diagnosticPresent = fs.existsSync(path.join(ROOT, '_EnvReport.js'));
ok(` ${diagnosticPresent ? 1 : 0} / max 0  temporary Phase 0 diagnostics still in the tree`,
   !diagnosticPresent);
if (diagnosticPresent) {
  console.log('           why it matters: it hardcodes both production spreadsheet ids ' +
              'and is exempt from the scans above. Delete it once Phase 0 is answered, ' +
              'then clasp push again.');
}

/* The api/ invariant belongs to Phase 4, not Phase 1: making GAS_URL mandatory has to
 * land at the same time as the Vercel environment variable that supplies it, or the
 * next deploy takes production down. Phase 1 is finished when everything above that
 * line is green. */
console.log(fails
  ? '\n' + fails + ' FAILING. Everything above the Phase 4 line is Phase 1 — ' +
    'each entry names the files still holding a second copy.'
  : '\nall green — one resolver, one property, one folder helper, one url');
process.exit(fails ? 1 : 0);
