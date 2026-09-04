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

    // The conversational grader now returns a bare integer per descriptor; the
    // audio pipeline still returns { score, feedback }. Accept either rather than
    // silently recording every band as zero.
    function band(d) {
      var v = sv[d];
      return Number(v && typeof v === 'object' ? v.score : v) || 0;
    }
    function fb(d) {
      var v = sv[d];
      return (v && typeof v === 'object' && v.feedback) ? String(v.feedback) : '';
    }

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
    // The examiner's working arrives in a second request, well after the bands, and
    // is filed as its own document. Appending a second summary row for it would put
    // the same sitting in the results table twice.
    if (payload.sheetRow !== false) _teaAppendSheetRow_(data, fileUrl);
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


/**
 * A candidate's own exam history.
 *
 * Results have been accumulating in two places — the TEA Results tab and
 * IcaoTestSectionReports — readable only by an admin. The person the reports
 * describe had no way to see them, which makes a report a one-time thing you
 * either read on the day or lose.
 *
 * Reads the results tab directly rather than through dbReadAll_: it predates
 * DB_SCHEMA and is not registered there.
 */
function apiGetMyIcaoResults(sessionToken) {
  try {
    var user  = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    var email = String(user.email || '').trim().toLowerCase();

    // Whether this candidate may READ their bands.
    //
    // The paywall was a CSS blur on one screen. The numbers themselves were sent to
    // the browser regardless — plainly, with no blur at all, in the results history
    // — so the gate held only for someone who did not look. A price on information
    // has to be enforced where the information is, not where it happens to be drawn.
    var locked = false;
    try { locked = String(getUserAccessStatus_(user).status || '') === 'free'; } catch (e) {}

    var results = [];
    try {
      var sheet   = _teaGetOrCreateSheet_();
      var lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        var width = Math.max(sheet.getLastColumn(), TEA_SHEET_HEADERS.length);
        var rows  = sheet.getRange(2, 1, lastRow - 1, width).getValues();
        var idx   = {};
        TEA_SHEET_HEADERS.forEach(function(h, i) { idx[h] = i; });

        rows.forEach(function(r) {
          if (String(r[idx['Candidate']] || '').trim().toLowerCase() !== email) return;
          // The pre-grading transcript row is the same sitting filed twice. Listed
          // separately it showed one examination as two, the second carrying no band
          // and labelled "Below Operational" — a failing grade for a row never marked.
          if (!(Number(r[idx['Overall Band']]) > 0)) return;
          // A locked result is sent as a sitting that happened, carrying no numbers.
          // The date and the fact of it are not what is being charged for.
          if (locked) {
            // Zeros, not nulls.
            //
            // Sending null was correct for the client I had just written and a crash
            // for the one already on the phone: Apps Script deploys the instant it is
            // pushed, while the browser is still running whatever the service worker
            // cached. bars() read scores[k] straight off it and the results screen
            // died with "null is not an object".
            //
            // A server may not assume the client it is talking to is the client it
            // was written against. Zeros carry no result, and an old build renders
            // them as an empty report rather than falling over.
            results.push({
              date:    String(r[idx['Date']] || ''),
              band:    0,
              locked:  true,
              version: String(r[idx['Version']] || ''),
              scores: {
                pronunciation: 0, structure: 0, vocabulary: 0,
                fluency: 0, comprehension: 0, interactions: 0
              }
            });
            return;
          }
          results.push({
            date:    String(r[idx['Date']] || ''),
            band:    Number(r[idx['Overall Band']]) || 0,
            scores: {
              pronunciation: Number(r[idx['Pronunciation']]) || 0,
              structure:     Number(r[idx['Structure']])     || 0,
              vocabulary:    Number(r[idx['Vocabulary']])    || 0,
              fluency:       Number(r[idx['Fluency']])       || 0,
              comprehension: Number(r[idx['Comprehension']]) || 0,
              interactions:  Number(r[idx['Interactions']])  || 0
            },
            version: String(r[idx['Version']] || ''),
            source:  String(r[idx['Source']]  || 'pipeline'),
            scope:   String(r[idx['Scope']]   || 'FULL')
          });
        });
      }
    } catch (e) { /* no results tab yet */ }

    var sections = [];
    try {
      dbReadAll_('IcaoTestSectionReports').forEach(function(r) {
        if (String(r.userId || '') !== String(user.userId)) return;
        sections.push({
          section:  String(r.section || ''),
          scope:    String(r.scope   || ''),
          bands: {
            pronunciation: Number(r.pronunciation) || 0,
            structure:     Number(r.structure)     || 0,
            vocabulary:    Number(r.vocabulary)    || 0,
            fluency:       Number(r.fluency)       || 0,
            comprehension: Number(r.comprehension) || 0,
            interactions:  Number(r.interactions)  || 0
          },
          strength:  String(r.strength || ''),
          improve:   String(r.improve  || ''),
          note:      String(r.note     || ''),
          createdAt: String(r.createdAt || '')
        });
      });
    } catch (e) { /* sheet not created yet */ }

    // Newest first, and the Drive report link is deliberately NOT returned: those
    // files carry the admin view, which is not the candidate's to read.
    results.sort(function(a, b) { return String(b.date).localeCompare(String(a.date)); });
    sections.sort(function(a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });

    return { ok: true, results: results, sections: sections };
  } catch (err) {
    return { ok: false, error: (err && err.message) || 'Could not load results' };
  }
}


