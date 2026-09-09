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

/* ACCEPTED, WITH A PRECONDITION, RATHER THAN ENFORCED AT ZERO.
 *
 * The original invariant wanted no literal at all: GAS_URL from the environment,
 * throwing when absent. That is the right end state and it cannot be the current
 * one, because GAS_WEBHOOK_URL is UNSET in Vercel (confirmed 2026-09-08). Throwing
 * on absence today takes the whole app down — every google.script.run call routes
 * through /api/gas. It is a two-step change that starts in the dashboard: set the
 * variable, confirm all four still answer, then drop the fallbacks.
 *
 * What WAS a live defect, and is fixed: two of the four had no override at all.
 * Setting the variable would have sent grading to one deployment and login, home
 * and levels to another — silently, with both halves working. That is the
 * split-deployment failure this project has hit four times.
 *
 * So the property asserted is the one that is true and worth keeping: all four
 * read the same variable, and all four fall back to the same literal. */
const API_FILES = ['gas.mjs', 'cron-streak-push.mjs', 'tea.mjs', 'tea-pipeline.mjs']
  .map(f => [f, fs.readFileSync(path.join(ROOT, 'api', f), 'utf8')]);

ok(' 4 / 4  api proxies read GAS_WEBHOOK_URL',
   API_FILES.every(([, t]) => /process\.env\.GAS_WEBHOOK_URL/.test(t)),
   API_FILES.filter(([, t]) => !/process\.env\.GAS_WEBHOOK_URL/.test(t)).map(([f]) => f).join(' '));

const literals = new Set();
API_FILES.forEach(([, t]) => (t.match(/AKfycb[A-Za-z0-9_-]+/g) || []).forEach(l => literals.add(l)));
ok(` ${literals.size} / 1  distinct deployment id across all four fallbacks`,
   literals.size === 1, [...literals].join(' '));

// The end state, recorded so it is not forgotten: this becomes max 0 once the
// variable is set in Vercel for Production and Preview.
ok(' the literal is a fallback, never the only source',
   API_FILES.every(([, t]) => /GAS_WEBHOOK_URL \|\|/.test(t.replace(/\s+/g, ' '))));

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
