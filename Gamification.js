// =============================================================================
//  Gamification.js  —  Squadron & Challenges
//  Standalone module. Zero dependencies on other project files.
//  All private helpers are prefixed _gam_ to prevent scope collisions.
// =============================================================================

// ── Constants ────────────────────────────────────────────────────────────────

var GAM_SHEETS = {
  USERS:      'Users',
  NETWORK:    'Network',
  CHALLENGES: 'Challenges'
};

var GAM_NETWORK_HEADERS    = ['Request_ID',   'From_Email',       'To_Email',    'Status'];

/* A duel, not a scenario name and a self-reported score.
 *
 * PaperJson is the frozen paper — which questions, and in what order their
 * options were shuffled — so both pilots answer the identical thing however long
 * apart they play. The two _Started_At stamps are the server's clock, because
 * the tie-break is time and a time the browser reports is a time it can choose.
 *
 * The old columns (Scenario_Name, Challenger_Score) are gone rather than kept:
 * they named eight scenarios that exist nowhere in the product and a number
 * nobody verified. Nothing converts, so nothing was migrated. */
var GAM_CHALLENGE_HEADERS = [
  'Challenge_ID', 'Challenger_Email', 'Target_Email', 'PaperJson',
  'Challenger_Correct', 'Challenger_Ms', 'Challenger_Started_At',
  'Target_Correct', 'Target_Ms', 'Target_Started_At',
  'Winner_Email', 'Status', 'Created_At', 'Completed_At'
];

/* Enumerated, and a duel is only ever in one of them. There is no Declined:
 * an invitation nobody plays simply stays where it is, and adding a decline is
 * adding a screen for it, not adding a string here. */
var GAM_STATUS = {
  PENDING:              'Pending',              // requests only — see Network
  ACCEPTED:             'Accepted',             // requests only
  AWAITING_CHALLENGER:  'Awaiting_Challenger',  // drawn, the challenger has not finished
  AWAITING_TARGET:      'Awaiting_Target',      // challenger done, waiting on the target
  COMPLETE:             'Complete'
};

/* Ten a correct answer, fifty more for taking the duel. Named here because the
 * server pays them and the screen animates them, and a number in two places
 * drifts. */
/* A duel goes stale after a day. It is not a cron and not a status anybody
 * writes: the row carries Created_At, and both the list and the paper compare
 * against it. A sweep that has to run is a sweep that can stop running, and an
 * expiry nobody enforces at the point of use is a challenge you can still open
 * a week later from an old email. */
var CHALLENGE_EXPIRY_HOURS = 24;

var CHALLENGE_XP_PER_CORRECT = 10;
var CHALLENGE_XP_WIN_BONUS   = 50;

// ── Response helpers ─────────────────────────────────────────────────────────

function _gamOk_(data, message) {
  return { status: 'success', data: data !== undefined ? data : null, message: message || '' };
}

function _gamErr_(message, code) {
  return { status: 'error', data: null, message: message || 'An unexpected error occurred.', code: code || 'ERROR' };
}

// ── Sheet helpers ────────────────────────────────────────────────────────────

function _gamSS_() {
  return dbGetSpreadsheet_();
}

/* Creates the sheet, and refuses to write into one whose header has drifted.
 *
 * Without the refusal this fails in the worst way available. The row is built
 * positionally from `headers`, and _gamReadAll_ reads whatever the sheet's first
 * row actually says — so appending fourteen values to a six-column header writes
 * every field into the wrong name and then reads them back under the old ones.
 * Nothing throws. The challenge is stored, the caller is told it worked, and it
 * is invisible to everyone for ever.
 *
 * That is exactly what happened when Challenges kept its old columns after the
 * duel replaced the engine: challenges were sent and nobody ever received one.
 * The message names the repair rather than describing the problem. */
function _gamEnsureSheet_(sheetName, headers) {
  var ss    = _gamSS_();
  var sheet = ss.getSheetByName(sheetName);
  if (sheet && sheet.getLastColumn() > 0) {
    var actual = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
                      .map(function (h) { return String(h).trim(); });
    var want = headers.join('|');
    var have = actual.slice(0, headers.length).join('|');
    if (have !== want) {
      throw new Error('Sheet "' + sheetName + '" has an out-of-date header. ' +
        'Run resetChallengesSheetDESTRUCTIVE() from the Apps Script editor. ' +
        'Expected: ' + want + ' — found: ' + actual.join('|'));
    }
  }
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length)
         .setFontWeight('bold')
         .setBackground('#1e293b')
         .setFontColor('#ffffff');
  }
  return sheet;
}

function _gamReadAll_(sheetName) {
  var ss    = _gamSS_();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0].map(function(h) { return String(h); });
  return data.slice(1).map(function(row) {
    var obj = {};
    headers.forEach(function(h, i) { obj[h] = row[i]; });
    return obj;
  });
}

function _gamAppendRow_(sheetName, headers, rowObj) {
  var sheet = _gamEnsureSheet_(sheetName, headers);
  var row   = headers.map(function(h) { return rowObj[h] !== undefined ? rowObj[h] : ''; });
  sheet.appendRow(row);
}

function _gamUpdateRow_(sheetName, keyField, keyValue, updates) {
  var ss    = _gamSS_();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return false;
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return false;
  var headers  = data[0].map(function(h) { return String(h); });
  var keyIndex = headers.indexOf(keyField);
  if (keyIndex === -1) return false;
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][keyIndex]) === String(keyValue)) {
      Object.keys(updates).forEach(function(col) {
        var ci = headers.indexOf(col);
        if (ci !== -1) sheet.getRange(r + 1, ci + 1).setValue(updates[col]);
      });
      return true;
    }
  }
  return false;
}

// Build { lowercaseEmail: displayName } index from the Users sheet
function _gamUserIndex_(users) {
  var idx = {};
  users.forEach(function(u) {
    var email = String(u['email'] || '').toLowerCase();
    if (email) idx[email] = String(u['name'] || u['email'] || email);
  });
  return idx;
}

// ── Sheet bootstrap (call once from admin or onInstall) ──────────────────────

function ensureGamificationSheets() {
  try {
    _gamEnsureSheet_(GAM_SHEETS.NETWORK,    GAM_NETWORK_HEADERS);
    _gamEnsureSheet_(GAM_SHEETS.CHALLENGES, GAM_CHALLENGE_HEADERS);
    return _gamOk_(null, 'Gamification sheets are ready.');
  } catch (e) {
    return _gamErr_('ensureGamificationSheets failed: ' + e.message, 'SETUP_ERROR');
  }
}

