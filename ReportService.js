/**
 * One table, joined, so the product can be analysed.
 *
 * Everything needed already existed and nothing assembled it: attempts in one sheet,
 * progress in another, exam bands in a third keyed by email, identity spread across
 * userId, email and candidateId, and timestamps in four shapes that sort differently
 * as text. Each question — does simulator practice raise a band, which phases produce
 * the most retries — needed its own manual join, and any of them could quietly drop a
 * student.
 *
 * exportAttemptsCsv() answers those with one flat row per attempt, joined to the
 * person and to their most recent band. Every timestamp is UTC ISO, every identity is
 * userId, and every number states its scale in DATA_DICTIONARY.md.
 */

var REPORT_FOLDER_NAME_ = 'AEROCOMMS Reports';

function _reportFolder_() {
  var it = DriveApp.getFoldersByName(REPORT_FOLDER_NAME_);
  return it.hasNext() ? it.next() : DriveApp.createFolder(REPORT_FOLDER_NAME_);
}

function _csvCell_(v) {
  var s = (v === null || v === undefined) ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/**
 * One row per attempt, with the person and their exam history attached.
 *
 * Joined on userId throughout. A sitting stored before userId was written falls back
 * to matching on email, and a row that matches neither is reported rather than
 * dropped — a report that silently loses people is worse than one that says it did.
 */
function exportAttemptsCsv() {
  var users = {}, byEmail = {};
  dbReadAll_('Users').forEach(function(u) {
    var id = String(u.userId || '').trim();
    if (!id) return;
    users[id] = u;
    var e = String(u.email || '').trim().toLowerCase();
    if (e) byEmail[e] = u;
  });

  // Most recent band per person, from the exam results.
  var bandById = {}, bandsUnmatched = 0;
  try {
    var sheet = _teaGetOrCreateSheet_();
    var last  = sheet.getLastRow();
    if (last > 1) {
      var width = Math.max(sheet.getLastColumn(), TEA_SHEET_HEADERS.length);
      var idx = {}; TEA_SHEET_HEADERS.forEach(function(h, i) { idx[h] = i; });
      sheet.getRange(2, 1, last - 1, width).getValues().forEach(function(r) {
        var uid = String(r[idx['UserId']] || '').trim();
        if (!uid) {
          // Written before UserId existed on this sheet.
          var em = String(r[idx['Candidate']] || '').trim().toLowerCase();
          var u  = byEmail[em];
          if (u) uid = String(u.userId || '');
        }
        if (!uid) { bandsUnmatched++; return; }
        if (String(r[idx['Scope']] || 'FULL').toUpperCase() !== 'FULL') return;
        var band = Number(r[idx['Overall Band']]) || 0;
        if (!band) return;
        var when = tsMs_(r[idx['Date']]);
        if (!bandById[uid] || when > bandById[uid].when) {
          bandById[uid] = { band: band, when: when, version: String(r[idx['Version']] || '') };
        }
      });
    }
  } catch (e) {}

  var head = ['userId','email','name','plan','attemptDateUtc','attemptDay','level','country',
              'phaseCode','scenarioId','sessionId','attemptNumber','correct','score',
              'responseTimeSec','replayCount','altDeviationFt','altSecondsOff','radioDifficulty',
              'latestBand','latestBandDateUtc','latestBandVersion'];
  var lines = [head.join(',')], unknown = 0, n = 0;

  dbReadAll_('Attempts').forEach(function(a) {
    var uid = String(a.userId || '').trim();
    var u   = users[uid];
    if (!u) { unknown++; }
    var b   = bandById[uid] || null;
    var ms  = tsMs_(a.createdAt);
    lines.push([
      uid,
      u ? String(u.email || '') : '',
      u ? String(u.name  || '') : '',
      u ? String(u.plan || u.subscriptionPlan || '') : '',
      ms ? new Date(ms).toISOString() : '',
      tsDay_(a.createdAt),
      a.level, a.country, a.phaseCode, a.scenarioId, a.sessionId,
      a.attemptNumber,
      String(a.correct).toUpperCase() === 'TRUE' || a.correct === true ? 1 : 0,
      Number(a.score) || 0,
      Number(a.responseTimeSec) || '',
      Number(a.replayCount) || 0,
      Number(a.altDeviationFt) || 0,
      Number(a.altSecondsOff) || 0,
      Number(a.radioDifficulty) || 0,
      b ? b.band : '',
      b ? new Date(b.when).toISOString() : '',
      b ? b.version : ''
    ].map(_csvCell_).join(','));
    n++;
  });

  var name = 'aerocomms_attempts_' + tsNow_().substring(0, 10) + '.csv';
  var file = _reportFolder_().createFile(name, lines.join('\n'), MimeType.CSV);

  var msg = 'EXPORTED ' + n + ' attempt(s)\n' +
    '  file   : ' + file.getUrl() + '\n' +
    '  folder : ' + REPORT_FOLDER_NAME_ + '\n' +
    '  people with a band attached : ' + Object.keys(bandById).length + '\n' +
    (unknown ? '  attempts whose user is not in Users : ' + unknown + '  (kept, userId only)\n' : '') +
    (bandsUnmatched ? '  sittings that matched no user : ' + bandsUnmatched + '\n' : '') +
    '\nEvery timestamp is UTC ISO. Every scale is described in DATA_DICTIONARY.md.';
  Logger.log(msg);
  return msg;
}

/**
 * The shape of the product in one screen: who is active, what they practise, and
 * whether their band moves. Printed rather than exported, for a quick look.
 */
function reportSummary() {
  var out = [], now = Date.now(), DAY = 86400000;

  var users = dbReadAll_('Users');
  var attempts = dbReadAll_('Attempts');

  var active7 = {}, active30 = {};
  attempts.forEach(function(a) {
    var ms = tsMs_(a.createdAt), uid = String(a.userId || '');
    if (!ms || !uid) return;
    if (now - ms <= 7  * DAY) active7[uid]  = true;
    if (now - ms <= 30 * DAY) active30[uid] = true;
  });

  var byLevel = {}, correct = 0, scored = 0;
  attempts.forEach(function(a) {
    var l = String(a.level || '?');
    var e = byLevel[l] || (byLevel[l] = { n: 0, ok: 0, replays: 0 });
    e.n++;
    var ok = String(a.correct).toUpperCase() === 'TRUE' || a.correct === true;
    if (ok) { e.ok++; correct++; }
    e.replays += Number(a.replayCount) || 0;
    scored++;
  });

  out.push('PEOPLE');
  out.push('  registered            : ' + users.length);
  out.push('  practised in 7 days   : ' + Object.keys(active7).length);
  out.push('  practised in 30 days  : ' + Object.keys(active30).length);
  out.push('');
  out.push('PRACTICE  (' + attempts.length + ' attempts)');
  out.push('  first-time correct    : ' + (scored ? Math.round(correct / scored * 100) : 0) + '%');
  out.push('');
  out.push('  level   attempts   correct   replays/attempt');
  Object.keys(byLevel).sort(function(a, b) { return Number(a) - Number(b); }).forEach(function(l) {
    var e = byLevel[l];
    out.push('  ' + String(l).padEnd(7) + String(e.n).padStart(8) +
             String(Math.round(e.ok / e.n * 100) + '%').padStart(10) +
             (e.n ? (e.replays / e.n).toFixed(1) : '0').padStart(18));
  });

  var msg = out.join('\n');
  Logger.log(msg);
  return msg;
}
