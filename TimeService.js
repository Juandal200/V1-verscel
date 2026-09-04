/**
 * One clock.
 *
 * Timestamps were written four ways across forty sheets: now_() with a timezone
 * offset, new Date().toISOString() in UTC, Date.now() in epoch milliseconds, and
 * Utilities.formatDate in assorted shapes. They describe the same instants and sort
 * differently as strings, so "attempts per day" across two sheets was not a question
 * with one right answer — and several places compare timestamps as strings, where a
 * mixed format silently gives the wrong order rather than an error.
 *
 * Everything written from here on goes through tsNow_(). Everything read goes through
 * tsMs_(), which understands every format already in the sheets, so the data already
 * stored stays usable and no migration is needed to make a report correct.
 */

/**
 * The canonical stamp: UTC, ISO 8601, milliseconds, always ending in Z.
 *
 * UTC rather than the local timezone because an offset stamp sorts wrongly against a
 * Z stamp for the same instant, and because a report crossing a daylight-saving
 * boundary should not have an hour that happens twice.
 */
function tsNow_() {
  return new Date().toISOString();
}

/**
 * Milliseconds from anything the sheets contain.
 *
 * Handles the ISO forms, epoch numbers written as numbers or as text, and the Date
 * objects Sheets hands back for a cell it decided was a date. Returns 0 for anything
 * unreadable, so a caller can tell "no timestamp" from "the epoch".
 */
function tsMs_(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (v instanceof Date) { var d = v.getTime(); return isNaN(d) ? 0 : d; }

  if (typeof v === 'number') {
    // Seconds or milliseconds. Anything below this is 1970, which no row here is.
    return v > 1e11 ? v : (v > 1e9 ? v * 1000 : 0);
  }

  var s = String(v).trim();
  if (!s) return 0;
  if (/^\d+$/.test(s)) return tsMs_(Number(s));

  var t = new Date(s).getTime();
  if (!isNaN(t)) return t;

  // "2026-09-04 12:00:00" — a space where the T should be, which some sheets hold.
  t = new Date(s.replace(' ', 'T')).getTime();
  return isNaN(t) ? 0 : t;
}

/** Canonical form of whatever was stored, or '' if it cannot be read. */
function tsIso_(v) {
  var ms = tsMs_(v);
  return ms ? new Date(ms).toISOString() : '';
}

/** Is a before b, whatever shape either was written in. */
function tsBefore_(a, b) {
  var x = tsMs_(a), y = tsMs_(b);
  return x !== 0 && y !== 0 && x < y;
}

/** The date part, in UTC, for grouping by day. */
function tsDay_(v) {
  var iso = tsIso_(v);
  return iso ? iso.substring(0, 10) : '';
}

/**
 * Which formats are actually in the sheets, and whether any are unreadable.
 *
 * Run checkTimestampFormats() from TimeService.gs.
 */
function checkTimestampFormats() {
  var shapes = {}, unreadable = [], checked = 0;

  function classify(v) {
    if (v instanceof Date) return 'Date object';
    var s = String(v).trim();
    if (!s) return null;
    if (/^\d+$/.test(s)) return 'epoch number';
    if (/Z$/.test(s)) return 'ISO UTC (Z)';
    if (/[+-]\d{2}:\d{2}$/.test(s)) return 'ISO with offset';
    if (/^\d{4}-\d{2}-\d{2}[T ]/.test(s)) return 'ISO, no zone';
    return 'other';
  }

  Object.keys(DB_SCHEMA).forEach(function(name) {
    var cols = (DB_SCHEMA[name] || []).filter(function(c) {
      return /(At|Date|timestamp|time)$/i.test(c);
    });
    if (!cols.length) return;
    var rows;
    try { rows = dbReadAll_(name); } catch (e) { return; }
    rows.slice(0, 200).forEach(function(r) {
      cols.forEach(function(c) {
        var v = r[c];
        if (v === '' || v === null || v === undefined) return;
        checked++;
        var k = classify(v);
        if (!k) return;
        var key = k;
        shapes[key] = (shapes[key] || 0) + 1;
        if (!tsMs_(v) && unreadable.length < 8) {
          unreadable.push('  ' + name + '.' + c + ' = ' + String(v).substring(0, 40));
        }
      });
    });
  });

  var out = ['TIMESTAMP FORMATS  (' + checked + ' values sampled)'];
  Object.keys(shapes).sort(function(a, b) { return shapes[b] - shapes[a]; })
    .forEach(function(k) { out.push('  ' + String(shapes[k]).padStart(6) + '  ' + k); });
  out.push('');
  if (unreadable.length) {
    out.push('UNREADABLE — tsMs_ returns 0 for these, so they sort as missing:');
    unreadable.forEach(function(u) { out.push(u); });
  } else {
    out.push('Every sampled value is readable by tsMs_, so a report can sort and group');
    out.push('across sheets even though the stored shapes differ.');
  }

  var msg = out.join('\n');
  Logger.log(msg);
  return msg;
}
