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
