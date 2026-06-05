function dbGetSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var spreadsheetId = props.getProperty(CONFIG.PROP_DB_SPREADSHEET_ID);

  if (!spreadsheetId) {
    throw new Error('Database not configured. Run setupDatabase() first.');
  }

  return SpreadsheetApp.openById(spreadsheetId);
}

function dbGetSheet_(sheetName) {
  var ss = dbGetSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    throw new Error('Sheet not found: ' + sheetName);
  }

  return sheet;
}

function dbGetHeaders_(sheetName) {
  if (!DB_SCHEMA[sheetName]) {
    throw new Error('Unknown sheet schema: ' + sheetName);
  }

  return DB_SCHEMA[sheetName];
}

function dbReadAll_(sheetName) {
  var sheet = dbGetSheet_(sheetName);
  var lastRow = sheet.getLastRow();
  var headers = dbGetHeaders_(sheetName);

  if (lastRow < 2) {
    return [];
  }

  var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();

  return values
    .map(function(row, index) {
      var obj = {};

      headers.forEach(function(header, colIndex) {
        obj[header] = row[colIndex];
      });

      obj.__rowNumber = index + 2;
      return obj;
    })
    .filter(function(obj) {
      return Object.keys(obj).some(function(key) {
        return key !== '__rowNumber' && obj[key] !== '';
      });
    });
}

function dbFindOne_(sheetName, fieldName, value) {
  var rows = dbReadAll_(sheetName);
  var target = String(value || '').trim().toLowerCase();

  for (var i = 0; i < rows.length; i++) {
    var current = String(rows[i][fieldName] || '').trim().toLowerCase();

    if (current === target) {
      return rows[i];
    }
  }

  return null;
}

function dbAppend_(sheetName, obj) {
  var sheet = dbGetSheet_(sheetName);
  var headers = dbGetHeaders_(sheetName);

  var row = headers.map(function(header) {
    return obj[header] !== undefined ? obj[header] : '';
  });

  sheet.appendRow(row);

  return obj;
}

function dbUpdateByRow_(sheetName, rowNumber, patch) {
  var sheet = dbGetSheet_(sheetName);
  var headers = dbGetHeaders_(sheetName);

  headers.forEach(function(header, index) {
    if (Object.prototype.hasOwnProperty.call(patch, header)) {
      sheet.getRange(rowNumber, index + 1).setValue(patch[header]);
    }
  });
}

function dbDeleteByRow_(sheetName, rowNumber) {
  var sheet = dbGetSheet_(sheetName);
  var safeRowNumber = Number(rowNumber || 0);

  if (!safeRowNumber || safeRowNumber < 2) {
    throw new Error('Invalid row for delete.');
  }

  sheet.deleteRow(safeRowNumber);
}

function dbWithScriptLock_(callback) {
  var lock = LockService.getScriptLock();

  try {
    lock.waitLock(20000);
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function uuid_(prefix) {
  return prefix + '_' + Utilities.getUuid();
}

function now_() {
  return Utilities.formatDate(
    new Date(),
    CONFIG.TIMEZONE,
    "yyyy-MM-dd'T'HH:mm:ssXXX"
  );
}

function normalizeEmail_(email) {
  return String(email || '').trim().toLowerCase();
}

function safeJson_(obj) {
  try {
    return JSON.stringify(obj || {});
  } catch (err) {
    return '{}';
  }
}
