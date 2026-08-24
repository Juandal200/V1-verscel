/**
 * Explicitly-scoped read cache.
 *
 * One attempt submission reads Attempts, Scenarios and Progress TWICE each — nine
 * full-sheet round-trips in total, every one a network call to Google's
 * spreadsheet service. Since the client now waits for server confirmation before
 * offering "Next exercise", the student sits watching that.
 *
 * This is deliberately NOT an always-on global cache: several places write sheets
 * directly rather than through these helpers (Gamification._gamAppendRow_ and a
 * few Código.js writers), and a stale cache behind one of those would corrupt
 * data. Instead a caller opts in around a known-safe block, and outside that scope
 * dbReadAll_ behaves exactly as it always has.
 *
 * Writes inside the scope are written THROUGH to the cache rather than
 * invalidating it. submitAttempt reads Attempts, appends, then reads Attempts
 * again to recompute progress — plain invalidation would re-fetch and save
 * nothing, so the appended row is pushed onto the cached array instead.
 */
var _DB_SCOPE = null;

function dbBeginReadScope_() { _DB_SCOPE = {}; }
function dbEndReadScope_()   { _DB_SCOPE = null; }

function dbWithReadScope_(fn) {
  var outer = _DB_SCOPE;          // tolerate nesting; only the outermost clears
  if (!outer) dbBeginReadScope_();
  try { return fn(); }
  finally { if (!outer) dbEndReadScope_(); }
}

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
  if (_DB_SCOPE && _DB_SCOPE[sheetName]) return _DB_SCOPE[sheetName];
  var sheet = dbGetSheet_(sheetName);
  var lastRow = sheet.getLastRow();
  var headers = dbGetHeaders_(sheetName);

  if (lastRow < 2) {
    return [];
  }

  var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();

  var rows = values
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

  if (_DB_SCOPE) _DB_SCOPE[sheetName] = rows;
  return rows;
}

// Row count without materialising the sheet. dbReadAll_ builds one object per
// row (a headers.forEach for every row), so asking it for a .length on a sheet
// like Attempts — one row per answer submitted, forever — costs seconds.
function dbCountRows_(sheetName) {
  if (_DB_SCOPE && _DB_SCOPE[sheetName]) return _DB_SCOPE[sheetName].length;
  try {
    var lastRow = dbGetSheet_(sheetName).getLastRow();
    return lastRow < 2 ? 0 : lastRow - 1;
  } catch (e) {
    return 0;
  }
}

// Read only the named columns. Pulls one narrow range per field instead of the
// full row width, so scanning a 19-column sheet for two fields moves roughly a
// tenth of the cells. Returns plain objects with no __rowNumber — read-only.
function dbReadFields_(sheetName, fields) {
  if (_DB_SCOPE && _DB_SCOPE[sheetName]) return _DB_SCOPE[sheetName];
  var sheet = dbGetSheet_(sheetName);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var headers = dbGetHeaders_(sheetName);
  var count = lastRow - 1;
  var cols = [];
  fields.forEach(function(field) {
    var idx = headers.indexOf(field);
    if (idx !== -1) {
      cols.push({ name: field, values: sheet.getRange(2, idx + 1, count, 1).getValues() });
    }
  });

  var rows = [];
  for (var i = 0; i < count; i++) {
    var obj = {};
    for (var c = 0; c < cols.length; c++) obj[cols[c].name] = cols[c].values[i][0];
    rows.push(obj);
  }
  return rows;
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

  // Write THROUGH to a live read scope rather than invalidating it: the caller
  // typically reads the same sheet again straight after, and dropping the cache
  // would re-fetch and save nothing.
  if (_DB_SCOPE && _DB_SCOPE[sheetName]) {
    var copy = {};
    headers.forEach(function(h) { copy[h] = obj[h] !== undefined ? obj[h] : ''; });
    copy.__rowNumber = sheet.getLastRow();
    _DB_SCOPE[sheetName].push(copy);
  }

  return obj;
}

function dbUpdateByRow_(sheetName, rowNumber, patch) {
  var sheet = dbGetSheet_(sheetName);
  var headers = dbGetHeaders_(sheetName);

  // One setValues for the whole row instead of one setValue per column. A Progress
  // update carries all 19 schema fields, so this was 19 separate round-trips.
  // Read the row first and merge, so columns absent from the patch keep their
  // current value rather than being blanked.
  var range = sheet.getRange(rowNumber, 1, 1, headers.length);
  var current = range.getValues()[0];

  headers.forEach(function(header, index) {
    if (Object.prototype.hasOwnProperty.call(patch, header)) {
      current[index] = patch[header];
    }
  });

  range.setValues([current]);

  if (_DB_SCOPE && _DB_SCOPE[sheetName]) {
    var cached = _DB_SCOPE[sheetName];
    for (var i = 0; i < cached.length; i++) {
      if (Number(cached[i].__rowNumber) === Number(rowNumber)) {
        headers.forEach(function(h, k) { cached[i][h] = current[k]; });
        break;
      }
    }
  }
}

function dbDeleteByRow_(sheetName, rowNumber) {
  // Deleting shifts every subsequent __rowNumber, so drop the cache rather than
  // trying to renumber it. Deletes are rare and never on the submit path.
  if (_DB_SCOPE) delete _DB_SCOPE[sheetName];
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