// =============================================================================
//  SQUADRON LOGIC
// =============================================================================

// 1. searchPilot(sessionToken, query)
//    Search Users for text matches. Excludes self, existing friends,
//    and anyone with a Pending request in either direction.
// -----------------------------------------------------------------------------
function searchPilot(sessionToken, query) {
  try {
    var user = AuthService.requireSession(sessionToken);
    var myEmail = user.email;

    if (!query) return _gamErr_('query is required.', 'MISSING_PARAMS');

    var q            = String(query).toLowerCase().trim();
    if (q.length < 2) return _gamErr_('Search query must be at least 2 characters.', 'QUERY_TOO_SHORT');

    var myLower  = String(myEmail).toLowerCase();
    var users    = _gamReadAll_(GAM_SHEETS.USERS);
    var network  = _gamReadAll_(GAM_SHEETS.NETWORK);

    // Build exclusion set: self + anyone already connected or pending
    var excluded = {};
    excluded[myLower] = true;

    network.forEach(function(row) {
      var from   = String(row['From_Email'] || '').toLowerCase();
      var to     = String(row['To_Email']   || '').toLowerCase();
      var status = String(row['Status']     || '');
      if ((from === myLower || to === myLower) &&
          (status === GAM_STATUS.PENDING || status === GAM_STATUS.ACCEPTED)) {
        excluded[from] = true;
        excluded[to]   = true;
      }
    });

    var results = users
      .filter(function(u) {
        var email = String(u['email'] || '').toLowerCase();
        var name  = String(u['name']  || '').toLowerCase();
        return !excluded[email] && (email.indexOf(q) >= 0 || name.indexOf(q) >= 0);
      })
      .map(function(u) {
        return { email: String(u['email']), name: String(u['name'] || u['email']) };
      });

    return _gamOk_(results, results.length + ' pilot(s) found.');
  } catch (e) {
    return _gamErr_('searchPilot failed: ' + e.message, 'SEARCH_ERROR');
  }
}

// 2. sendRequest(sessionToken, friendEmail)
//    Insert a Pending row into Network. Rejects duplicates in both directions.
// -----------------------------------------------------------------------------
function sendRequest(sessionToken, friendEmail) {
  try {
    var user = AuthService.requireSession(sessionToken);
    var myEmail = user.email;

    if (!friendEmail) return _gamErr_('friendEmail is required.', 'MISSING_PARAMS');

    var from = String(myEmail).toLowerCase();
    var to   = String(friendEmail).toLowerCase();
    if (from === to) return _gamErr_('You cannot send a request to yourself.', 'SELF_REQUEST');

    var network   = _gamReadAll_(GAM_SHEETS.NETWORK);
    var duplicate = network.some(function(row) {
      var f = String(row['From_Email'] || '').toLowerCase();
      var t = String(row['To_Email']   || '').toLowerCase();
      var s = String(row['Status']     || '');
      return ((f === from && t === to) || (f === to && t === from)) &&
             (s === GAM_STATUS.PENDING || s === GAM_STATUS.ACCEPTED);
    });

    if (duplicate) return _gamErr_('A request or connection already exists with this pilot.', 'DUPLICATE_REQUEST');

    _gamAppendRow_(GAM_SHEETS.NETWORK, GAM_NETWORK_HEADERS, {
      Request_ID: String(Date.now()),
      From_Email: myEmail,
      To_Email:   friendEmail,
      Status:     GAM_STATUS.PENDING
    });

    try {
      var users    = _gamReadAll_(GAM_SHEETS.USERS);
      var userIdx  = _gamUserIndex_(users);
      var fromName = userIdx[from] || myEmail;
      MailApp.sendEmail({
        to:      friendEmail,
        subject: 'aerocomms — Squadron invitation from ' + fromName,
        htmlBody: _emailWrap_(
          '<table width="100%" cellpadding="0" cellspacing="0" style="text-align:center;margin-bottom:24px;">' +
            '<tr><td>' +
              '<img src="' + getLogoUrl() + '" alt="aerocomms" style="width:64px;height:64px;border-radius:8px;object-fit:contain;background:#000;border:2px solid ' + EC_.edge + ';">' +
            '</td></tr>' +
            '<tr><td style="padding-top:12px;font-size:10px;font-weight:800;letter-spacing:2.5px;color:' + EC_.accent + ';">aerocomms</td></tr>' +
            '<tr><td style="padding-top:3px;font-size:12px;color:' + EC_.faint + ';">Aviation English Interactive Campus</td></tr>' +
          '</table>' +
          '<div style="background:' + EC_.panel + ';border:1px solid ' + EC_.edge + ';border-radius:12px;padding:18px 20px;margin:0 0 20px;text-align:center;">' +
            '<div style="font-size:22px;margin-bottom:6px;">&#9992;</div>' +
            '<div style="font-size:15px;font-weight:700;color:' + EC_.accent + ';">Squadron Invitation</div>' +
          '</div>' +
          '<p style="margin:0 0 12px;font-size:14px;color:' + EC_.text + ';line-height:1.6;">' +
            '<strong style="color:' + EC_.text + ';">' + fromName + '</strong> wants to add you to their squadron on aerocomms.' +
          '</p>' +
          '<p style="margin:0 0 24px;font-size:13px;color:' + EC_.muted + ';line-height:1.6;">Log in and open the <strong style="color:' + EC_.text + ';">Squadron</strong> tab to accept or decline the invitation.</p>' +
          '<p style="margin:0;font-size:12px;color:' + EC_.faint + ';">Sent from ' + myEmail + '</p>'
        )
      });
    } catch (mailErr) {
      // Email failure is non-fatal — request is already saved
    }

    return _gamOk_(null, 'Squadron request sent to ' + friendEmail + '.');
  } catch (e) {
    return _gamErr_('sendRequest failed: ' + e.message, 'SEND_ERROR');
  }
}

