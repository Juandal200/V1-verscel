/**
 * Read-only comparison of every sheet's real header row against DB_SCHEMA.
 *
 * dbReadAll_ maps columns by POSITION from DB_SCHEMA and ignores the header row the
 * sheet actually has. _gamReadAll_ maps them by that header row. Two readers over
 * the same sheets, disagreeing, with nothing raised when they do — so a field can
 * be read from the wrong column indefinitely and simply look empty.
 *
 * repairSheetHeaders() only reports a CONFLICT where both sides name a column. It
 * says nothing when the sheet is WIDER than the schema, which is how the Scenarios
 * sheet carried a phaseLabel column the schema had never heard of. This reports
 * every kind of drift, and writes nothing.
 */
function auditSheetSchemas() {
  var ss = dbGetSpreadsheet_();
  var out = [], clean = [], missingSheets = [];
  var totals = { sheets: 0, drifted: 0, misaligned: 0, extra: 0, absent: 0 };

  Object.keys(DB_SCHEMA).forEach(function(name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) { missingSheets.push(name); return; }
    totals.sheets++;

    var schema = DB_SCHEMA[name];
    var width  = Math.max(sheet.getLastColumn(), schema.length);
    var header = width > 0
      ? sheet.getRange(1, 1, 1, width).getValues()[0].map(function(h) { return String(h || '').trim(); })
      : [];

    var lines = [];

    // Position by position: what the schema believes vs what is there.
    for (var i = 0; i < Math.max(schema.length, header.length); i++) {
      var want = schema[i] || '';
      var got  = header[i] || '';
      if (want === got) continue;

      if (want && got) {
        // The dangerous one: dbReadAll_ returns the value of `got` under the name
        // `want`, silently.
        lines.push('    col' + (i + 1) + '  schema wants [' + want + ']  sheet has [' + got + ']  <-- MISALIGNED');
        totals.misaligned++;
      } else if (!want && got) {
        // Invisible to dbReadAll_, and the next schema field appended will land on it.
        lines.push('    col' + (i + 1) + '  sheet has [' + got + '] which the schema does not know about  <-- EXTRA');
        totals.extra++;
      } else {
        lines.push('    col' + (i + 1) + '  schema wants [' + want + '] but the sheet has no such column  <-- ABSENT (reads blank)');
        totals.absent++;
      }
    }

    if (lines.length) {
      totals.drifted++;
      out.push('  ' + name + '  (' + sheet.getLastColumn() + ' columns in sheet, ' +
               schema.length + ' in schema)');
      lines.forEach(function(l) { out.push(l); });
    } else {
      clean.push(name);
    }
  });

  Logger.log('SHEET SCHEMA AUDIT — read only, nothing written\n');
  Logger.log('  sheets checked : ' + totals.sheets);
  Logger.log('  in agreement   : ' + clean.length);
  Logger.log('  drifted        : ' + totals.drifted);
  Logger.log('    misaligned columns (read the WRONG column) : ' + totals.misaligned);
  Logger.log('    extra columns (invisible to dbReadAll_)    : ' + totals.extra);
  Logger.log('    absent columns (always read blank)         : ' + totals.absent);
  if (missingSheets.length) Logger.log('  sheets not created yet: ' + missingSheets.join(', '));
  Logger.log('');
  out.forEach(function(l) { Logger.log(l); });
  if (clean.length) Logger.log('\n  In agreement: ' + clean.join(', '));

  return { ok: totals.drifted === 0, totals: totals, detail: out };
}
