/*******************************************************
 * TEAService.gs
 * Persists TEA exam results to Google Drive (JSON report)
 * and appends a summary row to the TEA scores spreadsheet.
 *******************************************************/

var TEA_FOLDER_NAME  = 'AEROCOMMS TEA Results';
var TEA_TAB_NAME     = 'TEA Results';

var TEA_SHEET_HEADERS = [
  'Date', 'Candidate', 'Overall Band',
  'Pronunciation', 'Structure', 'Vocabulary',
  'Fluency', 'Comprehension', 'Interactions',
  'Drive Report',
  // Which item bank this sitting drew from. Versions can differ in difficulty, so
  // results from different banks are not comparable without knowing which was sat.
  'Version',
  // How it was graded. 'pipeline' scored transcribed speech with pace, pause and
  // hesitation data; 'conversation' scored the text of the conversation because
  // there was no recorded audio or the pipeline failed. They are not equivalent
  // evidence, and a results table that hides which is which is worse than one
  // without the column.
  'Source',
  // Which part of the exam ran. FULL is a real sitting; 2A, 2B, 2C, 1, 3 and SCORE
  // are section test runs and must not be read as exam results.
  'Scope'
];

/**
 * Called by doPost via action: 'apiSaveTEAResult'.
 * @param {object} data  The gasData object from tea-pipeline.mjs
 */
function apiSaveTEAResult(data) {
  try {
    var folder   = _teaGetOrCreateFolder_();
    var fileUrl  = _teaSaveJsonReport_(folder, data);
    _teaAppendSheetRow_(data, fileUrl);
    return { ok: true, driveFileUrl: fileUrl };
  } catch (err) {
    console.error('[TEAService] apiSaveTEAResult error:', err.message);
    return { ok: false, error: err.message };
  }
}

// ── Drive ──────────────────────────────────────────────────────────────────

function testApiSaveTEAResult() {
  var result = apiSaveTEAResult({
    candidateId:  'test@test.com',
    examDate:     new Date().toISOString(),
    savedAt:      new Date().toISOString(),
    overallBand:  4,
    scores:       { pronunciation:4, structure:4, vocabulary:5, fluency:4, comprehension:4, interactions:4 },
    studentFeedback: {
      pronunciation: 'Good clarity overall.',
      structure:     'Sentence control is solid.',
      vocabulary:    'Wide range of aviation terms.',
      fluency:       'Appropriate tempo maintained.',
      comprehension: 'Understood all scenarios.',
      interactions:  'Responses were timely and clear.'
    },
    adminReport: {
      annotatedTranscript:    '[P1]: FLUENCY - slight pause before response',
      technicalJustification: { pronunciation:'...', structure:'...', vocabulary:'...', fluency:'...', comprehension:'...', interactions:'...' }
    },
    enrichedTranscript: '[Speech rate: 110 WPM] This is a test enriched transcript.'
  });
  console.log(JSON.stringify(result));
}

function authorizeTeaDrive() {
  var f = DriveApp.createFolder('_TEA_AUTH_TEST_');
  f.setTrashed(true);
}

function _teaGetOrCreateFolder_() {
  var it = DriveApp.getFoldersByName(TEA_FOLDER_NAME);
  return it.hasNext() ? it.next() : DriveApp.createFolder(TEA_FOLDER_NAME);
}

function _teaSaveJsonReport_(folder, data) {
  var safeCandidateId = String(data.candidateId || 'unknown').replace(/[^a-zA-Z0-9@._-]/g, '_');
  var dateStr = String(data.examDate || new Date().toISOString()).substring(0, 10);
  var fileName = 'TEA_' + safeCandidateId + '_' + dateStr + '.json';

  var blob = Utilities.newBlob(
    JSON.stringify(data, null, 2),
    'application/json',
    fileName
  );
  var file = folder.createFile(blob);
  return file.getUrl();
}

// ── Sheets ─────────────────────────────────────────────────────────────────

function _teaAppendSheetRow_(data, fileUrl) {
  var sheet  = _teaGetOrCreateSheet_();
  var scores = data.scores || {};

  sheet.appendRow([
    data.examDate              || new Date().toISOString(),
    data.candidateId           || 'unknown',
    data.overallBand           || '',
    scores.pronunciation       || '',
    scores.structure           || '',
    scores.vocabulary          || '',
    scores.fluency             || '',
    scores.comprehension       || '',
    scores.interactions        || '',
    fileUrl                    || '',
    data.bank                  || '',
    data.source                || 'pipeline',
    data.scope                 || 'FULL'
  ]);
}