// 3. getPendingRequests(sessionToken)
//    Return all Pending requests addressed TO the authenticated user.
//    Cross-references Users to resolve the sender's display name.
// -----------------------------------------------------------------------------
function getPendingRequests(sessionToken) {
  try {
    var user = AuthService.requireSession(sessionToken);
    var myEmail = user.email;

    var myLower  = String(myEmail).toLowerCase();
    var network  = _gamReadAll_(GAM_SHEETS.NETWORK);
    var users    = _gamReadAll_(GAM_SHEETS.USERS);
    var userIdx  = _gamUserIndex_(users);

    var pending = network
      .filter(function(row) {
        return String(row['To_Email'] || '').toLowerCase() === myLower &&
               String(row['Status']  || '') === GAM_STATUS.PENDING;
      })
      .map(function(row) {
        var fromEmail = String(row['From_Email'] || '');
        return {
          requestId: String(row['Request_ID'] || ''),
          fromEmail: fromEmail,
          fromName:  userIdx[fromEmail.toLowerCase()] || fromEmail
        };
      });

    return _gamOk_(pending, pending.length + ' pending request(s).');
  } catch (e) {
    return _gamErr_('getPendingRequests failed: ' + e.message, 'FETCH_ERROR');
  }
}

// 4. acceptRequest(sessionToken, requestId)
//    Update the matching Network row status to Accepted.
//    Verifies the authenticated user is the intended recipient.
// -----------------------------------------------------------------------------
function acceptRequest(sessionToken, requestId) {
  try {
    var user = AuthService.requireSession(sessionToken);
    if (!requestId) return _gamErr_('requestId is required.', 'MISSING_PARAMS');

    var myLower = String(user.email).toLowerCase();
    var network = _gamReadAll_(GAM_SHEETS.NETWORK);
    var row = network.find(function(r) { return String(r['Request_ID'] || '') === String(requestId); });
    if (!row) return _gamErr_('Request ID not found.', 'NOT_FOUND');
    if (String(row['To_Email'] || '').toLowerCase() !== myLower) {
      return _gamErr_('Not authorized to accept this request.', 'FORBIDDEN');
    }

    var updated = _gamUpdateRow_(
      GAM_SHEETS.NETWORK, 'Request_ID', String(requestId),
      { Status: GAM_STATUS.ACCEPTED }
    );

    if (!updated) return _gamErr_('Request ID not found.', 'NOT_FOUND');
    return _gamOk_(null, 'Request accepted. Pilot added to your squadron.');
  } catch (e) {
    return _gamErr_('acceptRequest failed: ' + e.message, 'ACCEPT_ERROR');
  }
}

// 5. getSquadron(sessionToken)
//    Return all Accepted connections where the authenticated user appears as From OR To.
//    Cross-references Users for display names.
// -----------------------------------------------------------------------------
function getSquadron(sessionToken) {
  try {
    var user = AuthService.requireSession(sessionToken);
    var myEmail = user.email;

    var myLower = String(myEmail).toLowerCase();
    var network = _gamReadAll_(GAM_SHEETS.NETWORK);
    var users   = _gamReadAll_(GAM_SHEETS.USERS);
    var userIdx = _gamUserIndex_(users);

    var squadron = network
      .filter(function(row) {
        var from   = String(row['From_Email'] || '').toLowerCase();
        var to     = String(row['To_Email']   || '').toLowerCase();
        var status = String(row['Status']     || '');
        return status === GAM_STATUS.ACCEPTED && (from === myLower || to === myLower);
      })
      .map(function(row) {
        var from        = String(row['From_Email'] || '');
        var to          = String(row['To_Email']   || '');
        var friendEmail = from.toLowerCase() === myLower ? to : from;
        return {
          email: friendEmail,
          name:  userIdx[friendEmail.toLowerCase()] || friendEmail
        };
      });

    return _gamOk_(squadron, squadron.length + ' pilot(s) in your squadron.');
  } catch (e) {
    return _gamErr_('getSquadron failed: ' + e.message, 'FETCH_ERROR');
  }
}

// =============================================================================
//  CHALLENGE LOGIC
// =============================================================================

/* ── How a duel works ────────────────────────────────────────────────────────
 *
 * Five questions, the same five for both pilots, in the same order, with the
 * options in the same order. That is what PaperJson holds: the ids drawn, and
 * for each one the shuffled positions of its options. It is written once when
 * the challenge is created and never touched again — "the same paper" has to
 * survive the target opening it days later, after the bank has been edited.
 *
 * Storing the shuffle rather than re-deriving it is the point. The bank's answer
 * is A eighteen times out of forty-six, so serving the options as authored would
 * let anyone score by always picking A; shuffling per challenge puts it anywhere
 * without asking the specialist to think about distribution.
 *
 * WHY THE CLOCK IS THE SERVER'S
 *
 * The duel is decided on correct answers first and elapsed time second, so the
 * time decides real matches. A number the browser reports is a number the
 * browser can choose, and "I finished in 3 ms" would win every tie. So the
 * server stamps when it hands the paper over and measures at submit. The cost is
 * that a pilot who walks away mid-paper burns their own clock — which is the
 * same thing that happens in the room, and is why it is capped rather than left
 * to run: 30 seconds a question, five questions, so 150 seconds is both the cap
 * and the worst score a finished paper can carry.
 *
 * WHEN THE XP LANDS
 *
 * Ten per correct answer is paid when that pilot finishes their own five, not
 * when the duel resolves. The challenger would otherwise see nothing until the
 * other side plays, which may be days, and an XP animation that fires for
 * something you did on Tuesday is not a reward.
 *
 * The fifty for winning is paid when the second pilot submits, because that is
 * the first moment anyone knows. An exact tie — same correct, same millisecond —
 * pays it to nobody.
 */