/**
 * Saves the transcript of a completed sitting BEFORE it has been scored.
 *
 * Nothing was written until a report existed, so an examination that finished but
 * failed to score left no trace at all: twenty-five minutes of a candidate's work,
 * gone because the last step timed out. The sitting and the score are separate
 * facts, and the first does not depend on the second.
 *
 * The row is marked PENDING with no bands. If scoring later succeeds a normal row
 * is written alongside it; the pending row stays as the record that the exam was
 * actually sat.
 */
function apiSaveIcaoTranscript(sessionToken, payload) {
  try {
    var user = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    payload = payload || {};

    var data = {
      candidateId: String(user.email || user.userId || 'unknown'),
      examDate:    String(payload.examDate || now_()),
      savedAt:     now_(),
      bank:        String(payload.bank  || ''),
      scope:       String(payload.scope || 'FULL'),
      source:      'transcript-only',
      overallBand: '',
      scores:      {},
      studentFeedback: {},
      adminReport: { annotatedTranscript: '', technicalJustification: {} },
      enrichedTranscript: _teaFlattenHistory_(payload.history),
      note: 'PENDING — the sitting completed; scoring had not produced a report when this was saved.'
    };

    var folder  = _teaGetOrCreateFolder_();
    var fileUrl = _teaSaveJsonReport_(folder, data);
    _teaAppendSheetRow_(data, fileUrl);
    return { ok: true, driveFileUrl: fileUrl };
  } catch (err) {
    return { ok: false, error: (err && err.message) || 'Save failed' };
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * MOCK TEST ALLOWANCE
 *
 * How many sittings this account has left, and whether the result may be shown.
 *
 * Counted from the sittings themselves rather than from a counter, because a
 * counter is a second copy of the truth and the two drift. The exam already
 * writes a row per completed sitting; that IS the count.
 *
 * The free tier gets one sitting ever — not one a month — and its band is
 * withheld until they subscribe. Someone who has been through the whole exam and
 * is told their result is ready has a far better reason to pay than someone who
 * was shown a price list first.
 * ═══════════════════════════════════════════════════════════════════════════ */

function _icaoSittingsFor_(email, sinceIso) {
  var sheet   = _teaGetOrCreateSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  // Only the two columns this actually needs.
  //
  // It used to pull every column of every row — thirteen wide, including the Drive
  // report link — to count how many rows carry one email. Reading a range is the
  // expensive part of Apps Script, and this call sits directly in front of the
  // Begin button, so the whole sheet was being fetched before an exam could start.
  // The band column is read too, because an unmarked row is not an attempt.
  //
  // Every sitting writes TWO rows: apiSaveIcaoTranscript files the transcript before
  // grading so an exam that fails to score is not lost, then apiSaveIcaoExamResult
  // files the marked result. This counted rows, so ONE examination consumed TWO
  // attempts — a free plan's single test was spent twice over by taking it once, and
  // Basic's two were gone after one exam.
  //
  // A candidate is charged for a result, not for a row. A sitting with no band
  // produced nothing, which is the same rule that refuses to mark an unheard sitting.
  var dateCol = TEA_SHEET_HEADERS.indexOf('Date') + 1;
  var candCol = TEA_SHEET_HEADERS.indexOf('Candidate') + 1;
  var bandCol = TEA_SHEET_HEADERS.indexOf('Overall Band') + 1;
  var lo = Math.min(dateCol, candCol, bandCol);
  var hi = Math.max(dateCol, candCol, bandCol);
  var rows = sheet.getRange(2, lo, lastRow - 1, hi - lo + 1).getValues();
  var dIdx = dateCol - lo, cIdx = candCol - lo, bIdx = bandCol - lo;

  var since = sinceIso ? new Date(sinceIso) : null;
  var want  = String(email || '').trim().toLowerCase();
  var n = 0;
  rows.forEach(function(r) {
    if (String(r[cIdx] || '').trim().toLowerCase() !== want) return;
    if (!(Number(r[bIdx]) > 0)) return;   // filed but never marked — not an attempt
    if (since) {
      var d = new Date(String(r[dIdx] || ''));
      // An unparseable date counts. Losing a sitting because a cell was odd
      // charges the candidate for our data problem.
      if (!isNaN(d.getTime()) && d < since) return;
    }
    n++;
  });
  return n;
}

/**
 * Remaining sittings, and whether results are visible.
 *
 * Paid plans count within the current subscription period, so the allowance
 * refreshes when they renew. The free tier counts for all time.
 */
function _icaoAllowanceCacheKey_(email) { return 'icao_allow_' + String(email || ''); }

function apiGetIcaoExamAllowance(sessionToken) {
  try {
    var user   = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    var email  = String(user.email || '').trim().toLowerCase();

    // Cached for two minutes. Two sheet reads — the subscription row and the
    // sittings count — sit directly in front of the Begin button, and neither
    // changes between one press and the next. Cleared when a sitting is released,
    // so a candidate who finishes and starts again sees a current count rather
    // than a stale one.
    try {
      var hit = CacheService.getScriptCache().get(_icaoAllowanceCacheKey_(email));
      if (hit) {
        var cached = JSON.parse(hit);
        cached.inProgress = !!_icaoHeldReservation_(user.userId);
        return cached;
      }
    } catch (e) {}

    var access = getUserAccessStatus_(user);

    var isFree    = access.status === 'free';
    var allowance = Number(access.examAllowance || 0);

    // A paid allowance is per period. Without a start date, count everything —
    // which is the cautious direction for us, not for them.
    var since = null;
    if (!isFree && access.endDate) {
      var end = new Date(access.endDate);
      if (!isNaN(end.getTime())) {
        since = new Date(end.getTime() - 31 * 24 * 60 * 60 * 1000).toISOString();
      }
    }

    var used = 0;
    try { used = _icaoSittingsFor_(email, since); } catch (e) {}
    var remaining = Math.max(0, allowance - used);

    var out = {
      ok: true,
      plan:      access.plan,
      planLabel: access.planLabel,
      allowance: allowance,
      used:      used,
      remaining: remaining,
      // The free sitting runs in full and is graded in full. Only the reading of
      // the result is held back, so nothing about the exam itself is a demo.
      resultsVisible: !isFree,
      isFree: isFree,
      inProgress: !!_icaoHeldReservation_(user.userId)
    };

    try {
      // inProgress is deliberately not cached — it changes the moment an exam
      // starts or ends, and is re-read above on every cache hit.
      var toStore = {};
      Object.keys(out).forEach(function(k) { if (k !== 'inProgress') toStore[k] = out[k]; });
      CacheService.getScriptCache().put(_icaoAllowanceCacheKey_(email), JSON.stringify(toStore), 120);
    } catch (e) {}

    return out;
  } catch (err) {
    return apiError_('apiGetIcaoExamAllowance', err);
  }
}

/* ─── Sitting reservation ─────────────────────────────────────────────────────
 * Held while an exam is in progress so two cannot run at once.
 *
 * Deliberately NOT the thing that consumes an attempt — the completed row in TEA
 * Results is. A candidate whose connection dies at minute three has not sat an
 * exam and must not be charged for one, so the reservation simply expires and
 * costs nothing.
 *
 * Kept in CacheService because it expires by itself. There is no sweeper to
 * forget to run, and if the cache is evicted early the reservation lapses early —
 * which lets someone start another exam. That is the right direction to fail: it
 * gives away a sitting rather than refusing a paying candidate theirs.
 * ─────────────────────────────────────────────────────────────────────────── */
var ICAO_RESERVE_SECONDS_ = 45 * 60;   // longer than the exam, short enough to clear

function _icaoReserveKey_(userId) { return 'icao_resv_' + String(userId || ''); }

function _icaoHeldReservation_(userId) {
  try {
    return CacheService.getScriptCache().get(_icaoReserveKey_(userId)) || '';
  } catch (e) { return ''; }
}

/**
 * Claims the right to sit an exam now.
 * Returns ok:false with a reason the client can show, never throws for a normal
 * refusal — running out of attempts is not an error.
 */
function apiReserveIcaoExam(sessionToken) {
  try {
    var user = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    var al   = apiGetIcaoExamAllowance(sessionToken);
    if (!al || !al.ok) return { ok: false, reason: 'ALLOWANCE_UNKNOWN' };

    if (al.remaining <= 0) {
      return { ok: false, reason: 'NO_ATTEMPTS', allowance: al };
    }

    var held = _icaoHeldReservation_(user.userId);
    if (held) {
      return { ok: false, reason: 'IN_PROGRESS', startedAt: held, allowance: al };
    }

    try {
      CacheService.getScriptCache().put(
        _icaoReserveKey_(user.userId), new Date().toISOString(), ICAO_RESERVE_SECONDS_
      );
    } catch (e) {
      // Could not reserve. Let the exam run rather than block it — the worst case
      // is two concurrent sittings, which is far better than refusing a valid one.
    }
    return { ok: true, allowance: al };
  } catch (err) {
    return apiError_('apiReserveIcaoExam', err);
  }
}

/** Releases the hold. Called when the exam finishes or is abandoned. */
function apiReleaseIcaoExam(sessionToken) {
  try {
    var user = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    try { CacheService.getScriptCache().remove(_icaoReserveKey_(user.userId)); } catch (e) {}
    // A sitting just ended, so the count is now wrong. Drop it rather than let a
    // candidate be told they have an attempt they have already spent.
    try {
      CacheService.getScriptCache()
        .remove(_icaoAllowanceCacheKey_(String(user.email || '').trim().toLowerCase()));
    } catch (e) {}
    return { ok: true };
  } catch (err) {
    return apiError_('apiReleaseIcaoExam', err);
  }
}

/**
 * Times every step of starting an exam, so a slow Begin can be attributed rather
 * than guessed at. Reads only — takes no reservation and uses no attempt.
 * Run from the editor — TEAService.gs.
 */
function checkExamStartSpeed() {
  var out = [];
  function timed(label, fn) {
    var t = Date.now(), extra = '';
    try { extra = fn() || ''; } catch (e) { extra = 'ERROR ' + e.message; }
    out.push(('' + (Date.now() - t)).padStart(6) + ' ms  ' + label + (extra ? '  — ' + extra : ''));
  }

  var admin = null;
  // Named for what it measures: this is the first spreadsheet access of the
  // execution, so it carries the cost of opening the whole workbook, not just of
  // reading Users. That is the number that mattered — 11.6 seconds — and it was
  // being paid by every authenticated request in the app.
  timed('FIRST sheet access (opens the spreadsheet + reads Users)', function() {
    dbReadAll_('Users').forEach(function(u) {
      if (!admin && String(u.role || '').toUpperCase() === 'ADMIN') admin = u;
    });
    return admin ? admin.email : 'none found';
  });
  if (!admin) { Logger.log(out.join('\n')); return out.join('\n'); }

  timed('access status (subscription sheet)', function() {
    var a = getUserAccessStatus_(admin);
    return a.plan + ', ' + a.examAllowance + ' attempts';
  });

  timed('open TEA Results', function() {
    var sh = _teaGetOrCreateSheet_();
    return sh.getLastRow() + ' rows, ' + sh.getLastColumn() + ' cols';
  });

  timed('count sittings (2 columns)', function() {
    return _icaoSittingsFor_(String(admin.email || '').toLowerCase(), null) + ' found';
  });

  timed('read the whole item sheet', function() {
    return dbReadAll_(ICAO_ITEMS_SHEET_).length + ' rows';
  });

  timed('build the script for one bank', function() {
    var rows = dbReadAll_(ICAO_ITEMS_SHEET_);
    return _icaoUsableBanks_(rows).join(', ');
  });

  var msg = out.join('\n') + '\n\nAnything over a few hundred ms here is the ' +
            'reason Begin Exam is slow.';
  Logger.log(msg);
  return msg;
}

/**
 * Why a sitting was given the band it was given.
 *
 * A candidate reported a band of 1 after answering everything clearly, and the
 * result screen is blurred on a free plan so they could not read the transcript to
 * check. This reads the most recent saved sitting and says plainly whether the
 * examiner ever heard them.
 *
 * The two transcripts are kept apart on purpose. enrichedTranscript is the flattened
 * conversation the CLIENT built, where every answer whose browser-side transcription
 * failed was recorded as "(no answer given)". annotatedTranscript is what the server
 * produced by re-transcribing the recordings themselves. When the first is full of
 * silence and the second is full of speech, the recording was fine and the
 * bookkeeping was not — and it is the bookkeeping that Gemini is shown first.
 *
 * Read-only. Run from TEAService.gs.
 */
function checkLastIcaoSitting() {
  var folder = _teaGetOrCreateFolder_();
  var it = folder.getFilesByType(MimeType.PLAIN_TEXT);
  var newest = null, newestAt = 0;
  var all = folder.getFiles();
  while (all.hasNext()) {
    var f = all.next();
    if (String(f.getName()).indexOf('TEA_') !== 0) continue;
    var t = f.getLastUpdated().getTime();
    if (t > newestAt) { newestAt = t; newest = f; }
  }
  if (!newest) { Logger.log('No saved sittings found.'); return 'No saved sittings found.'; }

  var d;
  try { d = JSON.parse(newest.getBlob().getDataAsString()); }
  catch (e) { Logger.log('Could not read ' + newest.getName() + ': ' + e.message); return 'unreadable'; }

  var flat = String(d.enrichedTranscript || '');
  var ann  = String(d.annotatedTranscript || '');

  // Count the answers the client believed it never heard.
  var turns  = (flat.match(/\n?(Ca|Candidate|user)\s*:/gi) || []).length;
  var silent = (flat.match(/\(no answer given\)/gi) || []).length;

  var out = [];
  out.push('SITTING  ' + newest.getName());
  out.push('  candidate    : ' + (d.candidateId || '?'));
  out.push('  paper        : ' + (d.bank || '?') + '   scope: ' + (d.scope || '?'));
  out.push('  overall band : ' + (d.overallBand === 0 ? '0 (not recorded)' : d.overallBand));
  out.push('');
  out.push('  WHAT THE CLIENT RECORDED AS SAID  (this is what Gemini reads first)');
  out.push('    candidate turns          : ' + turns);
  out.push('    logged "(no answer given)": ' + silent);
  out.push('    first 300 characters     : ' + flat.substring(0, 300).replace(/\n/g, ' | '));
  out.push('');
  out.push('  WHAT THE SERVER HEARD ON THE RECORDINGS');
  out.push('    length                   : ' + ann.length + ' characters');
  out.push('    first 300 characters     : ' + (ann.substring(0, 300).replace(/\n/g, ' | ') || '(empty)'));
  out.push('');

  if (silent > 0 && ann.length > 200) {
    out.push('  VERDICT: the recordings captured speech, but ' + silent + ' answer(s) were');
    out.push('  filed as "(no answer given)". The band was marked against the silence.');
  } else if (ann.length <= 200) {
    out.push('  VERDICT: the server heard little or nothing. The recording itself failed,');
    out.push('  and no band should have been awarded at all.');
  } else {
    out.push('  VERDICT: both transcripts carry speech. The band came from the rubric,');
    out.push('  not from a transcription fault.');
  }

  var msg = out.join('\n');
  Logger.log(msg);
  return msg;
}