function _teaGetOrCreateSheet_() {
  // Use the same spreadsheet the rest of the app already uses
  var props = PropertiesService.getScriptProperties();
  var ssId  = props.getProperty('DB_SPREADSHEET_ID');
  if (!ssId) throw new Error('DB_SPREADSHEET_ID not set in Script Properties');

  var ss       = SpreadsheetApp.openById(ssId);
  var existing = ss.getSheetByName(TEA_TAB_NAME);
  if (existing) {
    // Headers are only written when the tab is created, so a column added to
    // TEA_SHEET_HEADERS later would never appear and its values would land under
    // a blank heading. Fill in any trailing headers the sheet is missing.
    var width = existing.getLastColumn();
    if (width < TEA_SHEET_HEADERS.length) {
      var missing = TEA_SHEET_HEADERS.slice(width);
      existing.getRange(1, width + 1, 1, missing.length)
              .setValues([missing]).setFontWeight('bold');
    }
    return existing;
  }

  // First run — add the tab and write headers
  var sheet = ss.insertSheet(TEA_TAB_NAME);
  sheet.appendRow(TEA_SHEET_HEADERS);
  sheet.setFrozenRows(1);
  return sheet;
}


/**
 * Saves a result that was graded conversationally rather than through the audio
 * pipeline.
 *
 * The pipeline path has always persisted its results. The fallback path — used
 * whenever the pipeline fails AND for every sitting answered by typing, since
 * there is then no recorded audio to transcribe — rendered a report on screen and
 * kept nothing. Those sittings simply did not exist afterwards, which is a poor
 * position to be in when the thing being judged is the quality of the grading.
 *
 * Same Drive file and same summary row as the pipeline, marked so the two can be
 * told apart.
 */
function apiSaveIcaoExamResult(sessionToken, payload) {
  try {
    var user = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    payload = payload || {};
    var sv = payload.student_view || {};
    var av = payload.admin_view   || {};

    function band(d) { return (sv[d] && sv[d].score) || 0; }
    function fb(d)   { return (sv[d] && sv[d].feedback) || ''; }

    var data = {
      candidateId: String(user.email || user.userId || 'unknown'),
      examDate:    String(payload.examDate || now_()),
      savedAt:     now_(),
      bank:        String(payload.bank  || ''),
      scope:       String(payload.scope || 'FULL'),
      source:      'conversation',
      overallBand: Number(sv.overall_band) || 0,
      scores: {
        pronunciation: band('pronunciation'), structure:     band('structure'),
        vocabulary:    band('vocabulary'),    fluency:       band('fluency'),
        comprehension: band('comprehension'), interactions:  band('interactions')
      },
      studentFeedback: {
        pronunciation: fb('pronunciation'), structure:     fb('structure'),
        vocabulary:    fb('vocabulary'),    fluency:       fb('fluency'),
        comprehension: fb('comprehension'), interactions:  fb('interactions')
      },
      adminReport: {
        annotatedTranscript:    (av && av.transcript) || '',
        technicalJustification: (av && av.technical_justification) || {}
      },
      // No Whisper output on this path, so the conversation itself is the record of
      // what the candidate actually said.
      enrichedTranscript: _teaFlattenHistory_(payload.history),
      sectionReports: payload.sectionReports || []
    };

    var folder  = _teaGetOrCreateFolder_();
    var fileUrl = _teaSaveJsonReport_(folder, data);
    _teaAppendSheetRow_(data, fileUrl);
    return { ok: true, driveFileUrl: fileUrl };
  } catch (err) {
    return { ok: false, error: (err && err.message) || 'Save failed' };
  }
}

function _teaFlattenHistory_(history) {
  if (!history || !history.length) return '';
  return history.map(function(m) {
    var who = m.role === 'assistant' ? 'EXAMINER' : 'CANDIDATE';
    return who + ': ' + String(m.content || '');
  }).join('\n\n');
}


/**
 * A candidate's own exam history.
 *
 * Results have been accumulating in two places — the TEA Results tab and
 * IcaoTestSectionReports — readable only by an admin. The person the reports
 * describe had no way to see them, which makes a report a one-time thing you
 * either read on the day or lose.
 *
 * Reads the results tab directly rather than through dbReadAll_: it predates
 * DB_SCHEMA and is not registered there.
 */