// 6. createChallenge(sessionToken, targetEmail)
//    Draw five active questions, freeze the paper, open the row, and hand the
//    challenger their copy. The row exists before a single answer, so an
//    abandoned attempt is visible as Awaiting_Challenger rather than absent.
// -----------------------------------------------------------------------------
function createChallenge(sessionToken, targetEmail) {
  try {
    var user    = AuthService.requireSession(sessionToken);
    var myEmail = user.email;

    if (!targetEmail) return _gamErr_('targetEmail is required.', 'MISSING_PARAMS');
    if (String(myEmail).toLowerCase() === String(targetEmail).toLowerCase()) {
      return _gamErr_('You cannot challenge yourself.', 'SELF_CHALLENGE');
    }

    var paper = _gamDrawPaper_();
    if (!paper.length) {
      return _gamErr_('The question bank does not have ' + CHALLENGE_QUESTION_COUNT +
                      ' active questions yet.', 'EMPTY_BANK');
    }

    var id    = String(Date.now());
    var stamp = new Date().toISOString();

    _gamAppendRow_(GAM_SHEETS.CHALLENGES, GAM_CHALLENGE_HEADERS, {
      Challenge_ID:          id,
      Challenger_Email:      myEmail,
      Target_Email:          targetEmail,
      PaperJson:             JSON.stringify(paper),
      Challenger_Correct:    '',
      Challenger_Ms:         '',
      Challenger_Started_At: stamp,
      Target_Correct:        '',
      Target_Ms:             '',
      Target_Started_At:     '',
      Winner_Email:          '',
      Status:                GAM_STATUS.AWAITING_CHALLENGER,
      Created_At:            stamp,
      Completed_At:          ''
    });

    return _gamOk_({
      challengeId:       id,
      questions:         _gamPaperForPlay_(paper),
      secondsPerQuestion: CHALLENGE_SECONDS_PER_QUESTION
    }, 'Challenge ready.');
  } catch (e) {
    return _gamErr_('createChallenge failed: ' + e.message, 'CHALLENGE_ERROR');
  }
}

// 7. getChallengePaper(sessionToken, challengeId)
//    The frozen paper, without the answers, for whichever side is asking. The
//    target's clock starts the first time they ask and never restarts, so
//    closing the tab and coming back does not buy a fresh run.
// -----------------------------------------------------------------------------
function getChallengePaper(sessionToken, challengeId) {
  try {
    var user  = AuthService.requireSession(sessionToken);
    var mine  = String(user.email).toLowerCase();
    var row   = _gamFindChallenge_(challengeId);
    if (!row) return _gamErr_('Challenge ID not found.', 'NOT_FOUND');

    var side = _gamSideOf_(row, mine);
    if (!side) return _gamErr_('Not your challenge.', 'FORBIDDEN');
    if (row[side + '_Correct'] !== '' && row[side + '_Correct'] !== null) {
      return _gamErr_('You have already played this challenge.', 'ALREADY_PLAYED');
    }
    /* Checked here and not only in the list: the email carries a link, and a link
     * outlives the card it came with. */
    if (_gamChallengeExpired_(row)) {
      return _gamErr_('This challenge expired — they are open for ' +
                      CHALLENGE_EXPIRY_HOURS + ' hours.', 'EXPIRED');
    }

    /* Stamped on first sight, not on every fetch — a refresh is not a restart. */
    if (!row[side + '_Started_At']) {
      var patch = {};
      patch[side + '_Started_At'] = new Date().toISOString();
      _gamUpdateRow_(GAM_SHEETS.CHALLENGES, 'Challenge_ID', String(challengeId), patch);
    }

    var paper = [];
    try { paper = JSON.parse(row.PaperJson || '[]'); } catch (e) {}
    if (!paper.length) return _gamErr_('This challenge has no paper.', 'NO_PAPER');

    return _gamOk_({
      challengeId:        String(challengeId),
      questions:          _gamPaperForPlay_(paper),
      secondsPerQuestion: CHALLENGE_SECONDS_PER_QUESTION
    }, 'Paper ready.');
  } catch (e) {
    return _gamErr_('getChallengePaper failed: ' + e.message, 'FETCH_ERROR');
  }
}

// 8. submitChallengeResult(sessionToken, challengeId, answers)
//    Score on the server from the frozen paper. `answers` is an array of the
//    DISPLAYED option index per question, or null for one left unanswered.
// -----------------------------------------------------------------------------
function submitChallengeResult(sessionToken, challengeId, answers) {
  try {
    var user = AuthService.requireSession(sessionToken);
    var mine = String(user.email).toLowerCase();
    var row  = _gamFindChallenge_(challengeId);
    if (!row) return _gamErr_('Challenge ID not found.', 'NOT_FOUND');

    var side = _gamSideOf_(row, mine);
    if (!side) return _gamErr_('Not your challenge.', 'FORBIDDEN');
    if (row[side + '_Correct'] !== '' && row[side + '_Correct'] !== null) {
      return _gamErr_('You have already played this challenge.', 'ALREADY_PLAYED');
    }

    var paper = [];
    try { paper = JSON.parse(row.PaperJson || '[]'); } catch (e) {}
    if (!paper.length) return _gamErr_('This challenge has no paper.', 'NO_PAPER');

    var given   = Array.isArray(answers) ? answers : [];
    var correct = _gamScorePaper_(paper, given);

    /* The clock the server started, capped at the paper's own limit. An unset
     * stamp means the paper was answered without ever being fetched, which the
     * screen cannot do — it scores as the full cap rather than as instant. */
    var startedAt = row[side + '_Started_At'];
    var capMs     = CHALLENGE_QUESTION_COUNT * CHALLENGE_SECONDS_PER_QUESTION * 1000;
    var elapsed   = startedAt ? (Date.now() - new Date(startedAt).getTime()) : capMs;
    var ms        = Math.max(0, Math.min(capMs, elapsed));

    var xpEarned = correct * CHALLENGE_XP_PER_CORRECT;
    if (xpEarned) lmsAddXp_(user.userId, xpEarned);

    var patch = {};
    patch[side + '_Correct'] = correct;
    patch[side + '_Ms']      = ms;

    var otherSide = (side === 'Challenger') ? 'Target' : 'Challenger';
    var otherDone = row[otherSide + '_Correct'] !== '' && row[otherSide + '_Correct'] !== null;

    var result = {
      correct:        correct,
      total:          paper.length,
      ms:             ms,
      xpEarned:       xpEarned,
      bonusXp:        0,
      youWon:         false,
      complete:       false,
      opponentName:   '',
      opponentCorrect: null,
      opponentMs:      null
    };

    if (!otherDone) {
      patch.Status = (side === 'Challenger') ? GAM_STATUS.AWAITING_TARGET
                                             : GAM_STATUS.AWAITING_CHALLENGER;
      _gamUpdateRow_(GAM_SHEETS.CHALLENGES, 'Challenge_ID', String(challengeId), patch);
      if (side === 'Challenger') _gamMailChallenge_(row, user, correct);
      return _gamOk_(result, 'Result recorded. Waiting for your opponent.');
    }

    /* Both in. More correct wins; level on correct, the faster clock wins; level
     * on both, nobody does and the bonus goes unpaid. */
    var otherCorrect = Number(row[otherSide + '_Correct']);
    var otherMs      = Number(row[otherSide + '_Ms']);
    var winnerSide   = null;
    if (correct > otherCorrect)      winnerSide = side;
    else if (correct < otherCorrect) winnerSide = otherSide;
    else if (ms < otherMs)           winnerSide = side;
    else if (ms > otherMs)           winnerSide = otherSide;

    var winnerEmail = winnerSide ? String(row[winnerSide + '_Email'] || '') : '';
    patch.Status       = GAM_STATUS.COMPLETE;
    patch.Winner_Email = winnerEmail;
    patch.Completed_At = new Date().toISOString();
    _gamUpdateRow_(GAM_SHEETS.CHALLENGES, 'Challenge_ID', String(challengeId), patch);

    if (winnerSide === side) {
      lmsAddXp_(user.userId, CHALLENGE_XP_WIN_BONUS);
      result.bonusXp = CHALLENGE_XP_WIN_BONUS;
      result.youWon  = true;
    } else if (winnerEmail) {
      /* The other pilot won while away from the screen, so their bonus is paid
       * here. They have no session in this call — the id comes off the sheet. */
      var users   = _gamReadAll_(GAM_SHEETS.USERS);
      var winnerR = users.filter(function (u) {
        return String(u.email || '').toLowerCase() === winnerEmail.toLowerCase();
      })[0];
      if (winnerR && winnerR.userId) lmsAddXp_(winnerR.userId, CHALLENGE_XP_WIN_BONUS);
    }

    var idx = _gamUserIndex_(_gamReadAll_(GAM_SHEETS.USERS));
    var otherEmail = String(row[otherSide + '_Email'] || '');
    result.complete        = true;
    result.opponentName    = idx[otherEmail.toLowerCase()] || otherEmail;
    result.opponentCorrect = otherCorrect;
    result.opponentMs      = otherMs;

    return _gamOk_(result, 'Challenge complete.');
  } catch (e) {
    return _gamErr_('submitChallengeResult failed: ' + e.message, 'SUBMIT_ERROR');
  }
}

