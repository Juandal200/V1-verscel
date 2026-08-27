/**
 * Relabels sheet headers to match DB_SCHEMA. Header text only — no cell of data is
 * read, moved or written.
 *
 * The audit found three sheets whose header row disagrees with the schema. The DATA
 * in them is fine: dbAppend_, dbUpdateByRow_ and dbReadAll_ all map columns by
 * position from DB_SCHEMA, so the app writes profession to column 16 and reads
 * column 16 back as profession. They agree with each other. It is the words printed
 * above those columns that are wrong.
 *
 * That still matters in three ways:
 *
 *   _gamReadAll_ builds its keys from the header row instead, so on the Users sheet
 *   it yields u['Column 2'] where the rest of the app says profession. Every
 *   Gamification read of those fields comes back undefined — which is why the
 *   leaderboard shows PILOT for everyone regardless of profession.
 *
 *   Anyone editing the sheet by hand is misled. "assignedInstructorId" sits above a
 *   column holding companyId; four fields sit under "Column 1".."Column 4". Typing
 *   into the wrong one corrupts real data with no warning.
 *
 *   And appending a new schema field lands on whatever is already there — exactly
 *   how targetAltitude came to sit on top of phaseLabel.
 *
 * Renaming a header cannot move data. The worst case is a header that is still
 * wrong, which is where we already are.
 */
function repairSheetHeaderLabels(apply) {
  var ss = dbGetSpreadsheet_();
  var planned = 0, skipped = 0;

  Object.keys(DB_SCHEMA).forEach(function(name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) return;

    var schema = DB_SCHEMA[name];
    var lastCol = sheet.getLastColumn();
    if (lastCol < 1) return;

    var header = sheet.getRange(1, 1, 1, lastCol).getValues()[0]
      .map(function(h) { return String(h || '').trim(); });

    var changes = [];
    for (var i = 0; i < schema.length && i < lastCol; i++) {
      if (header[i] === schema[i]) continue;
      changes.push({ col: i + 1, from: header[i], to: schema[i] });
    }
    if (!changes.length) return;

    Logger.log(name + ':');
    changes.forEach(function(c) {
      Logger.log('    col' + c.col + '  "' + (c.from || '(blank)') + '"  ->  "' + c.to + '"');
      planned++;
      if (apply) {
        sheet.getRange(1, c.col).setValue(c.to)
             .setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');
      }
    });

    // Trailing columns beyond the schema are left ALONE. Some hold real data the
    // schema has not caught up with — Scenarios carries emergencyTriggerPhase and
    // keywordsText out there — and clearing a header is how you lose track of that.
    if (lastCol > schema.length) {
      var extra = [];
      for (var j = schema.length; j < lastCol; j++) extra.push('col' + (j + 1) + ' "' + (header[j] || '(blank)') + '"');
      Logger.log('    beyond the schema, left untouched: ' + extra.join(', '));
      skipped += extra.length;
    }
  });

  Logger.log('');
  Logger.log(apply ? ('APPLIED — ' + planned + ' header(s) relabelled.')
                   : ('DRY RUN — ' + planned + ' header(s) would be relabelled. Nothing written.'));
  Logger.log(skipped + ' column(s) beyond the schema were left as they are.');
  if (!apply) Logger.log('Run repairSheetHeaderLabels(true) to apply, or applySheetHeaderLabels().');

  return { ok: true, planned: planned, untouched: skipped };
}

/** No-arg wrapper — the Apps Script Run button cannot pass arguments. */
function applySheetHeaderLabels() {
  return repairSheetHeaderLabels(true);
}