function apiGetMyIcaoResults(sessionToken) {
  try {
    var user  = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    var email = String(user.email || '').trim().toLowerCase();

    var results = [];
    try {
      var sheet   = _teaGetOrCreateSheet_();
      var lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        var width = Math.max(sheet.getLastColumn(), TEA_SHEET_HEADERS.length);
        var rows  = sheet.getRange(2, 1, lastRow - 1, width).getValues();
        var idx   = {};
        TEA_SHEET_HEADERS.forEach(function(h, i) { idx[h] = i; });

        rows.forEach(function(r) {
          if (String(r[idx['Candidate']] || '').trim().toLowerCase() !== email) return;
          results.push({
            date:    String(r[idx['Date']] || ''),
            band:    Number(r[idx['Overall Band']]) || 0,
            scores: {
              pronunciation: Number(r[idx['Pronunciation']]) || 0,
              structure:     Number(r[idx['Structure']])     || 0,
              vocabulary:    Number(r[idx['Vocabulary']])    || 0,
              fluency:       Number(r[idx['Fluency']])       || 0,
              comprehension: Number(r[idx['Comprehension']]) || 0,
              interactions:  Number(r[idx['Interactions']])  || 0
            },
            version: String(r[idx['Version']] || ''),
            source:  String(r[idx['Source']]  || 'pipeline'),
            scope:   String(r[idx['Scope']]   || 'FULL')
          });
        });
      }
    } catch (e) { /* no results tab yet */ }

    var sections = [];
    try {
      dbReadAll_('IcaoTestSectionReports').forEach(function(r) {
        if (String(r.userId || '') !== String(user.userId)) return;
        sections.push({
          section:  String(r.section || ''),
          scope:    String(r.scope   || ''),
          bands: {
            pronunciation: Number(r.pronunciation) || 0,
            structure:     Number(r.structure)     || 0,
            vocabulary:    Number(r.vocabulary)    || 0,
            fluency:       Number(r.fluency)       || 0,
            comprehension: Number(r.comprehension) || 0,
            interactions:  Number(r.interactions)  || 0
          },
          strength:  String(r.strength || ''),
          improve:   String(r.improve  || ''),
          note:      String(r.note     || ''),
          createdAt: String(r.createdAt || '')
        });
      });
    } catch (e) { /* sheet not created yet */ }

    // Newest first, and the Drive report link is deliberately NOT returned: those
    // files carry the admin view, which is not the candidate's to read.
    results.sort(function(a, b) { return String(b.date).localeCompare(String(a.date)); });
    sections.sort(function(a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });

    return { ok: true, results: results, sections: sections };
  } catch (err) {
    return { ok: false, error: (err && err.message) || 'Could not load results' };
  }
}


/**
 * Saves the transcript of a completed sitting BEFORE it has been scored.
 *
 * Nothing was written until a report existed, so an examination that finished but
 * failed to score left no trace at all: twenty-five minutes of a candidate's work,
 * gone because the last step timed out. The sitting and the score are separate
 * facts, and the first does not depend on the second.
 *
 * The row is marked PENDING with no bands. If scoring later succeeds a normal row
 * is written alongside it; the pending row stays as the record that the exam was
 * actually sat.
 */
function apiSaveIcaoTranscript(sessionToken, payload) {
  try {
    var user = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    payload = payload || {};

    var data = {
      candidateId: String(user.email || user.userId || 'unknown'),
      examDate:    String(payload.examDate || now_()),
      savedAt:     now_(),
      bank:        String(payload.bank  || ''),
      scope:       String(payload.scope || 'FULL'),
      source:      'transcript-only',
      overallBand: '',
      scores:      {},
      studentFeedback: {},
      adminReport: { annotatedTranscript: '', technicalJustification: {} },
      enrichedTranscript: _teaFlattenHistory_(payload.history),
      note: 'PENDING — the sitting completed; scoring had not produced a report when this was saved.'
    };

    var folder  = _teaGetOrCreateFolder_();
    var fileUrl = _teaSaveJsonReport_(folder, data);
    _teaAppendSheetRow_(data, fileUrl);
    return { ok: true, driveFileUrl: fileUrl };
  } catch (err) {
    return { ok: false, error: (err && err.message) || 'Save failed' };
  }
}