// 9. getIncomingChallenges(sessionToken)
//    Challenges waiting on ME to play. A row the challenger has not finished is
//    not incoming to anybody — it is their own unfinished attempt.
// -----------------------------------------------------------------------------
function getIncomingChallenges(sessionToken) {
  try {
    var user    = AuthService.requireSession(sessionToken);
    var myLower = String(user.email).toLowerCase();
    var idx     = _gamUserIndex_(_gamReadAll_(GAM_SHEETS.USERS));

    var incoming = _gamReadAll_(GAM_SHEETS.CHALLENGES)
      .filter(function (row) {
        return String(row.Target_Email || '').toLowerCase() === myLower &&
               String(row.Status || '') === GAM_STATUS.AWAITING_TARGET &&
               !_gamChallengeExpired_(row);
      })
      .map(function (row) {
        var who = String(row.Challenger_Email || '');
        return {
          challengeId:      String(row.Challenge_ID || ''),
          challengerEmail:  who,
          challengerName:   idx[who.toLowerCase()] || who,
          challengerCorrect: Number(row.Challenger_Correct),
          questionCount:    CHALLENGE_QUESTION_COUNT,
          status:           String(row.Status || '')
        };
      });

    return _gamOk_(incoming, incoming.length + ' incoming challenge(s).');
  } catch (e) {
    return _gamErr_('getIncomingChallenges failed: ' + e.message, 'FETCH_ERROR');
  }
}

/* ── Challenge helpers ───────────────────────────────────────────────────────*/

function _gamFindChallenge_(challengeId) {
  if (!challengeId) return null;
  return _gamReadAll_(GAM_SHEETS.CHALLENGES).filter(function (r) {
    return String(r.Challenge_ID || '') === String(challengeId);
  })[0] || null;
}

/* Which end of this duel is this email? Returns the column prefix, or null for
 * somebody who is neither — which is the authorisation check. */
function _gamSideOf_(row, emailLower) {
  if (String(row.Challenger_Email || '').toLowerCase() === emailLower) return 'Challenger';
  if (String(row.Target_Email     || '').toLowerCase() === emailLower) return 'Target';
  return null;
}

/* Expired is computed, never stored. Storing it would need something to run and
 * would disagree with the row the moment it stopped. */
function _gamChallengeExpired_(row) {
  var created = row && row.Created_At;
  if (!created) return false;
  var age = Date.now() - new Date(created).getTime();
  return age > CHALLENGE_EXPIRY_HOURS * 3600 * 1000;
}

