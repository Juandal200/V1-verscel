/*******************************************************
 * SetupDatabaseFix.gs
 * Standalone script to configure the ICAO Trainer database.
 * Run runSetupFix() once after pointing ICAO_DATABASE_SPREADSHEET_ID
 * to your corporate spreadsheet.
 *******************************************************/

// Replace with your corporate spreadsheet ID before running runSetupFix().
// Find it in: docs.google.com/spreadsheets/d/YOUR_ID_HERE/edit
var ICAO_DATABASE_SPREADSHEET_ID = 'YOUR_NEW_SPREADSHEET_ID_HERE';

function runSetupFix() {
  if (ICAO_DATABASE_SPREADSHEET_ID === 'YOUR_NEW_SPREADSHEET_ID_HERE') {
    throw new Error('Update ICAO_DATABASE_SPREADSHEET_ID at the top of Setupdatabasefix.js with your corporate spreadsheet ID before running.');
  }

  var props = PropertiesService.getScriptProperties();
  props.setProperty('DB_SPREADSHEET_ID',        ICAO_DATABASE_SPREADSHEET_ID);
  props.setProperty('DATABASE_SPREADSHEET_ID',  ICAO_DATABASE_SPREADSHEET_ID);
  props.setProperty('SPREADSHEET_ID',           ICAO_DATABASE_SPREADSHEET_ID);
  props.setProperty('ICAO_DB_SPREADSHEET_ID',   ICAO_DATABASE_SPREADSHEET_ID);

  var ss = SpreadsheetApp.openById(ICAO_DATABASE_SPREADSHEET_ID);

  ensureSheetWithHeaders_(ss, 'Users', [
    'userId',
    'googleSub',
    'email',
    'name',
    'role',
    'status',
    'currentLevel',
    'currentCountry',
    'assignedGroupId',
    'totalLearningSeconds',
    'createdAt',
    'updatedAt',
    'lastLoginAt'
  ]);

  ensureSheetWithHeaders_(ss, 'LoginCodes', [
    'codeId',
    'email',
    'name',
    'codeHash',
    'status',
    'expiresAt',
    'attempts',
    'createdAt',
    'usedAt'
  ]);

  ensureSheetWithHeaders_(ss, 'Scenarios', [
    'scenarioId',
    'scenarioOrder',
    'level',
    'country',
    'flightScenarioId',
    'flightScenarioName',
    'phaseCode',
    'phaseName',
    'phaseOrder',
    'scenarioType',
    'emergencyType',
    'context',
    'atcText',
    'expectedReadback',
    'keywords',
    'imageFileId',
    'videoUrl',
    'audioUrl',
    'isActive',
    'version',
    'createdBy',
    'createdAt',
    'updatedAt'
  ]);

  ensureSheetWithHeaders_(ss, 'Sessions', [
    'token',
    'userId',
    'email',
    'role',
    'createdAt',
    'expiresAt'
  ]);

  ensureSheetWithHeaders_(ss, 'Attempts', [
    'attemptId',
    'userId',
    'groupId',
    'scenarioId',
    'level',
    'country',
    'atcText',
    'studentAnswer',
    'expectedAnswer',
    'keywordsOk',
    'keywordsMissing',
    'score',
    'correct',
    'responseTimeSec',
    'replayCount',
    'attemptNumber',
    'createdAt'
  ]);

  ensureSheetWithHeaders_(ss, 'Progress', [
    'progressId',
    'userId',
    'level',
    'country',
    'completedScenarios',
    'totalScenarios',
    'progressPct',
    'scoreAvg',
    'unlocked',
    'completed',
    'completedAt',
    'updatedAt'
  ]);

  ensureSheetWithHeaders_(ss, 'Groups', [
    'groupId',
    'groupName',
    'instructorId',
    'status',
    'createdAt',
    'updatedAt'
  ]);

  ensureSheetWithHeaders_(ss, 'LearningTime', [
    'sessionId',
    'userId',
    'startTime',
    'endTime',
    'durationSec',
    'level',
    'country',
    'createdAt'
  ]);

  ensureSheetWithHeaders_(ss, 'Certificates', [
    'certificateId',
    'userId',
    'level',
    'country',
    'scoreAvg',
    'issuedAt',
    'pdfFileId',
    'validationCode'
  ]);

  ensureSheetWithHeaders_(ss, 'AdminLogs', [
    'logId',
    'actorUserId',
    'action',
    'entity',
    'entityId',
    'beforeJson',
    'afterJson',
    'createdAt'
  ]);

  ensureSheetWithHeaders_(ss, 'ErrorLogs', [
    'errorId',
    'source',
    'message',
    'stack',
    'userId',
    'createdAt'
  ]);

  ensureSheetWithHeaders_(ss, 'Config', [
    'key',
    'value',
    'description',
    'updatedAt'
  ]);

  Logger.log('Database configured: ' + ss.getName());

  return {
    ok: true,
    message: 'Database configured correctly.',
    spreadsheetId: ICAO_DATABASE_SPREADSHEET_ID,
    spreadsheetName: ss.getName()
  };
}

function testDatabaseFixConnection() {
  var props = PropertiesService.getScriptProperties();
  var id =
    props.getProperty('DB_SPREADSHEET_ID') ||
    props.getProperty('DATABASE_SPREADSHEET_ID') ||
    props.getProperty('SPREADSHEET_ID') ||
    props.getProperty('ICAO_DB_SPREADSHEET_ID');

  if (!id) {
    throw new Error('No database property found. Run runSetupFix() first.');
  }

  var ss = SpreadsheetApp.openById(id);
  Logger.log('Database OK: ' + ss.getName());

  return {
    ok: true,
    spreadsheetId: id,
    spreadsheetName: ss.getName(),
    sheets: ss.getSheets().map(function(sheet) { return sheet.getName(); })
  };
}

function ensureSheetWithHeaders_(ss, sheetName, requiredHeaders) {
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
    formatHeader_(sheet, requiredHeaders.length);
    return;
  }

  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var currentHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) {
    return String(h || '').trim();
  });

  var currentMap = {};
  currentHeaders.forEach(function(h) { if (h) currentMap[h.toLowerCase()] = true; });

  var missing = requiredHeaders.filter(function(h) { return !currentMap[h.toLowerCase()]; });

  if (missing.length > 0) {
    sheet.getRange(1, sheet.getLastColumn() + 1, 1, missing.length).setValues([missing]);
  }

  formatHeader_(sheet, sheet.getLastColumn());
}

function formatHeader_(sheet, lastCol) {
  if (!lastCol || lastCol < 1) return;
  sheet.getRange(1, 1, 1, lastCol)
    .setFontWeight('bold')
    .setBackground('#0f172a')
    .setFontColor('#ffffff');
  sheet.setFrozenRows(1);
}
