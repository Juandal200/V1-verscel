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
  'Drive Report'
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
    fileUrl                    || ''
  ]);
}

function _teaGetOrCreateSheet_() {
  // Use the same spreadsheet the rest of the app already uses
  var props = PropertiesService.getScriptProperties();
  var ssId  = props.getProperty('DB_SPREADSHEET_ID');
  if (!ssId) throw new Error('DB_SPREADSHEET_ID not set in Script Properties');

  var ss       = SpreadsheetApp.openById(ssId);
  var existing = ss.getSheetByName(TEA_TAB_NAME);
  if (existing) return existing;

  // First run — add the tab and write headers
  var sheet = ss.insertSheet(TEA_TAB_NAME);
  sheet.appendRow(TEA_SHEET_HEADERS);
  sheet.setFrozenRows(1);
  return sheet;
}
