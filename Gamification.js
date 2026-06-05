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
var GAM_CHALLENGE_HEADERS  = ['Challenge_ID', 'Challenger_Email', 'Target_Email','Scenario_Name', 'Challenger_Score', 'Status'];

var GAM_STATUS = {
  PENDING:     'Pending',
  ACCEPTED:    'Accepted',
  DECLINED:    'Declined',
  IN_PROGRESS: 'Accepted_In_Progress'
};

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

function _gamEnsureSheet_(sheetName, headers) {
  var ss    = _gamSS_();
  var sheet = ss.getSheetByName(sheetName);
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

// 1. searchPilot(query, myEmail)
//    Search Users for text matches. Excludes self, existing friends,
//    and anyone with a Pending request in either direction.
// -----------------------------------------------------------------------------
function searchPilot(query, myEmail) {
  try {
    if (!query || !myEmail) return _gamErr_('query and myEmail are required.', 'MISSING_PARAMS');

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

// 2. sendRequest(myEmail, friendEmail)
//    Insert a Pending row into Network. Rejects duplicates in both directions.
// -----------------------------------------------------------------------------
function sendRequest(myEmail, friendEmail) {
  try {
    if (!myEmail || !friendEmail) return _gamErr_('myEmail and friendEmail are required.', 'MISSING_PARAMS');

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
        subject: 'AEROCOMMS — Squadron invitation from ' + fromName,
        htmlBody: _emailWrap_(
          '<table width="100%" cellpadding="0" cellspacing="0" style="text-align:center;margin-bottom:24px;">' +
            '<tr><td>' +
              '<img src="' + getLogoDataUrl() + '" alt="AEROCOMMS" style="width:64px;height:64px;border-radius:8px;object-fit:contain;background:#000;border:2px solid rgba(0,212,142,0.35);">' +
            '</td></tr>' +
            '<tr><td style="padding-top:12px;font-size:10px;font-weight:800;letter-spacing:2.5px;text-transform:uppercase;color:#00d48e;">AEROCOMMS</td></tr>' +
            '<tr><td style="padding-top:3px;font-size:12px;color:#4a6280;">ICAO Trainer Pro</td></tr>' +
          '</table>' +
          '<div style="background:rgba(0,212,142,0.07);border:1px solid rgba(0,212,142,0.18);border-radius:12px;padding:18px 20px;margin:0 0 20px;text-align:center;">' +
            '<div style="font-size:22px;margin-bottom:6px;">&#9992;</div>' +
            '<div style="font-size:15px;font-weight:700;color:#00d48e;">Squadron Invitation</div>' +
          '</div>' +
          '<p style="margin:0 0 12px;font-size:14px;color:#dde6f0;line-height:1.6;">' +
            '<strong style="color:#dde6f0;">' + fromName + '</strong> wants to add you to their squadron on AEROCOMMS.' +
          '</p>' +
          '<p style="margin:0 0 24px;font-size:13px;color:#8fa3bb;line-height:1.6;">Log in and open the <strong style="color:#dde6f0;">Squadron</strong> tab to accept or decline the invitation.</p>' +
          '<p style="margin:0;font-size:12px;color:#2d4a63;">Sent from ' + myEmail + '</p>'
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

// 3. getPendingRequests(myEmail)
//    Return all Pending requests addressed TO myEmail.
//    Cross-references Users to resolve the sender's display name.
// -----------------------------------------------------------------------------
function getPendingRequests(myEmail) {
  try {
    if (!myEmail) return _gamErr_('myEmail is required.', 'MISSING_PARAMS');

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

// 4. acceptRequest(requestId)
//    Update the matching Network row status to Accepted.
// -----------------------------------------------------------------------------
function acceptRequest(requestId) {
  try {
    if (!requestId) return _gamErr_('requestId is required.', 'MISSING_PARAMS');

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

// 5. getSquadron(myEmail)
//    Return all Accepted connections where user appears as From OR To.
//    Cross-references Users for display names.
// -----------------------------------------------------------------------------
function getSquadron(myEmail) {
  try {
    if (!myEmail) return _gamErr_('myEmail is required.', 'MISSING_PARAMS');

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

// 6. sendChallenge(myEmail, targetEmail, scenarioName, myScore)
//    Insert a Pending row into Challenges.
// -----------------------------------------------------------------------------
function sendChallenge(myEmail, targetEmail, scenarioName, myScore) {
  try {
    if (!myEmail || !targetEmail || !scenarioName) {
      return _gamErr_('myEmail, targetEmail, and scenarioName are required.', 'MISSING_PARAMS');
    }

    var challenger = String(myEmail).toLowerCase();
    var target     = String(targetEmail).toLowerCase();
    if (challenger === target) return _gamErr_('You cannot challenge yourself.', 'SELF_CHALLENGE');

    var scoreValue = (myScore !== undefined && myScore !== null && myScore !== '')
      ? Number(myScore)
      : '';

    _gamAppendRow_(GAM_SHEETS.CHALLENGES, GAM_CHALLENGE_HEADERS, {
      Challenge_ID:     String(Date.now()),
      Challenger_Email: myEmail,
      Target_Email:     targetEmail,
      Scenario_Name:    scenarioName,
      Challenger_Score: scoreValue,
      Status:           GAM_STATUS.PENDING
    });

    try {
      var users       = _gamReadAll_(GAM_SHEETS.USERS);
      var userIdx     = _gamUserIndex_(users);
      var chalName    = userIdx[challenger] || myEmail;
      var scoreText   = (scoreValue !== '') ? ' Their score to beat: <strong>' + scoreValue + '</strong>.' : '';
      MailApp.sendEmail({
        to:      targetEmail,
        subject: 'AEROCOMMS — ' + chalName + ' has challenged you!',
        htmlBody: _emailWrap_(
          '<table width="100%" cellpadding="0" cellspacing="0" style="text-align:center;margin-bottom:24px;">' +
            '<tr><td>' +
              '<img src="' + getLogoDataUrl() + '" alt="AEROCOMMS" style="width:64px;height:64px;border-radius:8px;object-fit:contain;background:#000;border:2px solid rgba(245,158,11,0.4);">' +
            '</td></tr>' +
            '<tr><td style="padding-top:12px;font-size:10px;font-weight:800;letter-spacing:2.5px;text-transform:uppercase;color:#f59e0b;">AEROCOMMS</td></tr>' +
            '<tr><td style="padding-top:3px;font-size:12px;color:#4a6280;">ICAO Trainer Pro</td></tr>' +
          '</table>' +
          '<div style="background:rgba(245,158,11,0.07);border:1px solid rgba(245,158,11,0.22);border-radius:12px;padding:18px 20px;margin:0 0 20px;text-align:center;">' +
            '<div style="font-size:22px;margin-bottom:6px;">&#127942;</div>' +
            '<div style="font-size:15px;font-weight:700;color:#f59e0b;">Flight Duel Challenge</div>' +
          '</div>' +
          '<p style="margin:0 0 12px;font-size:14px;color:#dde6f0;line-height:1.6;">' +
            '<strong style="color:#dde6f0;">' + chalName + '</strong> has challenged you to the <strong style="color:#dde6f0;">' + scenarioName + '</strong> scenario.' +
            (scoreValue !== '' ? ' Their score to beat: <strong style="color:#f59e0b;">' + scoreValue + '</strong>.' : '') +
          '</p>' +
          '<p style="margin:0 0 20px;font-size:13px;color:#8fa3bb;line-height:1.6;">Open the <strong style="color:#dde6f0;">Squadron</strong> tab to accept or decline the challenge.</p>' +
          '<div style="text-align:center;margin-bottom:20px;">' +
            '<a href="' + ScriptApp.getService().getUrl() + '" style="display:inline-block;background:#f59e0b;color:#07101e;font-family:Arial,Helvetica,sans-serif;font-weight:900;font-size:14px;letter-spacing:1.5px;text-transform:uppercase;padding:14px 36px;border-radius:10px;text-decoration:none;">Accept Challenge →</a>' +
          '</div>' +
          '<p style="margin:0;font-size:12px;color:#2d4a63;">Sent from ' + myEmail + '</p>'
        )
      });
    } catch (mailErr) {
      // Email failure is non-fatal — challenge is already saved
    }

    return _gamOk_(null, 'Challenge sent to ' + targetEmail + ' on scenario "' + scenarioName + '".');
  } catch (e) {
    return _gamErr_('sendChallenge failed: ' + e.message, 'CHALLENGE_ERROR');
  }
}

// 7. getIncomingChallenges(myEmail)
//    Return all Pending challenges where Target_Email == myEmail.
//    Cross-references Users for the challenger's display name.
// -----------------------------------------------------------------------------
function getIncomingChallenges(myEmail) {
  try {
    if (!myEmail) return _gamErr_('myEmail is required.', 'MISSING_PARAMS');

    var myLower    = String(myEmail).toLowerCase();
    var challenges = _gamReadAll_(GAM_SHEETS.CHALLENGES);
    var users      = _gamReadAll_(GAM_SHEETS.USERS);
    var userIdx    = _gamUserIndex_(users);

    var incoming = challenges
      .filter(function(row) {
        return String(row['Target_Email'] || '').toLowerCase() === myLower &&
               String(row['Status']      || '') === GAM_STATUS.PENDING;
      })
      .map(function(row) {
        var challengerEmail = String(row['Challenger_Email'] || '');
        var rawScore        = row['Challenger_Score'];
        return {
          challengeId:     String(row['Challenge_ID']    || ''),
          challengerEmail: challengerEmail,
          challengerName:  userIdx[challengerEmail.toLowerCase()] || challengerEmail,
          scenarioName:    String(row['Scenario_Name']   || ''),
          challengerScore: (rawScore !== '' && rawScore !== null) ? Number(rawScore) : null,
          status:          String(row['Status'] || '')
        };
      });

    return _gamOk_(incoming, incoming.length + ' incoming challenge(s).');
  } catch (e) {
    return _gamErr_('getIncomingChallenges failed: ' + e.message, 'FETCH_ERROR');
  }
}

// 8. acceptChallenge(challengeId)
//    Update the matching Challenges row status to Accepted_In_Progress.
// -----------------------------------------------------------------------------
function acceptChallenge(challengeId) {
  try {
    if (!challengeId) return _gamErr_('challengeId is required.', 'MISSING_PARAMS');

    var updated = _gamUpdateRow_(
      GAM_SHEETS.CHALLENGES, 'Challenge_ID', String(challengeId),
      { Status: GAM_STATUS.IN_PROGRESS }
    );

    if (!updated) return _gamErr_('Challenge ID not found.', 'NOT_FOUND');
    return _gamOk_(null, 'Challenge accepted. Good luck, pilot.');
  } catch (e) {
    return _gamErr_('acceptChallenge failed: ' + e.message, 'ACCEPT_ERROR');
  }
}

// 9. getNotificationCounts(myEmail)
//    Returns pending request count + incoming challenge count in one call.
//    Used by the background poll to keep the nav badge current.
// -----------------------------------------------------------------------------
function getNotificationCounts(myEmail) {
  try {
    if (!myEmail) return _gamErr_('myEmail is required.', 'MISSING_PARAMS');
    var myLower  = String(myEmail).toLowerCase();
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
    var safeLimit = (limit && !isNaN(Number(limit))) ? Math.min(Number(limit), 100) : 20;
    var ss = _gamSS_();

    var progSheet = ss.getSheetByName('Progress');
    if (!progSheet) return _gamOk_([], 'No progress data yet.');
    var progData = progSheet.getDataRange().getValues();
    if (progData.length < 2) return _gamOk_([], 'No progress data yet.');
    var progHeaders = progData[0].map(function(h) { return String(h); });
    var progRows = progData.slice(1).map(function(row) {
      var obj = {};
      progHeaders.forEach(function(h, i) { obj[h] = row[i]; });
      return obj;
    });

    // XP base per level — index matches level number (0 is unused placeholder)
    // Decreasing curve: early levels give more XP, later levels give less.
    var XP_BASE = [0, 500, 450, 400, 350, 300, 260, 220, 180, 140, 100];

    // Aggregate per userId — track best score per distinct level to avoid
    // counting multiple attempts at the same level as separate completions.
    var byUser = {};
    progRows.forEach(function(row) {
      var uid       = String(row['userId'] || '').trim();
      var score     = parseFloat(row['scoreAvg']) || 0;
      var lvl       = parseInt(row['level'], 10)  || 0;
      var completed = String(row['completed'] || '').toLowerCase();
      var isDone    = (completed === 'true' || completed === '1' || completed === 'yes');
      if (!uid || lvl < 1) return;
      if (!byUser[uid]) byUser[uid] = { levels: {}, maxLevel: 0 };
      if (!byUser[uid].levels[lvl]) byUser[uid].levels[lvl] = { bestScore: 0, completed: false };
      if (score > byUser[uid].levels[lvl].bestScore) byUser[uid].levels[lvl].bestScore = score;
      if (isDone) byUser[uid].levels[lvl].completed = true;
      if (lvl > byUser[uid].maxLevel) byUser[uid].maxLevel = lvl;
    });

    // Build user lookup from Users sheet
    var users   = _gamReadAll_(GAM_SHEETS.USERS);
    var userMap = {};
    users.forEach(function(u) {
      var uid = String(u['userId'] || '').trim();
      if (uid) userMap[uid] = u;
    });

    // Build ranked array — XP and completedLevels derived from distinct level records
    var entries = Object.keys(byUser).map(function(uid) {
      var agg = byUser[uid];
      var u   = userMap[uid] || {};
      var totalXp = 0;
      var completedLevels = 0;
      Object.keys(agg.levels).forEach(function(lvlKey) {
        var lvlData = agg.levels[lvlKey];
        if (!lvlData.completed) return;
        completedLevels++;
        var lvl   = parseInt(lvlKey, 10);
        var base  = lvl <= 10 ? XP_BASE[lvl] : 100;
        var bonus = lvlData.bestScore >= 90 ? 50 : lvlData.bestScore >= 70 ? 25 : 0;
        totalXp += base + bonus;
      });
      return {
        userId:          uid,
        name:            String(u['name'] || u['email'] || uid),
        email:           String(u['email'] || ''),
        totalXp:         totalXp,
        completedLevels: completedLevels,
        maxLevel:        agg.maxLevel || parseInt(u['currentLevel'], 10) || 1
      };
    });

    // Tier-first: completedLevels DESC keeps tier grouping intact; totalXp breaks ties
    entries.sort(function(a, b) {
      if (b.completedLevels !== a.completedLevels) return b.completedLevels - a.completedLevels;
      return b.totalXp - a.totalXp;
    });

    var top = entries.slice(0, safeLimit).map(function(p, i) {
      return {
        rank:            i + 1,
        name:            p.name,
        email:           p.email,
        totalXp:         p.totalXp,
        completedLevels: p.completedLevels,
        maxLevel:        p.maxLevel
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
function getMyCompletedLevels(sessionToken) {
  try {
    var user = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    var ss = _gamSS_();
    var progSheet = ss.getSheetByName('Progress');
    if (!progSheet) return { ok: true, completedLevels: 0 };
    var data = progSheet.getDataRange().getValues();
    if (data.length < 2) return { ok: true, completedLevels: 0 };
    var headers = data[0].map(function(h) { return String(h); });
    var uid = String(user.userId || '').trim();

    // Use the active tour's start date so rank resets weekly
    var tourStart = null;
    try {
      var tour = TourService.getActiveTour();
      if (tour && tour.startDate) tourStart = new Date(tour.startDate);
    } catch(e) {}

    // Build level→required-country-count map (matches simulator definition)
    var levelCountryMap = {};
    try {
      var scenSheet = ss.getSheetByName('Scenarios');
      if (scenSheet) {
        var scenData = scenSheet.getDataRange().getValues();
        if (scenData.length >= 2) {
          var sHdrs     = scenData[0].map(function(h) { return String(h); });
          var sLvlIdx   = sHdrs.indexOf('level');
          var sCtryIdx  = sHdrs.indexOf('country');
          var sActIdx   = sHdrs.indexOf('isActive');
          var tmpMap    = {};
          scenData.slice(1).forEach(function(row) {
            var active = String(row[sActIdx] || '').trim().toUpperCase();
            if (active !== 'TRUE' && active !== 'ACTIVE' && active !== 'YES' && active !== '1') return;
            var lvl     = parseInt(row[sLvlIdx]  || '0', 10);
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
    } catch(e) {}

    // Track per-(level, country) completions
    var levelCountries = {};
    data.slice(1).forEach(function(row) {
      var obj = {};
      headers.forEach(function(h, i) { obj[h] = row[i]; });
      if (String(obj['userId'] || '').trim() !== uid) return;
      var lvl     = parseInt(obj['level'] || '0', 10);
      var country = String(obj['country'] || '').trim().toUpperCase();
      var c       = String(obj['completed'] || '').toLowerCase();
      var isDone  = (c === 'true' || c === '1' || c === 'yes');
      if (lvl < 1) return;
      // Only count levels updated this tour.
      // Rows with no timestamp are treated as pre-tour (excluded) so old
      // completed=TRUE data never inflates the rank badge.
      if (tourStart) {
        var ts = obj['updatedAt'] || obj['completedAt'] || '';
        if (!ts) return; // no timestamp → treat as older than tourStart
        var d = ts instanceof Date ? ts : new Date(String(ts));
        if (isNaN(d.getTime()) || d < tourStart) return;
      }
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
    return { ok: true, completedLevels: completedCount };
  } catch(e) {
    return { ok: false, completedLevels: 0 };
  }
}