function _gamShuffle_(arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

/* Five active questions, each with its options shuffled. `order` maps a
 * displayed position to the option index as the specialist wrote it, so the
 * answer can be checked later without storing it anywhere the client can see. */
function _gamDrawPaper_() {
  var bank = dbReadAll_(CHALLENGE_QUESTIONS_SHEET_).filter(function (r) {
    var flag = String(r.active).toUpperCase();
    return r.questionId && flag !== 'FALSE' && flag !== 'NO' && flag !== '0';
  });
  if (bank.length < CHALLENGE_QUESTION_COUNT) return [];

  return _gamShuffle_(bank).slice(0, CHALLENGE_QUESTION_COUNT).map(function (q) {
    var opts = [];
    try { opts = JSON.parse(q.optionsJson || '[]'); } catch (e) {}
    var positions = _gamShuffle_(opts.map(function (_, i) { return i; }));
    return { id: String(q.questionId), order: positions };
  });
}

/* The paper as the pilot sees it: text, image and options in the frozen order,
 * and NO correct index. The answer never leaves the server — reading it out of
 * the page source would be the whole game. */
function _gamPaperForPlay_(paper) {
  var bank = dbReadAll_(CHALLENGE_QUESTIONS_SHEET_);
  var byId = {};
  bank.forEach(function (r) { byId[String(r.questionId)] = r; });

  return paper.map(function (p) {
    var q = byId[p.id];
    if (!q) return { questionId: p.id, question: '(question withdrawn)', imageUrl: '', options: [] };
    var opts = [];
    try { opts = JSON.parse(q.optionsJson || '[]'); } catch (e) {}
    return {
      questionId: p.id,
      question:   String(q.question || ''),
      imageUrl:   String(q.imageUrl || ''),
      options:    p.order.map(function (orig) { return String(opts[orig] || ''); })
    };
  });
}

/* Scored against the frozen order: the displayed position the pilot picked is
 * mapped back through `order` and compared with the authored correctIndex. */
function _gamScorePaper_(paper, given) {
  var bank = dbReadAll_(CHALLENGE_QUESTIONS_SHEET_);
  var byId = {};
  bank.forEach(function (r) { byId[String(r.questionId)] = r; });

  var correct = 0;
  paper.forEach(function (p, i) {
    var q = byId[p.id];
    if (!q) return;
    var picked = given[i];
    if (picked === null || picked === undefined || picked === '') return;
    var original = p.order[Number(picked)];
    if (original === undefined) return;
    if (Number(original) === Number(q.correctIndex)) correct++;
  });
  return correct;
}

/* The invitation. A send that fails must not lose the challenge — it is already
 * on the sheet and reachable from the Squadron tab, so the mail is a courtesy
 * and its failure is swallowed on purpose. */
function _gamMailChallenge_(row, challenger, challengerCorrect) {
  try {
    var idx      = _gamUserIndex_(_gamReadAll_(GAM_SHEETS.USERS));
    var chalName = idx[String(challenger.email).toLowerCase()] || challenger.email;
    MailApp.sendEmail({
      to:      String(row.Target_Email || ''),
      subject: 'aerocomms — ' + chalName + ' has challenged you!',
      htmlBody: _emailWrap_(
        '<table width="100%" cellpadding="0" cellspacing="0" style="text-align:center;margin-bottom:24px;">' +
          '<tr><td><img src="' + getLogoUrl() + '" alt="aerocomms" style="width:64px;height:64px;border-radius:8px;object-fit:contain;background:#000;border:2px solid rgba(245,158,11,0.4);"></td></tr>' +
          '<tr><td style="padding-top:12px;font-size:10px;font-weight:800;letter-spacing:2.5px;color:' + EC_.amber + ';">aerocomms</td></tr>' +
        '</table>' +
        '<div style="background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.22);border-radius:12px;padding:18px 20px;margin:0 0 20px;text-align:center;">' +
          '<div style="font-size:22px;margin-bottom:6px;">&#127942;</div>' +
          '<div style="font-size:15px;font-weight:700;color:' + EC_.amber + ';">Flight Duel Challenge</div>' +
        '</div>' +
        '<p style="margin:0 0 12px;font-size:14px;color:' + EC_.text + ';line-height:1.6;">' +
          '<strong style="color:' + EC_.text + ';">' + chalName + '</strong> has challenged you to ' +
          CHALLENGE_QUESTION_COUNT + ' questions, and scored <strong style="color:' + EC_.amber + ';">' +
          challengerCorrect + ' of ' + CHALLENGE_QUESTION_COUNT + '</strong>.' +
        '</p>' +
        '<p style="margin:0 0 20px;font-size:13px;color:' + EC_.muted + ';line-height:1.6;">You get the same ' +
          CHALLENGE_QUESTION_COUNT + ' questions. Most correct wins; if you tie, the faster clock takes it.</p>' +
        '<div style="text-align:center;margin-bottom:20px;">' +
          '<a href="' + ScriptApp.getService().getUrl() + '" style="display:inline-block;background:' + EC_.amber + ';color:' + EC_.ink + ';font-family:Arial,Helvetica,sans-serif;font-weight:900;font-size:14px;letter-spacing:1.5px;text-transform:uppercase;padding:14px 36px;border-radius:10px;text-decoration:none;">Accept Challenge →</a>' +
        '</div>' +
        '<p style="margin:0;font-size:12px;color:' + EC_.faint + ';">Sent from ' + challenger.email + '</p>'
      )
    });
  } catch (mailErr) {
    // Non-fatal: the challenge is already saved and visible in the Squadron tab.
  }
}

// 9. getNotificationCounts(sessionToken)
//    Returns pending request count + incoming challenge count in one call.
//    Used by the background poll to keep the nav badge current.
// -----------------------------------------------------------------------------
function getNotificationCounts(sessionToken) {
  try {
    var user = AuthService.requireSession(sessionToken);
    var myLower  = String(user.email).toLowerCase();
    var network  = _gamReadAll_(GAM_SHEETS.NETWORK);
    var challenges = _gamReadAll_(GAM_SHEETS.CHALLENGES);

    var pendingCount = network.filter(function(row) {
      return String(row['To_Email'] || '').toLowerCase() === myLower &&
             String(row['Status']   || '') === GAM_STATUS.PENDING;
    }).length;

    var challengeCount = challenges.filter(function(row) {
      return String(row['Target_Email'] || '').toLowerCase() === myLower &&
             String(row['Status']       || '') === GAM_STATUS.PENDING;
    }).length;

    return _gamOk_({ pending: pendingCount, challenges: challengeCount },
      'Counts retrieved.');
  } catch (e) {
    return _gamErr_('getNotificationCounts failed: ' + e.message, 'COUNT_ERROR');
  }
}

// 10. getLeaderboard(limit)
//    Returns pilots ranked by average scenario score (from Progress sheet).
//    Cross-references Users for display names.
// -----------------------------------------------------------------------------
function getLeaderboard(limit) {
  try {
    var safeLimit = (limit && !isNaN(Number(limit))) ? Math.min(Number(limit), 100) : 50;

    // Build user map from Users sheet
    var users = _gamReadAll_(GAM_SHEETS.USERS);
    var userMap = {};
    users.forEach(function(u) {
      var uid = String(u['userId'] || '').trim();
      if (uid) userMap[uid] = u;
    });

    // Read LmsXp — cumulative + weekly XP per user
    var lmsXpMap = {};
    try {
      var thisMonday = _lmsGetMondayIso_();
      dbReadAll_('LmsXp').forEach(function(r) {
        var uid = String(r.userId || '').trim();
        if (!uid) return;
        // Compared as instants, not as text: an offset stamp and a Z stamp for the
        // same moment sort the wrong way round as strings.
        var weeklyReset = !r.weeklyResetAt || tsBefore_(r.weeklyResetAt, thisMonday);
        lmsXpMap[uid] = {
          lmsXp: Number(r.lmsXp) || 0,
          weeklyXp: weeklyReset ? 0 : (Number(r.weeklyXp) || 0)
        };
      });
    } catch(e) {}

    // Read UserStreaks — streak info per user
    var streakMap = {};
    try {
      dbReadAll_('UserStreaks').forEach(function(r) {
        var uid = String(r.userId || '').trim();
        if (!uid) return;
        var hoursSince = r.lastActiveAt ? (Date.now() - new Date(r.lastActiveAt).getTime()) / (1000 * 60 * 60) : 999;
        streakMap[uid] = {
          streakDays: hoursSince < 48 ? (Number(r.streakDays) || 0) : 0,
          streakProtected: hoursSince < 48
        };
      });
    } catch(e) {}

    // Build ranked list from all users with any LMS activity
    var uids = Object.keys(lmsXpMap);
    var entries = uids.map(function(uid) {
      var u = userMap[uid] || {};
      var xp = lmsXpMap[uid] || { lmsXp: 0, weeklyXp: 0 };
      var streak = streakMap[uid] || { streakDays: 0, streakProtected: false };
      return {
        userId:          uid,
        // An XP row whose user is not in the Users sheet is not a person to rank.
        //
        // The ranking is built from LmsXp and each id is then looked up in Users. When
        // that lookup misses, u is {} and this fell through to the raw identifier, so
        // the leaderboard showed every student a string like USR_b9d1c8fd. Every one
        // of the 94 accounts has a name — the row simply pointed at a user who is not
        // among them. Named here for the case where a row is merely incomplete;
        // genuine orphans are dropped below, because ranking a deleted account against
        // real students is worse than a bad label.
        name:            String(u['name'] || u['email'] || '').trim() || 'Pilot',
        orphan:          !userMap[uid],
        email:           String(u['email'] || ''),
        profession:      String(u['profession'] || u['licenseType'] || 'PILOT'),
        lmsXp:           xp.lmsXp,
        mergedXp:        xp.lmsXp,
        weeklyXp:        xp.weeklyXp,
        streakDays:      streak.streakDays,
        streakProtected: streak.streakProtected
      };
    });

    // Sort by weeklyXp DESC, lmsXp DESC as tiebreaker
    // Drop the orphans before ranking. An XP row pointing at a user who is no longer
    // in the Users sheet is a leftover, not a competitor, and leaving it in put a
    // deleted account above real students in their own weekly table.
    entries = entries.filter(function (e) { return !e.orphan; });

    entries.sort(function(a, b) {
      if (b.weeklyXp !== a.weeklyXp) return b.weeklyXp - a.weeklyXp;
      return b.lmsXp - a.lmsXp;
    });

    var top = entries.slice(0, safeLimit).map(function(p, i) {
      return {
        rank:            i + 1,
        name:            p.name,
        email:           p.email,
        profession:      p.profession,
        lmsXp:           p.lmsXp,
        mergedXp:        p.mergedXp,
        weeklyXp:        p.weeklyXp,
        streakDays:      p.streakDays,
        streakProtected: p.streakProtected
      };
    });

    return _gamOk_(top, top.length + ' pilot(s) on the leaderboard.');
  } catch (e) {
    return _gamErr_('getLeaderboard failed: ' + e.message, 'LEADERBOARD_ERROR');
  }
}

// 11. getMyCompletedLevels(sessionToken)
//    Returns the calling user's completed level count from the Progress sheet.
//    Used to render the topbar rank pill and stripe badges on login.
// -----------------------------------------------------------------------------
/* The rank badge, and why it used to take fifty seconds.
 *
 * On 2026-09-08 this was the only endpoint timing out: four times in four
 * minutes, at 43.2s and 54.0s, while apiPing (no I/O at all) answered in
 * 1.7-5.9s and getNotificationCounts in 3.5-4.4s. It reads seven sheets, two of
 * them in full — Progress, which grows with every student's every attempt, and
 * Scenarios — and it rebuilt an object for EVERY row of Progress, including
 * every other student's, before filtering to one userId.
 *
 * Three changes, in order of what they save:
 *
 *  1. The answer is cached per user. It changes when progress changes, and
 *     ProgressService.updateUserProgress invalidates it there — one place,
 *     which every completion path already goes through.
 *  2. The level -> required-country-count map is identical for every student
 *     and every call, and is now cached script-wide instead of rebuilt from a
 *     full scan of Scenarios each time.
 *  3. Progress rows are filtered by userId BEFORE an object is built, so the
 *     work is proportional to one student's rows rather than the whole table.
 *
 * NOT routed through dbReadAll_/_DB_SCOPE, deliberately. This endpoint opens no
 * read scope, so _DB_SCOPE would cache nothing; and dbReadAll_ maps columns by
 * DB_SCHEMA order while this reads the live header row. If the sheet's order has
 * ever drifted from the schema, that swap would mis-read every field on the one
 * table holding all student progress — and per rule 6 the sheet cannot be
 * checked from the repo. */
/* Thirty minutes, and that number is only safe because every writer clears it.
 *
 * The original ten minutes was not chosen against the poll interval and did not
 * survive it: the rank poll runs every five minutes, so a ten-minute entry gave
 * miss, hit, EXPIRE, miss, hit, expire — a flat 50% miss rate on a perfect
 * network, and a miss is a full read of the Progress sheet.
 *
 * Raising it alone would have been wrong. The entry carries lmsXp, weeklyXp,
 * streakDays and streakFreezes as well as the level count, and only
 * updateUserProgress used to clear it — so a longer life meant a longer stretch
 * of a student seeing XP they had already earned reported as missing. lmsAddXp_
 * and lmsUpdateStreak_ clear it now, so the length is bounded by writes rather
 * than by the clock. */
var GAM_COMPLETED_CACHE_SECS_  = 1800;  // 30 min; cleared by every writer
var GAM_LEVELMAP_CACHE_SECS_   = 1800;  // 30 min; identical for every student

function _gamCompletedCacheKey_(userId) { return 'gamCompleted_' + String(userId || ''); }

/* Called by ProgressService.updateUserProgress — the durable write every
 * completion path goes through, so one call covers attempt submit, finalise and
 * complete. Failing to invalidate must never break the write, hence the catch. */
function gamInvalidateCompletedLevels_(userId) {
  try { CacheService.getScriptCache().remove(_gamCompletedCacheKey_(userId)); }
  catch (e) {}
}

function _gamLevelCountryMap_(ss) {
  var cache = null, raw = null;
  try { cache = CacheService.getScriptCache(); raw = cache.get('gamLevelCountryMap'); } catch (e) {}
  if (raw) { try { return JSON.parse(raw); } catch (e) {} }

  var levelCountryMap = {};
  try {
    var scenSheet = ss.getSheetByName('Scenarios');
    if (scenSheet) {
      var scenData = scenSheet.getDataRange().getValues();
      if (scenData.length >= 2) {
        var sHdrs    = scenData[0].map(function(h) { return String(h); });
        var sLvlIdx  = sHdrs.indexOf('level');
        var sCtryIdx = sHdrs.indexOf('country');
        var sActIdx  = sHdrs.indexOf('isActive');
        var tmpMap   = {};
        scenData.slice(1).forEach(function(row) {
          var active = String(row[sActIdx] || '').trim().toUpperCase();
          if (active !== 'TRUE' && active !== 'ACTIVE' && active !== 'YES' && active !== '1') return;
          var lvl     = parseInt(row[sLvlIdx] || '0', 10);
          var country = String(row[sCtryIdx] || '').trim().toUpperCase();
          if (lvl < 1 || !country) return;
          if (!tmpMap[lvl]) tmpMap[lvl] = {};
          tmpMap[lvl][country] = true;
        });
        Object.keys(tmpMap).forEach(function(lvl) {
          levelCountryMap[lvl] = Object.keys(tmpMap[lvl]).length;
        });
      }
    }
  } catch (e) {}
  try { if (cache) cache.put('gamLevelCountryMap', JSON.stringify(levelCountryMap), GAM_LEVELMAP_CACHE_SECS_); }
  catch (e) {}
  return levelCountryMap;
}

function getMyCompletedLevels(sessionToken) {
  try {
    var user = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    var uid = String(user.userId || '').trim();

    var _cache = null;
    try {
      _cache = CacheService.getScriptCache();
      var _hit = _cache.get(_gamCompletedCacheKey_(uid));
      if (_hit) return JSON.parse(_hit);
    } catch (e) {}

    var ss = _gamSS_();
    var progSheet = ss.getSheetByName('Progress');
    if (!progSheet) return { ok: true, completedLevels: 0 };
    var data = progSheet.getDataRange().getValues();
    if (data.length < 2) return { ok: true, completedLevels: 0 };
    var headers = data[0].map(function(h) { return String(h); });

    // Identical for every student and every call — built once, cached script-wide.
    var levelCountryMap = _gamLevelCountryMap_(ss);

    // Track per-(level, country) completions
    /* Column indexes once, then the userId test BEFORE any object is built.
     * This used to construct a full object for every row in Progress — every
     * other student's included — and throw it away on the next line. The work is
     * now proportional to one student's rows. */
    var iUser    = headers.indexOf('userId');
    var iLevel   = headers.indexOf('level');
    var iCountry = headers.indexOf('country');
    var iDone    = headers.indexOf('completed');
    if (iUser === -1) return { ok: true, completedLevels: 0 };

    var levelCountries = {};
    data.slice(1).forEach(function(row) {
      if (String(row[iUser] || '').trim() !== uid) return;
      var obj = {};
      obj['level']       = iLevel   === -1 ? '' : row[iLevel];
      obj['country']     = iCountry === -1 ? '' : row[iCountry];
      obj['completed']   = iDone    === -1 ? '' : row[iDone];
      var lvl     = parseInt(obj['level'] || '0', 10);
      var country = String(obj['country'] || '').trim().toUpperCase();
      var c       = String(obj['completed'] || '').toLowerCase();
      var isDone  = (c === 'true' || c === '1' || c === 'yes');
      if (lvl < 1) return;
      /* Every level a student has finished counts, for good.
       *
       * This used to be filtered to the current tour, which is what put
       * TourService.getActiveTour() on the boot path — and that call, once a week
       * when the tour expired, closed the old tour, snapshotted every user one
       * appendRow at a time, awarded commendations and opened the next one, inline,
       * inside a student's page load. It is the 49.157s cold start, and the rank
       * dropping to zero every Monday afternoon was the same line. */
      var lcKey = lvl + '||' + country;
      if (!levelCountries[lcKey]) levelCountries[lcKey] = false;
      if (isDone) levelCountries[lcKey] = true;
    });

    // Count levels where ALL required countries are done
    var levelDoneCounts = {};
    Object.keys(levelCountries).forEach(function(lcKey) {
      var lvl = parseInt(lcKey.split('||')[0], 10);
      if (!levelDoneCounts[lvl]) levelDoneCounts[lvl] = 0;
      if (levelCountries[lcKey]) levelDoneCounts[lvl]++;
    });
    var completedCount = 0;
    Object.keys(levelDoneCounts).forEach(function(lvl) {
      var required = levelCountryMap[lvl] || 1;
      if (levelDoneCounts[lvl] >= required) completedCount++;
    });
    var lmsXp = 0, weeklyXp = 0, streakDays = 0, streakProtected = false, lastActiveAt = '';
    try {
      var xpData = lmsGetXpData_(user.userId);
      lmsXp = xpData.lmsXp;
      weeklyXp = xpData.weeklyXp;
    } catch(e) {}
    try {
      var streakData = lmsGetStreak_(user.userId);
      streakDays = streakData.streakDays;
      streakProtected = streakData.streakProtected;
      lastActiveAt = streakData.lastActiveAt || '';
    } catch(e) {}
    var streakFreezes = 0;
    try { streakFreezes = _dcGetFreezes_(user.userId); } catch(e) {}
    var out = {
      ok: true,
      completedLevels: completedCount,
      lmsXp: lmsXp,
      mergedXp: lmsXp,
      weeklyXp: weeklyXp,
      streakDays: streakDays,
      streakProtected: streakProtected,
      lastActiveAt: lastActiveAt,
      streakFreezes: streakFreezes
    };
    // Ten minutes, and invalidated the moment progress changes — so a student
    // who finishes a level sees the new rank on the next poll, not in ten.
    try { if (_cache) _cache.put(_gamCompletedCacheKey_(uid), JSON.stringify(out), GAM_COMPLETED_CACHE_SECS_); }
    catch (e) {}
    return out;
  } catch(e) {
    return { ok: false, completedLevels: 0, lmsXp: 0, mergedXp: 0, weeklyXp: 0, streakDays: 0, streakProtected: false, streakFreezes: 0 };
  }
}
