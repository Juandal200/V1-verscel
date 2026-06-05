

  /*******************************************************
 * DatabaseHardFix.gs
 * Reparación fuerte de configuración de base de datos
 *******************************************************/

// Replace with your corporate spreadsheet ID before running forceSetupDatabaseHard().
// Find it in: docs.google.com/spreadsheets/d/YOUR_ID_HERE/edit
var ICAO_HARD_DB_ID = '15Za2QsPmUcDwN92qzY1SMpihUCyLh3zeuZwcnmb9H1E';

function forceSetupDatabaseHard() {
  if (ICAO_HARD_DB_ID === 'YOUR_NEW_SPREADSHEET_ID_HERE') {
    throw new Error('Update ICAO_HARD_DB_ID at the top of DatabaseHardFix.js with your corporate spreadsheet ID before running.');
  }

  var props = PropertiesService.getScriptProperties();
  var ss = SpreadsheetApp.openById(ICAO_HARD_DB_ID);

  var keys = [
    'DB_SPREADSHEET_ID',
    'DATABASE_SPREADSHEET_ID',
    'SPREADSHEET_ID',
    'ICAO_DB_SPREADSHEET_ID',
    'DB_ID',
    'DATABASE_ID',
    'SHEET_ID',
    'DATA_SPREADSHEET_ID',
    'PROP_DB_SPREADSHEET_ID',
    'PROP_DATABASE_SPREADSHEET_ID',
    'PROP_SPREADSHEET_ID'
  ];

  keys.forEach(function(key) {
    props.setProperty(key, ICAO_HARD_DB_ID);
  });

  try {
    if (typeof CONFIG !== 'undefined' && CONFIG) {
      Object.keys(CONFIG).forEach(function(key) {
        if (key.indexOf('PROP_') === 0 && typeof CONFIG[key] === 'string') {
          var propName = CONFIG[key];

          if (
            propName.toUpperCase().indexOf('DB') >= 0 ||
            propName.toUpperCase().indexOf('DATABASE') >= 0 ||
            propName.toUpperCase().indexOf('SPREADSHEET') >= 0 ||
            propName.toUpperCase().indexOf('SHEET') >= 0
          ) {
            props.setProperty(propName, ICAO_HARD_DB_ID);
          }
        }
      });
    }
  } catch (err) {
    Logger.log('CONFIG scan skipped: ' + err.message);
  }

  ensureHardSheet_(ss, 'Users', [
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
    'lastLoginAt',
    'companyId',
    'licenseType'
  ]);

  ensureHardSheet_(ss, 'LoginCodes', [
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

  ensureHardSheet_(ss, 'Scenarios', [
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

  ensureHardSheet_(ss, 'Sessions', [
    'token',
    'userId',
    'email',
    'role',
    'createdAt',
    'expiresAt'
  ]);

  ensureHardSheet_(ss, 'Attempts', [
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

  ensureHardSheet_(ss, 'Progress', [
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

  ensureHardSheet_(ss, 'AdminLogs', [
    'logId',
    'actorUserId',
    'action',
    'entity',
    'entityId',
    'beforeJson',
    'afterJson',
    'createdAt'
  ]);

  ensureHardSheet_(ss, 'ErrorLogs', [
    'errorId',
    'source',
    'message',
    'stack',
    'userId',
    'createdAt'
  ]);

  ensureHardSheet_(ss, 'Groups', [
    'groupId',
    'groupName',
    'instructorId',
    'status',
    'createdAt',
    'updatedAt'
  ]);

  ensureHardSheet_(ss, 'LearningTime', [
    'sessionId',
    'userId',
    'startTime',
    'endTime',
    'durationSec',
    'level',
    'country',
    'createdAt'
  ]);

  ensureHardSheet_(ss, 'Certificates', [
    'certificateId',
    'userId',
    'level',
    'country',
    'scoreAvg',
    'issuedAt',
    'pdfFileId',
    'validationCode'
  ]);

  ensureHardSheet_(ss, 'Config', [
    'key',
    'value',
    'description',
    'updatedAt'
  ]);

  var allProps = props.getProperties();

  Logger.log('Database hard setup OK.');
  Logger.log('Spreadsheet: ' + ss.getName());
  Logger.log(JSON.stringify(allProps, null, 2));

  return {
    ok: true,
    message: 'Database hard setup OK',
    spreadsheetId: ICAO_HARD_DB_ID,
    spreadsheetName: ss.getName(),
    scriptProperties: allProps
  };
}

function testDatabaseHardConnection() {
  var props = PropertiesService.getScriptProperties();
  var allProps = props.getProperties();

  var possibleKeys = [
    'DB_SPREADSHEET_ID',
    'DATABASE_SPREADSHEET_ID',
    'SPREADSHEET_ID',
    'ICAO_DB_SPREADSHEET_ID',
    'DB_ID',
    'DATABASE_ID',
    'SHEET_ID',
    'DATA_SPREADSHEET_ID'
  ];

  var found = {};

  possibleKeys.forEach(function(key) {
    found[key] = props.getProperty(key) || '';
  });

  var ss = SpreadsheetApp.openById(ICAO_HARD_DB_ID);

  var dbReadAllWorks = false;
  var dbReadAllError = '';

  try {
    if (typeof dbReadAll_ === 'function') {
      var users = dbReadAll_('Users');
      dbReadAllWorks = true;
      Logger.log('dbReadAll_(Users) works. Rows: ' + users.length);
    } else {
      dbReadAllError = 'dbReadAll_ is not defined.';
    }
  } catch (err) {
    dbReadAllError = err && err.message ? err.message : String(err);
  }

  var report = {
    ok: true,
    spreadsheetId: ICAO_HARD_DB_ID,
    spreadsheetName: ss.getName(),
    sheets: ss.getSheets().map(function(sheet) {
      return sheet.getName();
    }),
    foundProperties: found,
    allScriptProperties: allProps,
    dbReadAllWorks: dbReadAllWorks,
    dbReadAllError: dbReadAllError
  };

  Logger.log(JSON.stringify(report, null, 2));

  return report;
}

function testOtpBackendAfterDatabaseFix() {
  var email = Session.getEffectiveUser().getEmail();

console.log("THE SCRIPT IS LOOKING FOR: " + email);

  var result = AuthService.createOtpCode(email, 'DATABASE TEST USER');

  Logger.log(JSON.stringify(result, null, 2));

  return result;
}

function ensureHardSheet_(ss, sheetName, headers) {
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    hardFormatHeader_(sheet);
    return;
  }

  var lastCol = Math.max(sheet.getLastColumn(), 1);

  var currentHeaders = sheet
    .getRange(1, 1, 1, lastCol)
    .getValues()[0]
    .map(function(header) {
      return String(header || '').trim();
    });

  var currentMap = {};

  currentHeaders.forEach(function(header) {
    if (header) {
      currentMap[header.toLowerCase()] = true;
    }
  });

  var missing = headers.filter(function(header) {
    return !currentMap[header.toLowerCase()];
  });

  if (missing.length > 0) {
    sheet.getRange(1, sheet.getLastColumn() + 1, 1, missing.length).setValues([missing]);
  }

  hardFormatHeader_(sheet);
}

function hardFormatHeader_(sheet) {
  var lastCol = sheet.getLastColumn();

  if (!lastCol) {
    return;
  }

  sheet.getRange(1, 1, 1, lastCol)
    .setFontWeight('bold')
    .setBackground('#0f172a')
    .setFontColor('#ffffff');

  sheet.setFrozenRows(1);
}


function manualEmailTest() {
  // Replace with the email address you want to test delivery to, then run once.
  var testEmail = 'YOUR_TEST_EMAIL_HERE';

  if (testEmail === 'YOUR_TEST_EMAIL_HERE') {
    throw new Error('Replace YOUR_TEST_EMAIL_HERE with an actual email address before running.');
  }

  try {
    GmailApp.sendEmail(testEmail, 'Test from Corporate', 'Is this working?');
    Logger.log("SUCCESS: Check the inbox for " + testEmail + " and the corporate 'Sent' folder.");
  } catch (e) {
    Logger.log('ERROR: ' + e.toString());
    throw e;
  }
}
