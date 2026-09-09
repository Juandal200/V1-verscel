/* Who may read the examiner's working, now that there is a door.
 *
 * F-0021 shut the candidate's route to the admin report — the client function was
 * deleted and api/tea.mjs refuses the [ADMIN_REPORT] instruction for anyone who is
 * not ADMIN or INSTRUCTOR. That closed the leak and left instructors with no way
 * in at all, which is T-4. apiGetIcaoAdminReport is that way in.
 *
 * The function is lifted out of TEAService.js and RUN, with Apps Script stubbed.
 * A regex over the source would only say requireRole appears in the file; the
 * thing worth knowing is what a student actually gets back, and what an
 * instructor gets when they name a report belonging to somebody else. */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../TEAService.js', 'utf8');
const grab = (sig) => { const i = src.indexOf(sig); let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } } };

const HEADERS = eval('(' + src.slice(src.indexOf('var TEA_SHEET_HEADERS = [') + 'var TEA_SHEET_HEADERS = '.length,
                                    src.indexOf('];', src.indexOf('var TEA_SHEET_HEADERS')) + 1).replace(/\/\/[^\n]*/g,'') + ')');

const ROWS = [
  //Date        Candidate      Band P  S  V  F  C  I   DriveReport                     Ver Src Scope UserId
  ['2026-09-01','ana@x.com',   5,   5, 5, 5, 5, 5, 5,'https://drive.google.com/file/d/AAAAAAAAAAAAAAAAAAAAAAAAA/view','A','pipeline','FULL','u-ana'],
  ['2026-09-02','beto@x.com',  4,   4, 4, 4, 4, 4, 4,'https://drive.google.com/file/d/BBBBBBBBBBBBBBBBBBBBBBBBB/view','A','pipeline','FULL','u-beto'],
];
const FILES = {
  AAAAAAAAAAAAAAAAAAAAAAAAA: JSON.stringify({ overallBand:5, scores:{pronunciation:5},
    annotatedTranscript:'[P1] FLUENCY - slight pause', technicalJustification:{fluency:'x'},
    enrichedTranscript:'Ca: good morning' }),
  BBBBBBBBBBBBBBBBBBBBBBBBB: JSON.stringify({ overallBand:4, annotatedTranscript:'BETO ONLY' }),
};

let role = 'INSTRUCTOR', logged = [];
const sandbox = {
  AuthService: { requireRole(tok, roles) {
    if (!roles.includes(role)) { const e = new Error('This action is not available for your role.'); e.code='FORBIDDEN'; throw e; }
    return { email: 'teacher@x.com', role };
  }},
  TEA_SHEET_HEADERS: HEADERS,
  _teaGetOrCreateSheet_: () => ({
    getLastRow: () => ROWS.length + 1,
    getLastColumn: () => HEADERS.length,
    getRange: (r, c, n, w) => ({ getValues: () => ROWS.slice(r - 2, r - 2 + n) }),
  }),
  DriveApp: { getFileById(id) {
    if (!FILES[id]) throw new Error('File not found');
    return { getBlob: () => ({ getDataAsString: () => FILES[id] }) };
  }},
  console: { log: m => logged.push(m), warn(){}, error(){} },
};
const fn = new Function(...Object.keys(sandbox), grab('function apiGetIcaoAdminReport(') +
  '\nreturn apiGetIcaoAdminReport;')(...Object.values(sandbox));

let fails = 0; const ok=(n,c)=>{if(!c)fails++;console.log((c?'  PASS  ':'  FAIL  ')+n);};

console.log('--- who may ask ---');
for (const r of ['STUDENT', '', 'GUEST']) {
  role = r;
  const res = fn('tok', { candidate: 'ana@x.com' });
  ok('a ' + (r || 'roleless caller') + ' is refused', res.ok === false && res.code === 'FORBIDDEN');
  ok('and is told nothing about the sitting', !JSON.stringify(res).includes('slight pause'));
}
role = 'INSTRUCTOR';
ok('an instructor is not refused', fn('tok', { candidate: 'ana@x.com' }).ok === true);
role = 'ADMIN';
ok('nor an admin',                fn('tok', { candidate: 'ana@x.com' }).ok === true);

console.log('--- the index says what exists, and no more ---');
role = 'INSTRUCTOR';
const idx = fn('tok', { candidate: 'ana@x.com' });
ok('one sitting for ana',        idx.sittings.length === 1);
ok('found by userId too',        fn('tok', { userId: 'u-beto' }).sittings.length === 1);
ok('an unknown candidate is empty, not an error',
   fn('tok', { candidate: 'nobody@x.com' }).ok === true && fn('tok', { candidate: 'nobody@x.com' }).sittings.length === 0);
ok('naming nobody is refused',   fn('tok', {}).ok === false);
ok('the index carries no transcript', !JSON.stringify(idx).includes('slight pause'));
ok('but does carry the band',    idx.sittings[0].overallBand === 5);

console.log('--- the full view, and only for the right candidate ---');
const full = fn('tok', { candidate: 'ana@x.com', driveUrl: ROWS[0][9] });
ok('the admin view comes back',  full.ok === true && full.adminView.annotatedTranscript === '[P1] FLUENCY - slight pause');
ok('with the technical justification', full.adminView.technicalJustification.fluency === 'x');
ok('and both transcripts kept apart',  full.adminView.enrichedTranscript === 'Ca: good morning');
/* The guard that matters: an instructor IS entitled to read reports, so
 * requireRole cannot be what stops them pulling a file belonging to someone else. */
const cross = fn('tok', { candidate: 'ana@x.com', driveUrl: ROWS[1][9] });
ok('another candidate\'s report is refused even for a real instructor',
   cross.ok === false && cross.code === 'FORBIDDEN');
ok('and its contents do not leak in the refusal', !JSON.stringify(cross).includes('BETO ONLY'));
const bogus = fn('tok', { candidate: 'ana@x.com', driveUrl: 'https://drive.google.com/file/d/ZZZZZZZZZZZZZZZZZZZZZZZZZ/view' });
ok('an invented url is refused',  bogus.ok === false);

console.log('--- every read is on the record ---');
ok('the index read was logged',  logged.some(l => /admin report INDEX read by teacher@x.com/.test(l)));
ok('and the full read names the candidate',
   logged.some(l => /admin report READ by teacher@x.com — candidate ana@x.com/.test(l)));

console.log(fails?('\n'+fails+' FAILING'):'\nall green');
process.exit(fails?1:0);
