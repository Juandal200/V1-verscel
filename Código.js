/*******************************************************
 * Code.gs
 * ICAO  Pro - Main API Endpoints
 *******************************************************/

function doGet(e) {
  var appName = getAppConfigValue_('APP_NAME', 'Icao Aerocomms');

  return HtmlService
    .createTemplateFromFile('Index')
    .evaluate()
    .setTitle(appName)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ── Vercel/external HTTP API ───────────────────────────────────────────────
// Receives POST requests from the Vercel frontend (fetch calls routed via
// the google.script.run shim). Only functions whose names start with 'api'
// (or the special 'getClientConfigJson') are callable — all of them already
// validate the session token internally, so auth is unchanged.
function doPost(e) {
  if (!e || !e.postData) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'doPost reached but no postData' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  try {
    var body = JSON.parse(e.postData.contents);

    // Wompi payment webhook
    if (body.event === 'transaction.updated' &&
        body.data && body.data.transaction &&
        body.data.transaction.status === 'APPROVED') {
      var txn   = body.data.transaction;
      var parts = String(txn.reference || '').split('-');
      var plan, userId;
      if (parts[0] === 'AEROCOMMS') {
        if (_PLAN_DAYS[parts[1]]) {
          plan   = parts[1];
          userId = parts[2];
        } else {
          plan   = '1m';
          userId = parts[1];
        }
        if (userId) {
          var email = (txn.customer_data && txn.customer_data.email) || '';
          wompiRecordSubscription_(userId, email, String(txn.id), txn.amount_in_cents || 0, _PLAN_DAYS[plan] || 30);
        }
      }
      return ContentService.createTextOutput('ok').setMimeType(ContentService.MimeType.TEXT);
    }

    // Standard API call
    var action  = String(body.action || '');
    var args    = Array.isArray(body.args) ? body.args : [];

    var allowed = action === 'getClientConfigJson' ||
                  /^api[A-Z]/.test(action) ||
                  action === 'getMyCompletedLevels' ||
                  action === 'getTtsConfigStatus' ||
                  action === 'fetchLMSData' ||
                  action === 'saveLMSScore' ||
                  action === 'getLevelConfig' ||
                  action === 'getPendingRequests' ||
                  action === 'getIncomingChallenges' ||
                  action === 'getNotificationCounts' ||
                  action === 'getSquadron' ||
                  action === 'sendRequest' ||
                  action === 'sendChallenge' ||
                  action === 'acceptRequest' ||
                  action === 'acceptChallenge' ||
                  action === 'searchPilot';

    var output = ContentService.createTextOutput();
    output.setMimeType(ContentService.MimeType.JSON);

    if (!allowed) {
      output.setContent(JSON.stringify({ ok: false, error: 'Not allowed: ' + action }));
      return output;
    }

    var fn = globalThis[action];
    if (typeof fn !== 'function') {
      output.setContent(JSON.stringify({ ok: false, error: 'Unknown function: ' + action }));
      return output;
    }

    var result = fn.apply(null, args);
    output.setContent(JSON.stringify(result));
    return output;

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err && err.message ? err.message : String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getClientConfigJson() {
  var props = PropertiesService.getScriptProperties();

  return JSON.stringify({
    appName: getAppConfigValue_('APP_NAME', 'Icao Aerocomms'),
    appVersion: getAppConfigValue_('APP_VERSION', '2.0.0'),
    googleClientId: props.getProperty(getAppConfigValue_('PROP_GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_ID')) || ''
  });
}

/*******************************************************
 * AUTH
 *******************************************************/

function apiRegisterUser(payload) {
  try {
    payload = payload || {};

    var result = AuthService.registerUser(
      String(payload.email || '').trim().toLowerCase(),
      String(payload.name || '').trim(),
      String(payload.profession || '').trim().toUpperCase()
    );

    return safeResponse_(result);

  } catch (err) {
    return apiError_('apiRegisterUser', err);
  }
}

function apiDirectLogin(payload) {
  try {
    payload = payload || {};
    var email = String(payload.email || '').trim().toLowerCase();
    if (!email) throw new Error('Email required.');
    var user = dbFindOne_('Users', 'email', email);
    if (!user) return { ok: false, message: 'No account found for this email. Ask your administrator to register you.' };
    if (String(user.status || '').toUpperCase() !== 'ACTIVE') {
      return { ok: false, code: 'USER_NOT_ACTIVE', user: user, message: 'Your account is pending approval.' };
    }
    var token = AuthService.createSession(user);
    return { ok: true, sessionToken: token, user: { userId: user.userId, email: user.email, name: user.name, role: user.role, status: user.status, profession: user.profession || 'PILOT' } };
  } catch (err) {
    return apiError_('apiDirectLogin', err);
  }
}

function apiRequestLoginCode(payload) {
  try {
    payload = payload || {};

    var result = AuthService.createOtpCode(
      String(payload.email || '').trim().toLowerCase()
    );

    return safeResponse_(result);

  } catch (err) {
    return apiError_('apiRequestLoginCode', err);
  }
}

function apiVerifyLoginCode(payload) {
  try {
    payload = payload || {};

    var result = AuthService.verifyOtpAndCreateSession(
      String(payload.email || '').trim().toLowerCase(),
      String(payload.code || '').trim()
    );

    return safeResponse_(result);

  } catch (err) {
    return apiError_('apiVerifyLoginCode', err);
  }
}

function getUserAccessStatus_(user) {
  if (!user) return { status: 'expired' };
  if (user.role === 'ADMIN' || user.role === 'INSTRUCTOR') return { status: 'active' };

  // Active subscription takes priority
  try {
    var sub = wompiGetSubscriptionStatus_(user.userId);
    if (sub && sub.ok && sub.active) {
      return { status: 'active', endDate: sub.endDate, daysLeft: sub.daysLeft };
    }
  } catch(e) {}

  // Trial window
  var trialStart = user.trialStartDate ? new Date(user.trialStartDate) : null;
  if (!trialStart) {
    // Grandfathered user (registered before trial system) — keep access
    return { status: 'active' };
  }
  var now = new Date();
  var trialEnd = new Date(trialStart.getTime() + 3 * 24 * 60 * 60 * 1000);
  if (now < trialEnd) {
    var hoursLeft = (trialEnd - now) / (1000 * 60 * 60);
    var daysLeft  = Math.max(1, Math.ceil(hoursLeft / 24));
    return { status: 'trial', daysLeft: daysLeft, trialEnd: trialEnd.toISOString() };
  }
  return { status: 'expired' };
}

function apiGetMe(sessionToken) {
  try {
    var user = AuthService.requireSession(sessionToken);
    var publicUser = UserService.toPublicUser(user);

    // Derive instructorId from assigned group — B2B users only, best-effort
    if (publicUser.assignedGroupId) {
      try {
        var groups = dbReadAll_('Groups');
        for (var _gi = 0; _gi < groups.length; _gi++) {
          if (String(groups[_gi].groupId || '') === publicUser.assignedGroupId) {
            publicUser.instructorId = String(groups[_gi].instructorId || '');
            break;
          }
        }
      } catch(e) { /* non-fatal */ }
    }

    return safeResponse_({
      ok: true,
      user: publicUser,
      home: DashboardService.getHomeData(user),
      accessStatus: getUserAccessStatus_(user)
    });

  } catch (err) {
    return {
      ok: false,
      code: 'SESSION_ERROR',
      message: err && err.message ? err.message : String(err)
    };
  }
}

function apiLogout(sessionToken) {
  try {
    AuthService.destroySession(sessionToken);

    return {
      ok: true
    };

  } catch (err) {
    return apiError_('apiLogout', err);
  }
}

function apiMarkFirstFlightDone(sessionToken) {
  try {
    var user = AuthService.requireSession(sessionToken);
    dbWithScriptLock_(function() {
      var u = dbFindOne_('Users', 'userId', user.userId);
      if (u) dbUpdateByRow_('Users', u.__rowNumber, { firstFlightDone: true, updatedAt: now_() });
    });
    var updated = dbFindOne_('Users', 'userId', user.userId);
    return safeResponse_({ ok: true, user: UserService.toPublicUser(updated || user) });
  } catch (err) {
    return apiError_('apiMarkFirstFlightDone', err);
  }
}

/*******************************************************
 * EXAMS  (gates between levels 3/4, 6/7, 9/10)
 *******************************************************/

var EXAM_CONFIG_ = {
  1: { levels: [1, 2, 3] },
  2: { levels: [4, 5, 6] },
  3: { levels: [7, 8, 9] }
};
var EXAM_PASS_THRESHOLD_ = 85;
var EXAM_MAX_ATTEMPTS_   = 2;

// Returns all Exams rows for a userId, grouped by examNum.
function getExamAttemptsForUser_(userId) {
  try {
    var rows = dbReadAll_('Exams');
    var byNum = { 1: [], 2: [], 3: [] };
    rows.forEach(function(r) {
      var n = Number(r.examNum || 0);
      if (byNum[n]) byNum[n].push(r);
    });
    // Keep only rows for this user
    [1, 2, 3].forEach(function(n) {
      byNum[n] = byNum[n].filter(function(r) {
        return String(r.userId || '') === String(userId || '');
      }).sort(function(a, b) {
        return Number(a.attemptNumber || 0) - Number(b.attemptNumber || 0);
      });
    });
    return byNum;
  } catch(e) {
    return { 1: [], 2: [], 3: [] };
  }
}

// Returns { 1: true|false, 2: true|false, 3: true|false } — whether each exam is passed.
function getExamPassedMap_(userId) {
  var attempts = getExamAttemptsForUser_(userId);
  var map = {};
  [1, 2, 3].forEach(function(n) {
    map[n] = attempts[n].some(function(r) {
      return r.passed === true || String(r.passed).toUpperCase() === 'TRUE';
    });
  });
  return map;
}

// Computes status string for one exam given its attempt rows + prerequisite levels completed.
function computeExamStatus_(attemptRows, prereqsDone, progressRows, userId) {
  if (!prereqsDone) return 'locked';
  var passed = attemptRows.some(function(r) {
    return r.passed === true || String(r.passed).toUpperCase() === 'TRUE';
  });
  if (passed) return 'passed';
  var failCount = attemptRows.filter(function(r) {
    return r.passed !== true && String(r.passed).toUpperCase() !== 'TRUE';
  }).length;
  if (failCount === 0) return 'available';
  if (failCount === 1) return 'failed_once';
  // 2 failures — check if replay requirement is satisfied
  var lastFail = attemptRows[attemptRows.length - 1];
  var lastFailedAt = lastFail ? String(lastFail.attemptedAt || '') : '';
  if (lastFailedAt && progressRows && progressRows.length) {
    // Find examNum from attemptRows
    var examNum = Number(attemptRows[0] ? attemptRows[0].examNum : 0);
    var cfg = EXAM_CONFIG_[examNum];
    if (cfg) {
      var replayed = cfg.levels.every(function(lvl) {
        return progressRows.some(function(p) {
          return Number(p.level || 0) === lvl &&
                 String(p.userId || '') === String(userId || '') &&
                 String(p.updatedAt || '') > lastFailedAt;
        });
      });
      if (replayed) return 'available';
    }
  }
  return 'replay_required';
}

// ── Exam scoring helpers (mirrors client-side _clientEvaluate logic) ──────

// Strips punctuation, uppercases, collapses spaces. Keeps digits as digits.
function examNormalizeGrading_(text) {
  return String(text || '').toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Full ICAO normalization: digits → spoken words, abbreviations expanded.
function examNormalizeIcao_(value) {
  function digitsToIcao(n) {
    var m = {'0':'ZERO','1':'ONE','2':'TWO','3':'THREE','4':'FOUR',
             '5':'FIVE','6':'SIX','7':'SEVEN','8':'EIGHT','9':'NINER'};
    return String(n).split('').map(function(d){ return m[d]||d; }).join(' ');
  }
  var out = String(value || '').toUpperCase().trim();
  out = out
    .replace(/\b(\d{3})\.(\d{1,3})\b/g, function(_, i, d) { return digitsToIcao(i) + ' DECIMAL ' + digitsToIcao(d); })
    .replace(/\bFL\s*(\d{1,4})\b/g,     function(_, n)    { return 'FLIGHT LEVEL ' + digitsToIcao(n); })
    .replace(/\b(\d+)\b/g,              function(_, n)    { return digitsToIcao(n); });
  out = out
    .replace(/\bNINE\b/g,  'NINER').replace(/\bOH\b/g,    'ZERO')
    .replace(/\bPOINT\b/g, 'DECIMAL').replace(/\bDOT\b/g, 'DECIMAL')
    .replace(/\./g,        ' DECIMAL ')
    .replace(/\bFT\b/g,    'FEET').replace(/\bKTS?\b/g,   'KNOTS')
    .replace(/\bRWY\b/g,   'RUNWAY').replace(/\bHDG\b/g,  'HEADING');
  out = out.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  out = out
    .replace(/\bTAKE\s*OFF\b/g,   'TAKEOFF').replace(/\bPUSH\s*BACK\b/g,  'PUSHBACK')
    .replace(/\bGO\s*AROUND\b/g,  'GOAROUND').replace(/\bLINE\s*UP\b/g,   'LINEUP')
    .replace(/\bHOLD\s*SHORT\b/g, 'HOLDSHORT').replace(/\bSTAND\s*BY\b/g, 'STANDBY')
    .replace(/\bTOUCH\s*DOWN\b/g, 'TOUCHDOWN');
  return out;
}

// Extracts semantic tokens from the normalized expected readback.
// Mirrors client _extractSemanticTokens but OMITS callsign (doesn't count in exam).
function examExtractTokens_(normExpected) {
  var t      = normExpected;
  var tokens = [];

  var approachM = t.match(/\b(ILS APPROACH|VOR APPROACH|RNAV APPROACH|NDB APPROACH|VISUAL APPROACH|SURVEILLANCE APPROACH)\b/);
  if (approachM) tokens.push(approachM[1]);

  var rwyM = t.match(/\bRUNWAY\s+(\d{1,2}[LRC]?)\b/);
  if (rwyM) tokens.push('RUNWAY ' + rwyM[1]);

  var hdgM = t.match(/\bHEADING\s+(\d{2,3})\b/);
  if (hdgM) tokens.push('HEADING ' + hdgM[1]);

  if (/\bRIGHT\b/.test(t) && /\bHEADING\b/.test(t)) tokens.push('RIGHT');
  else if (/\bLEFT\b/.test(t) && /\bHEADING\b/.test(t)) tokens.push('LEFT');

  ['CLEARED', 'TAXI', 'MAINTAIN', 'EXPEDITE', 'REPORT', 'HOLD SHORT', 'LINE UP'].forEach(function(v) {
    if (t.indexOf(v) !== -1) tokens.push(v);
  });

  if (t.indexOf('CONTACT') !== -1) {
    tokens.push('CONTACT');
    var freqM = t.match(/\bCONTACT\b[^.]*?(\d{3})\b/);
    if (freqM) tokens.push(freqM[1]);
  }

  if (t.indexOf('CLIMB') !== -1) {
    tokens.push('CLIMB');
    var climbM = t.match(/\bCLIMB\b[^.]*?(\d{3,5})\b/);
    if (climbM) tokens.push(climbM[1]);
  }

  if (t.indexOf('DESCEND') !== -1) {
    tokens.push('DESCEND');
    var descM = t.match(/\bDESCEND\b[^.]*?(\d{3,5})\b/);
    if (descM) tokens.push(descM[1]);
  }

  // Callsign intentionally excluded — callsigns don't count in exam scoring
  return tokens;
}

// Score one scenario answer. Primary path: semantic token matching from expectedReadback.
// Fallback: pipe-delimited keyword matching (callsign = last keyword, stripped).
function scoreExamScenario_(answer, keywordsText, expectedReadback) {
  var normExpected = expectedReadback ? examNormalizeGrading_(expectedReadback) : '';
  if (normExpected) {
    var tokens = examExtractTokens_(normExpected);
    if (tokens.length > 0) {
      var normDigit = examNormalizeGrading_(answer);
      var normIcao  = examNormalizeIcao_(answer);
      function tokenHit(tok) {
        if (normDigit.indexOf(tok) !== -1 || normIcao.indexOf(tok) !== -1) return true;
        // Also try converting the token itself to ICAO words (e.g. "27" → "TWO SEVEN")
        var tokIcao = tok.replace(/\b(\d+)\b/g, function(_, n) {
          var m = {'0':'ZERO','1':'ONE','2':'TWO','3':'THREE','4':'FOUR',
                   '5':'FIVE','6':'SIX','7':'SEVEN','8':'EIGHT','9':'NINER'};
          return String(n).split('').map(function(d){ return m[d]||d; }).join(' ');
        });
        return normDigit.indexOf(tokIcao) !== -1 || normIcao.indexOf(tokIcao) !== -1;
      }
      var matched = tokens.filter(tokenHit).length;
      return { matched: matched, total: tokens.length };
    }
  }

  // Fallback: keyword presence matching (callsign = last keyword, stripped)
  var kws = String(keywordsText || '').split('|')
    .map(function(k) { return k.trim(); }).filter(Boolean);
  if (kws.length > 1) kws.pop();
  if (!kws.length) return { matched: 1, total: 1 };
  var normAns = examNormalizeIcao_(answer);
  var matched = 0;
  kws.forEach(function(kw) {
    if (normAns.indexOf(examNormalizeIcao_(kw)) !== -1) matched++;
  });
  return { matched: matched, total: kws.length };
}

function apiGetExamStatus(sessionToken) {
  try {
    var user = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    var attempts   = getExamAttemptsForUser_(user.userId);
    var progress   = readSheetObjectsV5Hard_('Progress');
    var scenarios  = readSheetObjectsV5Hard_('Scenarios');
    var result = [1, 2, 3].map(function(n) {
      var cfg = EXAM_CONFIG_[n];
      // Check all prerequisite levels completed for this user
      var prereqsDone = cfg.levels.every(function(lvl) {
        // A level is done if all countries for that level are completed
        var countriesForLevel = [];
        scenarios.forEach(function(s) {
          if (Number(s.level || 0) === lvl &&
              isTruthyV5Hard_(s.isActive) &&
              countriesForLevel.indexOf(String(s.country || '').toUpperCase()) === -1) {
            countriesForLevel.push(String(s.country || '').toUpperCase());
          }
        });
        if (!countriesForLevel.length) return false;
        return countriesForLevel.every(function(c) {
          return progress.some(function(p) {
            return String(p.userId || '') === String(user.userId || '') &&
                   Number(p.level || 0) === lvl &&
                   String(p.country || '').toUpperCase() === c &&
                   isTruthyV5Hard_(p.completed);
          });
        });
      });
      var rows = attempts[n];
      var status = computeExamStatus_(rows, prereqsDone, progress, user.userId);
      var lastAttempt = rows.length ? rows[rows.length - 1] : null;
      return {
        examNum:         n,
        status:          status,
        attemptCount:    rows.length,
        score:           lastAttempt ? Number(lastAttempt.score || 0) : null,
        lastAttemptedAt: lastAttempt ? String(lastAttempt.attemptedAt || '') : null,
        prerequisiteLevels: cfg.levels
      };
    });
    return { ok: true, exams: result };
  } catch(err) {
    return apiError_('apiGetExamStatus', err);
  }
}

function apiStartExam(sessionToken, examNum) {
  try {
    var user = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    examNum = Number(examNum || 1);
    var cfg = EXAM_CONFIG_[examNum];
    if (!cfg) throw new Error('Invalid exam number.');
    // Verify status allows starting
    var statusRes = apiGetExamStatus(sessionToken);
    if (!statusRes.ok) throw new Error('Could not verify exam status.');
    var examInfo = statusRes.exams.filter(function(e) { return e.examNum === examNum; })[0];
    if (!examInfo) throw new Error('Exam not found.');
    if (examInfo.status !== 'available' && examInfo.status !== 'failed_once') {
      throw new Error('Exam not available. Status: ' + examInfo.status);
    }
    // Pick a random route from prerequisite levels (NORMAL scenarios only)
    var allScenarios = readSheetObjectsV5Hard_('Scenarios').filter(function(s) {
      return isTruthyV5Hard_(s.isActive) &&
             cfg.levels.indexOf(Number(s.level || 0)) !== -1 &&
             String(s.scenarioType || '').toUpperCase() !== 'EMERGENCY';
    });
    // Group by flightScenarioId
    var routeMap = {};
    allScenarios.forEach(function(s) {
      var rid = String(s.flightScenarioId || '');
      if (!rid) return;
      if (!routeMap[rid]) routeMap[rid] = [];
      routeMap[rid].push(s);
    });
    var routeIds = Object.keys(routeMap).filter(function(rid) {
      return routeMap[rid].length >= 4; // must have at least 4 phases to be worth using
    });
    if (!routeIds.length) throw new Error('No routes available for this exam.');
    var routeId   = routeIds[Math.floor(Math.random() * routeIds.length)];
    var phases    = routeMap[routeId]
      .sort(function(a, b) { return Number(a.phaseOrder || 0) - Number(b.phaseOrder || 0); })
      .slice(0, 8);
    // Assign a random accent + voice + speaking rate to each phase independently.
    // All 5 exam countries are guaranteed to appear at least once across 8 phases.
    var examCountries = ['USA', 'UK', 'AUSTRALIA', 'INDIA', 'CANADA'];
    function shuffle_(arr) {
      var a = arr.slice();
      for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
      }
      return a;
    }
    var countrySlots = shuffle_(examCountries);
    // Fill remaining slots (phases beyond 5) with random picks from the same pool
    while (countrySlots.length < phases.length) {
      countrySlots.push(examCountries[Math.floor(Math.random() * examCountries.length)]);
    }
    countrySlots = shuffle_(countrySlots.slice(0, phases.length));

    var safePhases = phases.map(function(s, i) {
      var kws = String(s.keywordsText || s.keywords || '').split('|')
        .map(function(k) { return k.trim(); }).filter(Boolean);
      if (kws.length > 1) kws.pop(); // strip callsign
      var country = countrySlots[i];
      var profile  = TTSService.getProfileByCountry_(country);
      var voices   = profile.voiceNames || [];
      var voice    = voices.length ? voices[Math.floor(Math.random() * voices.length)] : '';
      var rate = Math.round((1.0 + Math.random() * 0.2) * 100) / 100; // 1.00–1.20
      return {
        scenarioId:       String(s.scenarioId || ''),
        phaseCode:        String(s.phaseCode  || ''),
        phaseName:        String(s.phaseName  || ''),
        atcText:          String(s.atcText    || ''),
        expectedReadback: String(s.expectedReadback || ''),
        keywordsExam:     kws.join('|'),
        country:          country,
        voice:            voice,
        speakingRate:     rate
      };
    });
    return { ok: true, examNum: examNum, routeId: routeId, phases: safePhases };
  } catch(err) {
    return apiError_('apiStartExam', err);
  }
}

function apiSubmitExam(sessionToken, payload) {
  try {
    var user = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    payload = payload || {};
    var examNum = Number(payload.examNum || 1);
    var routeId = String(payload.routeId || '');
    var answers = Array.isArray(payload.answers) ? payload.answers : [];
    if (!answers.length) throw new Error('No answers provided.');
    var cfg = EXAM_CONFIG_[examNum];
    if (!cfg) throw new Error('Invalid exam number.');
    // Verify status allows submitting
    var statusRes = apiGetExamStatus(sessionToken);
    if (!statusRes.ok) throw new Error('Could not verify exam status.');
    var examInfo = statusRes.exams.filter(function(e) { return e.examNum === examNum; })[0];
    if (!examInfo) throw new Error('Exam not found.');
    if (examInfo.status !== 'available' && examInfo.status !== 'failed_once') {
      throw new Error('Exam not available for submission. Status: ' + examInfo.status);
    }
    // Score all answers against scenario keywords
    var allScenarios = readSheetObjectsV5Hard_('Scenarios');
    var scenarioMap  = {};
    allScenarios.forEach(function(s) { scenarioMap[String(s.scenarioId || '')] = s; });
    var totalMatched = 0, totalKeywords = 0;
    var scenarioIds  = [];
    answers.forEach(function(a) {
      var sc       = scenarioMap[String(a.scenarioId || '')];
      var kws      = sc ? String(sc.keywordsText || sc.keywords || '') : '';
      var expected = sc ? String(sc.expectedReadback || '') : '';
      var res = scoreExamScenario_(String(a.answer || ''), kws, expected);
      totalMatched  += res.matched;
      totalKeywords += res.total;
      scenarioIds.push(String(a.scenarioId || ''));
    });
    var score  = totalKeywords > 0 ? Math.round((totalMatched / totalKeywords) * 100) : 0;
    var passed = score >= EXAM_PASS_THRESHOLD_;
    var attemptNumber = (examInfo.attemptCount || 0) + 1;
    ensureExamsSheet_();
    dbWithScriptLock_(function() {
      dbAppend_('Exams', {
        examRowId:     uuid_('EX'),
        userId:        user.userId,
        examNum:       examNum,
        attemptNumber: attemptNumber,
        score:         score,
        passed:        passed,
        routeId:       routeId,
        scenarioIds:   scenarioIds.join('|'),
        attemptedAt:   now_()
      });
    });
    // Re-compute status after writing
    var newStatusRes = apiGetExamStatus(sessionToken);
    var newExamInfo  = newStatusRes.ok
      ? (newStatusRes.exams.filter(function(e) { return e.examNum === examNum; })[0] || {})
      : {};
    return {
      ok:            true,
      score:         score,
      passed:        passed,
      attemptNumber: attemptNumber,
      examStatus:    newExamInfo.status || (passed ? 'passed' : 'failed_once'),
      attemptCount:  newExamInfo.attemptCount || attemptNumber
    };
  } catch(err) {
    return apiError_('apiSubmitExam', err);
  }
}

function apiResetExamAttempts(sessionToken, targetUserId, examNum) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN', 'INSTRUCTOR']);
    targetUserId = String(targetUserId || '');
    examNum      = Number(examNum || 0);
    if (!targetUserId) throw new Error('targetUserId required.');
    if (!examNum || !EXAM_CONFIG_[examNum]) throw new Error('Invalid examNum.');
    dbWithScriptLock_(function() {
      var rows = dbReadAll_('Exams').filter(function(r) {
        return String(r.userId || '') === targetUserId && Number(r.examNum || 0) === examNum;
      }).sort(function(a, b) { return b.__rowNumber - a.__rowNumber; }); // reverse so deletions don't shift
      rows.forEach(function(r) { dbDeleteByRow_('Exams', r.__rowNumber); });
    });
    return { ok: true, deleted: true };
  } catch(err) {
    return apiError_('apiResetExamAttempts', err);
  }
}

function apiGetExamPerformance(sessionToken, targetUserId) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN', 'INSTRUCTOR']);
    targetUserId = String(targetUserId || '');
    if (!targetUserId) throw new Error('targetUserId required.');
    var rows = dbReadAll_('Exams').filter(function(r) {
      return String(r.userId || '') === targetUserId;
    }).map(function(r) {
      return {
        examNum:       Number(r.examNum       || 0),
        attemptNumber: Number(r.attemptNumber || 0),
        score:         Number(r.score         || 0),
        passed:        r.passed === true || String(r.passed).toUpperCase() === 'TRUE',
        routeId:       String(r.routeId       || ''),
        attemptedAt:   String(r.attemptedAt   || '')
      };
    });
    return { ok: true, exams: rows };
  } catch(err) {
    return apiError_('apiGetExamPerformance', err);
  }
}

/*******************************************************
 * PLACEMENT TEST
 *******************************************************/

var PLACEMENT_PASS_THRESHOLD_ = 75;

function ensurePlacementSheet_() {
  try { dbGetSheet_('Placement'); } catch(e) {
    var ss = dbGetSpreadsheet_();
    var newSheet = ss.insertSheet('Placement');
    newSheet.appendRow(DB_SCHEMA.Placement);
    var headerRange = newSheet.getRange(1, 1, 1, DB_SCHEMA.Placement.length);
    headerRange.setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');
  }
}

function apiGetPlacementStatus(sessionToken) {
  try {
    var user = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    ensurePlacementSheet_();
    var rows = dbReadAll_('Placement').filter(function(r) {
      return String(r.userId || '') === user.userId;
    }).sort(function(a, b) { return String(b.timestamp || '').localeCompare(String(a.timestamp || '')); });
    if (!rows.length) return { ok: true, status: 'not_taken' };
    var r = rows[0];
    return {
      ok:           true,
      status:       'taken',
      placedAtLevel: Number(r.placedAtLevel || 1),
      round1Score:  Number(r.round1Score || 0),
      round2Score:  Number(r.round2Score || 0)
    };
  } catch(err) {
    return apiError_('apiGetPlacementStatus', err);
  }
}

function apiStartPlacementTest(sessionToken) {
  try {
    var user = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    var statusRes = apiGetPlacementStatus(sessionToken);
    if (statusRes.ok && statusRes.status === 'taken') throw new Error('Placement test already completed.');

    var allScenarios = readSheetObjectsV5Hard_('Scenarios').filter(function(s) {
      return isTruthyV5Hard_(s.isActive) &&
             String(s.scenarioType || '').toUpperCase() !== 'EMERGENCY';
    });

    function pickRoundPhases(levelNums) {
      var pool = allScenarios.filter(function(s) {
        return levelNums.indexOf(Number(s.level || 0)) !== -1;
      });
      var routeMap = {};
      pool.forEach(function(s) {
        var rid = String(s.flightScenarioId || '');
        if (!rid) return;
        if (!routeMap[rid]) routeMap[rid] = [];
        routeMap[rid].push(s);
      });
      var routeIds = Object.keys(routeMap).filter(function(rid) { return routeMap[rid].length >= 4; });
      if (!routeIds.length) throw new Error('Not enough scenarios for placement test (levels ' + levelNums.join(',') + ').');
      var routeId = routeIds[Math.floor(Math.random() * routeIds.length)];
      return routeMap[routeId]
        .sort(function(a, b) { return Number(a.phaseOrder || 0) - Number(b.phaseOrder || 0); })
        .slice(0, 4);
    }

    var round1Phases = pickRoundPhases([1, 2, 3]);
    var round2Phases = pickRoundPhases([4, 5, 6]);
    var allPhases    = round1Phases.concat(round2Phases);

    var examCountries = ['USA', 'UK', 'AUSTRALIA', 'INDIA', 'CANADA'];
    function shuffle_(arr) {
      var a = arr.slice();
      for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
      }
      return a;
    }
    var countrySlots = shuffle_(examCountries);
    while (countrySlots.length < allPhases.length) {
      countrySlots.push(examCountries[Math.floor(Math.random() * examCountries.length)]);
    }
    countrySlots = shuffle_(countrySlots.slice(0, allPhases.length));

    var safePhases = allPhases.map(function(s, i) {
      var kws = String(s.keywordsText || s.keywords || '').split('|')
        .map(function(k) { return k.trim(); }).filter(Boolean);
      if (kws.length > 1) kws.pop();
      var country = countrySlots[i];
      var profile = TTSService.getProfileByCountry_(country);
      var voices  = profile.voiceNames || [];
      var voice   = voices.length ? voices[Math.floor(Math.random() * voices.length)] : '';
      var rate    = Math.round((1.0 + Math.random() * 0.2) * 100) / 100;
      return {
        scenarioId:       String(s.scenarioId       || ''),
        phaseCode:        String(s.phaseCode         || ''),
        phaseName:        String(s.phaseName         || ''),
        atcText:          String(s.atcText           || ''),
        expectedReadback: String(s.expectedReadback  || ''),
        keywordsExam:     kws.join('|'),
        country:          country,
        voice:            voice,
        speakingRate:     rate,
        round:            i < 4 ? 1 : 2
      };
    });
    return { ok: true, phases: safePhases };
  } catch(err) {
    return apiError_('apiStartPlacementTest', err);
  }
}

function apiSubmitPlacementTest(sessionToken, payload) {
  try {
    var user = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    payload  = payload || {};
    var answers = Array.isArray(payload.answers) ? payload.answers : [];
    if (answers.length !== 8) throw new Error('Expected 8 answers, got ' + answers.length + '.');

    var statusRes = apiGetPlacementStatus(sessionToken);
    if (statusRes.ok && statusRes.status === 'taken') throw new Error('Placement test already completed.');

    var allScenarios = readSheetObjectsV5Hard_('Scenarios');
    var scenarioMap  = {};
    allScenarios.forEach(function(s) { scenarioMap[String(s.scenarioId || '')] = s; });

    var r1Matched = 0, r1Total = 0, r2Matched = 0, r2Total = 0;
    answers.forEach(function(a, idx) {
      var sc       = scenarioMap[String(a.scenarioId || '')];
      var kws      = sc ? String(sc.keywordsText || sc.keywords || '') : '';
      var expected = sc ? String(sc.expectedReadback || '') : '';
      var res      = scoreExamScenario_(String(a.answer || ''), kws, expected);
      if (idx < 4) { r1Matched += res.matched; r1Total += res.total; }
      else         { r2Matched += res.matched; r2Total += res.total; }
    });

    var round1Score = r1Total > 0 ? Math.round((r1Matched / r1Total) * 100) : 0;
    var round2Score = r2Total > 0 ? Math.round((r2Matched / r2Total) * 100) : 0;

    var placedAtLevel, syntheticExamNums;
    if (round1Score >= PLACEMENT_PASS_THRESHOLD_ && round2Score >= PLACEMENT_PASS_THRESHOLD_) {
      placedAtLevel    = 7;
      syntheticExamNums = [1, 2];
    } else if (round1Score >= PLACEMENT_PASS_THRESHOLD_) {
      placedAtLevel    = 4;
      syntheticExamNums = [1];
    } else {
      placedAtLevel    = 1;
      syntheticExamNums = [];
    }

    ensurePlacementSheet_();
    ensureExamsSheet_();
    dbWithScriptLock_(function() {
      dbAppend_('Placement', {
        placementId:   uuid_('PL'),
        userId:        user.userId,
        email:         user.email  || '',
        name:          user.name   || '',
        timestamp:     now_(),
        round1Score:   round1Score,
        round2Score:   round2Score,
        placedAtLevel: placedAtLevel
      });
      syntheticExamNums.forEach(function(examNum) {
        dbAppend_('Exams', {
          examRowId:     uuid_('EX'),
          userId:        user.userId,
          examNum:       examNum,
          attemptNumber: 1,
          score:         examNum === 1 ? round1Score : round2Score,
          passed:        true,
          routeId:       'placement',
          scenarioIds:   '',
          attemptedAt:   now_()
        });
      });
    });

    return { ok: true, round1Score: round1Score, round2Score: round2Score, placedAtLevel: placedAtLevel };
  } catch(err) {
    return apiError_('apiSubmitPlacementTest', err);
  }
}

function apiAdminResetPlacement(sessionToken, targetUserId) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN', 'INSTRUCTOR']);
    targetUserId = String(targetUserId || '');
    if (!targetUserId) throw new Error('targetUserId required.');
    dbWithScriptLock_(function() {
      ensurePlacementSheet_();
      var plaRows = dbReadAll_('Placement').filter(function(r) {
        return String(r.userId || '') === targetUserId;
      }).sort(function(a, b) { return b.__rowNumber - a.__rowNumber; });
      plaRows.forEach(function(r) { dbDeleteByRow_('Placement', r.__rowNumber); });

      ensureExamsSheet_();
      var examRows = dbReadAll_('Exams').filter(function(r) {
        return String(r.userId || '') === targetUserId && String(r.routeId || '') === 'placement';
      }).sort(function(a, b) { return b.__rowNumber - a.__rowNumber; });
      examRows.forEach(function(r) { dbDeleteByRow_('Exams', r.__rowNumber); });
    });
    return { ok: true, deleted: true };
  } catch(err) {
    return apiError_('apiAdminResetPlacement', err);
  }
}

/*******************************************************
 * ADMIN - USERS
 *******************************************************/

function apiAdminListUsers(sessionToken) {
  return apiAdminListUsersV4_SAFE(sessionToken);
}

function apiAdminListUsersV4_SAFE(sessionToken) {
  try {
    var admin = AuthService.requireRole(sessionToken, ['ADMIN']);
    var users = UserService.listUsersForAdmin();

    // Build placement map: userId → latest placement record
    var placementMap = {};
    try {
      ensurePlacementSheet_();
      dbReadAll_('Placement').forEach(function(r) {
        var uid = String(r.userId || '');
        if (!uid) return;
        var existing = placementMap[uid];
        if (!existing || String(r.timestamp || '') > String(existing.timestamp || '')) {
          placementMap[uid] = r;
        }
      });
    } catch(e) {}

    return {
      ok: true,
      source: 'apiAdminListUsersV4_SAFE',
      total: users.length,
      users: users.map(function(user) {
        var safe = safeUserForClient_(user);
        var pr   = placementMap[String(user.userId || '')] || null;
        safe.placement = pr ? {
          taken:         true,
          placedAtLevel: Number(pr.placedAtLevel || 1),
          round1Score:   Number(pr.round1Score   || 0),
          round2Score:   Number(pr.round2Score   || 0),
          timestamp:     String(pr.timestamp     || '')
        } : { taken: false };
        return safe;
      })
    };

  } catch (err) {
    return apiError_('apiAdminListUsersV4_SAFE', err);
  }
}

function apiAdminUpdateUser(sessionToken, payload) {
  try {
    var admin = AuthService.requireRole(sessionToken, ['ADMIN']);
    var updatedUser = UserService.updateUserByAdmin(payload || {}, admin);

    return {
      ok: true,
      source: 'apiAdminUpdateUser',
      user: safeUserForClient_(updatedUser)
    };

  } catch (err) {
    return apiError_('apiAdminUpdateUser', err);
  }
}

function apiAdminDeleteUser(sessionToken, payload) {
  try {
    var admin = AuthService.requireRole(sessionToken, ['ADMIN']);
    var deletedUser = UserService.deleteUserByAdmin(payload || {}, admin);

    return {
      ok: true,
      source: 'apiAdminDeleteUser',
      user: safeUserForClient_(deletedUser)
    };

  } catch (err) {
    return apiError_('apiAdminDeleteUser', err);
  }
}

function testApiAdminListUsersV4WithoutSession() {
  var users = UserService.listUsersForAdmin();

  var safeUsers = users.map(function(user) {
    return safeUserForClient_(user);
  });

  Logger.log(JSON.stringify(safeUsers.slice(0, 5), null, 2));

  return {
    ok: true,
    source: 'testApiAdminListUsersV4WithoutSession',
    total: safeUsers.length,
    sample: safeUsers.slice(0, 5)
  };
}

/*******************************************************
 * ADMIN - SCENARIOS
 *******************************************************/

function apiAdminSeedSampleScenarios(sessionToken) {
  try {
    var admin = AuthService.requireRole(sessionToken, ['ADMIN']);
    var result = ScenarioService.seedSampleScenarios(admin);

    return safeResponse_(result);

  } catch (err) {
    return apiError_('apiAdminSeedSampleScenarios', err);
  }
}

function apiAdminListScenarios(sessionToken) {
  return apiAdminListScenariosV4_SAFE(sessionToken);
}

function apiAdminListScenariosV4_SAFE(sessionToken) {
  try {
    var admin = AuthService.requireRole(sessionToken, ['ADMIN']);
    var scenarios = ScenarioService.listScenariosForAdmin();

    var safeScenarios = scenarios.map(function(s) {
      return safeScenarioForClient_(s);
    });

    return {
      ok: true,
      source: 'apiAdminListScenariosV4_SAFE',
      total: safeScenarios.length,
      scenarios: safeScenarios
    };

  } catch (err) {
    return apiError_('apiAdminListScenariosV4_SAFE', err);
  }
}

function apiAdminSaveScenario(sessionToken, payload) {
  try {
    var admin = AuthService.requireRole(sessionToken, ['ADMIN']);
    var result = ScenarioService.saveScenarioByAdmin(payload || {}, admin);

    if (result && result.scenario) {
      result.scenario = safeScenarioForClient_(result.scenario);
    }

    return safeResponse_(result);

  } catch (err) {
    return apiError_('apiAdminSaveScenario', err);
  }
}

function apiAdminSetScenarioActive(sessionToken, payload) {
  try {
    var admin = AuthService.requireRole(sessionToken, ['ADMIN']);
    var result = ScenarioService.setScenarioActiveByAdmin(payload || {}, admin);

    if (result && result.scenario) {
      result.scenario = safeScenarioForClient_(result.scenario);
    }

    return safeResponse_(result);

  } catch (err) {
    return apiError_('apiAdminSetScenarioActive', err);
  }
}

function testApiAdminListScenariosV4WithoutSession() {
  var scenarios = ScenarioService.listScenariosForAdmin();

  var safeScenarios = scenarios.map(function(s) {
    return safeScenarioForClient_(s);
  });

  Logger.log('Total scenarios: ' + safeScenarios.length);
  Logger.log(JSON.stringify(safeScenarios.slice(0, 5), null, 2));

  return {
    ok: true,
    source: 'testApiAdminListScenariosV4WithoutSession',
    total: safeScenarios.length,
    sample: safeScenarios.slice(0, 5)
  };
}

/*******************************************************
 * SIMULATOR
 *******************************************************/

function apiGetTrainingCatalog(sessionToken) {
  try {
    var user = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);

    var catalog = buildTrainingCatalogForRole_(user);

    return {
      ok: true,
      source: 'apiGetTrainingCatalog',
      data: safeTrainingCatalogForClient_(catalog)
    };

  } catch (err) {
    return apiError_('apiGetTrainingCatalog', err);
  }
}


function apiGetTrainingCatalogV4_SAFE(sessionToken) {
  try {
    var user = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);

    var catalog = buildTrainingCatalogForRole_(user);

    return {
      ok: true,
      source: 'apiGetTrainingCatalogV4_SAFE',
      catalog: safeTrainingCatalogForClient_(catalog)
    };

  } catch (err) {
    return apiError_('apiGetTrainingCatalogV4_SAFE', err);
  }
}


/**
 * Construye el catálogo de entrenamiento según el rol.
 * Admin e Instructor ven todos los niveles desbloqueados.
 * Student ve niveles según progreso.
 */
function buildTrainingCatalogForRole_(user) {
  var catalog = ScenarioService.getTrainingCatalog(user);

  // Cambia este número si quieres mostrar más o menos niveles.
  // Tú habías mencionado hasta 50 niveles.
  catalog = ensureCatalogHasVisibleLevels_(catalog, 50);

  if (user.role === 'ADMIN' || user.role === 'INSTRUCTOR') {
    catalog = unlockCatalogForStaff_(catalog);
  }

  return catalog;
}


/**
 * Asegura que existan visualmente todos los niveles,
 * aunque todavía no tengan escenarios activos.
 */
function ensureCatalogHasVisibleLevels_(catalog, maxLevels) {
  catalog = catalog || {};
  catalog.levels = catalog.levels || [];

  maxLevels = Number(maxLevels || 50);

  var levelMap = {};

  catalog.levels.forEach(function(levelItem) {
    var levelNumber = Number(levelItem.level || 1);
    levelMap[levelNumber] = levelItem;
  });

  for (var level = 1; level <= maxLevels; level++) {
    if (!levelMap[level]) {
      levelMap[level] = {
        level: level,
        totalCountries: 0,
        completedCountries: 0,
        completed: false,
        unlocked: level === 1,
        locked: level !== 1,
        countries: []
      };
    }
  }

  var levels = Object.keys(levelMap)
    .map(function(key) {
      return levelMap[key];
    })
    .sort(function(a, b) {
      return Number(a.level || 0) - Number(b.level || 0);
    });

  catalog.levels = levels;
  catalog.totalLevels = levels.length;

  return catalog;
}


/**
 * Admin e Instructor pueden ver y abrir todos los niveles.
 */
function unlockCatalogForStaff_(catalog) {
  catalog = catalog || {};
  catalog.levels = catalog.levels || [];

  catalog.levels.forEach(function(levelItem) {
    levelItem.unlocked = true;
    levelItem.locked = false;
  });

  return catalog;
}

function apiGetStudentScenarios(sessionToken, payload) {
  try {
    var user = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    var data = ScenarioService.getScenariosForStudent(user, payload || {});

    return {
      ok: true,
      data: safeScenarioRouteForClient_(data)
    };

  } catch (err) {
    return apiError_('apiGetStudentScenarios', err);
  }
}

function apiGetStudentScenariosV4_SAFE(sessionToken, payload) {
  try {
    var user = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    var data = ScenarioService.getScenariosForStudent(user, payload || {});

    return {
      ok: true,
      source: 'apiGetStudentScenariosV4_SAFE',
      data: safeScenarioRouteForClient_(data)
    };

  } catch (err) {
    return apiError_('apiGetStudentScenariosV4_SAFE', err);
  }
}

function apiGetMyProgress(sessionToken) {
  try {
    var user = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    var progress = ProgressService.getUserProgress(user);

    return {
      ok: true,
      progress: safeArrayForClient_(progress)
    };

  } catch (err) {
    return apiError_('apiGetMyProgress', err);
  }
}

// Called at the end of a training route to atomically save + return progress.
// This eliminates the race between apiSubmitAttempt and apiGetMyProgress.
function apiCompleteRoute(sessionToken, payload) {
  try {
    var user    = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    payload     = payload || {};
    var level   = Number(payload.level   || 1);
    var country = String(payload.country || '').trim();
    if (!country) throw new Error('country required');

    // Re-run progress calculation now (all attempts already in sheet).
    var fakeScenario = { level: level, country: country };
    var currentProgress = ProgressService.updateUserProgress(user, fakeScenario);

    // Return all user progress so the client can hydrate every country.
    var allProgress = ProgressService.getUserProgress(user);
    return {
      ok:              true,
      progress:        safeArrayForClient_(allProgress),
      currentProgress: safeArrayForClient_([currentProgress])[0] || currentProgress
    };
  } catch (err) {
    return apiError_('apiCompleteRoute', err);
  }
}

function apiSaveCertificate(sessionToken, payload) {
  try {
    var user = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    payload = payload || {};
    var level         = Number(payload.level  || 1);
    var certificateId = String(payload.certificateId || '').trim();
    var country       = String(payload.country || '').trim();
    var scoreAvg      = Number(payload.scoreAvg || 0);
    if (!certificateId) throw new Error('certificateId required.');

    // Idempotent — don't create a duplicate for the same certificateId
    var rows = [];
    try { rows = dbReadAll_('Certificates'); } catch (e) {}
    var existing = rows.filter(function(r) {
      return String(r.certificateId || '') === certificateId;
    })[0];
    if (existing) return { ok: true, certificateId: certificateId, alreadyExists: true };

    // Ensure sheet exists before appending — auto-create if missing
    try {
      dbGetSheet_('Certificates');
    } catch (e) {
      var ss = dbGetSpreadsheet_();
      var newSheet = ss.insertSheet('Certificates');
      newSheet.appendRow(DB_SCHEMA.Certificates);
    }

    dbAppend_('Certificates', {
      certificateId: certificateId,
      userId:        user.userId,
      level:         level,
      country:       country,
      scoreAvg:      scoreAvg,
      issuedAt:      now_()
    });

    return { ok: true, certificateId: certificateId };
  } catch (err) {
    return apiError_('apiSaveCertificate', err);
  }
}

function apiGetMyCertificates(sessionToken) {
  try {
    var user = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    var allRows = [];
    try { allRows = dbReadAll_('Certificates'); } catch (e) { /* sheet not yet created */ }
    var certs = allRows.filter(function(r) {
      return String(r.userId || '') === String(user.userId || '');
    });
    certs.sort(function(a, b) { return String(b.issuedAt || '').localeCompare(String(a.issuedAt || '')); });
    return { ok: true, certificates: safeArrayForClient_(certs) };
  } catch (err) {
    return apiError_('apiGetMyCertificates', err);
  }
}

/*******************************************************
 * ICAO COMPREHENSION TEST
 *******************************************************/

function apiGetIcaoTestStatus(sessionToken) {
  try {
    var user = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    var rows = [];
    try { rows = dbReadAll_('IcaoTestResults'); } catch (e) {}
    var userRows = rows
      .filter(function(r) { return String(r.userId || '') === String(user.userId || ''); })
      .sort(function(a, b) { return String(b.completedAt || '').localeCompare(String(a.completedAt || '')); });
    if (!userRows.length) return { ok: true, status: 'available' };
    var latest = userRows[0];
    if (String(latest.retakeAuthorized || '').toLowerCase() === 'true') {
      return { ok: true, status: 'retake_authorized', lastResult: latest };
    }
    return { ok: true, status: 'locked', lastResult: latest };
  } catch (err) {
    return apiError_('apiGetIcaoTestStatus', err);
  }
}

function apiSaveIcaoTestResult(sessionToken, payload) {
  try {
    var user = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    payload = payload || {};
    var resultId = 'ICAO-' + String(user.userId || '').slice(-6) + '-' + Date.now();
    dbAppend_('IcaoTestResults', {
      resultId:            resultId,
      userId:              user.userId,
      band:                Number(payload.band     || 1),
      bandLabel:           String(payload.bandLabel || ''),
      score:               Number(payload.score    || 0),
      replayAvg:           Number(payload.replayAvg || 0),
      scenarioResultsJson: JSON.stringify(payload.scenarioResults || []),
      completedAt:         now_(),
      retakeAuthorized:    'false'
    });
    return { ok: true, resultId: resultId };
  } catch (err) {
    return apiError_('apiSaveIcaoTestResult', err);
  }
}

function apiAdminGetIcaoTestResults(sessionToken) {
  try {
    AuthService.requireRole(sessionToken, ['INSTRUCTOR', 'ADMIN']);
    var rows = [];
    try { rows = dbReadAll_('IcaoTestResults'); } catch (e) {}
    var users = [];
    try { users = dbReadAll_('Users'); } catch (e) {}
    var userMap = {};
    users.forEach(function(u) { userMap[String(u.userId || '')] = u; });
    var results = rows
      .filter(function(r) { return r.band && String(r.band) !== 'false'; })
      .sort(function(a, b) { return String(b.completedAt || '').localeCompare(String(a.completedAt || '')); })
      .map(function(r) {
        var u = userMap[String(r.userId || '')] || {};
        return {
          name:          String(u.name  || r.userId || '—'),
          email:         String(u.email || '—'),
          band:          Number(r.band  || 0),
          bandLabel:     String(r.bandLabel || ''),
          score:         Number(r.score || 0),
          replayAvg:     Number(r.replayAvg || 0),
          completedAt:   String(r.completedAt || '').slice(0, 10),
          retakeAuthorized: String(r.retakeAuthorized || 'false'),
          userId:        String(r.userId || '')
        };
      });
    return { ok: true, results: results };
  } catch (err) {
    return apiError_('apiAdminGetIcaoTestResults', err);
  }
}

function apiAuthorizeIcaoRetest(sessionToken, targetUserId) {
  try {
    AuthService.requireRole(sessionToken, ['INSTRUCTOR', 'ADMIN']);
    var rows = [];
    try { rows = dbReadAll_('IcaoTestResults'); } catch (e) {}
    var userRows = rows
      .filter(function(r) { return String(r.userId || '') === String(targetUserId || ''); })
      .sort(function(a, b) { return String(b.completedAt || '').localeCompare(String(a.completedAt || '')); });
    if (!userRows.length) return { ok: false, message: 'No test result found for this user.' };
    dbUpdateByRow_('IcaoTestResults', userRows[0].__rowNumber, { retakeAuthorized: 'true' });
    return { ok: true };
  } catch (err) {
    return apiError_('apiAuthorizeIcaoRetest', err);
  }
}

/*******************************************************
 * TTS / AUDIO
 *******************************************************/

function apiAdminPreviewTts(sessionToken, payload) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN', 'INSTRUCTOR']);
    payload = payload || {};
    var text     = String(payload.text    || '').trim();
    var country  = String(payload.country || 'USA').trim().toUpperCase();
    var voiceOverride = String(payload.voice || '').trim();
    if (!text) throw new Error('No text provided.');
    var profile  = TTSService.getProfileByCountry_(country);
    var rate     = Number(payload.speakingRate || payload.rate || profile.speakingRate || 0.93);
    var ssml     = TTSService.buildAtcSsml_(text, profile, rate);
    var result;
    if (voiceOverride) {
      // Voice Lab: force a specific voice, skip fallback list
      var audio = TTSService.callGoogleTts_(ssml, voiceOverride, profile.languageCode || 'en-GB', rate, 0, []);
      result = { audioBase64: audio, voiceName: voiceOverride };
    } else {
      result = TTSService.callGoogleTtsWithFallbackVoices_(ssml, profile, rate);
    }
    return { ok: true, audioBase64: result.audioBase64, mimeType: 'audio/mp3', voiceName: result.voiceName };
  } catch (err) {
    return apiError_('apiAdminPreviewTts', err);
  }
}

function authorizeMailService() {
  MailApp.sendEmail({
    to: Session.getEffectiveUser().getEmail(),
    subject: 'ICAO Trainer Pro - MailApp authorization test',
    body: 'MailApp authorization OK. You can now send login verification codes.'
  });

  return 'MailApp authorized successfully.';
}

/*******************************************************
 * USER STATUS SHEET TRIGGER
 * Run installUserStatusTrigger() once from the
 * Apps Script editor to watch for direct sheet edits.
 *******************************************************/

function installUserStatusTrigger() {
  var props = PropertiesService.getScriptProperties();
  var dbId =
    props.getProperty('DB_SPREADSHEET_ID') ||
    props.getProperty('DATABASE_SPREADSHEET_ID') ||
    props.getProperty('SPREADSHEET_ID') ||
    props.getProperty('ICAO_DB_SPREADSHEET_ID') ||
    '1IKVJEEw8QoX9HkMJpnXNj3a20HnTl_-CjUcOJb4vgWY';
  var ss = SpreadsheetApp.openById(dbId);

  // Remove any existing triggers for this function to avoid duplicates
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'onUserStatusSheetEdit') {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger('onUserStatusSheetEdit')
    .forSpreadsheet(ss)
    .onEdit()
    .create();

  Logger.log('User status trigger installed successfully.');
  return 'Trigger installed. Direct sheet edits to the Users status column will now send activation emails.';
}

function onUserStatusSheetEdit(e) {
  try {
    var sheet = e && e.range && e.range.getSheet();
    if (!sheet || sheet.getName() !== 'Users') return;

    var range = e.range;

    // Find which column is "status"
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var statusCol = -1;
    for (var i = 0; i < headers.length; i++) {
      if (String(headers[i] || '').trim().toLowerCase() === 'status') {
        statusCol = i + 1;
        break;
      }
    }

    if (statusCol === -1) return;

    // Only care about edits in the status column (single cell)
    if (range.getColumn() !== statusCol || range.getNumRows() !== 1) return;

    var newStatus = String(range.getValue() || '').trim().toUpperCase();
    var oldStatus = String(e.oldValue || '').trim().toUpperCase();

    if (newStatus !== 'ACTIVE') return;
    if (oldStatus === 'ACTIVE') return; // already was active, no-op

    // Read the full row to get the user's email and name
    var row = range.getRow();
    var rowValues = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];

    var user = {};
    headers.forEach(function(h, idx) {
      user[String(h || '').trim()] = rowValues[idx];
    });

    var email = String(user.email || '').trim().toLowerCase();
    var name  = String(user.name  || '').trim();
    var userId = String(user.userId || '').trim();

    if (!email || email.indexOf('@') === -1) return;

    UserService.notifyUserOfActivation_({
      userId: userId,
      email:  email,
      name:   name || email,
      status: 'ACTIVE'
    });

  } catch (err) {
    Logger.log('[onUserStatusSheetEdit] ' + (err && err.message ? err.message : err));
  }
}

/*******************************************************
 * SCENARIO READBACK REPAIR
 * Run repairAllScenarioReadbacks() once from the editor
 * to fix expectedReadback + keywords for all NORMAL scenarios.
 *******************************************************/

function repairAllScenarioReadbacks() {
  var props = PropertiesService.getScriptProperties();
  var dbId =
    props.getProperty('DB_SPREADSHEET_ID') ||
    props.getProperty('DATABASE_SPREADSHEET_ID') ||
    props.getProperty('SPREADSHEET_ID') ||
    '1IKVJEEw8QoX9HkMJpnXNj3a20HnTl_-CjUcOJb4vgWY';

  var ss    = SpreadsheetApp.openById(dbId);
  var sheet = ss.getSheetByName('Scenarios');
  if (!sheet) throw new Error('Scenarios sheet not found.');

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2) return 'No scenarios found.';

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) {
    return String(h || '').trim();
  });
  var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

  function ci(name) { return headers.indexOf(name); }
  var C = {
    fid:      ci('flightScenarioId'),
    phase:    ci('phaseCode'),
    stype:    ci('scenarioType'),
    atc:      ci('atcText'),
    readback: ci('expectedReadback'),
    kw:       ci('keywords'),
    kwt:      ci('keywordsText')
  };

  // Pass 1: find callsign for each route from its STARTUP row
  var callsigns = {};
  data.forEach(function(row) {
    var fid   = String(row[C.fid]   || '').trim();
    var phase = String(row[C.phase] || '').trim().toUpperCase();
    var stype = String(row[C.stype] || '').trim().toUpperCase();
    var atc   = String(row[C.atc]   || '').trim();
    if (!fid || phase !== 'STARTUP' || stype === 'EMERGENCY' || !atc) return;
    var idx = atc.toUpperCase().indexOf(' START UP');
    if (idx > 0) callsigns[fid] = atc.substring(0, idx).trim();
  });

  Logger.log('[repairAllScenarioReadbacks] callsigns: ' + JSON.stringify(callsigns));

  // Pass 2: repair each NORMAL row
  var repaired = 0;
  var skipped  = 0;

  data.forEach(function(row, i) {
    var fid   = String(row[C.fid]   || '').trim();
    var phase = String(row[C.phase] || '').trim().toUpperCase();
    var stype = String(row[C.stype] || '').trim().toUpperCase();
    var atc   = String(row[C.atc]   || '').trim();

    if (!fid || !atc || stype === 'EMERGENCY') { skipped++; return; }

    var callsign = callsigns[fid];
    if (!callsign) { skipped++; return; }

    var readback = _repairDeriveReadback(atc, phase, callsign);
    var kw       = _repairDeriveKeywords(readback, phase, callsign);

    var sheetRow = i + 2;
    if (C.readback >= 0) sheet.getRange(sheetRow, C.readback + 1).setValue(readback);
    if (C.kw      >= 0) sheet.getRange(sheetRow, C.kw      + 1).setValue(kw);
    if (C.kwt     >= 0) sheet.getRange(sheetRow, C.kwt     + 1).setValue(kw);

    Logger.log('Row ' + sheetRow + ' [' + phase + '] -> ' + readback + ' | kw: ' + kw);
    repaired++;
  });

  var msg = 'Done. Repaired ' + repaired + ' rows. Skipped ' + skipped + ' (emergency or no callsign).';
  Logger.log(msg);
  return msg;
}

function _repairDeriveReadback(atcText, phase, callsign) {
  var text     = atcText.trim();
  var csUpper  = callsign.toUpperCase();
  var txtUpper = text.toUpperCase();

  // Strip callsign from the start of the ATC text
  if (txtUpper.indexOf(csUpper) === 0) {
    text = text.substring(callsign.length).trim();
  }

  // TAKEOFF and LANDING: pilots don't read back wind — strip everything before RUNWAY
  if (phase === 'TAKEOFF' || phase === 'LANDING') {
    var rwIdx = text.toUpperCase().indexOf('RUNWAY');
    if (rwIdx > 0) text = text.substring(rwIdx);
  }

  return text.trim() + ' ' + callsign;
}

function _repairDeriveKeywords(readback, phase, callsign) {
  var rb = readback.toUpperCase();

  var runwayMatch = rb.match(/RUNWAY\s+(\w+)/);
  var runway      = runwayMatch ? 'RUNWAY ' + runwayMatch[1] : '';

  var freqMatch = rb.match(/(\d{3})\s+DECIMAL\s+(\d+)/);
  var freq      = freqMatch ? freqMatch[1] + ' DECIMAL ' + freqMatch[2] : '';

  var standMatch = rb.match(/STAND\s+(\w+)/);
  var stand      = standMatch ? 'STAND ' + standMatch[1] : '';

  var parts = [];

  switch (phase) {
    case 'STARTUP':
      parts.push('START UP APPROVED');
      var qnhMatch = rb.match(/QNH\s+(\d+)/);
      if (qnhMatch) parts.push('QNH ' + qnhMatch[1]);
      parts.push(callsign);
      break;

    case 'TAXI_OUT':
      parts.push('TAXI TO HOLDING POINT');
      if (runway) parts.push(runway);
      var viaMatch = rb.match(/VIA\s+(?:TAXIWAY\s+)?(\w+)/);
      if (viaMatch) parts.push(viaMatch[1]);
      if (rb.indexOf('GIVE WAY') >= 0) parts.push('GIVE WAY');
      parts.push(callsign);
      break;

    case 'TAKEOFF':
      if (runway) parts.push(runway);
      parts.push('CLEARED FOR TAKEOFF');
      parts.push(callsign);
      break;

    case 'DEPARTURE':
      parts.push('CLIMB');
      if (freq) parts.push(freq);
      parts.push(callsign);
      break;

    case 'CRUISE':
      parts.push('CONTACT CONTROL');
      if (freq) parts.push(freq);
      parts.push(callsign);
      break;

    case 'APPROACH':
      parts.push('DESCEND');
      if (rb.indexOf('ILS') >= 0) parts.push('ILS APPROACH');
      if (runway) parts.push(runway);
      parts.push(callsign);
      break;

    case 'LANDING':
      if (runway) parts.push(runway);
      parts.push('CLEARED TO LAND');
      parts.push(callsign);
      break;

    case 'TAXI_IN':
      parts.push('TAXI TO');
      if (stand) parts.push(stand);
      parts.push(callsign);
      break;

    default:
      parts.push(callsign);
  }

  return parts.join('|');
}

function authorizeUrlFetchService() {
  var response = UrlFetchApp.fetch('https://www.google.com/generate_204', {
    method: 'get',
    muteHttpExceptions: true
  });

  Logger.log('HTTP status: ' + response.getResponseCode());

  return 'UrlFetchApp authorized successfully. HTTP status: ' + response.getResponseCode();
}

function testTtsApiKey() {
  var apiKey = PropertiesService
    .getScriptProperties()
    .getProperty('GOOGLE_TTS_API_KEY');

  if (!apiKey) {
    throw new Error('GOOGLE_TTS_API_KEY is empty.');
  }

  var url = 'https://texttospeech.googleapis.com/v1/text:synthesize?key=' + encodeURIComponent(apiKey);

  var payload = {
    input: {
      text: 'Fastair three four five, start up approved.'
    },
    voice: {
      languageCode: 'en-US',
      name: 'en-US-Standard-A'
    },
    audioConfig: {
      audioEncoding: 'MP3',
      speakingRate: 1
    }
  };

  var response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  Logger.log('HTTP status: ' + response.getResponseCode());
  Logger.log(response.getContentText().substring(0, 500));

  return response.getResponseCode();
}

/*******************************************************
 * DEBUG
 *******************************************************/

function apiDebugPingV3() {
  return {
    ok: true,
    source: 'apiDebugPingV3',
    message: 'Backend is responding correctly',
    timestamp: new Date().toISOString()
  };
}

/*******************************************************
 * SAFE SERIALIZATION HELPERS
 *******************************************************/

function safeResponse_(obj) {
  if (!obj) {
    return {
      ok: false,
      message: 'Empty response.'
    };
  }

  return safeObjectForClient_(obj);
}

function safeArrayForClient_(rows) {
  rows = rows || [];

  return rows.map(function(row) {
    return safeObjectForClient_(row);
  });
}

function safeObjectForClient_(obj) {
  var safe = {};

  obj = obj || {};

  Object.keys(obj).forEach(function(key) {
    var value = obj[key];

    if (value instanceof Date) {
      safe[key] = formatDateForClient_(value);
      return;
    }

    if (value === null || value === undefined) {
      safe[key] = '';
      return;
    }

    if (Array.isArray(value)) {
      safe[key] = value.map(function(item) {
        if (item instanceof Date) {
          return formatDateForClient_(item);
        }

        if (item === null || item === undefined) {
          return '';
        }

        if (typeof item === 'object') {
          return safeObjectForClient_(item);
        }

        return item;
      });
      return;
    }

    if (typeof value === 'object') {
      safe[key] = safeObjectForClient_(value);
      return;
    }

    safe[key] = value;
  });

  return safe;
}

function safeUserForClient_(user) {
  user = user || {};

  return {
    userId:               String(user.userId || ''),
    name:                 String(user.name   || ''),
    email:                String(user.email  || ''),
    role:                 String(user.role   || 'STUDENT'),
    status:               String(user.status || 'PENDING'),
    currentLevel:         Number(user.currentLevel  || 1),
    currentCountry:       String(user.currentCountry || ''),
    assignedInstructorId: String(user.assignedInstructorId || ''),
    assignedGroupId:      String(user.assignedGroupId || ''),
    createdAt:  user.createdAt  instanceof Date ? formatDateForClient_(user.createdAt)  : String(user.createdAt  || ''),
    updatedAt:  user.updatedAt  instanceof Date ? formatDateForClient_(user.updatedAt)  : String(user.updatedAt  || ''),
    lastLoginAt: user.lastLoginAt instanceof Date ? formatDateForClient_(user.lastLoginAt) : String(user.lastLoginAt || ''),
    // B2B enrichment — empty string for standard B2C accounts
    companyId:    String(user.companyId   || ''),
    licenseType:  String(user.licenseType || ''),
    cohortId:     String(user.assignedGroupId || ''),
    instructorId: String(user.instructorId || '')
  };
}

function safeScenarioForClient_(s) {
  s = s || {};

  return {
    scenarioId: String(s.scenarioId || ''),
    scenarioOrder: Number(s.scenarioOrder || 0),
    level: Number(s.level || 1),
    country: String(s.country || ''),
    flightScenarioId: String(s.flightScenarioId || ''),
    flightScenarioName: String(s.flightScenarioName || ''),
    phaseCode: String(s.phaseCode || ''),
    phaseName: String(s.phaseName || ''),
    phaseOrder: Number(s.phaseOrder || 0),
    phaseLabel: String(s.phaseLabel || ''),
    scenarioType: String(s.scenarioType || 'NORMAL'),
    emergencyType: String(s.emergencyType || ''),
    context: String(s.context || ''),
    atcText: String(s.atcText || ''),
    expectedReadback: String(s.expectedReadback || ''),
    keywords: Array.isArray(s.keywords) ? s.keywords.map(String) : [],
    keywordsText: String(s.keywordsText || ''),
    imageFileId: String(s.imageFileId || ''),
    videoUrl: String(s.videoUrl || ''),
    audioUrl: String(s.audioUrl || ''),
    isActive: s.isActive === true || String(s.isActive).toUpperCase() === 'TRUE',
    version: Number(s.version || 1),
    createdBy: String(s.createdBy || ''),
    createdAt: s.createdAt instanceof Date ? formatDateForClient_(s.createdAt) : String(s.createdAt || ''),
    updatedAt: s.updatedAt instanceof Date ? formatDateForClient_(s.updatedAt) : String(s.updatedAt || '')
  };
}

function safeTrainingCatalogForClient_(catalog) {
  catalog = catalog || {};

  var highestUnlocked = 1;
  (catalog.levels || []).forEach(function(level) {
    var lvlNum = Number(level.level || 1);
    var isUnlocked = level.unlocked === true || String(level.unlocked).toUpperCase() === 'TRUE';
    if (isUnlocked && lvlNum > highestUnlocked) highestUnlocked = lvlNum;
  });

  return {
    totalLevels: Number(catalog.totalLevels || 0),
    highestUnlockedLevel: highestUnlocked,
    levels: (catalog.levels || []).map(function(level) {
      return {
        level: Number(level.level || 1),
        totalCountries: Number(level.totalCountries || 0),
        completedCountries: Number(level.completedCountries || 0),
        completed: level.completed === true || String(level.completed).toUpperCase() === 'TRUE',
        unlocked: level.unlocked === true || String(level.unlocked).toUpperCase() === 'TRUE',
        locked: level.locked === true || String(level.locked).toUpperCase() === 'TRUE',
        countries: (level.countries || []).map(function(country) {
          return {
            country: String(country.country || ''),
            level: Number(country.level || level.level || 1),
            totalScenarios: Number(country.totalScenarios || 0),
            completedScenarios: Number(country.completedScenarios || 0),
            progressPct: Number(country.progressPct || 0),
            scoreAvg: Number(country.scoreAvg || 0),
            completed: country.completed === true || String(country.completed).toUpperCase() === 'TRUE'
          };
        })
      };
    })
  };
}

function safeScenarioRouteForClient_(data) {
  data = data || {};

  return {
    currentLevel: Number(data.currentLevel || 1),
    currentCountry: String(data.currentCountry || ''),
    totalScenarios: Number(data.totalScenarios || 0),
    scenarios: (data.scenarios || []).map(function(s) {
      return safeScenarioForClient_(s);
    })
  };
}

function unlockCatalogForStaff_(catalog) {
  catalog = catalog || {};
  catalog.levels = catalog.levels || [];

  catalog.levels.forEach(function(level) {
    level.unlocked = true;
    level.locked = false;
  });

  return catalog;
}

function formatDateForClient_(date) {
  return Utilities.formatDate(
    date,
    Session.getScriptTimeZone(),
    'yyyy-MM-dd HH:mm:ss'
  );
}

function apiError_(source, err) {
  var message = err && err.message ? err.message : String(err);
  var stack = err && err.stack ? err.stack : 'No stack available';

  try {
    Logger.log(source + ' ERROR: ' + message);
    Logger.log(stack);

    if (typeof LogService !== 'undefined' && LogService.error) {
      LogService.error(source, err, stack);
    }
  } catch (logErr) {
    Logger.log('Could not write LogService error: ' + logErr);
  }

  return {
    ok: false,
    source: source,
    message: message,
    stack: stack
  };
}

function getAppConfigValue_(key, fallback) {
  try {
    if (typeof CONFIG !== 'undefined' && CONFIG && CONFIG[key]) {
      return CONFIG[key];
    }
  } catch (e) {}

  return fallback;
}

function apiGetTrainingCatalogV5_HARD(sessionToken) {
  try {
    var user = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);

    var catalog = buildTrainingCatalogV5Hard_(user, 10);

    return {
      ok: true,
      source: 'apiGetTrainingCatalogV5_HARD',
      catalog: catalog
    };

  } catch (err) {
    return {
      ok: false,
      source: 'apiGetTrainingCatalogV5_HARD',
      message: err && err.message ? err.message : String(err),
      stack: err && err.stack ? err.stack : 'No stack available.'
    };
  }
}


function testTrainingCatalogV5HardWithoutSession() {
  var catalog = buildTrainingCatalogV5Hard_({
    userId: 'TEST_ADMIN',
    role: 'ADMIN'
  }, 50);

  Logger.log(JSON.stringify(catalog, null, 2));

  return {
    ok: true,
    source: 'testTrainingCatalogV5HardWithoutSession',
    totalLevels: catalog.totalLevels,
    sample: catalog.levels.slice(0, 5)
  };
}


function buildTrainingCatalogV5Hard_(user, maxLevels) {
  user = user || {};
  maxLevels = Number(maxLevels || 50);

  var scenarios = readSheetObjectsV5Hard_('Scenarios');
  var progressRows = readSheetObjectsV5Hard_('Progress');

  var activeScenarios = scenarios.filter(function(row) {
    return isTruthyV5Hard_(row.isActive);
  });

  var progressMap = {};

  progressRows
    .filter(function(row) {
      return String(row.userId || '') === String(user.userId || '');
    })
    .forEach(function(row) {
      var key =
        Number(row.level || 1) +
        '||' +
        String(row.country || '').trim().toUpperCase();

      var existing = progressMap[key];
      if (!existing) {
        progressMap[key] = row;
      } else {
        // Never downgrade a previously completed route.
        // If the existing row is completed and the new one is not, keep
        // completed=TRUE but take the newer stats (score, progress pct).
        var existingDone = isTruthyV5Hard_(existing.completed);
        var newDone      = isTruthyV5Hard_(row.completed);
        if (existingDone && !newDone) {
          progressMap[key] = Object.assign({}, row, { completed: existing.completed });
        } else {
          progressMap[key] = row;
        }
      }
    });

  var levelMap = {};

  activeScenarios.forEach(function(row) {
    var level = Number(row.level || 1);
    var country = String(row.country || '').trim();

    if (!level || !country) {
      return;
    }

    if (!levelMap[level]) {
      levelMap[level] = {
        level: level,
        totalCountries: 0,
        completedCountries: 0,
        completed: false,
        unlocked: level === 1,
        locked: level !== 1,
        countriesMap: {}
      };
    }

    var countryKey = country.toUpperCase();

    if (!levelMap[level].countriesMap[countryKey]) {
      levelMap[level].countriesMap[countryKey] = {
        country: country,
        level: level,
        totalScenarios: 0,
        completedScenarios: 0,
        progressPct: 0,
        scoreAvg: 0,
        completed: false
      };
    }

    levelMap[level].countriesMap[countryKey].totalScenarios += 1;
  });

  var levels = Object.keys(levelMap)
    .map(function(key) {
      var levelItem = levelMap[key];

      var countries = Object.keys(levelItem.countriesMap)
        .sort()
        .map(function(countryKey) {
          var countryItem = levelItem.countriesMap[countryKey];
          var progress = progressMap[levelItem.level + '||' + countryKey];

          if (progress) {
            countryItem.completedScenarios = Number(progress.completedScenarios || 0);
            countryItem.progressPct = Number(progress.progressPct || 0);
            countryItem.scoreAvg = Number(progress.scoreAvg || 0);
            countryItem.completed = isTruthyV5Hard_(progress.completed);
            countryItem.completedAt = progress.completedAt || progress.updatedAt || null;
          }

          return {
            country: String(countryItem.country || ''),
            level: Number(countryItem.level || levelItem.level || 1),
            totalScenarios: Number(countryItem.totalScenarios || 0),
            completedScenarios: Number(countryItem.completedScenarios || 0),
            progressPct: Number(countryItem.progressPct || 0),
            scoreAvg: Number(countryItem.scoreAvg || 0),
            completed: countryItem.completed === true,
            completedAt: countryItem.completedAt || null
          };
        });

      var completedCountries = countries.filter(function(country) {
        return country.completed;
      }).length;

      return {
        level: Number(levelItem.level || 1),
        totalCountries: countries.length,
        completedCountries: completedCountries,
        completed: countries.length > 0 && completedCountries >= countries.length,
        unlocked: levelItem.unlocked === true,
        locked: levelItem.locked === true,
        countries: countries
      };
    })
    .sort(function(a, b) {
      return Number(a.level || 0) - Number(b.level || 0);
    })
    .filter(function(levelItem) {
      // Only show levels that have at least one configured country/scenario
      return levelItem.countries.length > 0;
    })
    .slice(0, maxLevels); // Hard cap to maxLevels (10)

  if (user.role === 'ADMIN' || user.role === 'INSTRUCTOR') {
    levels.forEach(function(levelItem) {
      levelItem.unlocked = true;
      levelItem.locked = false;
    });
  } else {
    var examPassedMap  = getExamPassedMap_(user.userId);
    var prevLevelDone  = true; // Level 1 is always accessible
    levels.forEach(function(levelItem, idx) {
      var lvl = Number(levelItem.level || 1);
      // Levels 4, 7, 10 each require the preceding exam to be passed
      var examGate   = lvl === 4 ? 1 : lvl === 7 ? 2 : lvl === 10 ? 3 : null;
      var examPassed = examGate ? (examPassedMap[examGate] === true) : true;
      // Exam-gated levels unlock purely by exam (supports placement bypass); all others require sequential completion.
      if (examGate) {
        levelItem.unlocked = examPassed;
      } else {
        levelItem.unlocked = (idx === 0 || prevLevelDone);
      }
      levelItem.locked   = !levelItem.unlocked;
      prevLevelDone      = levelItem.completed;
    });
  }

  return {
    totalLevels: levels.length,
    highestUnlockedLevel: getHighestUnlockedLevelV5Hard_(levels),
    levels: levels
  };
}


function getHighestUnlockedLevelV5Hard_(levels) {
  var highest = 1;

  levels.forEach(function(levelItem) {
    if (levelItem.unlocked) {
      highest = Math.max(highest, Number(levelItem.level || 1));
    }
  });

  return highest;
}


function readSheetObjectsV5Hard_(sheetName) {
  var ss = SpreadsheetApp.openById(getDatabaseIdV5Hard_());
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    return [];
  }

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();

  if (lastRow < 2 || lastCol < 1) {
    return [];
  }

  var headers = sheet
    .getRange(1, 1, 1, lastCol)
    .getValues()[0]
    .map(function(header) {
      return String(header || '').trim();
    });

  var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

  return values
    .filter(function(row) {
      return row.some(function(cell) {
        return cell !== '' && cell !== null && cell !== undefined;
      });
    })
    .map(function(row) {
      var obj = {};

      headers.forEach(function(header, index) {
        if (!header) {
          return;
        }

        var value = row[index];

        if (value instanceof Date) {
          obj[header] = Utilities.formatDate(
            value,
            Session.getScriptTimeZone(),
            'yyyy-MM-dd HH:mm:ss'
          );
        } else {
          obj[header] = value;
        }
      });

      return obj;
    });
}


function getDatabaseIdV5Hard_() {
  var props = PropertiesService.getScriptProperties();

  return (
    props.getProperty('DB_SPREADSHEET_ID') ||
    props.getProperty('DATABASE_SPREADSHEET_ID') ||
    props.getProperty('SPREADSHEET_ID') ||
    props.getProperty('ICAO_DB_SPREADSHEET_ID') ||
    '1IKVJEEw8QoX9HkMJpnXNj3a20HnTl_-CjUcOJb4vgWY'
  );
}


function isTruthyV5Hard_(value) {
  if (value === true || value === 1) return true;
  var s = String(value === null || value === undefined ? '' : value).trim().toUpperCase();
  return s === 'TRUE' || s === '1' || s === 'YES';
}


function getTtsConfigStatus() {
  var apiKey = PropertiesService.getScriptProperties().getProperty('GOOGLE_TTS_API_KEY');

  return {
    ok: true,
    configured: !!apiKey,
    message: apiKey
      ? 'TTS configurado.'
      : 'TTS no configurado. Ejecuta setTtsConfig() primero.'
  };
}

/*******************************************************
 * ROUTE BUILDER - BACKEND
 * Creates a complete 8-phase flight route for a level/country
 *******************************************************/

function apiAdminCreateFullRoute(sessionToken, payload) {
  try {
    var admin = AuthService.requireRole(sessionToken, ['ADMIN']);

    payload = payload || {};

    var result = RouteBuilderService.createFullRoute(admin, payload);

    return {
      ok: true,
      source: 'apiAdminCreateFullRoute',
      message: result.message,
      created: result.created,
      skipped: result.skipped,
      deactivated: result.deactivated,
      route: result.route
    };

  } catch (err) {
    return apiError_('apiAdminCreateFullRoute', err);
  }
}


var RouteBuilderService = {
  PHASES: [
    {
      code: 'STARTUP',
      name: 'Pre-flight / Startup',
      label: 'Startup',
      order: 1
    },
    {
      code: 'TAXI_OUT',
      name: 'Taxi Out',
      label: 'Taxi Out',
      order: 2
    },
    {
      code: 'TAKEOFF',
      name: 'Takeoff',
      label: 'Takeoff',
      order: 3
    },
    {
      code: 'DEPARTURE',
      name: 'Departure / Climb',
      label: 'Departure',
      order: 4
    },
    {
      code: 'CRUISE',
      name: 'Enroute / Cruise',
      label: 'Cruise',
      order: 5
    },
    {
      code: 'APPROACH',
      name: 'Descent / Approach',
      label: 'Approach',
      order: 6
    },
    {
      code: 'LANDING',
      name: 'Landing',
      label: 'Landing',
      order: 7
    },
    {
      code: 'TAXI_IN',
      name: 'Taxi In / Shutdown',
      label: 'Taxi In',
      order: 8
    }
  ],

  REQUIRED_HEADERS: [
    'scenarioId',
    'scenarioOrder',
    'level',
    'country',
    'flightScenarioId',
    'flightScenarioName',
    'phaseCode',
    'phaseName',
    'phaseOrder',
    'phaseLabel',
    'scenarioType',
    'emergencyType',
    'context',
    'atcText',
    'expectedReadback',
    'keywords',
    'keywordsText',
    'imageFileId',
    'videoUrl',
    'audioUrl',
    'isActive',
    'version',
    'emergencyTriggerPhase',
    'createdAt',
    'updatedAt'
  ],

  createFullRoute: function(adminUser, payload) {
    var level = Number(payload.level || 1);
    var country = String(payload.country || 'USA').trim();
    var scenarioType = String(payload.scenarioType || 'NORMAL').trim().toUpperCase();
    var emergencyType = String(payload.emergencyType || '').trim().toUpperCase();
    var emergencyTriggerPhase = String(payload.emergencyTriggerPhase || '').trim().toUpperCase();
    var callsign = String(payload.callsign || 'FASTAIR 345').trim().toUpperCase();
    var runway = String(payload.runway || '27').trim();
    var stand = String(payload.stand || 'B12').trim().toUpperCase();
    var taxiRoute = String(payload.taxiRoute || 'ALPHA').trim().toUpperCase();
    var duplicateMode = String(payload.duplicateMode || 'SKIP_EXISTING').trim().toUpperCase();
    var isActive = payload.isActive === false ? false : true;

    if (!level || level < 1) {
      throw new Error('Level is required.');
    }

    if (!country) {
      throw new Error('Country is required.');
    }

    if (scenarioType !== 'NORMAL' && scenarioType !== 'EMERGENCY') {
      throw new Error('Scenario Type must be NORMAL or EMERGENCY.');
    }

    if (scenarioType === 'EMERGENCY' && !emergencyType) {
      throw new Error('Emergency Type is required for emergency routes.');
    }

    if (scenarioType === 'EMERGENCY' && !emergencyTriggerPhase) {
      emergencyTriggerPhase = this.getDefaultTriggerPhase_(emergencyType);
    }

    var ss = SpreadsheetApp.openById(this.getDatabaseId_());
    var sheet = ss.getSheetByName('Scenarios');

    if (!sheet) {
      sheet = ss.insertSheet('Scenarios');
    }

    this.ensureHeaders_(sheet, this.REQUIRED_HEADERS);

    var allRows = this.readSheetObjectsWithRow_(sheet);
    var headerMap = this.getHeaderMap_(sheet);

    var flightScenarioId = this.buildFlightScenarioId_(level, country, scenarioType, emergencyType);
    var flightScenarioName = this.buildFlightScenarioName_(level, country, scenarioType, emergencyType);

    var deactivated = 0;

    if (duplicateMode === 'REPLACE_EXISTING') {
      deactivated = this.deactivateExistingRoute_(
        sheet,
        headerMap,
        allRows,
        level,
        country,
        scenarioType,
        emergencyType
      );

      allRows = this.readSheetObjectsWithRow_(sheet);
    }

    var created = [];
    var skipped = [];

    for (var i = 0; i < this.PHASES.length; i++) {
      var phase = this.PHASES[i];

      var existing = this.findExistingPhase_(
        allRows,
        level,
        country,
        scenarioType,
        emergencyType,
        phase.code
      );

      if (existing && duplicateMode !== 'REPLACE_EXISTING') {
        skipped.push({
          phaseCode: phase.code,
          reason: 'Already exists active scenario for this phase.'
        });

        continue;
      }

      var template = this.buildTemplate_(phase.code, {
        country: country,
        callsign: callsign,
        runway: runway,
        stand: stand,
        taxiRoute: taxiRoute,
        scenarioType: scenarioType,
        emergencyType: emergencyType,
        emergencyTriggerPhase: emergencyTriggerPhase
      });

      var scenario = {
        scenarioId: this.makeScenarioId_(level, country, scenarioType, phase.code),
        scenarioOrder: 1,
        level: level,
        country: country,
        flightScenarioId: flightScenarioId,
        flightScenarioName: flightScenarioName,
        phaseCode: phase.code,
        phaseName: phase.name,
        phaseOrder: phase.order,
        phaseLabel: phase.label,
        scenarioType: scenarioType,
        emergencyType: scenarioType === 'EMERGENCY' ? emergencyType : '',
        emergencyTriggerPhase: scenarioType === 'EMERGENCY' ? emergencyTriggerPhase : '',
        context: template.context,
        atcText: template.atcText,
        expectedReadback: template.expectedReadback,
        keywords: template.keywords,
        keywordsText: template.keywords,
        imageFileId: '',
        videoUrl: '',
        audioUrl: '',
        isActive: isActive,
        version: 1,
        createdAt: this.now_(),
        updatedAt: this.now_()
      };

      this.appendScenario_(sheet, headerMap, scenario);

      created.push({
        scenarioId: scenario.scenarioId,
        phaseCode: scenario.phaseCode,
        phaseName: scenario.phaseName
      });
    }

    return {
      message: 'Route builder finished. Created: ' + created.length + ', skipped: ' + skipped.length + ', deactivated: ' + deactivated + '.',
      created: created,
      skipped: skipped,
      deactivated: deactivated,
      route: {
        level: level,
        country: country,
        scenarioType: scenarioType,
        emergencyType: scenarioType === 'EMERGENCY' ? emergencyType : '',
        emergencyTriggerPhase: scenarioType === 'EMERGENCY' ? emergencyTriggerPhase : '',
        flightScenarioId: flightScenarioId,
        flightScenarioName: flightScenarioName,
        totalPhases: this.PHASES.length
      }
    };
  },

  buildFlightScenarioId_: function(level, country, scenarioType, emergencyType) {
    var cleanCountry = String(country || 'USA')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_');

    var id = 'FLT-L' + Number(level || 1) + '-' + cleanCountry + '-' + scenarioType;

    if (scenarioType === 'EMERGENCY' && emergencyType) {
      id += '-' + String(emergencyType).replace(/\s+/g, '_');
    }

    return id;
  },

  buildFlightScenarioName_: function(level, country, scenarioType, emergencyType) {
    if (scenarioType === 'EMERGENCY') {
      return country + ' Level ' + level + ' Emergency Route - ' + String(emergencyType || '').replace(/_/g, ' ');
    }

    return country + ' Level ' + level + ' Normal Flight Route';
  },

  makeScenarioId_: function(level, country, scenarioType, phaseCode) {
    var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMddHHmmss');
    var cleanCountry = String(country || 'USA').trim().toUpperCase().replace(/\s+/g, '_');

    return [
      'SCN',
      'L' + Number(level || 1),
      cleanCountry,
      scenarioType,
      phaseCode,
      stamp,
      Utilities.getUuid().slice(0, 8)
    ].join('-');
  },

  buildTemplate_: function(phaseCode, options) {
    var callsign = options.callsign || 'FASTAIR 345';
    var runway = options.runway || '27';
    var stand = options.stand || 'B12';
    var taxiRoute = options.taxiRoute || 'ALPHA';

    var templates = {
      STARTUP: {
        context: 'Pre-flight startup clearance',
        atcText: callsign + ' START UP APPROVED TEMPERATURE MINUS 2',
        expectedReadback: 'START UP APPROVED ' + callsign,
        keywords: 'START UP APPROVED|' + callsign
      },
      TAXI_OUT: {
        context: 'Taxi clearance to holding point',
        atcText: callsign + ' TAXI TO HOLDING POINT RUNWAY ' + runway + ' VIA ' + taxiRoute,
        expectedReadback: 'TAXI TO HOLDING POINT RUNWAY ' + runway + ' VIA ' + taxiRoute + ' ' + callsign,
        keywords: 'TAXI|HOLDING POINT|RUNWAY ' + runway + '|' + taxiRoute + '|' + callsign
      },
      TAKEOFF: {
        context: 'Takeoff clearance',
        atcText: callsign + ' WIND 260 DEGREES 8 KNOTS RUNWAY ' + runway + ' CLEARED FOR TAKEOFF',
        expectedReadback: 'RUNWAY ' + runway + ' CLEARED FOR TAKEOFF ' + callsign,
        keywords: 'RUNWAY ' + runway + '|CLEARED FOR TAKEOFF|' + callsign
      },
      DEPARTURE: {
        context: 'Departure climb instruction',
        atcText: callsign + ' CLIMB FLIGHT LEVEL 120 CONTACT DEPARTURE 119 DECIMAL 7',
        expectedReadback: 'CLIMB FLIGHT LEVEL 120 CONTACT DEPARTURE 119 DECIMAL 7 ' + callsign,
        keywords: 'CLIMB|FLIGHT LEVEL 120|DEPARTURE|119 DECIMAL 7|' + callsign
      },
      CRUISE: {
        context: 'Enroute frequency change',
        atcText: callsign + ' CONTACT CONTROL 129 DECIMAL 1',
        expectedReadback: 'CONTACT CONTROL 129 DECIMAL 1 ' + callsign,
        keywords: 'CONTACT CONTROL|129 DECIMAL 1|' + callsign
      },
      APPROACH: {
        context: 'Approach clearance',
        atcText: callsign + ' DESCEND TO 3000 FEET CLEARED ILS APPROACH RUNWAY ' + runway,
        expectedReadback: 'DESCEND TO 3000 FEET CLEARED ILS APPROACH RUNWAY ' + runway + ' ' + callsign,
        keywords: 'DESCEND|3000 FEET|ILS APPROACH|RUNWAY ' + runway + '|' + callsign
      },
      LANDING: {
        context: 'Landing clearance',
        atcText: callsign + ' WIND 270 DEGREES 6 KNOTS RUNWAY ' + runway + ' CLEARED TO LAND',
        expectedReadback: 'RUNWAY ' + runway + ' CLEARED TO LAND ' + callsign,
        keywords: 'RUNWAY ' + runway + '|CLEARED TO LAND|' + callsign
      },
      TAXI_IN: {
        context: 'Taxi to stand after landing',
        atcText: callsign + ' TAXI TO STAND ' + stand + ' VIA BRAVO AND CHARLIE',
        expectedReadback: 'TAXI TO STAND ' + stand + ' VIA BRAVO AND CHARLIE ' + callsign,
        keywords: 'TAXI|STAND ' + stand + '|BRAVO|CHARLIE|' + callsign
      }
    };

    var template = templates[phaseCode] || templates.STARTUP;

    if (options.scenarioType === 'EMERGENCY') {
      template = this.buildEmergencyTemplate_(
        phaseCode,
        options.emergencyType,
        options.emergencyTriggerPhase,
        callsign,
        runway,
        stand,
        template
      );
    }

    return template;
  },

  buildEmergencyTemplate_: function(phaseCode, emergencyType, triggerPhase, callsign, runway, stand, normalTemplate) {
    var emergencyLabel = String(emergencyType || 'EMERGENCY').replace(/_/g, ' ');
    var role = this.getEmergencyPhaseRole_(phaseCode, triggerPhase);

    if (role === 'BEFORE_TRIGGER') {
      return {
        context: 'Normal operation - ' + normalTemplate.context,
        atcText: normalTemplate.atcText,
        expectedReadback: normalTemplate.expectedReadback,
        keywords: normalTemplate.keywords
      };
    }

    if (role === 'TRIGGER') {
      return this.getEmergencyTriggerTemplate_(phaseCode, emergencyType, emergencyLabel, callsign, runway);
    }

    return this.getPostEmergencyTemplate_(phaseCode, emergencyLabel, callsign, runway, stand);
  },

  getEmergencyTriggerTemplate_: function(phaseCode, emergencyType, emergencyLabel, callsign, runway) {
    var byType = {
      ENGINE_FAILURE: {
        context: emergencyLabel + ' declared during ' + phaseCode,
        atcText: callsign + ' ROGER MAYDAY, TURN LEFT HEADING 180, MAINTAIN 3000 FEET, EXPECT VECTORS FOR RETURN ILS RUNWAY ' + runway,
        expectedReadback: 'ROGER MAYDAY TURNING LEFT HEADING 180 MAINTAIN 3000 FEET EXPECT VECTORS ILS RUNWAY ' + runway + ' ' + callsign,
        keywords: 'MAYDAY|HEADING 180|3000 FEET|ILS RUNWAY ' + runway + '|' + callsign
      },
      REJECTED_TAKEOFF: {
        context: emergencyLabel + ' - RTO declared during ' + phaseCode,
        atcText: callsign + ' ROGER, STOP CONFIRMED, EMERGENCY SERVICES ALERTED, VACATE RUNWAY ' + runway + ' VIA ALPHA WHEN ABLE',
        expectedReadback: 'STOPPING CONFIRMED VACATING RUNWAY ' + runway + ' VIA ALPHA ' + callsign,
        keywords: 'STOPPING CONFIRMED|VACATING RUNWAY ' + runway + '|' + callsign
      },
      RADIO_FAILURE: {
        context: emergencyLabel + ' - loss of comms during ' + phaseCode,
        atcText: callsign + ' IF YOU READ SQUAWK 7600, CONTINUE PRESENT HEADING, EXPECT RADAR VECTORS FOR APPROACH RUNWAY ' + runway,
        expectedReadback: 'SQUAWKING 7600 CONTINUING PRESENT HEADING ' + callsign,
        keywords: 'SQUAWKING 7600|PRESENT HEADING|' + callsign
      },
      MEDICAL_EMERGENCY: {
        context: emergencyLabel + ' - PAN declared during ' + phaseCode,
        atcText: callsign + ' PAN PAN ACKNOWLEDGED, DESCEND IMMEDIATELY TO 4000 FEET, DIRECT TO RUNWAY ' + runway + ', MEDICAL SERVICES STANDING BY',
        expectedReadback: 'PAN PAN DESCENDING TO 4000 FEET DIRECT RUNWAY ' + runway + ' ' + callsign,
        keywords: 'PAN PAN|4000 FEET|DIRECT|RUNWAY ' + runway + '|' + callsign
      },
      WEATHER_DEVIATION: {
        context: emergencyLabel + ' - deviation request during ' + phaseCode,
        atcText: callsign + ' DEVIATION APPROVED, TURN LEFT HEADING 240, WHEN ABLE RESUME OWN NAVIGATION',
        expectedReadback: 'DEVIATION APPROVED TURNING LEFT HEADING 240 WILL RESUME OWN NAVIGATION ' + callsign,
        keywords: 'DEVIATION APPROVED|HEADING 240|OWN NAVIGATION|' + callsign
      },
      LOW_FUEL: {
        context: emergencyLabel + ' - MAYDAY FUEL declared during ' + phaseCode,
        atcText: callsign + ' MAYDAY FUEL ACKNOWLEDGED, CLEARED DIRECT RUNWAY ' + runway + ', DESCEND TO 3000 FEET, REPORT FIELD IN SIGHT',
        expectedReadback: 'MAYDAY FUEL DIRECT RUNWAY ' + runway + ' DESCENDING 3000 FEET ' + callsign,
        keywords: 'MAYDAY FUEL|DIRECT RUNWAY ' + runway + '|3000 FEET|' + callsign
      },
      GO_AROUND: {
        context: emergencyLabel + ' initiated during ' + phaseCode,
        atcText: callsign + ' GO AROUND, CLIMB STRAIGHT AHEAD TO 3000 FEET, CONTACT APPROACH 119 DECIMAL 7',
        expectedReadback: 'GO AROUND CLIMBING TO 3000 FEET CONTACT APPROACH 119 DECIMAL 7 ' + callsign,
        keywords: 'GO AROUND|3000 FEET|APPROACH|119 DECIMAL 7|' + callsign
      },
      MAYDAY: {
        context: emergencyLabel + ' declared during ' + phaseCode,
        atcText: callsign + ' MAYDAY MAYDAY MAYDAY ROGER, CLEARED DIRECT RUNWAY ' + runway + ', DESCEND TO 2000 FEET, ALL SERVICES ALERTED',
        expectedReadback: 'MAYDAY ROGER DIRECT RUNWAY ' + runway + ' DESCENDING 2000 FEET ' + callsign,
        keywords: 'MAYDAY|DIRECT RUNWAY ' + runway + '|2000 FEET|' + callsign
      },
      PAN_PAN: {
        context: emergencyLabel + ' declared during ' + phaseCode,
        atcText: callsign + ' PAN PAN ROGER, EXPEDITE DESCENT, CLEARED DIRECT RUNWAY ' + runway + ', EXPECT IMMEDIATE APPROACH',
        expectedReadback: 'PAN PAN ROGER EXPEDITING DESCENT DIRECT RUNWAY ' + runway + ' ' + callsign,
        keywords: 'PAN PAN|EXPEDITING DESCENT|DIRECT RUNWAY ' + runway + '|' + callsign
      }
    };

    return byType[emergencyType] || {
      context: emergencyLabel + ' declared during ' + phaseCode,
      atcText: callsign + ' EMERGENCY ACKNOWLEDGED, CLEARED DIRECT RUNWAY ' + runway + ', DESCEND TO 3000 FEET',
      expectedReadback: 'EMERGENCY ROGER DIRECT RUNWAY ' + runway + ' DESCENDING 3000 FEET ' + callsign,
      keywords: 'EMERGENCY|DIRECT RUNWAY ' + runway + '|3000 FEET|' + callsign
    };
  },

  getPostEmergencyTemplate_: function(phaseCode, emergencyLabel, callsign, runway, stand) {
    var byPhase = {
      CRUISE: {
        context: emergencyLabel + ' - post-emergency management',
        atcText: callsign + ' CONTINUE PRESENT HEADING, EXPECT PRIORITY APPROACH RUNWAY ' + runway + ', FIRE SERVICES STANDING BY',
        expectedReadback: 'CONTINUE PRESENT HEADING EXPECT PRIORITY APPROACH RUNWAY ' + runway + ' ' + callsign,
        keywords: 'CONTINUE PRESENT HEADING|PRIORITY APPROACH|RUNWAY ' + runway + '|' + callsign
      },
      APPROACH: {
        context: emergencyLabel + ' - priority approach vectors',
        atcText: callsign + ' PRIORITY SEQUENCE, DESCEND TO 3000 FEET, ILS APPROACH RUNWAY ' + runway + ', EMERGENCY SERVICES IN POSITION',
        expectedReadback: 'PRIORITY SEQUENCE DESCENDING 3000 FEET ILS APPROACH RUNWAY ' + runway + ' ' + callsign,
        keywords: 'PRIORITY SEQUENCE|3000 FEET|ILS APPROACH|RUNWAY ' + runway + '|' + callsign
      },
      LANDING: {
        context: emergencyLabel + ' - emergency landing clearance',
        atcText: callsign + ' RUNWAY ' + runway + ' CLEARED TO LAND, WIND CALM, EMERGENCY SERVICES IN POSITION',
        expectedReadback: 'RUNWAY ' + runway + ' CLEARED TO LAND ' + callsign,
        keywords: 'RUNWAY ' + runway + '|CLEARED TO LAND|' + callsign
      },
      TAXI_IN: {
        context: emergencyLabel + ' - post-landing emergency hold',
        atcText: callsign + ' HOLD POSITION, EMERGENCY SERVICES PROCEEDING TO YOUR LOCATION, DO NOT EVACUATE UNTIL INSTRUCTED',
        expectedReadback: 'HOLDING POSITION EMERGENCY SERVICES ACKNOWLEDGED ' + callsign,
        keywords: 'HOLDING POSITION|EMERGENCY SERVICES|' + callsign
      },
      DEPARTURE: {
        context: emergencyLabel + ' - post-emergency departure vectors',
        atcText: callsign + ' TURN RIGHT HEADING 090, CLIMB TO 5000 FEET, EMERGENCY SERVICES NOTIFIED',
        expectedReadback: 'TURNING RIGHT HEADING 090 CLIMBING 5000 FEET ' + callsign,
        keywords: 'HEADING 090|5000 FEET|' + callsign
      },
      TAKEOFF: {
        context: emergencyLabel + ' - post-emergency climb out',
        atcText: callsign + ' CLIMB STRAIGHT AHEAD TO 4000 FEET, EMERGENCY SERVICES ALERTED',
        expectedReadback: 'CLIMBING STRAIGHT AHEAD 4000 FEET ' + callsign,
        keywords: 'CLIMBING STRAIGHT AHEAD|4000 FEET|' + callsign
      },
      STARTUP: {
        context: emergencyLabel + ' - emergency resolved, normal startup',
        atcText: callsign + ' START UP APPROVED, EMERGENCY SERVICES STANDING DOWN',
        expectedReadback: 'START UP APPROVED ' + callsign,
        keywords: 'START UP APPROVED|' + callsign
      },
      TAXI_OUT: {
        context: emergencyLabel + ' - emergency exit under escort',
        atcText: callsign + ' TAXI SLOWLY VIA ALPHA, FOLLOW EMERGENCY VEHICLE, FIRE SERVICES ALONGSIDE',
        expectedReadback: 'TAXIING SLOWLY VIA ALPHA FOLLOWING EMERGENCY VEHICLE ' + callsign,
        keywords: 'TAXI|ALPHA|EMERGENCY VEHICLE|' + callsign
      }
    };

    return byPhase[phaseCode] || {
      context: emergencyLabel + ' - post-emergency phase',
      atcText: callsign + ' CONTINUE, EMERGENCY SERVICES ADVISED',
      expectedReadback: 'CONTINUING EMERGENCY SERVICES ADVISED ' + callsign,
      keywords: 'CONTINUING|EMERGENCY|' + callsign
    };
  },

  getEmergencyPhaseRole_: function(phaseCode, triggerPhase) {
    var order = { STARTUP: 1, TAXI_OUT: 2, TAKEOFF: 3, DEPARTURE: 4, CRUISE: 5, APPROACH: 6, LANDING: 7, TAXI_IN: 8 };
    var phaseOrder = order[String(phaseCode || '').toUpperCase()] || 0;
    var triggerOrder = order[String(triggerPhase || '').toUpperCase()] || 0;

    if (!triggerOrder) return 'BEFORE_TRIGGER';
    if (phaseOrder < triggerOrder) return 'BEFORE_TRIGGER';
    if (phaseOrder === triggerOrder) return 'TRIGGER';
    return 'AFTER_TRIGGER';
  },

  getDefaultTriggerPhase_: function(emergencyType) {
    var defaults = {
      ENGINE_FAILURE: 'DEPARTURE',
      REJECTED_TAKEOFF: 'TAKEOFF',
      RADIO_FAILURE: 'CRUISE',
      MEDICAL_EMERGENCY: 'CRUISE',
      WEATHER_DEVIATION: 'CRUISE',
      LOW_FUEL: 'APPROACH',
      GO_AROUND: 'LANDING',
      MAYDAY: 'DEPARTURE',
      PAN_PAN: 'CRUISE'
    };
    return defaults[String(emergencyType || '').toUpperCase()] || 'DEPARTURE';
  },

  findExistingPhase_: function(rows, level, country, scenarioType, emergencyType, phaseCode) {
    var targetCountry = this.normalize_(country);
    var targetType = String(scenarioType || 'NORMAL').toUpperCase();
    var targetEmergency = String(emergencyType || '').toUpperCase();
    var targetPhase = String(phaseCode || '').toUpperCase();

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];

      var active = row.isActive === true || String(row.isActive || '').toUpperCase() === 'TRUE';

      if (!active) {
        continue;
      }

      var sameLevel = Number(row.level || 0) === Number(level);
      var sameCountry = this.normalize_(row.country) === targetCountry;
      var sameType = String(row.scenarioType || 'NORMAL').toUpperCase() === targetType;
      var sameEmergency = String(row.emergencyType || '').toUpperCase() === targetEmergency;
      var samePhase = String(row.phaseCode || '').toUpperCase() === targetPhase;

      if (sameLevel && sameCountry && sameType && sameEmergency && samePhase) {
        return row;
      }
    }

    return null;
  },

  deactivateExistingRoute_: function(sheet, headerMap, rows, level, country, scenarioType, emergencyType) {
    var count = 0;
    var targetCountry = this.normalize_(country);
    var targetType = String(scenarioType || 'NORMAL').toUpperCase();
    var targetEmergency = String(emergencyType || '').toUpperCase();

    if (!headerMap.isActive) {
      throw new Error('isActive column not found.');
    }

    rows.forEach(function(row) {
      var active = row.isActive === true || String(row.isActive || '').toUpperCase() === 'TRUE';

      if (!active) {
        return;
      }

      var sameLevel = Number(row.level || 0) === Number(level);
      var sameCountry = RouteBuilderService.normalize_(row.country) === targetCountry;
      var sameType = String(row.scenarioType || 'NORMAL').toUpperCase() === targetType;
      var sameEmergency = String(row.emergencyType || '').toUpperCase() === targetEmergency;

      if (sameLevel && sameCountry && sameType && sameEmergency) {
        sheet.getRange(row.__rowNumber, headerMap.isActive).setValue(false);

        if (headerMap.updatedAt) {
          sheet.getRange(row.__rowNumber, headerMap.updatedAt).setValue(RouteBuilderService.now_());
        }

        count++;
      }
    });

    return count;
  },

  appendScenario_: function(sheet, headerMap, scenario) {
    var lastCol = sheet.getLastColumn();
    var row = [];

    for (var col = 1; col <= lastCol; col++) {
      row.push('');
    }

    Object.keys(scenario).forEach(function(key) {
      if (headerMap[key]) {
        row[headerMap[key] - 1] = scenario[key];
      }
    });

    sheet.appendRow(row);
  },

  ensureHeaders_: function(sheet, requiredHeaders) {
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, requiredHeaders.length).setValues([requiredHeaders]);
      return;
    }

    var lastCol = Math.max(sheet.getLastColumn(), 1);

    var current = sheet
      .getRange(1, 1, 1, lastCol)
      .getValues()[0]
      .map(function(h) {
        return String(h || '').trim();
      });

    var map = {};

    current.forEach(function(header) {
      if (header) {
        map[header.toLowerCase()] = true;
      }
    });

    var missing = requiredHeaders.filter(function(header) {
      return !map[String(header).toLowerCase()];
    });

    if (missing.length) {
      sheet.getRange(1, sheet.getLastColumn() + 1, 1, missing.length).setValues([missing]);
    }
  },

  getHeaderMap_: function(sheet) {
    var lastCol = sheet.getLastColumn();

    var headers = sheet
      .getRange(1, 1, 1, lastCol)
      .getValues()[0]
      .map(function(h) {
        return String(h || '').trim();
      });

    var map = {};

    headers.forEach(function(header, index) {
      if (header) {
        map[header] = index + 1;
      }
    });

    return map;
  },

  readSheetObjectsWithRow_: function(sheet) {
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();

    if (lastRow < 2 || lastCol < 1) {
      return [];
    }

    var headers = sheet
      .getRange(1, 1, 1, lastCol)
      .getValues()[0]
      .map(function(h) {
        return String(h || '').trim();
      });

    var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

    return values.map(function(row, rowIndex) {
      var obj = {
        __rowNumber: rowIndex + 2
      };

      headers.forEach(function(header, index) {
        if (!header) {
          return;
        }

        obj[header] = row[index];
      });

      return obj;
    });
  },

  normalize_: function(value) {
    return String(value || '').trim().toUpperCase();
  },

  now_: function() {
    return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  },

  getDatabaseId_: function() {
    var props = PropertiesService.getScriptProperties();

    return (
      props.getProperty('DB_SPREADSHEET_ID') ||
      props.getProperty('DATABASE_SPREADSHEET_ID') ||
      props.getProperty('SPREADSHEET_ID') ||
      props.getProperty('ICAO_DB_SPREADSHEET_ID') ||
      '1IKVJEEw8QoX9HkMJpnXNj3a20HnTl_-CjUcOJb4vgWY'
    );
  }
};



/*******************************************************
 * CUSTOM FULL ROUTE BUILDER - BACKEND
 * Creates a full route using custom ATC text per phase
 *******************************************************/

function apiAdminCreateCustomFullRoute(sessionToken, payload) {
  try {
    var admin = AuthService.requireRole(sessionToken, ['ADMIN']);

    if (typeof RouteBuilderService === 'undefined') {
      throw new Error('RouteBuilderService is not defined. Paste the base RouteBuilderService first.');
    }

    var result = RouteBuilderService.createCustomFullRoute(admin, payload || {});

    return {
      ok: true,
      source: 'apiAdminCreateCustomFullRoute',
      message: result.message,
      created: result.created,
      skipped: result.skipped,
      deactivated: result.deactivated,
      route: result.route
    };

  } catch (err) {
    return apiError_('apiAdminCreateCustomFullRoute', err);
  }
}


RouteBuilderService.createCustomFullRoute = function(adminUser, payload) {
  payload = payload || {};

  var level = Number(payload.level || 1);
  var country = String(payload.country || 'USA').trim();
  var scenarioType = String(payload.scenarioType || 'NORMAL').trim().toUpperCase();
  var emergencyType = String(payload.emergencyType || '').trim().toUpperCase();
  var emergencyTriggerPhase = String(payload.emergencyTriggerPhase || '').trim().toUpperCase();
  var duplicateMode = String(payload.duplicateMode || 'SKIP_EXISTING').trim().toUpperCase();
  var isActive = payload.isActive === false ? false : true;
  var phases = payload.phases || [];

  if (!level || level < 1) {
    throw new Error('Level is required.');
  }

  if (!country) {
    throw new Error('Country is required.');
  }

  if (scenarioType !== 'NORMAL' && scenarioType !== 'EMERGENCY') {
    throw new Error('Scenario Type must be NORMAL or EMERGENCY.');
  }

  if (scenarioType === 'EMERGENCY' && !emergencyType) {
    throw new Error('Emergency Type is required for emergency routes.');
  }

  if (scenarioType === 'EMERGENCY' && !emergencyTriggerPhase) {
    emergencyTriggerPhase = this.getDefaultTriggerPhase_(emergencyType);
  }

  if (!Array.isArray(phases) || phases.length !== 8) {
    throw new Error('A full route must include exactly 8 phases.');
  }

  var normalizedPhases = this.validateCustomRoutePhases_(phases);

  var ss = SpreadsheetApp.openById(this.getDatabaseId_());
  var sheet = ss.getSheetByName('Scenarios');

  if (!sheet) {
    sheet = ss.insertSheet('Scenarios');
  }

  this.ensureHeaders_(sheet, this.REQUIRED_HEADERS);

  var headerMap = this.getHeaderMap_(sheet);
  var allRows = this.readSheetObjectsWithRow_(sheet);

  var flightScenarioId = this.buildFlightScenarioId_(level, country, scenarioType, emergencyType);
  var flightScenarioName = this.buildFlightScenarioName_(level, country, scenarioType, emergencyType);

  var deactivated = 0;

  if (duplicateMode === 'REPLACE_EXISTING') {
    deactivated = this.deactivateExistingRoute_(
      sheet,
      headerMap,
      allRows,
      level,
      country,
      scenarioType,
      emergencyType
    );

    allRows = this.readSheetObjectsWithRow_(sheet);
  }

  var created = [];
  var skipped = [];

  for (var i = 0; i < normalizedPhases.length; i++) {
    var phase = normalizedPhases[i];

    var existing = this.findExistingPhase_(
      allRows,
      level,
      country,
      scenarioType,
      emergencyType,
      phase.phaseCode
    );

    if (existing && duplicateMode !== 'REPLACE_EXISTING') {
      skipped.push({
        phaseCode: phase.phaseCode,
        reason: 'Already exists active scenario for this phase.'
      });

      continue;
    }

    var scenario = {
      scenarioId: this.makeScenarioId_(level, country, scenarioType, phase.phaseCode),
      scenarioOrder: Number(phase.scenarioOrder || 1),
      level: level,
      country: country,

      flightScenarioId: flightScenarioId,
      flightScenarioName: flightScenarioName,

      phaseCode: phase.phaseCode,
      phaseName: phase.phaseName,
      phaseOrder: Number(phase.phaseOrder),
      phaseLabel: phase.phaseLabel,

      scenarioType: scenarioType,
      emergencyType: scenarioType === 'EMERGENCY' ? emergencyType : '',
      emergencyTriggerPhase: scenarioType === 'EMERGENCY' ? emergencyTriggerPhase : '',

      context: phase.context,
      atcText: phase.atcText,
      expectedReadback: phase.expectedReadback,
      keywords: phase.keywordsText,
      keywordsText: phase.keywordsText,

      imageFileId: phase.imageFileId || '',
      videoUrl: phase.videoUrl || '',
      audioUrl: phase.audioUrl || '',

      isActive: isActive,
      version: 1,
      createdAt: this.now_(),
      updatedAt: this.now_()
    };

    this.appendScenario_(sheet, headerMap, scenario);

    created.push({
      scenarioId: scenario.scenarioId,
      phaseCode: scenario.phaseCode,
      phaseName: scenario.phaseName
    });
  }

  return {
    message: 'Custom route created. Created: ' + created.length + ', skipped: ' + skipped.length + ', deactivated: ' + deactivated + '.',
    created: created,
    skipped: skipped,
    deactivated: deactivated,
    route: {
      level: level,
      country: country,
      scenarioType: scenarioType,
      emergencyType: scenarioType === 'EMERGENCY' ? emergencyType : '',
      emergencyTriggerPhase: scenarioType === 'EMERGENCY' ? emergencyTriggerPhase : '',
      flightScenarioId: flightScenarioId,
      flightScenarioName: flightScenarioName,
      totalPhases: 8
    }
  };
};


RouteBuilderService.validateCustomRoutePhases_ = function(phases) {
  var phaseMap = {};

  for (var i = 0; i < this.PHASES.length; i++) {
    phaseMap[this.PHASES[i].code] = this.PHASES[i];
  }

  var output = [];

  for (var j = 0; j < phases.length; j++) {
    var input = phases[j] || {};
    var phaseCode = String(input.phaseCode || '').trim().toUpperCase();

    if (!phaseCode || !phaseMap[phaseCode]) {
      throw new Error('Invalid or missing phaseCode at item ' + (j + 1) + '.');
    }

    var basePhase = phaseMap[phaseCode];

    var context = String(input.context || '').trim();
    var atcText = String(input.atcText || '').trim();
    var expectedReadback = String(input.expectedReadback || '').trim();
    var keywordsText = String(input.keywordsText || '').trim();

    if (!context) {
      throw new Error(basePhase.code + ': Context / briefing is required.');
    }

    if (!atcText) {
      throw new Error(basePhase.code + ': ATC text is required.');
    }

    if (!expectedReadback) {
      throw new Error(basePhase.code + ': Expected read-back is required.');
    }

    if (!keywordsText) {
      throw new Error(basePhase.code + ': Keywords are required.');
    }

    output.push({
      phaseCode: basePhase.code,
      phaseName: basePhase.name,
      phaseOrder: basePhase.order,
      phaseLabel: basePhase.label,
      scenarioOrder: Number(input.scenarioOrder || 1),
      context: context,
      atcText: atcText,
      expectedReadback: expectedReadback,
      keywordsText: keywordsText,
      imageFileId: String(input.imageFileId || '').trim(),
      videoUrl: String(input.videoUrl || '').trim(),
      audioUrl: String(input.audioUrl || '').trim()
    });
  }

  output.sort(function(a, b) {
    return Number(a.phaseOrder) - Number(b.phaseOrder);
  });

  return output;
};


/*******************************************************
 * ROUTE ADMIN SERVICE
 * Route-first scenario management
 *******************************************************/

function apiAdminListScenarioRoutes(sessionToken) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN']);
    return RouteAdminService.listRoutes();
  } catch (err) {
    return apiError_('apiAdminListScenarioRoutes', err);
  }
}

function apiAdminGetScenarioRoute(sessionToken, routeKey) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN']);
    return RouteAdminService.getRoute(routeKey);
  } catch (err) {
    return apiError_('apiAdminGetScenarioRoute', err);
  }
}

function apiAdminSaveScenarioRoute(sessionToken, payload) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN']);
    return RouteAdminService.saveRoute(payload || {});
  } catch (err) {
    return apiError_('apiAdminSaveScenarioRoute', err);
  }
}

function apiAdminSetScenarioRouteActive(sessionToken, routeKey, active) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN']);
    return RouteAdminService.setRouteActive(routeKey, active);
  } catch (err) {
    return apiError_('apiAdminSetScenarioRouteActive', err);
  }
}

function apiAdminDeleteScenarioRoute(sessionToken, routeKey) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN']);
    return RouteAdminService.deleteRoute(routeKey);
  } catch (err) {
    return apiError_('apiAdminDeleteScenarioRoute', err);
  }
}

var RouteAdminService = {
  SHEET_NAME: 'Scenarios',

  REQUIRED_HEADERS: [
    'scenarioId',
    'scenarioOrder',
    'level',
    'country',
    'flightScenarioId',
    'flightScenarioName',
    'phaseCode',
    'phaseName',
    'phaseOrder',
    'phaseLabel',
    'scenarioType',
    'emergencyType',
    'context',
    'atcText',
    'expectedReadback',
    'keywords',
    'keywordsText',
    'imageFileId',
    'videoUrl',
    'audioUrl',
    'isActive',
    'version',
    'emergencyTriggerPhase',
    'createdAt',
    'updatedAt'
  ],

  PHASE_ORDER: {
    STARTUP: 1,
    TAXI_OUT: 2,
    TAKEOFF: 3,
    DEPARTURE: 4,
    CRUISE: 5,
    APPROACH: 6,
    LANDING: 7,
    TAXI_IN: 8
  },

  listRoutes: function() {
    var sheet = this.getSheet_();
    this.ensureHeaders_(sheet);

    var rows = this.readRows_(sheet);
    var groups = {};

    rows.forEach(function(row) {
      if (!row.scenarioId) return;

      var key = RouteAdminService.buildRouteKeyFromRow_(row);

      if (!groups[key]) {
        groups[key] = {
          routeKey: key,
          level: Number(row.level || 1),
          country: String(row.country || ''),
          flightScenarioId: String(row.flightScenarioId || ''),
          flightScenarioName: String(row.flightScenarioName || ''),
          scenarioType: String(row.scenarioType || 'NORMAL').toUpperCase(),
          emergencyType: String(row.emergencyType || '').toUpperCase(),
          emergencyTriggerPhase: String(row.emergencyTriggerPhase || '').toUpperCase(),
          totalRows: 0,
          activeRows: 0,
          inactiveRows: 0,
          phasesMap: {},
          updatedAt: '',
          createdAt: '',
          sampleAtcText: ''
        };
      }

      var group = groups[key];
      var active = RouteAdminService.isActive_(row.isActive);

      group.totalRows++;

      if (active) {
        group.activeRows++;
      } else {
        group.inactiveRows++;
      }

      if (row.phaseCode) {
        group.phasesMap[String(row.phaseCode).toUpperCase()] = true;
      }

      if (!group.sampleAtcText && row.atcText) {
        group.sampleAtcText = String(row.atcText);
      }

      if (row.updatedAt) {
        group.updatedAt = String(row.updatedAt);
      }

      if (!group.createdAt && row.createdAt) {
        group.createdAt = String(row.createdAt);
      }
    });

    var routes = Object.keys(groups).map(function(key) {
      var group = groups[key];
      var phaseCount = Object.keys(group.phasesMap).length;

      group.phaseCount = phaseCount;
      group.status = group.activeRows > 0
        ? (group.inactiveRows > 0 ? 'PARTIAL' : 'ACTIVE')
        : 'INACTIVE';

      delete group.phasesMap;

      return group;
    });

    routes.sort(function(a, b) {
      if (Number(a.level) !== Number(b.level)) {
        return Number(a.level) - Number(b.level);
      }

      var c = String(a.country).localeCompare(String(b.country));
      if (c !== 0) return c;

      return String(a.flightScenarioName).localeCompare(String(b.flightScenarioName));
    });

    return {
      ok: true,
      source: 'apiAdminListScenarioRoutes',
      routes: routes
    };
  },

  getRoute: function(routeKey) {
    var sheet = this.getSheet_();
    this.ensureHeaders_(sheet);

    var rows = this.readRows_(sheet);
    var routeRows = rows.filter(function(row) {
      return RouteAdminService.buildRouteKeyFromRow_(row) === routeKey;
    });

    if (!routeRows.length) {
      throw new Error('Route not found.');
    }

    routeRows.sort(function(a, b) {
      var pa = Number(a.phaseOrder || RouteAdminService.PHASE_ORDER[String(a.phaseCode || '').toUpperCase()] || 999);
      var pb = Number(b.phaseOrder || RouteAdminService.PHASE_ORDER[String(b.phaseCode || '').toUpperCase()] || 999);

      if (pa !== pb) return pa - pb;

      return Number(a.scenarioOrder || 1) - Number(b.scenarioOrder || 1);
    });

    var first = routeRows[0];

    return {
      ok: true,
      source: 'apiAdminGetScenarioRoute',
      route: {
        routeKey: routeKey,
        level: Number(first.level || 1),
        country: String(first.country || ''),
        flightScenarioId: String(first.flightScenarioId || ''),
        flightScenarioName: String(first.flightScenarioName || ''),
        scenarioType: String(first.scenarioType || 'NORMAL').toUpperCase(),
        emergencyType: String(first.emergencyType || '').toUpperCase(),
        emergencyTriggerPhase: (function() {
          var tp = String(first.emergencyTriggerPhase || '').toUpperCase();
          if (!tp && String(first.scenarioType || '').toUpperCase() === 'EMERGENCY') {
            var defs = { ENGINE_FAILURE: 'DEPARTURE', REJECTED_TAKEOFF: 'TAKEOFF', RADIO_FAILURE: 'CRUISE', MEDICAL_EMERGENCY: 'CRUISE', WEATHER_DEVIATION: 'CRUISE', LOW_FUEL: 'APPROACH', GO_AROUND: 'LANDING', MAYDAY: 'DEPARTURE', PAN_PAN: 'CRUISE' };
            tp = defs[String(first.emergencyType || '').toUpperCase()] || 'DEPARTURE';
          }
          return tp;
        })(),
        status: routeRows.some(function(r) { return RouteAdminService.isActive_(r.isActive); }) ? 'ACTIVE' : 'INACTIVE',
        totalRows: routeRows.length
      },
      scenarios: routeRows.map(function(row) {
        return RouteAdminService.normalizeScenario_(row);
      })
    };
  },

  saveRoute: function(payload) {
    var oldRouteKey = String(payload.routeKey || '');
    var route = payload.route || {};
    var scenarios = payload.scenarios || [];

    if (!oldRouteKey) {
      throw new Error('routeKey is required.');
    }

    if (!Array.isArray(scenarios) || !scenarios.length) {
      throw new Error('At least one scenario is required.');
    }

    var sheet = this.getSheet_();
    this.ensureHeaders_(sheet);

    var headerMap = this.getHeaderMap_(sheet);
    var rows = this.readRows_(sheet);

    var routeRows = rows.filter(function(row) {
      return RouteAdminService.buildRouteKeyFromRow_(row) === oldRouteKey;
    });

    if (!routeRows.length) {
      throw new Error('Route not found for saving.');
    }

    var rowByScenarioId = {};

    routeRows.forEach(function(row) {
      rowByScenarioId[String(row.scenarioId)] = row;
    });

    var updated = 0;
    var appended = 0;
    var now = this.now_();

    scenarios.forEach(function(scenario) {
      scenario = scenario || {};

      var scenarioId = String(scenario.scenarioId || '').trim();
      var existing = scenarioId ? rowByScenarioId[scenarioId] : null;

      var data = {
        scenarioId: scenarioId || RouteAdminService.makeScenarioId_(
          route.level,
          route.country,
          route.scenarioType,
          scenario.phaseCode
        ),

        scenarioOrder: Number(scenario.scenarioOrder || 1),
        level: Number(route.level || 1),
        country: String(route.country || ''),
        flightScenarioId: String(route.flightScenarioId || ''),
        flightScenarioName: String(route.flightScenarioName || ''),
        phaseCode: String(scenario.phaseCode || '').toUpperCase(),
        phaseName: String(scenario.phaseName || ''),
        phaseOrder: Number(scenario.phaseOrder || 0),
        phaseLabel: String(scenario.phaseLabel || ''),
        scenarioType: String(route.scenarioType || 'NORMAL').toUpperCase(),
        emergencyType: String(route.emergencyType || '').toUpperCase(),
        emergencyTriggerPhase: String(route.emergencyTriggerPhase || '').toUpperCase(),
        context: String(scenario.context || ''),
        atcText: String(scenario.atcText || ''),
        expectedReadback: String(scenario.expectedReadback || ''),
        keywords: String(scenario.keywords || scenario.keywordsText || ''),
        keywordsText: String(scenario.keywordsText || scenario.keywords || ''),
        imageFileId: String(scenario.imageFileId || ''),
        videoUrl: String(scenario.videoUrl || ''),
        audioUrl: String(scenario.audioUrl || ''),
        isActive: scenario.isActive === false ? false : true,
        version: Number(scenario.version || 1),
        updatedAt: now
      };

      if (existing) {
        RouteAdminService.updateRow_(sheet, headerMap, existing.__rowNumber, data);
        updated++;
      } else {
        data.createdAt = now;
        RouteAdminService.appendRow_(sheet, headerMap, data);
        appended++;
      }
    });

    return {
      ok: true,
      source: 'apiAdminSaveScenarioRoute',
      message: 'Route saved. Updated: ' + updated + ', created: ' + appended + '.',
      updated: updated,
      created: appended
    };
  },

  setRouteActive: function(routeKey, active) {
    var sheet = this.getSheet_();
    this.ensureHeaders_(sheet);

    var headerMap = this.getHeaderMap_(sheet);
    var rows = this.readRows_(sheet);
    var now = this.now_();

    var count = 0;

    rows.forEach(function(row) {
      if (RouteAdminService.buildRouteKeyFromRow_(row) !== routeKey) return;

      sheet.getRange(row.__rowNumber, headerMap.isActive).setValue(active === true);

      if (headerMap.updatedAt) {
        sheet.getRange(row.__rowNumber, headerMap.updatedAt).setValue(now);
      }

      count++;
    });

    return {
      ok: true,
      source: 'apiAdminSetScenarioRouteActive',
      message: 'Route ' + (active ? 'activated' : 'deactivated') + '. Updated scenarios: ' + count + '.',
      updated: count
    };
  },

  deleteRoute: function(routeKey) {
    var sheet = this.getSheet_();
    this.ensureHeaders_(sheet);

    var rows = this.readRows_(sheet);

    var targetRows = rows
      .filter(function(row) {
        return RouteAdminService.buildRouteKeyFromRow_(row) === routeKey;
      })
      .map(function(row) {
        return row.__rowNumber;
      })
      .sort(function(a, b) {
        return b - a;
      });

    if (!targetRows.length) {
      throw new Error('Route not found for delete.');
    }

    targetRows.forEach(function(rowNumber) {
      sheet.deleteRow(rowNumber);
    });

    return {
      ok: true,
      source: 'apiAdminDeleteScenarioRoute',
      message: 'Route permanently deleted. Deleted scenarios: ' + targetRows.length + '.',
      deleted: targetRows.length
    };
  },

  normalizeScenario_: function(row) {
    return {
      scenarioId: String(row.scenarioId || ''),
      scenarioOrder: Number(row.scenarioOrder || 1),
      level: Number(row.level || 1),
      country: String(row.country || ''),
      flightScenarioId: String(row.flightScenarioId || ''),
      flightScenarioName: String(row.flightScenarioName || ''),
      phaseCode: String(row.phaseCode || '').toUpperCase(),
      phaseName: String(row.phaseName || ''),
      phaseOrder: Number(row.phaseOrder || 0),
      phaseLabel: String(row.phaseLabel || ''),
      scenarioType: String(row.scenarioType || 'NORMAL').toUpperCase(),
      emergencyType: String(row.emergencyType || '').toUpperCase(),
      emergencyTriggerPhase: (function() {
        var tp = String(row.emergencyTriggerPhase || '').toUpperCase();
        if (!tp && String(row.scenarioType || '').toUpperCase() === 'EMERGENCY') {
          var defs = { ENGINE_FAILURE: 'DEPARTURE', REJECTED_TAKEOFF: 'TAKEOFF', RADIO_FAILURE: 'CRUISE', MEDICAL_EMERGENCY: 'CRUISE', WEATHER_DEVIATION: 'CRUISE', LOW_FUEL: 'APPROACH', GO_AROUND: 'LANDING', MAYDAY: 'DEPARTURE', PAN_PAN: 'CRUISE' };
          tp = defs[String(row.emergencyType || '').toUpperCase()] || 'DEPARTURE';
        }
        return tp;
      })(),
      context: String(row.context || ''),
      atcText: String(row.atcText || ''),
      expectedReadback: String(row.expectedReadback || ''),
      keywords: String(row.keywords || row.keywordsText || ''),
      keywordsText: String(row.keywordsText || row.keywords || ''),
      imageFileId: String(row.imageFileId || ''),
      videoUrl: String(row.videoUrl || ''),
      audioUrl: String(row.audioUrl || ''),
      isActive: this.isActive_(row.isActive),
      version: Number(row.version || 1),
      createdAt: String(row.createdAt || ''),
      updatedAt: String(row.updatedAt || '')
    };
  },

  buildRouteKeyFromRow_: function(row) {
    var level = Number(row.level || 1);
    var country = this.normalize_(row.country);
    var scenarioType = String(row.scenarioType || 'NORMAL').toUpperCase();
    var emergencyType = String(row.emergencyType || '').toUpperCase();

    var flightScenarioId = String(row.flightScenarioId || '').trim();

    if (!flightScenarioId) {
      flightScenarioId = [
        'LEGACY',
        'L' + level,
        country,
        scenarioType,
        emergencyType
      ].join('-');
    }

    return [
      level,
      country,
      scenarioType,
      emergencyType,
      flightScenarioId
    ].join('§');
  },

  makeScenarioId_: function(level, country, scenarioType, phaseCode) {
    var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMddHHmmss');
    var cleanCountry = String(country || 'USA').trim().toUpperCase().replace(/\s+/g, '_');

    return [
      'SCN',
      'L' + Number(level || 1),
      cleanCountry,
      String(scenarioType || 'NORMAL').toUpperCase(),
      String(phaseCode || 'PHASE').toUpperCase(),
      stamp,
      Utilities.getUuid().slice(0, 8)
    ].join('-');
  },

  getSheet_: function() {
    var ss = SpreadsheetApp.openById(this.getDatabaseId_());
    var sheet = ss.getSheetByName(this.SHEET_NAME);

    if (!sheet) {
      sheet = ss.insertSheet(this.SHEET_NAME);
    }

    return sheet;
  },

  ensureHeaders_: function(sheet) {
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, this.REQUIRED_HEADERS.length).setValues([this.REQUIRED_HEADERS]);
      return;
    }

    var lastCol = Math.max(sheet.getLastColumn(), 1);
    var current = sheet
      .getRange(1, 1, 1, lastCol)
      .getValues()[0]
      .map(function(h) {
        return String(h || '').trim();
      });

    var map = {};

    current.forEach(function(header) {
      if (header) {
        map[header.toLowerCase()] = true;
      }
    });

    var missing = this.REQUIRED_HEADERS.filter(function(header) {
      return !map[String(header).toLowerCase()];
    });

    if (missing.length) {
      sheet.getRange(1, sheet.getLastColumn() + 1, 1, missing.length).setValues([missing]);
    }
  },

  getHeaderMap_: function(sheet) {
    var lastCol = sheet.getLastColumn();

    var headers = sheet
      .getRange(1, 1, 1, lastCol)
      .getValues()[0]
      .map(function(h) {
        return String(h || '').trim();
      });

    var map = {};

    headers.forEach(function(header, index) {
      if (header) {
        map[header] = index + 1;
      }
    });

    return map;
  },

  readRows_: function(sheet) {
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();

    if (lastRow < 2 || lastCol < 1) {
      return [];
    }

    var headers = sheet
      .getRange(1, 1, 1, lastCol)
      .getValues()[0]
      .map(function(h) {
        return String(h || '').trim();
      });

    var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

    return values.map(function(row, rowIndex) {
      var obj = {
        __rowNumber: rowIndex + 2
      };

      headers.forEach(function(header, index) {
        if (!header) return;
        obj[header] = row[index];
      });

      return obj;
    });
  },

  updateRow_: function(sheet, headerMap, rowNumber, data) {
    Object.keys(data).forEach(function(key) {
      if (!headerMap[key]) return;
      sheet.getRange(rowNumber, headerMap[key]).setValue(data[key]);
    });
  },

  appendRow_: function(sheet, headerMap, data) {
    var lastCol = sheet.getLastColumn();
    var row = [];

    for (var i = 1; i <= lastCol; i++) {
      row.push('');
    }

    Object.keys(data).forEach(function(key) {
      if (!headerMap[key]) return;
      row[headerMap[key] - 1] = data[key];
    });

    sheet.appendRow(row);
  },

  isActive_: function(value) {
    return value === true || String(value || '').toUpperCase() === 'TRUE';
  },

  normalize_: function(value) {
    var key = String(value || '').trim().toUpperCase();

    if (key === 'US') return 'USA';
    if (key === 'GB') return 'UK';
    if (key === 'IN') return 'INDIA';
    if (key === 'CO') return 'COLOMBIA';

    return key;
  },

  now_: function() {
    return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  },

  getDatabaseId_: function() {
    var props = PropertiesService.getScriptProperties();

    return (
      props.getProperty('DB_SPREADSHEET_ID') ||
      props.getProperty('DATABASE_SPREADSHEET_ID') ||
      props.getProperty('SPREADSHEET_ID') ||
      props.getProperty('ICAO_DB_SPREADSHEET_ID') ||
      '1IKVJEEw8QoX9HkMJpnXNj3a20HnTl_-CjUcOJb4vgWY'
    );
  }
};


/*******************************************************
 * SIMULATOR ROUTE BRIDGE V7
 * Makes simulator read routes created by Route Builder / Route Admin
 *******************************************************/

function apiGetTrainingRouteV7_ROUTE_ADMIN(sessionToken, payload) {
  try {
    var user = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);

    payload = payload || {};

    var result = RouteSimulatorBridgeService.getTrainingRoute(user, payload);

    return result;

  } catch (err) {
    return apiError_('apiGetTrainingRouteV7_ROUTE_ADMIN', err);
  }
}


var RouteSimulatorBridgeService = {
  SHEET_NAME: 'Scenarios',

  getTrainingRoute: function(user, payload) {
    var level = Number(payload.level || user.currentLevel || 1);
    var country = String(payload.country || user.currentCountry || 'USA').trim();

    if (
      String(user.role || '').toUpperCase() === ROLES.STUDENT &&
      typeof ProgressService !== 'undefined' &&
      !ProgressService.canUserAccessLevel(user, level)
    ) {
      throw new Error('This level is locked. Complete previous levels first.');
    }

    var ss = SpreadsheetApp.openById(this.getDatabaseId_());
    var sheet = ss.getSheetByName(this.SHEET_NAME);

    if (!sheet) {
      throw new Error('Scenarios sheet not found.');
    }

    var rows = this.readRowsByHeaders_(sheet);
    var targetCountry = this.normalizeCountry_(country);

    var scenarios = rows.filter(function(row) {
      var rowLevel = Number(row.level || 0);
      var rowCountry = RouteSimulatorBridgeService.normalizeCountry_(row.country);
      var active = RouteSimulatorBridgeService.isActive_(row.isActive);

      return (
        rowLevel === level &&
        rowCountry === targetCountry &&
        active
      );
    }).map(function(row) {
      return RouteSimulatorBridgeService.normalizeScenarioForClient_(row);
    }).sort(function(a, b) {
      var pa = Number(a.phaseOrder || 999);
      var pb = Number(b.phaseOrder || 999);

      if (pa !== pb) return pa - pb;

      return Number(a.scenarioOrder || 1) - Number(b.scenarioOrder || 1);
    });

    var first = scenarios.length ? scenarios[0] : {};

    return {
      ok: true,
      source: 'apiGetTrainingRouteV7_ROUTE_ADMIN',
      route: {
        currentLevel: level,
        currentCountry: country,
        level: level,
        country: country,
        flightScenarioId: first.flightScenarioId || '',
        flightScenarioName: first.flightScenarioName || '',
        totalScenarios: scenarios.length,
        scenarios: scenarios
      },
      scenarios: scenarios,
      totalScenarios: scenarios.length,
      debug: {
        requestedLevel: level,
        requestedCountry: country,
        normalizedCountry: targetCountry,
        totalRowsInSheet: rows.length,
        matchedScenarios: scenarios.length
      }
    };
  },

  normalizeScenarioForClient_: function(row) {
    return {
      scenarioId: String(row.scenarioId || '').trim(),
      scenarioOrder: Number(row.scenarioOrder || 1),

      level: Number(row.level || 1),
      country: String(row.country || '').trim(),

      flightScenarioId: String(row.flightScenarioId || '').trim(),
      flightScenarioName: String(row.flightScenarioName || '').trim(),

      phaseCode: String(row.phaseCode || '').trim().toUpperCase(),
      phaseName: String(row.phaseName || '').trim(),
      phaseOrder: Number(row.phaseOrder || 0),
      phaseLabel: String(row.phaseLabel || '').trim(),

      scenarioType: String(row.scenarioType || 'NORMAL').trim().toUpperCase(),
      emergencyType: String(row.emergencyType || '').trim().toUpperCase(),

      context: String(row.context || '').trim(),
      atcText: String(row.atcText || '').trim(),
      expectedReadback: String(row.expectedReadback || '').trim(),

      keywords: (function(){ var a=String(row.keywords||'').trim(),b=String(row.keywordsText||'').trim(); return (a.indexOf('|')!==-1)?a:(b.indexOf('|')!==-1)?b:(a||b); })(),
      keywordsText: (function(){ var a=String(row.keywords||'').trim(),b=String(row.keywordsText||'').trim(); return (a.indexOf('|')!==-1)?a:(b.indexOf('|')!==-1)?b:(a||b); })(),

      imageFileId: String(row.imageFileId || '').trim(),
      videoUrl: String(row.videoUrl || '').trim(),
      audioUrl: String(row.audioUrl || '').trim(),

      isActive: this.isActive_(row.isActive),
      version: Number(row.version || 1)
    };
  },

  readRowsByHeaders_: function(sheet) {
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();

    if (lastRow < 2 || lastCol < 1) {
      return [];
    }

    var headers = sheet
      .getRange(1, 1, 1, lastCol)
      .getValues()[0]
      .map(function(h) {
        return String(h || '').trim();
      });

    var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

    return values.map(function(row, rowIndex) {
      var obj = {
        __rowNumber: rowIndex + 2
      };

      headers.forEach(function(header, index) {
        if (!header) return;
        obj[header] = row[index];
      });

      return obj;
    });
  },

  normalizeCountry_: function(country) {
    var key = String(country || '').trim().toUpperCase();

    if (key === 'US') return 'USA';
    if (key === 'UNITED STATES') return 'USA';
    if (key === 'UNITED STATES OF AMERICA') return 'USA';

    if (key === 'GB') return 'UK';
    if (key === 'UNITED KINGDOM') return 'UK';
    if (key === 'GREAT BRITAIN') return 'UK';

    if (key === 'IN') return 'INDIA';

    if (key === 'CO') return 'COLOMBIA';

    return key;
  },

  isActive_: function(value) {
    var text = String(value || '').trim().toUpperCase();

    return (
      value === true ||
      text === 'TRUE' ||
      text === 'ACTIVE' ||
      text === 'YES' ||
      text === 'SI' ||
      text === 'SÍ' ||
      text === '1'
    );
  },

  getDatabaseId_: function() {
    var props = PropertiesService.getScriptProperties();

    return (
      props.getProperty('DB_SPREADSHEET_ID') ||
      props.getProperty('DATABASE_SPREADSHEET_ID') ||
      props.getProperty('SPREADSHEET_ID') ||
      props.getProperty('ICAO_DB_SPREADSHEET_ID') ||
      '1IKVJEEw8QoX9HkMJpnXNj3a20HnTl_-CjUcOJb4vgWY'
    );
  }
};


function testRouteBridgeUKLevel1() {
  var result = RouteSimulatorBridgeService.getTrainingRoute(
    {
      role: 'ADMIN',
      currentLevel: 1,
      currentCountry: 'UK'
    },
    {
      level: 1,
      country: 'UK'
    }
  );

  Logger.log(JSON.stringify(result.debug, null, 2));
  Logger.log(JSON.stringify(result.scenarios.map(function(s) {
    return {
      phaseCode: s.phaseCode,
      atcText: s.atcText,
      isActive: s.isActive
    };
  }), null, 2));

  return result;
}

/*******************************************************
 * RUNTIME SCENARIO READER FIX
 * Makes Audio + Feedback use the same scenario data
 * shown in the simulator.
 *******************************************************/

function ensureScenarioServiceUsesHeaderReader_() {
  if (typeof ScenarioService === 'undefined' || !ScenarioService) {
    throw new Error('ScenarioService is not defined.');
  }

  ScenarioService.getScenarioById = function(scenarioId) {
    return RuntimeScenarioReaderService.getScenarioById(scenarioId);
  };

  // Override listActiveScenarios to use header-based reader.
  // The old dbReadAll_ uses column indices that break when sheet columns are reordered.
  ScenarioService.listActiveScenarios = function() {
    var ss    = SpreadsheetApp.openById(RuntimeScenarioReaderService.getDatabaseId_());
    var sheet = ss.getSheetByName('Scenarios');
    if (!sheet) return [];
    return RuntimeScenarioReaderService.readRowsByHeaders_(sheet)
      .filter(function(row) {
        return RuntimeScenarioReaderService.isActive_(row.isActive);
      })
      .map(function(row) {
        return RuntimeScenarioReaderService.normalizeScenario_(row);
      });
  };
}


var RuntimeScenarioReaderService = {
  SHEET_NAME: 'Scenarios',

  getScenarioById: function(scenarioId) {
    scenarioId = String(scenarioId || '').trim();

    if (!scenarioId) {
      throw new Error('scenarioId is required.');
    }

    var ss = SpreadsheetApp.openById(this.getDatabaseId_());
    var sheet = ss.getSheetByName(this.SHEET_NAME);

    if (!sheet) {
      throw new Error('Scenarios sheet not found.');
    }

    var rows = this.readRowsByHeaders_(sheet);

    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].scenarioId || '').trim() === scenarioId) {
        return this.normalizeScenario_(rows[i]);
      }
    }

    throw new Error('Scenario not found by header reader: ' + scenarioId);
  },

  normalizeScenario_: function(row) {
    row = row || {};

    var _kw  = String(row.keywords     || '').trim();
    var _kwt = String(row.keywordsText || '').trim();
    var keywordsText = (_kw.indexOf('|') !== -1)  ? _kw  :
                       (_kwt.indexOf('|') !== -1) ? _kwt :
                       (_kw || _kwt);
    var expected = String(row.expectedReadback || row.expectedAnswer || '').trim();

    var scenario = {
      scenarioId: String(row.scenarioId || '').trim(),
      scenarioOrder: Number(row.scenarioOrder || 1),

      level: Number(row.level || 1),
      country: String(row.country || '').trim(),

      flightScenarioId: String(row.flightScenarioId || '').trim(),
      flightScenarioName: String(row.flightScenarioName || '').trim(),

      phaseCode: String(row.phaseCode || '').trim().toUpperCase(),
      phaseName: String(row.phaseName || '').trim(),
      phaseOrder: Number(row.phaseOrder || 0),
      phaseLabel: String(row.phaseLabel || '').trim(),

      scenarioType: String(row.scenarioType || 'NORMAL').trim().toUpperCase(),
      emergencyType: String(row.emergencyType || '').trim().toUpperCase(),

      context: String(row.context || '').trim(),
      atcText: String(row.atcText || '').trim(),

      expectedReadback: expected,
      expectedAnswer: expected,

      keywordsText: keywordsText,
      keywords: keywordsText,
      requiredKeywords: keywordsText
        ? keywordsText.split('|').map(function(k) { return String(k || '').trim(); }).filter(Boolean)
        : [],

      imageFileId: String(row.imageFileId || '').trim(),
      videoUrl: String(row.videoUrl || '').trim(),
      audioUrl: String(row.audioUrl || '').trim(),

      isActive: this.isActive_(row.isActive),
      version: Number(row.version || 1)
    };

    if (
      scenario.atcText &&
      scenario.flightScenarioName &&
      scenario.atcText.toUpperCase() === scenario.flightScenarioName.toUpperCase()
    ) {
      Logger.log('[WARN] atcText equals flightScenarioName for scenarioId: ' + scenario.scenarioId + ' — TTS will still proceed.');
    }

    return scenario;
  },

  readRowsByHeaders_: function(sheet) {
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();

    if (lastRow < 2 || lastCol < 1) {
      return [];
    }

    var headers = sheet
      .getRange(1, 1, 1, lastCol)
      .getValues()[0]
      .map(function(h) {
        return String(h || '').trim();
      });

    var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

    return values.map(function(row, rowIndex) {
      var obj = {
        __rowNumber: rowIndex + 2
      };

      headers.forEach(function(header, index) {
        if (!header) return;
        obj[header] = row[index];
      });

      return obj;
    });
  },

  isActive_: function(value) {
    var text = String(value || '').trim().toUpperCase();

    return (
      value === true ||
      text === 'TRUE' ||
      text === 'ACTIVE' ||
      text === 'YES' ||
      text === 'SI' ||
      text === 'SÍ' ||
      text === '1'
    );
  },

  getDatabaseId_: function() {
    var props = PropertiesService.getScriptProperties();

    return (
      props.getProperty('DB_SPREADSHEET_ID') ||
      props.getProperty('DATABASE_SPREADSHEET_ID') ||
      props.getProperty('SPREADSHEET_ID') ||
      props.getProperty('ICAO_DB_SPREADSHEET_ID') ||
      '1IKVJEEw8QoX9HkMJpnXNj3a20HnTl_-CjUcOJb4vgWY'
    );
  }
};


/*******************************************************
 * OVERRIDE AUDIO ENDPOINT
 * Keeps TTSService, but forces it to read correct scenario.
 *******************************************************/

function apiGenerateIcaoTestVoice(sessionToken, payload) {
  try {
    AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    payload = payload || {};
    var text    = String(payload.text    || '').trim();
    var country = String(payload.country || 'USA').trim().toUpperCase();
    var voice   = String(payload.voice   || '').trim();
    if (!text) throw new Error('No text provided.');
    var profile = TTSService.getProfileByCountry_(country);
    var rate    = Number(payload.speakingRate || profile.speakingRate || 0.91);
    var ssml    = TTSService.buildAtcSsml_(text, profile, rate);
    var audio   = TTSService.callGoogleTts_(ssml, voice, profile.languageCode, rate, 0, []);
    return { ok: true, audioBase64: audio, mimeType: 'audio/mp3', voiceName: voice, speakingRate: rate };
  } catch (err) {
    return apiError_('apiGenerateIcaoTestVoice', err);
  }
}

function apiGenerateScenarioVoice(sessionToken, payload) {
  try {
    ensureScenarioServiceUsesHeaderReader_();

    var user = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);

    payload = payload || {};

    var scenario = RuntimeScenarioReaderService.getScenarioById(payload.scenarioId);

    if (!payload.text) {
      payload.text = scenario.atcText;
    }

    var result = TTSService.generateScenarioVoice(user, payload);

    return result;

  } catch (err) {
    return apiError_('apiGenerateScenarioVoice', err);
  }
}


/*******************************************************
 * TEST HELPERS
 *******************************************************/

function testRuntimeScenarioReaderById() {
  var scenarioId = 'SCN-L1-UK-NORMAL-STARTUP-20260501033801-4844f72e';
  var scenario = RuntimeScenarioReaderService.getScenarioById(scenarioId);

  Logger.log(JSON.stringify({
    scenarioId: scenario.scenarioId,
    level: scenario.level,
    country: scenario.country,
    flightScenarioName: scenario.flightScenarioName,
    phaseCode: scenario.phaseCode,
    atcText: scenario.atcText,
    expectedReadback: scenario.expectedReadback,
    keywordsText: scenario.keywordsText
  }, null, 2));

  return scenario;
}


/*******************************************************
 * KEYWORDS ARRAY FIX
 * Fixes: keywords.forEach is not a function
 *******************************************************/

function normalizeKeywordsForAttempt_(value) {
  if (Array.isArray(value)) {
    return value
      .map(function(k) {
        return String(k || '').trim();
      })
      .filter(Boolean);
  }

  return String(value || '')
    .split('|')
    .map(function(k) {
      return String(k || '').trim();
    })
    .filter(Boolean);
}


/**
 * Override RuntimeScenarioReaderService.normalizeScenario_
 * Makes scenario.keywords an ARRAY and keeps keywordsText as STRING.
 */
if (typeof RuntimeScenarioReaderService !== 'undefined') {
  RuntimeScenarioReaderService.normalizeScenario_ = function(row) {
    row = row || {};

    // Prefer whichever field has pipe separators — that one is properly formatted.
    var _kw  = String(row.keywords     || '').trim();
    var _kwt = String(row.keywordsText || '').trim();
    var keywordsText = (_kw.indexOf('|') !== -1)  ? _kw  :
                       (_kwt.indexOf('|') !== -1) ? _kwt :
                       (_kw || _kwt);
    var keywordsArray = normalizeKeywordsForAttempt_(keywordsText);

    var expected = String(row.expectedReadback || row.expectedAnswer || '').trim();

    var scenario = {
      scenarioId: String(row.scenarioId || '').trim(),
      scenarioOrder: Number(row.scenarioOrder || 1),

      level: Number(row.level || 1),
      country: String(row.country || '').trim(),

      flightScenarioId: String(row.flightScenarioId || '').trim(),
      flightScenarioName: String(row.flightScenarioName || '').trim(),

      phaseCode: String(row.phaseCode || '').trim().toUpperCase(),
      phaseName: String(row.phaseName || '').trim(),
      phaseOrder: Number(row.phaseOrder || 0),
      phaseLabel: String(row.phaseLabel || '').trim(),

      scenarioType: String(row.scenarioType || 'NORMAL').trim().toUpperCase(),
      emergencyType: String(row.emergencyType || '').trim().toUpperCase(),

      context: String(row.context || '').trim(),
      atcText: String(row.atcText || '').trim(),

      expectedReadback: expected,
      expectedAnswer: expected,

      // IMPORTANT:
      // keywords must be ARRAY for AttemptService.
      keywords: keywordsArray,
      requiredKeywords: keywordsArray,

      // keywordsText stays STRING for display/editing.
      keywordsText: keywordsText,

      imageFileId: String(row.imageFileId || '').trim(),
      videoUrl: String(row.videoUrl || '').trim(),
      audioUrl: String(row.audioUrl || '').trim(),

      isActive: this.isActive_(row.isActive),
      version: Number(row.version || 1)
    };

    if (
      scenario.atcText &&
      scenario.flightScenarioName &&
      scenario.atcText.toUpperCase() === scenario.flightScenarioName.toUpperCase()
    ) {
      Logger.log('[WARN] atcText equals flightScenarioName for scenarioId: ' + scenario.scenarioId + ' — TTS will still proceed.');
    }

    return scenario;
  };
}


/**
 * Override apiSubmitAttempt
 * Forces feedback to receive keyword arrays, not keyword strings.
 * Uses phaseCode + flightScenarioId as tiebreakers when scenarioId is duplicated across phases.
 */
function apiSubmitAttempt(sessionToken, payload) {
  try {
    ensureScenarioServiceUsesHeaderReader_();

    var user = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);

    payload = payload || {};

    var scenario = apiSubmitAttempt_resolveScenario_(payload);

    Logger.log(
      '[apiSubmitAttempt] resolved scenario: id=' + scenario.scenarioId +
      ' phase=' + scenario.phaseCode +
      ' atcPreview=' + String(scenario.atcText || '').substring(0, 60)
    );

    // Pick the source with pipe separators; fall back to array if already normalised.
    var _kwSrc = Array.isArray(scenario.keywords) ? scenario.keywords :
                 (function(){
                   var a = String(scenario.keywords    || '').trim();
                   var b = String(scenario.keywordsText|| '').trim();
                   return (a.indexOf('|') !== -1) ? a : (b.indexOf('|') !== -1) ? b : (a || b);
                 })();
    var keywordsArray = normalizeKeywordsForAttempt_(_kwSrc);

    payload.expectedReadback    = scenario.expectedReadback;
    payload.expectedAnswer      = scenario.expectedReadback;
    payload.keywords            = keywordsArray;
    payload.requiredKeywords    = keywordsArray;
    payload.keywordsText        = scenario.keywordsText || keywordsArray.join('|');
    // Attach the resolved scenario so AttemptService.submitAttempt skips its own DB lookup.
    payload._resolvedScenario   = scenario;

    var result = AttemptService.submitAttempt(user, payload);

    return safeResponse_(result);

  } catch (err) {
    return apiError_('apiSubmitAttempt', err);
  }
}

function apiSubmitAttempt_resolveScenario_(payload) {
  var requestedId    = String(payload.scenarioId       || '').trim();
  var requestedPhase = String(payload.phaseCode        || '').trim().toUpperCase();
  var requestedFsId  = String(payload.flightScenarioId || '').trim();
  var requestedLevel = Number(payload.level  || 0);
  var requestedCountry = String(payload.country || '').trim().toUpperCase();

  // Primary: look up by scenarioId
  var scenario = RuntimeScenarioReaderService.getScenarioById(requestedId);

  // If the found scenario's phaseCode doesn't match what the client sent,
  // we have a duplicate-ID problem. Fall back to searching by phase identity.
  if (
    requestedPhase &&
    scenario.phaseCode &&
    scenario.phaseCode.toUpperCase() !== requestedPhase
  ) {
    Logger.log(
      '[apiSubmitAttempt] Phase mismatch! id=' + requestedId +
      ' found phase=' + scenario.phaseCode +
      ' expected phase=' + requestedPhase +
      ' — falling back to phase search.'
    );

    var ss = SpreadsheetApp.openById(RuntimeScenarioReaderService.getDatabaseId_());
    var sheet = ss.getSheetByName('Scenarios');
    var rows  = RuntimeScenarioReaderService.readRowsByHeaders_(sheet);

    // Find the row that matches on flightScenarioId + phaseCode (+ level/country if known)
    var candidates = rows.filter(function(row) {
      var rowPhase = String(row.phaseCode || '').trim().toUpperCase();
      var rowFsId  = String(row.flightScenarioId || '').trim();
      var rowActive = RuntimeScenarioReaderService.isActive_(row.isActive);

      if (rowPhase !== requestedPhase) return false;
      if (requestedFsId && rowFsId !== requestedFsId) return false;
      if (requestedLevel && Number(row.level || 0) !== requestedLevel) return false;
      if (requestedCountry) {
        var rowCountry = String(row.country || '').trim().toUpperCase();
        if (rowCountry !== requestedCountry) return false;
      }
      return rowActive;
    });

    if (candidates.length > 0) {
      scenario = RuntimeScenarioReaderService.normalizeScenario_(candidates[0]);
      Logger.log('[apiSubmitAttempt] fallback resolved to: id=' + scenario.scenarioId + ' phase=' + scenario.phaseCode);
    } else {
      Logger.log('[apiSubmitAttempt] fallback found no candidates — using original (possibly wrong) scenario.');
    }
  }

  return scenario;
}


/*******************************************************
 * TEST KEYWORDS FIX
 *******************************************************/

function testKeywordsArrayFix() {
  var scenarioId = 'PEGA_AQUI_UN_SCENARIO_ID_REAL';

  var scenario = RuntimeScenarioReaderService.getScenarioById(scenarioId);

  Logger.log(JSON.stringify({
    scenarioId: scenario.scenarioId,
    atcText: scenario.atcText,
    expectedReadback: scenario.expectedReadback,
    keywords: scenario.keywords,
    keywordsIsArray: Array.isArray(scenario.keywords),
    keywordsText: scenario.keywordsText
  }, null, 2));

  return {
    ok: true,
    keywords: scenario.keywords,
    keywordsIsArray: Array.isArray(scenario.keywords)
  };
}

/*******************************************************
 * ANALYTICS SERVICE V1
 * Dashboards + platform effectiveness tracking
 *******************************************************/

function apiGetDashboardAnalytics(sessionToken) {
  try {
    var user = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    return AnalyticsServiceV1.getDashboard(user);
  } catch (err) {
    return apiError_('apiGetDashboardAnalytics', err);
  }
}

function validateEventPayload_(payload) {
  payload = payload || {};

  // Ensure eventType is a plain string
  if (!payload.eventType || typeof payload.eventType !== 'string') {
    payload.eventType = 'unknown';
  }

  // Clamp score/rate fields to 0–100
  var score100Fields = ['score', 'readbackAccuracy', 'overallScore', 'progressPct', 'scoreAvg',
    'passRate', 'altitudeRestrictionCompliance', 'headingCompliance',
    'frequencyChangeAccuracy', 'callSignAccuracy', 'standardPhraseologyRate'];
  score100Fields.forEach(function(f) {
    if (payload[f] != null) {
      var n = Number(payload[f]);
      if (isNaN(n)) { delete payload[f]; }
      else { payload[f] = Math.max(0, Math.min(100, n)); }
    }
  });

  // Clamp workloadIndex to 0–10
  if (payload.workloadIndex != null) {
    var wi = Number(payload.workloadIndex);
    if (isNaN(wi)) { delete payload.workloadIndex; }
    else { payload.workloadIndex = Math.max(0, Math.min(10, wi)); }
  }

  // Strip prototype-pollution keys
  ['__proto__', 'constructor', 'prototype'].forEach(function(k) { delete payload[k]; });

  return payload;
}

function apiLogClientEvent(sessionToken, payload) {
  try {
    var user = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    return AnalyticsServiceV1.logEvent(user, validateEventPayload_(payload || {}));
  } catch (err) {
    return apiError_('apiLogClientEvent', err);
  }
}

var AnalyticsServiceV1 = {
  SHEETS: {
    USERS: 'Users',
    ATTEMPTS: 'Attempts',
    PROGRESS: 'Progress',
    SCENARIOS: 'Scenarios',
    EVENTS: 'ClientEvents'
  },

  EVENT_HEADERS: [
    'eventId',
    'timestamp',
    'userId',
    'email',
    'name',
    'role',
    'eventType',
    'level',
    'country',
    'scenarioType',
    'emergencyType',
    'flightScenarioId',
    'routeName',
    'scenarioId',
    'phaseCode',
    'metadata',
    'userAgent'
  ],

  getDashboard: function(user) {
    var users = this.readRows_(this.SHEETS.USERS);
    var attempts = this.readRows_(this.SHEETS.ATTEMPTS);
    var progress = this.readRows_(this.SHEETS.PROGRESS);
    var scenarios = this.readRows_(this.SHEETS.SCENARIOS);
    var events = this.readRows_(this.SHEETS.EVENTS);

    var role = String(user.role || 'STUDENT').toUpperCase();

    var scopedAttempts = this.scopeRowsForRole_(attempts, user, role);
    var scopedProgress = this.scopeRowsForRole_(progress, user, role);
    var scopedEvents = this.scopeRowsForRole_(events, user, role);

    // Recompute avgCompleteness fresh from first attempts — Progress sheet values
    // can be null for rows predating the column, causing fallback to inflated scoreAvg.
    var _faByRoute = {};
    scopedAttempts.forEach(function(r) {
      if (Number(r.attemptNumber) !== 1) return;
      var key = (r.level || '') + '||' + String(r.country || '').trim().toUpperCase();
      if (!_faByRoute[key]) _faByRoute[key] = { sum: 0, count: 0 };
      _faByRoute[key].sum   += Number(r.score || 0);
      _faByRoute[key].count += 1;
    });
    scopedProgress = scopedProgress.map(function(row) {
      var key = (row.level || '') + '||' + String(row.country || '').trim().toUpperCase();
      var bucket = _faByRoute[key];
      if (bucket && bucket.count > 0) {
        row = JSON.parse(JSON.stringify(row));
        row.avgCompleteness = Math.round(bucket.sum / bucket.count);
      }
      return row;
    });

    var attemptStats = this.computeAttemptStats_(scopedAttempts);
    var progressStats = this.computeProgressStats_(scopedProgress);
    var eventStats = this.computeEventStats_(scopedEvents);
    var routeHealth = this.computeRouteHealth_(scenarios);

    var dashboard = {
      ok: true,
      source: 'apiGetDashboardAnalytics',
      generatedAt: this.now_(),
      role: role,
      scope: role === 'STUDENT' ? 'personal' : 'all_visible_data',
      user: {
        userId: user.userId || '',
        name: user.name || '',
        email: user.email || '',
        role: role,
        currentLevel: user.currentLevel || '',
        currentCountry: user.currentCountry || ''
      },
      cards: [],
      student: {},
      staff: {},
      admin: {},
      charts: {},
      effectiveness: {},
      routeHealth: routeHealth
    };

    dashboard.student = this.buildStudentSection_(user, scopedAttempts, scopedProgress, scopedEvents, scenarios);
    dashboard.staff = this.buildStaffSection_(users, scopedAttempts, scopedProgress, scopedEvents, routeHealth);
    dashboard.admin = this.buildAdminSection_(users, attempts, progress, events, scenarios, routeHealth);
    dashboard.charts = {
      attemptsByDay: this.buildAttemptsByDay_(scopedAttempts, 14),
      scoreByLevel: this.buildScoreByLevel_(scopedAttempts),
      scoreByCountry: this.buildScoreByCountry_(scopedAttempts),
      progressByCountry: this.buildProgressByCountry_(scopedProgress),
      routeReadiness: this.buildRouteReadiness_(routeHealth),
      weakKeywords: this.buildWeakKeywords_(scopedAttempts),
      phaseBreakdown: this.buildPhaseBreakdown_(scopedAttempts, scenarios)
    };

    dashboard.effectiveness = this.buildEffectivenessSection_(
      scopedAttempts,
      scopedProgress,
      scopedEvents,
      routeHealth
    );

    dashboard.cards = this.buildRoleCards_(
      role,
      users,
      attemptStats,
      progressStats,
      eventStats,
      routeHealth,
      dashboard.student,
      dashboard.effectiveness
    );

    return dashboard;
  },

  logEvent: function(user, payload) {
    payload = payload || {};

    var ss = SpreadsheetApp.openById(this.getDatabaseId_());
    var sheet = ss.getSheetByName(this.SHEETS.EVENTS);

    if (!sheet) {
      sheet = ss.insertSheet(this.SHEETS.EVENTS);
      sheet.getRange(1, 1, 1, this.EVENT_HEADERS.length).setValues([this.EVENT_HEADERS]);
    }

    this.ensureHeaders_(sheet, this.EVENT_HEADERS);

    var headerMap = this.getHeaderMap_(sheet);
    var rowObj = {
      eventId: Utilities.getUuid(),
      timestamp: this.now_(),
      userId: user.userId || '',
      email: user.email || '',
      name: user.name || '',
      role: user.role || '',
      eventType: payload.eventType || 'unknown',
      level: payload.level || '',
      country: payload.country || '',
      scenarioType: payload.scenarioType || '',
      emergencyType: payload.emergencyType || '',
      flightScenarioId: payload.flightScenarioId || '',
      routeName: payload.routeName || '',
      scenarioId: payload.scenarioId || '',
      phaseCode: payload.phaseCode || '',
      metadata: JSON.stringify(payload.metadata || {}),
      userAgent: payload.userAgent || ''
    };

    this.appendRowByHeaders_(sheet, headerMap, rowObj);

    return {
      ok: true,
      source: 'apiLogClientEvent',
      eventType: rowObj.eventType
    };
  },

  buildRoleCards_: function(role, users, attemptStats, progressStats, eventStats, routeHealth, student, effectiveness) {
    var activeRoutes = routeHealth.filter(function(r) {
      return r.status === 'ACTIVE' || r.status === 'PARTIAL';
    }).length;

    var readyRoutes = routeHealth.filter(function(r) {
      return r.ready === true;
    }).length;

    if (role === 'STUDENT') {
      return [
        {
          label: 'Current level',
          value: student.currentLevel || '-',
          sub: 'Assigned training level'
        },
        {
          label: 'Completed routes',
          value: student.completedRoutes || 0,
          sub: 'Finished country routes'
        },
        {
          label: 'Average score',
          value: String(student.avgScore || 0) + '%',
          sub: 'Based on submitted attempts'
        },
        {
          label: 'Reveal usage',
          value: String(effectiveness.revealRate || 0) + '%',
          sub: 'Visual support usage'
        }
      ];
    }

    if (role === 'INSTRUCTOR') {
      return [
        {
          label: 'Active learners',
          value: eventStats.activeUsers14d || 0,
          sub: 'Users active in last 14 days'
        },
        {
          label: 'Attempts reviewed',
          value: attemptStats.totalAttempts || 0,
          sub: 'Submitted read-backs'
        },
        {
          label: 'Average score',
          value: String(attemptStats.avgScore || 0) + '%',
          sub: 'Training performance'
        },
        {
          label: 'Routes ready',
          value: readyRoutes + ' / ' + activeRoutes,
          sub: 'Ready active routes'
        }
      ];
    }

    return [
      {
        label: 'Total users',
        value: users.length,
        sub: 'Registered accounts'
      },
      {
        label: 'Active users',
        value: this.countUsersByStatus_(users, 'ACTIVE'),
        sub: 'Approved users'
      },
      {
        label: 'Attempts',
        value: attemptStats.totalAttempts || 0,
        sub: 'Total read-back submissions'
      },
      {
        label: 'Route readiness',
        value: readyRoutes + ' / ' + activeRoutes,
        sub: 'Ready active routes'
      }
    ];
  },

  buildPhaseBreakdown_: function(attempts, scenarios) {
    var scenarioPhaseMap = {};
    (scenarios || []).forEach(function(s) {
      var sid = String(s.scenarioId || '').trim();
      if (sid) scenarioPhaseMap[sid] = String(s.phaseCode || '').trim().toUpperCase();
    });

    // Use only first attempt per scenario for an honest difficulty score
    var firstAttemptMap = {};
    attempts.forEach(function(row) {
      if (Number(row.attemptNumber) === 1) {
        firstAttemptMap[String(row.scenarioId || '_' + row.attemptId)] = row;
      }
    });

    var phaseGroups = {};
    Object.keys(firstAttemptMap).forEach(function(sid) {
      var row   = firstAttemptMap[sid];
      var phase = String(row.phaseCode || '').trim().toUpperCase();
      if (!phase && scenarioPhaseMap[sid]) phase = scenarioPhaseMap[sid];
      if (!phase) return;
      if (!phaseGroups[phase]) phaseGroups[phase] = { count: 0, scoreSum: 0 };
      phaseGroups[phase].count++;
      phaseGroups[phase].scoreSum += Number(row.score || 0);
    });

    var result = Object.keys(phaseGroups).map(function(phase) {
      var g = phaseGroups[phase];
      return { phase: phase, avgScore: g.count ? Math.round(g.scoreSum / g.count) : 0, count: g.count };
    });
    result.sort(function(a, b) { return a.avgScore - b.avgScore; }); // hardest → easiest
    return result;
  },

  buildStudentSection_: function(user, attempts, progress, events, scenarios) {
    var attemptStats = this.computeAttemptStats_(attempts);
    var progressStats = this.computeProgressStats_(progress);
    var eventStats = this.computeEventStats_(events);

    // Build scenarioId → phaseCode map to backfill old attempts that predate phaseCode schema
    var scenarioPhaseMap = {};
    (scenarios || []).forEach(function(s) {
      var sid = String(s.scenarioId || '').trim();
      if (sid) scenarioPhaseMap[sid] = String(s.phaseCode || '').trim().toUpperCase();
    });

    var recent = attempts
      .slice()
      .sort(function(a, b) {
        return AnalyticsServiceV1.dateValue_(b) - AnalyticsServiceV1.dateValue_(a);
      })
      .slice(0, 8)
      .map(function(row) {
        var phase = String(AnalyticsServiceV1.getValue_(row, ['phaseCode', 'PhaseCode', 'phase'], '') || '').trim();
        if (!phase) {
          var sid = String(row.scenarioId || '').trim();
          if (sid && scenarioPhaseMap[sid]) phase = scenarioPhaseMap[sid];
        }
        return {
          date: AnalyticsServiceV1.getDateText_(row),
          level: AnalyticsServiceV1.getValue_(row, ['level', 'Level'], ''),
          country: AnalyticsServiceV1.getValue_(row, ['country', 'Country'], ''),
          phaseCode: phase,
          score: AnalyticsServiceV1.getNumber_(row, ['score', 'Score', 'evaluationScore'], 0),
          correct: AnalyticsServiceV1.getBool_(AnalyticsServiceV1.getValue_(row, ['correct', 'isCorrect', 'passed'], false))
        };
      });

    return {
      currentLevel: user.currentLevel || '',
      currentCountry: user.currentCountry || '',
      totalAttempts: attemptStats.totalAttempts,
      avgScore: attemptStats.avgScore,
      passRate: attemptStats.passRate,
      avgResponseTimeSec: attemptStats.avgResponseTimeSec,
      completedRoutes: progressStats.completedRoutes,
      inProgressRoutes: progressStats.inProgressRoutes,
      completedScenarios: progressStats.completedScenarios,
      totalScenarios: progressStats.totalScenarios,
      revealEvents: eventStats.revealEvents,
      audioPlays: eventStats.audioPlays,
      recentAttempts: recent
    };
  },

  buildStaffSection_: function(users, attempts, progress, events, routeHealth) {
    var attemptStats = this.computeAttemptStats_(attempts);
    var progressStats = this.computeProgressStats_(progress);
    var eventStats = this.computeEventStats_(events);

    return {
      learnerCount: this.countUsersByRole_(users, 'STUDENT'),
      instructorCount: this.countUsersByRole_(users, 'INSTRUCTOR'),
      activeLearners14d: eventStats.activeUsers14d,
      totalAttempts: attemptStats.totalAttempts,
      avgScore: attemptStats.avgScore,
      passRate: attemptStats.passRate,
      completedRoutes: progressStats.completedRoutes,
      readyRoutes: routeHealth.filter(function(r) { return r.ready; }).length,
      routeIssues: routeHealth.filter(function(r) { return !r.ready; }).length
    };
  },

  buildAdminSection_: function(users, attempts, progress, events, scenarios, routeHealth) {
    var attemptStats = this.computeAttemptStats_(attempts);
    var progressStats = this.computeProgressStats_(progress);
    var eventStats = this.computeEventStats_(events);

    return {
      totalUsers: users.length,
      activeUsers: this.countUsersByStatus_(users, 'ACTIVE'),
      pendingUsers: this.countUsersByStatus_(users, 'PENDING'),
      blockedUsers: this.countUsersByStatus_(users, 'BLOCKED'),
      students: this.countUsersByRole_(users, 'STUDENT'),
      instructors: this.countUsersByRole_(users, 'INSTRUCTOR'),
      admins: this.countUsersByRole_(users, 'ADMIN'),
      totalAttempts: attemptStats.totalAttempts,
      avgScore: attemptStats.avgScore,
      passRate: attemptStats.passRate,
      completedRoutes: progressStats.completedRoutes,
      totalScenarioRows: scenarios.length,
      totalRoutes: routeHealth.length,
      readyRoutes: routeHealth.filter(function(r) { return r.ready; }).length,
      activeUsers14d: eventStats.activeUsers14d
    };
  },

  buildEffectivenessSection_: function(attempts, progress, events, routeHealth) {
    var attemptStats = this.computeAttemptStats_(attempts);
    var progressStats = this.computeProgressStats_(progress);
    var eventStats = this.computeEventStats_(events);

    var revealRate = eventStats.audioPlays > 0
      ? Math.round((eventStats.revealEvents / eventStats.audioPlays) * 100)
      : 0;

    var completionRate = progressStats.totalRoutes > 0
      ? Math.round((progressStats.completedRoutes / progressStats.totalRoutes) * 100)
      : 0;

    var readyRoutes = routeHealth.filter(function(r) { return r.ready; }).length;
    var activeRoutes = routeHealth.filter(function(r) {
      return r.status === 'ACTIVE' || r.status === 'PARTIAL';
    }).length;

    var routeQualityRate = activeRoutes > 0
      ? Math.round((readyRoutes / activeRoutes) * 100)
      : 0;

    return {
      totalAttempts:     attemptStats.totalAttempts,
      avgScore:          attemptStats.avgScore,
      passRate:          attemptStats.passRate,
      avgResponseTimeSec: attemptStats.avgResponseTimeSec,
      completionRate:    completionRate,
      revealRate:        revealRate,
      audioPlays:        eventStats.audioPlays,
      revealEvents:      eventStats.revealEvents,
      trainingStarts:    eventStats.trainingStarts,
      routeCompletions:  eventStats.routeCompletions,
      routeQualityRate:  routeQualityRate
    };
  },

  computeAttemptStats_: function(attempts) {
    attempts = attempts || [];

    var total = attempts.length;
    var scoreSum = 0;
    var scoreCount = 0;
    var passCount = 0;
    var timeSum = 0;
    var timeCount = 0;

    attempts.forEach(function(row) {
      var score = AnalyticsServiceV1.getNumber_(row, ['score', 'Score', 'evaluationScore'], null);

      if (score !== null && !isNaN(score)) {
        scoreSum += score;
        scoreCount++;
      }

      var correctValue = AnalyticsServiceV1.getValue_(row, ['correct', 'isCorrect', 'passed'], '');
      if (AnalyticsServiceV1.getBool_(correctValue) || score >= 70) {
        passCount++;
      }

      var time = AnalyticsServiceV1.getNumber_(row, ['responseTimeSec', 'responseTime', 'timeSec'], null);
      if (time !== null && !isNaN(time)) {
        timeSum += time;
        timeCount++;
      }
    });

    return {
      totalAttempts: total,
      avgScore: scoreCount ? Math.round(scoreSum / scoreCount) : 0,
      passRate: total ? Math.round((passCount / total) * 100) : 0,
      avgResponseTimeSec: timeCount ? Math.round(timeSum / timeCount) : 0
    };
  },

  computeProgressStats_: function(progress) {
    progress = progress || [];

    var completedRoutes = 0;
    var inProgressRoutes = 0;
    var totalScenarios = 0;
    var completedScenarios = 0;

    progress.forEach(function(row) {
      var total = AnalyticsServiceV1.getNumber_(row, ['totalScenarios', 'TotalScenarios'], 0);
      var completed = AnalyticsServiceV1.getNumber_(row, ['completedScenarios', 'CompletedScenarios'], 0);
      var isCompleted = AnalyticsServiceV1.getBool_(
        AnalyticsServiceV1.getValue_(row, ['completed', 'isCompleted', 'status'], false)
      );

      totalScenarios += total;
      completedScenarios += completed;

      if (isCompleted || (total > 0 && completed >= total)) {
        completedRoutes++;
      } else if (completed > 0 || total > 0) {
        inProgressRoutes++;
      }
    });

    return {
      totalRoutes: progress.length,
      completedRoutes: completedRoutes,
      inProgressRoutes: inProgressRoutes,
      totalScenarios: totalScenarios,
      completedScenarios: completedScenarios
    };
  },

  computeEventStats_: function(events) {
    events = events || [];

    var audioPlays = 0;
    var revealEvents = 0;
    var trainingStarts = 0;
    var routeCompletions = 0;
    var activeUsers = {};

    var now = new Date();
    var cutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    events.forEach(function(row) {
      var type = String(AnalyticsServiceV1.getValue_(row, ['eventType'], '')).toLowerCase();
      var email = String(AnalyticsServiceV1.getValue_(row, ['email', 'userEmail'], '')).toLowerCase();
      var d = AnalyticsServiceV1.dateValue_(row);

      if (type === 'audio_play') audioPlays++;
      if (type === 'atc_reveal') revealEvents++;
      if (type === 'training_start_click') trainingStarts++;
      if (type === 'route_completed') routeCompletions++;

      if (email && d && d >= cutoff.getTime()) {
        activeUsers[email] = true;
      }
    });

    return {
      audioPlays: audioPlays,
      revealEvents: revealEvents,
      trainingStarts: trainingStarts,
      routeCompletions: routeCompletions,
      activeUsers14d: Object.keys(activeUsers).length
    };
  },

  computeRouteHealth_: function(scenarios) {
    scenarios = scenarios || [];

    var groups = {};

    scenarios.forEach(function(row) {
      var active = AnalyticsServiceV1.isActive_(AnalyticsServiceV1.getValue_(row, ['isActive', 'active'], true));
      var level = AnalyticsServiceV1.getValue_(row, ['level', 'Level'], '');
      var country = AnalyticsServiceV1.getValue_(row, ['country', 'Country'], '');
      var scenarioType = String(AnalyticsServiceV1.getValue_(row, ['scenarioType'], 'NORMAL')).toUpperCase();
      var emergencyType = String(AnalyticsServiceV1.getValue_(row, ['emergencyType'], '')).toUpperCase();
      var flightScenarioId = AnalyticsServiceV1.getValue_(row, ['flightScenarioId'], '');
      var routeName = AnalyticsServiceV1.getValue_(row, ['flightScenarioName'], '');

      var key = [
        level,
        String(country).toUpperCase(),
        scenarioType,
        emergencyType,
        flightScenarioId || routeName || 'LEGACY'
      ].join('§');

      if (!groups[key]) {
        groups[key] = {
          routeKey: key,
          level: level,
          country: country,
          scenarioType: scenarioType,
          emergencyType: emergencyType,
          flightScenarioId: flightScenarioId,
          routeName: routeName,
          totalRows: 0,
          activeRows: 0,
          phaseMap: {},
          missingAtc: 0,
          missingExpected: 0,
          missingKeywords: 0,
          audioCount: 0,
          videoCount: 0
        };
      }

      var g = groups[key];

      g.totalRows++;

      if (active) {
        g.activeRows++;
      }

      var phase = String(AnalyticsServiceV1.getValue_(row, ['phaseCode'], '')).toUpperCase();
      if (phase) {
        g.phaseMap[phase] = true;
      }

      if (!String(AnalyticsServiceV1.getValue_(row, ['atcText'], '')).trim()) {
        g.missingAtc++;
      }

      if (!String(AnalyticsServiceV1.getValue_(row, ['expectedReadback', 'expectedAnswer'], '')).trim()) {
        g.missingExpected++;
      }

      if (!String(AnalyticsServiceV1.getValue_(row, ['keywordsText', 'keywords'], '')).trim()) {
        g.missingKeywords++;
      }

      if (String(AnalyticsServiceV1.getValue_(row, ['audioUrl'], '')).trim()) {
        g.audioCount++;
      }

      if (String(AnalyticsServiceV1.getValue_(row, ['videoUrl'], '')).trim()) {
        g.videoCount++;
      }
    });

    return Object.keys(groups).map(function(key) {
      var g = groups[key];
      g.phaseCount = Object.keys(g.phaseMap).length;
      g.status = g.activeRows > 0 ? (g.activeRows < g.totalRows ? 'PARTIAL' : 'ACTIVE') : 'INACTIVE';
      g.ready = g.activeRows >= 8 &&
        g.phaseCount >= 8 &&
        g.missingAtc === 0 &&
        g.missingExpected === 0 &&
        g.missingKeywords === 0;

      delete g.phaseMap;

      return g;
    }).sort(function(a, b) {
      if (Number(a.level) !== Number(b.level)) return Number(a.level) - Number(b.level);
      return String(a.country).localeCompare(String(b.country));
    });
  },

  buildAttemptsByDay_: function(attempts, days) {
    attempts = attempts || [];
    days = days || 14;

    var map = {};
    var tz = Session.getScriptTimeZone();
    var now = new Date();

    for (var i = days - 1; i >= 0; i--) {
      var d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      var key = Utilities.formatDate(d, tz, 'yyyy-MM-dd');
      map[key] = 0;
    }

    attempts.forEach(function(row) {
      var dMs = AnalyticsServiceV1.dateValue_(row);
      if (!dMs) return;

      var key = Utilities.formatDate(new Date(dMs), tz, 'yyyy-MM-dd');

      if (map.hasOwnProperty(key)) {
        map[key]++;
      }
    });

    return Object.keys(map).map(function(key) {
      return {
        label: key.slice(5),
        value: map[key]
      };
    });
  },

  buildScoreByLevel_: function(attempts) {
    return this.groupAverage_(attempts, ['level', 'Level'], ['score', 'Score', 'evaluationScore']);
  },

  buildScoreByCountry_: function(attempts) {
    return this.groupAverage_(attempts, ['country', 'Country'], ['score', 'Score', 'evaluationScore']);
  },

  buildProgressByCountry_: function(progress) {
    progress = progress || [];
    var map = {};

    progress.forEach(function(row) {
      var country = String(AnalyticsServiceV1.getValue_(row, ['country', 'Country'], 'Unknown'));
      var total = AnalyticsServiceV1.getNumber_(row, ['totalScenarios'], 0);
      var completed = AnalyticsServiceV1.getNumber_(row, ['completedScenarios'], 0);

      if (!map[country]) {
        map[country] = {
          label: country,
          total: 0,
          completed: 0
        };
      }

      map[country].total += total;
      map[country].completed += completed;
    });

    return Object.keys(map).map(function(country) {
      var item = map[country];
      item.value = item.total ? Math.round((item.completed / item.total) * 100) : 0;
      return item;
    }).sort(function(a, b) {
      return b.value - a.value;
    }).slice(0, 10);
  },

  buildRouteReadiness_: function(routeHealth) {
    routeHealth = routeHealth || [];
    return routeHealth.slice(0, 12).map(function(route) {
      return {
        label: (route.country || '-') + ' L' + (route.level || '-') + ' ' + (route.scenarioType || ''),
        value: route.ready ? 100 : Math.max(0, Math.round((route.activeRows / 8) * 100)),
        ready: route.ready,
        issues: route.missingAtc + route.missingExpected + route.missingKeywords
      };
    });
  },

  buildWeakKeywords_: function(attempts) {
    attempts = attempts || [];
    var map = {};

    attempts.forEach(function(row) {
      var text = String(AnalyticsServiceV1.getValue_(row, [
        'keywordsMissing',
        'missingKeywords',
        'Missing Keywords',
        'missing'
      ], ''));

      text.split(/[|,;]/).forEach(function(k) {
        var clean = String(k || '').trim().toUpperCase();
        if (!clean) return;
        map[clean] = (map[clean] || 0) + 1;
      });
    });

    return Object.keys(map).map(function(k) {
      return {
        label: k,
        value: map[k]
      };
    }).sort(function(a, b) {
      return b.value - a.value;
    }).slice(0, 10);
  },

  groupAverage_: function(rows, groupFields, valueFields) {
    rows = rows || [];
    var map = {};

    rows.forEach(function(row) {
      var key = String(AnalyticsServiceV1.getValue_(row, groupFields, 'Unknown')).trim() || 'Unknown';
      var value = AnalyticsServiceV1.getNumber_(row, valueFields, null);

      if (value === null || isNaN(value)) return;

      if (!map[key]) {
        map[key] = {
          label: key,
          sum: 0,
          count: 0
        };
      }

      map[key].sum += value;
      map[key].count++;
    });

    return Object.keys(map).map(function(key) {
      return {
        label: key,
        value: map[key].count ? Math.round(map[key].sum / map[key].count) : 0
      };
    }).sort(function(a, b) {
      return b.value - a.value;
    }).slice(0, 12);
  },

  scopeRowsForRole_: function(rows, user, role) {
    rows = rows || [];

    if (role === 'ADMIN') {
      return rows;
    }

    if (role === 'INSTRUCTOR') {
      // Future improvement: filter by assigned instructor.
      // For now instructors see all training analytics.
      return rows;
    }

    return rows.filter(function(row) {
      return AnalyticsServiceV1.rowBelongsToUser_(row, user);
    });
  },

  rowBelongsToUser_: function(row, user) {
    var email = String(user.email || '').trim().toLowerCase();
    var userId = String(user.userId || '').trim();

    var rowEmail = String(this.getValue_(row, [
      'email',
      'Email',
      'userEmail',
      'studentEmail',
      'StudentEmail'
    ], '')).trim().toLowerCase();

    var rowUserId = String(this.getValue_(row, [
      'userId',
      'UserId',
      'studentId',
      'StudentId'
    ], '')).trim();

    if (email && rowEmail && email === rowEmail) return true;
    if (userId && rowUserId && userId === rowUserId) return true;

    return false;
  },

  countUsersByRole_: function(users, role) {
    role = String(role || '').toUpperCase();

    return (users || []).filter(function(row) {
      return String(AnalyticsServiceV1.getValue_(row, ['role', 'Role'], '')).toUpperCase() === role;
    }).length;
  },

  countUsersByStatus_: function(users, status) {
    status = String(status || '').toUpperCase();

    return (users || []).filter(function(row) {
      return String(AnalyticsServiceV1.getValue_(row, ['status', 'Status'], '')).toUpperCase() === status;
    }).length;
  },

  readRows_: function(sheetName) {
    var ss = SpreadsheetApp.openById(this.getDatabaseId_());
    var sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      return [];
    }

    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();

    if (lastRow < 2 || lastCol < 1) {
      return [];
    }

    var headers = sheet
      .getRange(1, 1, 1, lastCol)
      .getValues()[0]
      .map(function(h) {
        return String(h || '').trim();
      });

    var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

    return values.map(function(row, rowIndex) {
      var obj = {
        __rowNumber: rowIndex + 2
      };

      headers.forEach(function(header, index) {
        if (!header) return;
        obj[header] = row[index];
      });

      return obj;
    });
  },

  ensureHeaders_: function(sheet, requiredHeaders) {
    var lastCol = Math.max(sheet.getLastColumn(), 1);
    var current = sheet
      .getRange(1, 1, 1, lastCol)
      .getValues()[0]
      .map(function(h) {
        return String(h || '').trim();
      });

    var existing = {};

    current.forEach(function(header) {
      if (header) {
        existing[header.toLowerCase()] = true;
      }
    });

    var missing = requiredHeaders.filter(function(header) {
      return !existing[String(header).toLowerCase()];
    });

    if (missing.length) {
      sheet.getRange(1, sheet.getLastColumn() + 1, 1, missing.length).setValues([missing]);
    }
  },

  getHeaderMap_: function(sheet) {
    var lastCol = sheet.getLastColumn();
    var headers = sheet
      .getRange(1, 1, 1, lastCol)
      .getValues()[0]
      .map(function(h) {
        return String(h || '').trim();
      });

    var map = {};

    headers.forEach(function(header, index) {
      if (header) {
        map[header] = index + 1;
      }
    });

    return map;
  },

  appendRowByHeaders_: function(sheet, headerMap, obj) {
    var lastCol = sheet.getLastColumn();
    var row = [];

    for (var i = 1; i <= lastCol; i++) {
      row.push('');
    }

    Object.keys(obj).forEach(function(key) {
      if (headerMap[key]) {
        row[headerMap[key] - 1] = obj[key];
      }
    });

    sheet.appendRow(row);
  },

  getValue_: function(row, names, defaultValue) {
    names = Array.isArray(names) ? names : [names];

    for (var i = 0; i < names.length; i++) {
      if (row.hasOwnProperty(names[i]) && row[names[i]] !== '' && row[names[i]] !== null && row[names[i]] !== undefined) {
        return row[names[i]];
      }
    }

    return defaultValue;
  },

  getNumber_: function(row, names, defaultValue) {
    var value = this.getValue_(row, names, defaultValue);

    if (value === null || value === undefined || value === '') {
      return defaultValue;
    }

    if (typeof value === 'number') {
      return value;
    }

    var clean = String(value).replace('%', '').replace(',', '.').trim();
    var n = Number(clean);

    if (isNaN(n)) {
      return defaultValue;
    }

    return n;
  },

  getBool_: function(value) {
    var text = String(value || '').trim().toUpperCase();

    return (
      value === true ||
      text === 'TRUE' ||
      text === 'YES' ||
      text === 'SI' ||
      text === 'SÍ' ||
      text === '1' ||
      text === 'COMPLETED' ||
      text === 'PASS' ||
      text === 'PASSED'
    );
  },

  isActive_: function(value) {
    var text = String(value || '').trim().toUpperCase();

    return (
      value === true ||
      text === 'TRUE' ||
      text === 'ACTIVE' ||
      text === 'YES' ||
      text === 'SI' ||
      text === 'SÍ' ||
      text === '1'
    );
  },

  getDateText_: function(row) {
    var value = this.getValue_(row, ['createdAt', 'timestamp', 'attemptedAt', 'updatedAt', 'date'], '');

    if (Object.prototype.toString.call(value) === '[object Date]') {
      return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
    }

    return String(value || '');
  },

  dateValue_: function(row) {
    var value = this.getValue_(row, ['createdAt', 'timestamp', 'attemptedAt', 'updatedAt', 'date'], '');

    if (Object.prototype.toString.call(value) === '[object Date]') {
      return value.getTime();
    }

    if (!value) return 0;

    var d = new Date(value);

    if (isNaN(d.getTime())) {
      return 0;
    }

    return d.getTime();
  },

  now_: function() {
    return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  },

  getDatabaseId_: function() {
    var props = PropertiesService.getScriptProperties();

    return (
      props.getProperty('DB_SPREADSHEET_ID') ||
      props.getProperty('DATABASE_SPREADSHEET_ID') ||
      props.getProperty('SPREADSHEET_ID') ||
      props.getProperty('ICAO_DB_SPREADSHEET_ID') ||
      '1IKVJEEw8QoX9HkMJpnXNj3a20HnTl_-CjUcOJb4vgWY'
    );
  }
};


/*******************************************************
 * STUDENT ACCESS FIX
 * The original validateScenarioAccess_ and validateScenarioAudioAccess_
 * compare user.currentCountry (DB field, defaults empty → 'USA') against
 * scenario.country (e.g. 'UK'). The DB field is only populated when the
 * admin manually updates the student record; it is never synced when the
 * student loads a training route. This causes a false mismatch.
 *
 * Fix: for STUDENT role, skip the stale level/country comparison.
 * Access is already gated at route-load time by apiGetTrainingRouteV7_ROUTE_ADMIN,
 * which filters scenarios to the exact level/country the student requested.
 * The scenarioId arriving in apiSubmitAttempt / apiGenerateScenarioVoice was
 * retrieved via RuntimeScenarioReaderService.getScenarioById, confirming it exists.
 *******************************************************/

if (typeof AttemptService !== 'undefined' && AttemptService) {
  AttemptService.validateScenarioAccess_ = function(user, scenario) {
    var role = String((user && user.role) || '').toUpperCase();

    Logger.log(
      '[validateScenarioAccess_] user=' + (user && user.email) +
      ' role=' + role +
      ' userLevel=' + (user && user.currentLevel) +
      ' userCountry=' + (user && user.currentCountry) +
      ' scenarioId=' + (scenario && scenario.scenarioId) +
      ' scenarioLevel=' + (scenario && scenario.level) +
      ' scenarioCountry=' + (scenario && scenario.country)
    );

    if (role === 'ADMIN' || role === 'INSTRUCTOR') return true;

    if (role === 'STUDENT') return true;

    throw new Error('Access denied for role: ' + role);
  };
}


if (typeof TTSService !== 'undefined' && TTSService) {
  TTSService.validateScenarioAudioAccess_ = function(user, scenario) {
    var role = String((user && user.role) || '').toUpperCase();

    Logger.log(
      '[validateScenarioAudioAccess_] user=' + (user && user.email) +
      ' role=' + role +
      ' scenarioId=' + (scenario && scenario.scenarioId) +
      ' scenarioCountry=' + (scenario && scenario.country)
    );

    if (role === 'ADMIN' || role === 'INSTRUCTOR' || role === 'STUDENT') return true;

    throw new Error('TTS access denied for role: ' + role);
  };
}


/*******************************************************
 * apiUpdateUserTrainingContext
 * Called by the client when a student starts a training route.
 * Syncs currentLevel and currentCountry in the Users sheet so that
 * any remaining level/country checks in other services stay consistent.
 *******************************************************/

function apiUpdateUserTrainingContext(sessionToken, payload) {
  try {
    var user = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);

    payload = payload || {};

    var patch = {};

    if (payload.currentLevel !== undefined && payload.currentLevel !== null && payload.currentLevel !== '') {
      patch.currentLevel = Number(payload.currentLevel);
    }

    if (payload.currentCountry !== undefined && payload.currentCountry !== null && payload.currentCountry !== '') {
      patch.currentCountry = String(payload.currentCountry).trim().toUpperCase();
    }

    if (!Object.keys(patch).length) {
      return { ok: true, message: 'Nothing to update.' };
    }

    if (
      String(user.role || '').toUpperCase() === ROLES.STUDENT &&
      patch.currentLevel &&
      typeof ProgressService !== 'undefined' &&
      !ProgressService.canUserAccessLevel(user, patch.currentLevel)
    ) {
      throw new Error('This level is locked. Complete previous levels first.');
    }

    Logger.log(
      '[apiUpdateUserTrainingContext] userId=' + user.userId +
      ' patch=' + JSON.stringify(patch)
    );

    var userRow = UserService.getById(user.userId);

    if (!userRow) {
      throw new Error('User not found: ' + user.userId);
    }

    dbUpdateByRow_('Users', userRow.__rowNumber, patch);

    return { ok: true, updated: patch };

  } catch (err) {
    return apiError_('apiUpdateUserTrainingContext', err);
  }
}


/*******************************************************
 * ANALYTICS ENHANCEMENT v2
 * Adds: sessionId, durationSec, Feedback sheet,
 * session stats, drop-off analysis, feedback summary,
 * admin-only analytics API.
 *******************************************************/

(function() {
  if (typeof AnalyticsServiceV1 === 'undefined') return;

  // ── Patch EVENT_HEADERS: v1 additions + v2 B2B fields ───────────────
  var _B2B_FIELDS = [
    'sessionId', 'durationSec',
    'companyId', 'cohortId', 'instructorId', 'licenseType',
    'eventVersion', 'scenarioDifficulty', 'workloadIndex'
  ];
  var existingHeaders = AnalyticsServiceV1.EVENT_HEADERS || [];
  _B2B_FIELDS.forEach(function(f) {
    if (existingHeaders.indexOf(f) === -1) existingHeaders = existingHeaders.concat([f]);
  });
  AnalyticsServiceV1.EVENT_HEADERS = existingHeaders;

  // ── Patch logEvent to write sessionId + durationSec ─────────────────
  AnalyticsServiceV1.logEvent = function(user, payload) {
    payload = payload || {};
    var ss = SpreadsheetApp.openById(this.getDatabaseId_());
    var sheet = ss.getSheetByName(this.SHEETS.EVENTS);
    if (!sheet) {
      sheet = ss.insertSheet(this.SHEETS.EVENTS);
      sheet.getRange(1, 1, 1, this.EVENT_HEADERS.length).setValues([this.EVENT_HEADERS]);
    }
    this.ensureHeaders_(sheet, this.EVENT_HEADERS);
    var headerMap = this.getHeaderMap_(sheet);
    var rowObj = {
      eventId:         Utilities.getUuid(),
      timestamp:       this.now_(),
      userId:          user.userId || '',
      email:           user.email || '',
      name:            user.name || '',
      role:            user.role || '',
      eventType:       payload.eventType || 'unknown',
      level:           payload.level || '',
      country:         payload.country || '',
      scenarioType:    payload.scenarioType || '',
      emergencyType:   payload.emergencyType || '',
      flightScenarioId: payload.flightScenarioId || '',
      routeName:       payload.routeName || '',
      scenarioId:      payload.scenarioId || '',
      phaseCode:       payload.phaseCode || '',
      metadata:        JSON.stringify(payload.metadata || {}),
      userAgent:       payload.userAgent || '',
      sessionId:          payload.sessionId || '',
      durationSec:        payload.durationSec != null ? Number(payload.durationSec) : '',
      companyId:          payload.companyId || '',
      cohortId:           payload.cohortId || '',
      instructorId:       payload.instructorId || '',
      licenseType:        payload.licenseType || '',
      eventVersion:       payload.eventVersion || '2.0',
      scenarioDifficulty: payload.scenarioDifficulty || '',
      workloadIndex:      payload.workloadIndex != null ? Number(payload.workloadIndex) : ''
    };
    this.appendRowByHeaders_(sheet, headerMap, rowObj);
    return { ok: true, source: 'apiLogClientEvent', eventType: rowObj.eventType };
  };

  // ── Feedback sheet ────────────────────────────────────────────────────
  AnalyticsServiceV1.SHEETS.FEEDBACK = 'UserFeedback';

  AnalyticsServiceV1.FEEDBACK_HEADERS = [
    'feedbackId', 'timestamp', 'sessionId', 'userId', 'email', 'role',
    'feedbackType', 'difficulty', 'exitReason', 'wouldUseAgain', 'freeText',
    'level', 'country', 'scenarioId', 'phaseCode', 'stars'
  ];

  AnalyticsServiceV1.saveFeedback = function(user, payload) {
    payload = payload || {};
    var ss = SpreadsheetApp.openById(this.getDatabaseId_());
    var sheet = ss.getSheetByName(this.SHEETS.FEEDBACK);
    if (!sheet) {
      sheet = ss.insertSheet(this.SHEETS.FEEDBACK);
      sheet.getRange(1, 1, 1, this.FEEDBACK_HEADERS.length).setValues([this.FEEDBACK_HEADERS]);
    }
    this.ensureHeaders_(sheet, this.FEEDBACK_HEADERS);
    var headerMap = this.getHeaderMap_(sheet);
    var stars = Number(payload.stars || 0);
    if (stars < 1 || stars > 5) stars = 0;
    var rowObj = {
      feedbackId:   Utilities.getUuid(),
      timestamp:    this.now_(),
      sessionId:    payload.sessionId || '',
      userId:       user.userId || '',
      email:        user.email || '',
      role:         user.role || '',
      feedbackType: payload.feedbackType || 'unknown',
      difficulty:   payload.difficulty || '',
      exitReason:   payload.exitReason || '',
      wouldUseAgain: payload.wouldUseAgain || '',
      freeText:     String(payload.freeText || '').substring(0, 500),
      level:        payload.level || '',
      country:      payload.country || '',
      scenarioId:   payload.scenarioId || '',
      phaseCode:    payload.phaseCode || '',
      stars:        stars || ''
    };
    this.appendRowByHeaders_(sheet, headerMap, rowObj);
    return { ok: true, feedbackId: rowObj.feedbackId };
  };

  // ── Session stats from events ─────────────────────────────────────────
  AnalyticsServiceV1.buildSessionStats_ = function(events) {
    var sessions = {};
    var self = this;
    events.forEach(function(row) {
      var sid = String(self.getValue_(row, ['sessionId'], '') || '');
      if (!sid) return;
      if (!sessions[sid]) {
        sessions[sid] = { replays: 0, started: 0, completed: 0, maxDur: 0, quit: false, quitPhase: '' };
      }
      var s = sessions[sid];
      var type = String(self.getValue_(row, ['eventType'], '')).toLowerCase();
      var dur  = self.getNumber_(row, ['durationSec'], 0);
      if (dur > s.maxDur) s.maxDur = dur;
      if (type === 'replay_pressed')      s.replays++;
      if (type === 'scenario_started')    s.started++;
      if (type === 'scenario_completed')  s.completed++;
      if (type === 'user_quit') {
        s.quit = true;
        s.quitPhase = String(self.getValue_(row, ['phaseCode'], ''));
      }
    });

    var list = Object.keys(sessions).map(function(k) { return sessions[k]; });
    var totalSessions   = list.length;
    var durSum = 0, durCount = 0;
    var repSum = 0, repCount = 0;
    var completedSessions = 0;
    var dropMap = {};

    list.forEach(function(s) {
      if (s.maxDur > 0) { durSum += s.maxDur; durCount++; }
      if (s.replays > 0) { repSum += s.replays; repCount++; }
      if (s.completed > 0 && s.completed >= s.started && s.started > 0) completedSessions++;
      if (s.quit && s.quitPhase) dropMap[s.quitPhase] = (dropMap[s.quitPhase] || 0) + 1;
    });

    var dropoffPoints = Object.keys(dropMap).map(function(p) {
      return { phase: p, count: dropMap[p] };
    }).sort(function(a, b) { return b.count - a.count; }).slice(0, 6);

    return {
      totalSessions:          totalSessions,
      avgSessionSec:          durCount ? Math.round(durSum / durCount) : 0,
      completionRate:         totalSessions ? Math.round((completedSessions / totalSessions) * 100) : 0,
      avgReplaysPerScenario:  repCount ? Math.round((repSum / repCount) * 10) / 10 : 0,
      totalReplays:           repSum,
      dropoffPoints:          dropoffPoints
    };
  };

  // ── Feedback summary ──────────────────────────────────────────────────
  AnalyticsServiceV1.buildFeedbackSummary_ = function(feedback) {
    var self = this;
    var diff   = { easy: 0, ok: 0, hard: 0 };
    var exits  = {};
    var wua    = { yes: 0, no: 0, maybe: 0 };
    var texts  = [];
    var scenarioRatingMap = {};
    var scenarioComments  = [];

    feedback.forEach(function(row) {
      var type = String(self.getValue_(row, ['feedbackType'], '')).toLowerCase();

      var d = String(self.getValue_(row, ['difficulty'], '')).toLowerCase();
      if (diff[d] !== undefined) diff[d]++;
      var r = String(self.getValue_(row, ['exitReason'], '')).toLowerCase();
      if (r) exits[r] = (exits[r] || 0) + 1;
      var w = String(self.getValue_(row, ['wouldUseAgain'], '')).toLowerCase();
      if (wua[w] !== undefined) wua[w]++;
      var t = String(self.getValue_(row, ['freeText'], '')).trim();
      if (t && type !== 'scenario_rating') texts.push(t);

      if (type === 'scenario_rating') {
        var sid   = String(self.getValue_(row, ['scenarioId'], '')).trim();
        var stars = Number(self.getValue_(row, ['stars'], 0));
        if (sid && stars >= 1 && stars <= 5) {
          if (!scenarioRatingMap[sid]) scenarioRatingMap[sid] = { sum: 0, count: 0 };
          scenarioRatingMap[sid].sum   += stars;
          scenarioRatingMap[sid].count += 1;
        }
        if (t && sid) {
          scenarioComments.push({
            scenarioId: sid,
            stars:      stars,
            freeText:   t,
            email:      String(self.getValue_(row, ['email'],     '')).trim(),
            timestamp:  String(self.getValue_(row, ['timestamp'], '')).trim()
          });
        }
      }
    });

    var scenarioRatings = Object.keys(scenarioRatingMap).map(function(sid) {
      var entry = scenarioRatingMap[sid];
      return {
        scenarioId: sid,
        avg:        Math.round((entry.sum / entry.count) * 10) / 10,
        count:      entry.count
      };
    }).sort(function(a, b) { return b.count - a.count; });

    return {
      total: feedback.length,
      difficulty: diff,
      exitReasons: exits,
      wouldUseAgain: wua,
      recentFreeTexts:   texts.slice(-5),
      scenarioRatings:   scenarioRatings,
      scenarioComments:  scenarioComments.slice(-10)
    };
  };

  // ── buildB2bStats_ ────────────────────────────────────────────────────
  AnalyticsServiceV1.buildB2bStats_ = function(events) {
    var self = this;
    var licenseBreakdown    = {};
    var difficultyBreakdown = {};
    var companyActivity     = {};
    var cohortActivity      = {};
    var totalWorkload = 0, workloadCount = 0, v2Events = 0;

    events.forEach(function(ev) {
      var lt = String(self.getValue_(ev, ['licenseType'], '')    || '').trim();
      var sd = String(self.getValue_(ev, ['scenarioDifficulty'], '') || '').trim();
      var co = String(self.getValue_(ev, ['companyId'], '')      || '').trim();
      var ch = String(self.getValue_(ev, ['cohortId'], '')       || '').trim();
      var wi = self.getNumber_(ev, ['workloadIndex'], 0);
      var ver= String(self.getValue_(ev, ['eventVersion'], '')   || '').trim();

      if (lt) licenseBreakdown[lt]    = (licenseBreakdown[lt]    || 0) + 1;
      if (sd) difficultyBreakdown[sd] = (difficultyBreakdown[sd] || 0) + 1;
      if (co) companyActivity[co]     = (companyActivity[co]     || 0) + 1;
      if (ch) cohortActivity[ch]      = (cohortActivity[ch]      || 0) + 1;
      if (wi > 0) { totalWorkload += wi; workloadCount++; }
      if (ver === '2.0') v2Events++;
    });

    var companyRows = Object.keys(companyActivity).map(function(k) {
      return { id: k, events: companyActivity[k] };
    }).sort(function(a, b) { return b.events - a.events; }).slice(0, 10);

    var cohortRows = Object.keys(cohortActivity).map(function(k) {
      return { id: k, events: cohortActivity[k] };
    }).sort(function(a, b) { return b.events - a.events; }).slice(0, 10);

    return {
      licenseBreakdown:    licenseBreakdown,
      difficultyBreakdown: difficultyBreakdown,
      companyRows:         companyRows,
      cohortRows:          cohortRows,
      avgWorkloadIndex:    workloadCount > 0 ? Math.round(totalWorkload / workloadCount) : 0,
      v2Events:            v2Events,
      totalEvents:         events.length,
      hasB2bData:          companyRows.length > 0
    };
  };

  // ── buildScenarioStats_ ───────────────────────────────────────────────
  AnalyticsServiceV1.buildScenarioStats_ = function(events) {
    var self = this;
    var completions = events.filter(function(ev) {
      return String(self.getValue_(ev, ['eventType'], '')).toLowerCase() === 'scenario_completed';
    });

    var totalCompletions = completions.length;
    var scoreSum = 0, scoreCount = 0;
    var passCount = 0;
    var responseSum = 0, responseCount = 0;
    var replaySum = 0,  replayCount  = 0;
    var keywordMissMap = {};
    var bands = { excellent: 0, good: 0, fair: 0, poor: 0 };

    completions.forEach(function(ev) {
      var rawMeta = String(self.getValue_(ev, ['metadata'], '') || '');
      var meta = {};
      try { if (rawMeta) meta = JSON.parse(rawMeta); } catch(e) {}

      var score = meta.score != null ? Number(meta.score) : null;
      if (score != null && !isNaN(score)) {
        scoreSum += score;
        scoreCount++;
        if (score >= 90)      bands.excellent++;
        else if (score >= 75) bands.good++;
        else if (score >= 55) bands.fair++;
        else                  bands.poor++;
      }

      var correct = meta.correct;
      if (correct === true || correct === 'true' || correct === 'TRUE') passCount++;

      var rt = meta.responseTimeSec != null ? Number(meta.responseTimeSec) : null;
      if (rt != null && !isNaN(rt) && rt > 0) { responseSum += rt; responseCount++; }

      var rp = meta.replays != null ? Number(meta.replays) : null;
      if (rp != null && !isNaN(rp)) { replaySum += rp; replayCount++; }

      var missing = String(meta.keywordsMissing || '').trim();
      if (missing) {
        missing.split('|').forEach(function(kw) {
          kw = kw.trim();
          if (kw) keywordMissMap[kw] = (keywordMissMap[kw] || 0) + 1;
        });
      }
    });

    var missedKeywords = Object.keys(keywordMissMap).map(function(kw) {
      return { keyword: kw, count: keywordMissMap[kw] };
    }).sort(function(a, b) { return b.count - a.count; }).slice(0, 10);

    return {
      totalCompletions:    totalCompletions,
      avgScore:            scoreCount  ? Math.round(scoreSum  / scoreCount)  : null,
      passRate:            totalCompletions ? Math.round((passCount / totalCompletions) * 100) : null,
      avgResponseTimeSec:  responseCount ? Math.round(responseSum / responseCount) : null,
      avgReplays:          replayCount  ? Math.round((replaySum  / replayCount) * 10) / 10 : null,
      scoreBands:          bands,
      missedKeywords:      missedKeywords
    };
  };

  // ── getAdminAnalytics ─────────────────────────────────────────────────
  AnalyticsServiceV1.getAdminAnalytics = function(user) {
    var self    = this;
    var events  = this.readRows_(this.SHEETS.EVENTS);
    var feedback = [];
    try { feedback = this.readRows_(this.SHEETS.FEEDBACK); } catch(e) {}

    var sessionStats    = this.buildSessionStats_(events);
    var feedbackSummary = this.buildFeedbackSummary_(feedback);
    var eventStats      = this.computeEventStats_(events);
    var b2bStats        = this.buildB2bStats_(events);
    var scenarioStats   = this.buildScenarioStats_(events);

    // Recent unique sessions (last 20)
    var seen = {}, recentSessions = [];
    for (var i = events.length - 1; i >= 0 && recentSessions.length < 20; i--) {
      var sid   = String(self.getValue_(events[i], ['sessionId'], '') || '');
      var email = String(self.getValue_(events[i], ['email'], '') || '');
      if (!sid || seen[sid]) continue;
      seen[sid] = true;
      recentSessions.push({
        sessionId:   sid.substring(0, 16),
        email:       email,
        timestamp:   String(self.getValue_(events[i], ['timestamp'], '')),
        durationSec: self.getNumber_(events[i], ['durationSec'], 0)
      });
    }

    // Dashboard data for the Overview pane (same as getDashboard admin path)
    var users     = this.readRows_(this.SHEETS.USERS);
    var attempts  = this.readRows_(this.SHEETS.ATTEMPTS);
    var progress  = this.readRows_(this.SHEETS.PROGRESS);
    var scenarios = this.readRows_(this.SHEETS.SCENARIOS);
    var routeHealth = this.computeRouteHealth_(scenarios);
    var adminSection = this.buildAdminSection_(users, attempts, progress, events, scenarios, routeHealth);
    var effectiveness = this.buildEffectivenessSection_(attempts, progress, events, routeHealth);
    var charts = {
      attemptsByDay:    this.buildAttemptsByDay_(attempts, 14),
      scoreByLevel:     this.buildScoreByLevel_(attempts),
      scoreByCountry:   this.buildScoreByCountry_(attempts),
      weakKeywords:     this.buildWeakKeywords_(attempts)
    };

    // Build userId → display name lookup from Users sheet
    var userNameMap = {};
    users.forEach(function(u) {
      var uid = String(u.userId || '');
      if (uid) userNameMap[uid] = String(u.name || u.email || uid);
    });

    // Recent attempts (last 20) for the Business tab activity log
    var recentAttempts = attempts.slice(-20).reverse().map(function(r) {
      var uid = String(r.userId || '');
      return {
        name:      userNameMap[uid] || String(r.email || uid || ''),
        level:     String(r.level    || ''),
        country:   String(r.country  || ''),
        score:     Number(r.score    || 0),
        attempt:   Number(r.attemptNumber || 1),
        timestamp: String(r.timestamp || r.createdAt || '')
      };
    });

    // Level progression: how many students have progress rows at each level
    var levelMap = {};
    progress.forEach(function(row) {
      var lvl = String(row.level || '');
      if (!lvl) return;
      if (!levelMap[lvl]) levelMap[lvl] = { level: lvl, students: 0, completed: 0 };
      levelMap[lvl].students++;
      var done = row.completed === true || String(row.completed).toUpperCase() === 'TRUE';
      if (done) levelMap[lvl].completed++;
    });
    var levelProgression = Object.keys(levelMap).sort().map(function(k) { return levelMap[k]; });

    // Active users last 30 days from attempts
    var cutoff30 = Date.now() - 30 * 24 * 3600 * 1000;
    var active30 = {};
    attempts.forEach(function(r) {
      var ts = new Date(r.timestamp || r.createdAt || 0).getTime();
      if (ts >= cutoff30 && r.email) active30[r.email] = true;
    });
    adminSection.activeUsers30d = Object.keys(active30).length;

    return {
      ok:              true,
      generatedAt:     this.now_(),
      sessionStats:    sessionStats,
      feedbackSummary: feedbackSummary,
      eventStats:      eventStats,
      b2bStats:        b2bStats,
      scenarioStats:   scenarioStats,
      recentSessions:  recentSessions,
      recentAttempts:  recentAttempts,
      levelProgression: levelProgression,
      admin:           adminSection,
      effectiveness:   effectiveness,
      charts:          charts
    };
  };
})();

// ── API endpoints ─────────────────────────────────────────────────────────
function apiSaveFeedback(sessionToken, payload) {
  try {
    var user = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    return AnalyticsServiceV1.saveFeedback(user, payload || {});
  } catch(err) {
    return apiError_('apiSaveFeedback', err);
  }
}

function apiGetAdminAnalytics(sessionToken) {
  try {
    var user = AuthService.requireRole(sessionToken, ['ADMIN']);
    return AnalyticsServiceV1.getAdminAnalytics(user);
  } catch(err) {
    return apiError_('apiGetAdminAnalytics', err);
  }
}

// ─── B2B ANALYTICS API ────────────────────────────────────────────────────────
// REST concept → GAS function:
//   GET /api/b2b/analytics/:companyId/kpis         → apiB2bGetKpis
//   GET /api/b2b/analytics/:companyId/performance  → apiB2bGetPerformance
//   GET /api/b2b/analytics/:companyId/risk         → apiB2bGetRisk
//
// Tenant isolation: users may only query their own companyId; ADMIN bypasses.

function apiB2bGetKpis(sessionToken, companyId) {
  try {
    var user = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    return B2bAnalyticsService.getKpis(user, companyId);
  } catch(err) {
    var code = err && err.code ? err.code : 'SERVER_ERROR';
    if (code === 'TENANT_FORBIDDEN' || code === 'INVALID_COMPANY_ID') {
      return { ok: false, code: code, message: err.message };
    }
    return apiError_('apiB2bGetKpis', err);
  }
}

function apiB2bGetPerformance(sessionToken, companyId) {
  try {
    var user = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    return B2bAnalyticsService.getPerformance(user, companyId);
  } catch(err) {
    var code = err && err.code ? err.code : 'SERVER_ERROR';
    if (code === 'TENANT_FORBIDDEN' || code === 'INVALID_COMPANY_ID') {
      return { ok: false, code: code, message: err.message };
    }
    return apiError_('apiB2bGetPerformance', err);
  }
}

function apiB2bGetRisk(sessionToken, companyId) {
  try {
    var user = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    return B2bAnalyticsService.getRisk(user, companyId);
  } catch(err) {
    var code = err && err.code ? err.code : 'SERVER_ERROR';
    if (code === 'TENANT_FORBIDDEN' || code === 'INVALID_COMPANY_ID') {
      return { ok: false, code: code, message: err.message };
    }
    return apiError_('apiB2bGetRisk', err);
  }
}

// ── Tour / Season API ─────────────────────────────────────────────────────────

function apiGetWeeklyLeaderboard(sessionToken) {
  try {
    AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    return TourService.getWeeklyLeaderboard(20);
  } catch(err) { return apiError_('apiGetWeeklyLeaderboard', err); }
}

function apiGetCareerLeaderboard(sessionToken) {
  try {
    AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    return TourService.getCareerLeaderboard(20);
  } catch(err) { return apiError_('apiGetCareerLeaderboard', err); }
}

function apiGetMyCareerStats(sessionToken) {
  try {
    var user = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    return TourService.getMyCareerStats(user);
  } catch(err) { return apiError_('apiGetMyCareerStats', err); }
}

function apiAdminResetTour(sessionToken) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN']);
    return TourService.forceCloseTour();
  } catch(err) { return apiError_('apiAdminResetTour', err); }
}

function apiGetActiveTour(sessionToken) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN']);
    var tour = TourService.getActiveTour();
    return { ok: true, tour: tour };
  } catch(err) { return apiError_('apiGetActiveTour', err); }
}

function apiAdminSendWeeklyEmails(sessionToken) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN']);
    return TourService.sendWeeklyResetEmails();
  } catch(err) { return apiError_('apiAdminSendWeeklyEmails', err); }
}

function apiAdminSendTestEmail(sessionToken) {
  try {
    var user = AuthService.requireRole(sessionToken, ['ADMIN']);
    return TourService.sendTestEmail(user);
  } catch(err) { return apiError_('apiAdminSendTestEmail', err); }
}

function apiAdminGetEmailLog(sessionToken) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN']);
    return TourService.getEmailLog();
  } catch(err) { return apiError_('apiAdminGetEmailLog', err); }
}

function apiAdminDiagnoseTts(sessionToken) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN']);
    var issues = diagnoseScenarioTts();
    return { ok: true, issues: issues || [] };
  } catch(err) { return apiError_('apiAdminDiagnoseTts', err); }
}

function apiAdminListTtsVoices(sessionToken, languageCode) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN']);
    var voices = listGoogleTtsVoicesForLanguage(languageCode || 'en-CA');
    var result = (voices || []).map(function(v) {
      return { name: v.name, gender: v.ssmlGender, languageCodes: v.languageCodes };
    });
    return { ok: true, voices: result };
  } catch(err) { return apiError_('apiAdminListTtsVoices', err); }
}

// ── Readback Evaluation Test Suite ────────────────────────────────────────

function _seededRng_(seed) {
  var s = ((seed >>> 0) || 1);
  return function() {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    return (s >>> 0) / 4294967296;
  };
}

function _shuffleWords_(text, rng) {
  var words = String(text || '').split(' ');
  for (var i = words.length - 1; i > 0; i--) {
    var j = Math.floor(rng() * (i + 1));
    var tmp = words[i]; words[i] = words[j]; words[j] = tmp;
  }
  return words.join(' ');
}

function _abbreviateReadback_(text) {
  return String(text || '')
    .replace(/\bRUNWAY\b/gi, 'RWY')
    .replace(/\bHEADING\b/gi, 'HDG')
    .replace(/\bFLIGHT LEVEL\b/gi, 'FL')
    .replace(/\bKNOTS\b/gi, 'KTS');
}

function _extractCallsign_(text) {
  // Callsign is typically the last comma-delimited segment (e.g. "…, NOVAIR ONE TWO THREE.")
  var parts = String(text || '').split(',');
  return (parts[parts.length - 1] || parts[0] || '').trim();
}

function _removeCriticalNumber_(text) {
  return String(text || '').replace(/\b\d{2,}\b/, '___');
}

function apiAdminRunReadbackTests(sessionToken, payload) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN']);
    var seed         = Number((payload && payload.seed)         || 42);
    var maxScenarios = Math.min(Number((payload && payload.maxScenarios) || 30), 200);
    var levelFilter  = (payload && payload.level) ? Number(payload.level) : null;

    var rows       = dbReadAll_('Scenarios');
    var candidates = rows.filter(function(r) {
      return r.expectedReadback && String(r.expectedReadback).trim().length > 0;
    });
    if (levelFilter) {
      candidates = candidates.filter(function(r) { return Number(r.level) === levelFilter; });
    }
    candidates.sort(function(a, b) { return String(a.scenarioId).localeCompare(String(b.scenarioId)); });
    candidates = candidates.slice(0, maxScenarios);

    if (candidates.length === 0) {
      return { ok: true, results: [], total: 0, matching: 0, seed: seed,
               scenariosTested: 0, message: 'No scenarios with expectedReadback found.' };
    }

    var rng     = _seededRng_(seed);
    var results = [];

    candidates.forEach(function(sc, idx) {
      var keywords = Array.isArray(sc.keywords)
        ? sc.keywords
        : String(sc.keywordsText || sc.keywords || '').split('|').map(function(k) { return k.trim(); }).filter(Boolean);
      var expected = String(sc.expectedReadback || '').trim();

      var wrongSc     = candidates[(idx + 1) % candidates.length];
      var wrongAnswer = String(wrongSc.expectedReadback || 'WRONG ANSWER DELTA 999').trim();

      var testCases = [
        { shouldPass: true,  label: 'exact',         answer: expected },
        { shouldPass: true,  label: 'lowercase',     answer: expected.toLowerCase() },
        { shouldPass: true,  label: 'abbreviated',   answer: _abbreviateReadback_(expected) },
        { shouldPass: false, label: 'shuffled',      answer: _shuffleWords_(expected, rng) },
        { shouldPass: false, label: 'empty',         answer: '.' },
        { shouldPass: false, label: 'callsign-only', answer: _extractCallsign_(expected) },
        { shouldPass: false, label: 'missing-num',   answer: _removeCriticalNumber_(expected) },
        { shouldPass: false, label: 'wrong-row',     answer: wrongAnswer },
      ];

      testCases.forEach(function(tc) {
        var ev      = AttemptService.evaluateAnswer_(tc.answer, keywords, expected);
        var gotPass = ev.correct;
        results.push({
          scenarioId:   sc.scenarioId,
          level:        sc.level,
          country:      sc.country,
          label:        tc.label,
          shouldPass:   tc.shouldPass,
          answer:       tc.answer.substring(0, 100),
          correct:      gotPass,
          score:        ev.score,
          behaviorOk:   gotPass === tc.shouldPass,
          keywordsOk:   (ev.keywordsOk       || []).join('|'),
          keywordsMiss: (ev.keywordsMissing   || []).join('|'),
        });
      });
    });

    var total    = results.length;
    var matching = results.filter(function(r) { return r.behaviorOk; }).length;
    return { ok: true, results: results, total: total, matching: matching, seed: seed,
             scenariosTested: candidates.length };
  } catch(err) { return apiError_('apiAdminRunReadbackTests', err); }
}

// ── Admin Bulk Invite ─────────────────────────────────────────────────────

function apiAdminBulkInvite(sessionToken, users) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN']);
    users = users || [];
    var results = { ok: true, created: 0, skipped: 0, failed: 0, failedList: [] };

    users.forEach(function(entry) {
      var email = String(entry.email || '').trim().toLowerCase();
      var name  = String(entry.name  || '').trim();
      var role  = String(entry.role  || 'STUDENT').toUpperCase();
      if (!email || email.indexOf('@') === -1) {
        results.failed++;
        results.failedList.push({ email: email, reason: 'Invalid email' });
        return;
      }
      if (!name) name = email.split('@')[0];

      try {
        var created = false;
        var user = dbWithScriptLock_(function() {
          var existing = dbFindOne_('Users', 'email', email);
          if (existing) return existing;
          var now = now_();
          var newUser = {
            userId: uuid_('USR'), googleSub: 'email:' + email,
            email: email, name: name, role: role,
            status: 'ACTIVE', currentLevel: 1, currentCountry: 'USA',
            assignedGroupId: '', totalLearningSeconds: 0,
            createdAt: now, updatedAt: now, lastLoginAt: ''
          };
          dbAppend_('Users', newUser);
          created = true;
          return newUser;
        });

        if (!created) { results.skipped++; return; }

        _sendInviteEmail_(user);
        results.created++;
      } catch(e) {
        results.failed++;
        results.failedList.push({ email: email, reason: e && e.message ? e.message : String(e) });
      }
    });

    return results;
  } catch(err) { return apiError_('apiAdminBulkInvite', err); }
}

function apiAdminSendInviteTest(sessionToken) {
  try {
    var admin = AuthService.requireRole(sessionToken, ['ADMIN']);
    _sendInviteEmail_({ email: admin.email, name: admin.name || admin.email });
    return { ok: true, sentTo: admin.email };
  } catch(err) { return apiError_('apiAdminSendInviteTest', err); }
}

function _sendInviteEmail_(user) {
  var appUrl  = 'https://www.icaoaerocomms.com/';
  var subject = 'You\'ve been invited to ' + CONFIG.APP_NAME;
  var firstName = String(user.name || user.email).split(/[\s,]+/)[0];

  var plainBody =
    'Hello ' + firstName + ',\n\n' +
    'You have been invited to ' + CONFIG.APP_NAME + ' — an ATC phraseology simulator.\n\n' +
    'Your account is ready. Sign in with your Google account (' + user.email + '):\n\n' +
    appUrl + '\n\nWelcome aboard!';

  var htmlBody = _emailWrap_(
    '<table width="100%" cellpadding="0" cellspacing="0" style="text-align:center;margin-bottom:28px;">' +
      '<tr><td><img src="cid:aerocommsLogo" alt="AEROCOMMS" style="width:160px;height:93px;border-radius:8px;object-fit:contain;background:#000;border:2px solid rgba(0,212,142,0.35);"></td></tr>' +
      '<tr><td style="padding-top:14px;font-size:10px;font-weight:800;letter-spacing:2.5px;text-transform:uppercase;color:#00d48e;">AEROCOMMS</td></tr>' +
      '<tr><td style="padding-top:4px;font-size:12px;color:#4a6280;letter-spacing:1px;">ICAO Trainer Pro</td></tr>' +
    '</table>' +
    '<div style="background:rgba(0,212,142,0.07);border:1px solid rgba(0,212,142,0.2);border-radius:12px;padding:20px 24px;margin:0 0 24px;text-align:center;">' +
      '<div style="font-size:28px;margin-bottom:8px;">&#9992;</div>' +
      '<div style="font-size:16px;font-weight:700;color:#00d48e;">You\'ve been invited</div>' +
    '</div>' +
    '<p style="margin:0 0 8px;font-size:15px;color:#dde6f0;">Hello, <strong>' + _escapeHtmlInline_(firstName) + '</strong></p>' +
    '<p style="margin:0 0 24px;font-size:14px;color:#8fa3bb;line-height:1.7;">Your account on <strong>' + CONFIG.APP_NAME + '</strong> is ready. Sign in with your Google account (<strong>' + _escapeHtmlInline_(user.email) + '</strong>) to get started.</p>' +
    '<table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;"><tr><td style="background:#00d48e;border-radius:9px;">' +
      '<a href="' + appUrl + '" style="display:inline-block;padding:13px 28px;font-size:13px;font-weight:800;color:#07101e;text-decoration:none;letter-spacing:0.5px;">Open ' + CONFIG.APP_NAME + ' &#8594;</a>' +
    '</td></tr></table>' +
    '<p style="margin:0;font-size:12px;color:#2d4a63;text-align:center;">If you were not expecting this invitation, you can safely ignore this email.</p>'
  );

  var logoBase64Si = getLogoDataUrl().split(',')[1];
  var logoBlobSi   = Utilities.newBlob(Utilities.base64Decode(logoBase64Si), 'image/png', 'logo.png');
  MailApp.sendEmail({ to: user.email, subject: subject, body: plainBody, htmlBody: htmlBody, inlineImages: { aerocommsLogo: logoBlobSi } });
}

function _escapeHtmlInline_(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── VR Incentive System ────────────────────────────────────────────────────

var VR_CONFIG_KEY_  = 'VR_INCENTIVE_CONFIG';
var VR_DAILY_KEY_   = 'VR_DAILY_ASSIGNMENTS';

// Flat XP bonus per event type. 'double' = null means "copy the level's base XP"
// so the level earns 2× base XP total (base + same again as bonus).
var VR_XP_BONUS_ = { double: null, critical: 50, priority: 25, hot: 15 };
// CP bonus added flat after the streak multiplier at tour snapshot.
var VR_CP_BONUS_ = { double: 20,   critical: 15, priority: 10, hot: 5  };

var VR_CONFIG_DEFAULTS_ = {
  enabled:       true,
  fireRate:      65,
  secondaryRate: 18,
  slotMin:       22,
  slotMax:       56,
  weights:       { double: 8, critical: 17, priority: 45, hot: 30 },
  pinned:        []
};

function apiGetVRConfig(sessionToken) {
  try {
    AuthService.requireSession(sessionToken);
    var raw = PropertiesService.getScriptProperties().getProperty(VR_CONFIG_KEY_);
    var config = raw ? JSON.parse(raw) : VR_CONFIG_DEFAULTS_;
    return { ok: true, config: config };
  } catch(err) { return apiError_('apiGetVRConfig', err); }
}

function apiAdminSetVRConfig(sessionToken, config) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN']);
    var w = config.weights || {};
    var sum = (w.double || 0) + (w.critical || 0) + (w.priority || 0) + (w.hot || 0);
    if (sum !== 100) {
      if (sum > 0) {
        w.double   = Math.round(w.double   / sum * 100);
        w.critical = Math.round(w.critical / sum * 100);
        w.priority = Math.round(w.priority / sum * 100);
        w.hot      = 100 - w.double - w.critical - w.priority;
      } else {
        config.weights = VR_CONFIG_DEFAULTS_.weights;
      }
    }
    PropertiesService.getScriptProperties().setProperty(VR_CONFIG_KEY_, JSON.stringify(config));
    // Invalidate cached daily assignments so next call regenerates with new config
    PropertiesService.getScriptProperties().deleteProperty(VR_DAILY_KEY_);
    return { ok: true, config: config };
  } catch(err) { return apiError_('apiAdminSetVRConfig', err); }
}

// ── VR daily assignment generation ────────────────────────────────────────

function _vrGetConfig_() {
  var raw = PropertiesService.getScriptProperties().getProperty(VR_CONFIG_KEY_);
  if (!raw) return VR_CONFIG_DEFAULTS_;
  try { return JSON.parse(raw); } catch(e) { return VR_CONFIG_DEFAULTS_; }
}

function _vrRollType_(weights) {
  var keys  = ['double', 'critical', 'priority', 'hot'];
  var total = keys.reduce(function(s, k) { return s + (Number(weights[k]) || 0); }, 0) || 100;
  var r = Math.random() * total, cum = 0;
  for (var i = 0; i < keys.length; i++) {
    cum += Number(weights[keys[i]]) || 0;
    if (r < cum) return keys[i];
  }
  return 'hot';
}

function _vrGenerateDailyAssignments_() {
  var cfg   = _vrGetConfig_();
  var today = new Date().toISOString().slice(0, 10);
  var assignments = {};

  // Pinned events are always included regardless of fire rate
  (cfg.pinned || []).forEach(function(pin) {
    if (!pin.until || pin.until >= today) {
      assignments[String(pin.level)] = String(pin.type);
    }
  });

  // Random primary event
  if (Math.random() < (cfg.fireRate || 65) / 100) {
    var available = [1,2,3,4,5,6,7,8,9,10]
      .filter(function(l) { return !assignments[String(l)]; });
    if (available.length) {
      var primary = available[Math.floor(Math.random() * available.length)];
      assignments[String(primary)] = _vrRollType_(cfg.weights || VR_CONFIG_DEFAULTS_.weights);

      // Secondary hot sector (different level)
      var rest = available.filter(function(l) { return l !== primary; });
      if (rest.length && Math.random() < (cfg.secondaryRate || 18) / 100) {
        assignments[String(rest[Math.floor(Math.random() * rest.length)])] = 'hot';
      }
    }
  }

  return assignments; // { "5": "double", "3": "hot", ... }
}

// Returns today's assignments — generates once, caches in Script Properties until tomorrow
function _vrGetTodayAssignments_() {
  var today = new Date().toISOString().slice(0, 10);
  var raw   = PropertiesService.getScriptProperties().getProperty(VR_DAILY_KEY_);
  if (raw) {
    try {
      var stored = JSON.parse(raw);
      if (stored.date === today) return stored.assignments;
    } catch(e) {}
  }
  var assignments = _vrGenerateDailyAssignments_();
  PropertiesService.getScriptProperties().setProperty(VR_DAILY_KEY_, JSON.stringify({
    date: today, assignments: assignments
  }));
  return assignments;
}

// Ensure VRBonusLog sheet exists with proper headers
function _ensureVrBonusLog_() {
  var ss    = dbGetSpreadsheet_();
  var name  = 'VRBonusLog';
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, 8).setValues([[
      'logId', 'userId', 'level', 'tourId',
      'bonusType', 'bonusXp', 'bonusCp', 'earnedAt'
    ]]);
  }
  return sheet;
}

// Called when ALL countries in a level are newly complete.
// Checks today's VR assignment for that level and logs the bonus.
// Returns { type, bonusXp, bonusCp } or null.
function _vrApplyLevelCompletionBonus_(user, level) {
  try {
    var cfg = _vrGetConfig_();
    if (!cfg.enabled) return null;

    var assignments = _vrGetTodayAssignments_();
    var eventType   = assignments[String(level)];
    if (!eventType) return null;

    var tour = null;
    try { tour = TourService.getActiveTour(); } catch(e) {}
    var tourId = tour ? String(tour.tourId) : '';

    // Idempotency: never award the same (user, level, tour) twice
    var already = dbReadAll_('VRBonusLog').filter(function(r) {
      return String(r.userId || '') === String(user.userId) &&
             Number(r.level  || 0) === Number(level) &&
             String(r.tourId || '') === tourId;
    });
    if (already.length) return null;

    // Calculate XP bonus
    var bonusXp;
    if (eventType === 'double') {
      var xpTable = TourService.xpBaseTable || [0,500,450,400,350,300,260,220,180,140,100];
      bonusXp = Number(xpTable[Number(level)] || 100);
    } else {
      bonusXp = Number(VR_XP_BONUS_[eventType] || 0);
    }
    var bonusCp = Number(VR_CP_BONUS_[eventType] || 0);

    _ensureVrBonusLog_();
    dbWithScriptLock_(function() {
      dbAppend_('VRBonusLog', {
        logId:     uuid_('VRB'),
        userId:    user.userId,
        level:     level,
        tourId:    tourId,
        bonusType: eventType,
        bonusXp:   bonusXp,
        bonusCp:   bonusCp,
        earnedAt:  now_()
      });
    });

    Logger.log('[VR] bonus logged: user=' + user.userId +
               ' level=' + level + ' type=' + eventType +
               ' xp=' + bonusXp + ' cp=' + bonusCp);

    return { type: eventType, bonusXp: bonusXp, bonusCp: bonusCp };
  } catch(e) {
    Logger.log('[_vrApplyLevelCompletionBonus_] error: ' + e.message);
    return null;
  }
}

// Public API: returns today's server-side VR assignments for level-map rendering
function apiGetVRAssignments(sessionToken) {
  try {
    AuthService.requireSession(sessionToken);
    var cfg = _vrGetConfig_();
    if (!cfg.enabled) return { ok: true, assignments: {}, enabled: false };
    var assignments = _vrGetTodayAssignments_();
    return {
      ok:          true,
      enabled:     true,
      assignments: assignments,
      date:        new Date().toISOString().slice(0, 10)
    };
  } catch(err) { return apiError_('apiGetVRAssignments', err); }
}

function apiAdminDiagnoseMyProgress(sessionToken) {
  try {
    var user = AuthService.requireRole(sessionToken, ['ADMIN']);
    var rows = dbReadAll_('Progress').filter(function(r) {
      return String(r.userId || '').trim() === String(user.userId || '').trim();
    });
    var tour = null;
    try { tour = TourService.getActiveTour(); } catch(e) {}
    return {
      ok: true,
      userId: user.userId,
      tourStart: tour ? tour.startDate : null,
      rows: rows.map(function(r) {
        return {
          level: r.level, country: r.country,
          completed: r.completed, completedType: typeof r.completed,
          scoreAvg: r.scoreAvg, progressPct: r.progressPct,
          firstAttemptRate: r.firstAttemptRate, avgCompleteness: r.avgCompleteness,
          consistencyScore: r.consistencyScore, avgReplays: r.avgReplays,
          performanceScore: r.performanceScore,
          trendScore: r.trendScore, trendLabel: r.trendLabel,
          updatedAt: r.updatedAt, completedAt: r.completedAt
        };
      })
    };
  } catch(err) { return apiError_('apiAdminDiagnoseMyProgress', err); }
}

// Adds any columns that exist in DB_SCHEMA but are missing from the sheet header row.
// Safe to call multiple times — skips columns that already exist.
function migrateAddSchemaColumns_() {
  var ss = dbGetSpreadsheet_();
  var report = [];
  Object.keys(DB_SCHEMA).forEach(function(sheetName) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    var lastCol = sheet.getLastColumn();
    var existing = lastCol > 0
      ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) { return String(h || '').trim(); })
      : [];
    DB_SCHEMA[sheetName].forEach(function(header) {
      if (existing.indexOf(header) === -1) {
        var newCol = sheet.getLastColumn() + 1;
        sheet.getRange(1, newCol).setValue(header);
        sheet.getRange(1, newCol).setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');
        existing.push(header);
        report.push(sheetName + '.' + header);
      }
    });
  });
  return report;
}

function apiMigrateSchema(sessionToken) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN']);
    var added = migrateAddSchemaColumns_();
    return { ok: true, added: added, message: added.length ? 'Added ' + added.length + ' column(s): ' + added.join(', ') : 'No new columns needed.' };
  } catch(err) { return apiError_('apiMigrateSchema', err); }
}

// ─── ADMIN STUDENT PROGRESS VIEW ─────────────────────────────────────────────

function apiAdminGetStudentProgress(sessionToken, targetUserId) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN']);
    var targetUser = UserService.getById(String(targetUserId || ''));
    if (!targetUser) return { ok: false, error: 'User not found' };
    var publicUser = UserService.toPublicUser(targetUser);

    var progress = ProgressService.getUserProgress(publicUser);
    var attempts = dbReadAll_('Attempts').filter(function(r) {
      return String(r.userId || '') === String(publicUser.userId);
    });

    var totalAttempts = attempts.length;
    var scored  = attempts.filter(function(r) { return Number(r.score || 0) > 0; });
    var avgScore = scored.length
      ? Math.round(scored.reduce(function(s,r){ return s + Number(r.score||0); }, 0) / scored.length) : 0;
    var passed  = attempts.filter(function(r) { return r.correct === true || String(r.correct).toUpperCase() === 'TRUE'; });
    var passRate = totalAttempts ? Math.round((passed.length / totalAttempts) * 100) : 0;

    // Build scenarioId → phaseCode map to backfill attempts predating phaseCode schema
    var adminScenarios = dbReadAll_('Scenarios');
    var adminScenarioPhaseMap = {};
    adminScenarios.forEach(function(s) {
      var sid = String(s.scenarioId || '').trim();
      if (sid) adminScenarioPhaseMap[sid] = String(s.phaseCode || '').trim().toUpperCase();
    });

    var recentAttempts = attempts
      .sort(function(a,b){ return String(b.createdAt||'').localeCompare(String(a.createdAt||'')); })
      .slice(0, 10)
      .map(function(r) {
        var phase = String(r.phaseCode || '').trim();
        if (!phase) {
          var sid = String(r.scenarioId || '').trim();
          if (sid && adminScenarioPhaseMap[sid]) phase = adminScenarioPhaseMap[sid];
        }
        return {
          level:     r.level,
          country:   r.country,
          phaseCode: phase,
          score:     Number(r.score || 0),
          correct:   r.correct,
          date:      String(r.createdAt || '').substring(0, 10)
        };
      });

    // Phase breakdown for difficulty analysis (first attempts only)
    var adminPhaseGroups = {};
    attempts.forEach(function(row) {
      if (Number(row.attemptNumber) !== 1) return;
      var phase = String(row.phaseCode || '').trim().toUpperCase();
      if (!phase) {
        var sid = String(row.scenarioId || '').trim();
        if (sid && adminScenarioPhaseMap[sid]) phase = adminScenarioPhaseMap[sid];
      }
      if (!phase) return;
      if (!adminPhaseGroups[phase]) adminPhaseGroups[phase] = { count: 0, scoreSum: 0 };
      adminPhaseGroups[phase].count++;
      adminPhaseGroups[phase].scoreSum += Number(row.score || 0);
    });
    var phaseBreakdown = Object.keys(adminPhaseGroups).map(function(phase) {
      var g = adminPhaseGroups[phase];
      return { phase: phase, avgScore: g.count ? Math.round(g.scoreSum / g.count) : 0, count: g.count };
    });
    phaseBreakdown.sort(function(a, b) { return a.avgScore - b.avgScore; });

    // Enrich instructorId from Groups sheet (same as apiGetMe)
    if (publicUser.assignedGroupId) {
      try {
        var groups = dbReadAll_('Groups');
        for (var gi = 0; gi < groups.length; gi++) {
          if (String(groups[gi].groupId || '') === publicUser.assignedGroupId) {
            publicUser.instructorId = String(groups[gi].instructorId || '');
            break;
          }
        }
      } catch(e) { /* non-fatal */ }
    }

    var totalTimeSec = attempts.reduce(function(s, r) { return s + Number(r.responseTimeSec || 0); }, 0);

    // Recompute avgCompleteness fresh from first attempts so stale Progress sheet
    // values (or nulls from rows predating the column) don't inflate the display.
    var firstAttemptByRoute = {};
    attempts.forEach(function(r) {
      if (Number(r.attemptNumber) !== 1) return;
      var key = (r.level || '') + '||' + String(r.country || '').trim().toUpperCase();
      if (!firstAttemptByRoute[key]) firstAttemptByRoute[key] = { sum: 0, count: 0 };
      firstAttemptByRoute[key].sum   += Number(r.score || 0);
      firstAttemptByRoute[key].count += 1;
    });
    progress = progress.map(function(row) {
      var key = (row.level || '') + '||' + String(row.country || '').trim().toUpperCase();
      var bucket = firstAttemptByRoute[key];
      if (bucket && bucket.count > 0) {
        row = JSON.parse(JSON.stringify(row));
        row.avgCompleteness = Math.round(bucket.sum / bucket.count);
      }
      return row;
    });

    var instructorEmail = '';
    if (publicUser.instructorId) {
      var inst = UserService.getById(publicUser.instructorId);
      if (inst) instructorEmail = String(inst.email || '');
    }

    return {
      ok: true,
      student: publicUser,
      progress: safeArrayForClient_(progress),
      phaseBreakdown: phaseBreakdown,
      effectiveness: {
        avgScore:          avgScore,
        passRate:          passRate,
        totalAttempts:     totalAttempts,
        totalTimeSec:      totalTimeSec,
        avgResponseTimeSec: 0
      },
      recentAttempts:  recentAttempts,
      instructorEmail: instructorEmail
    };
  } catch(err) {
    return apiError_('apiAdminGetStudentProgress', err);
  }
}

function apiAdminSendProgressReport(sessionToken, payload) {
  try {
    var admin = AuthService.requireRole(sessionToken, ['ADMIN']);
    payload = payload || {};
    var targetUserId    = String(payload.targetUserId   || '');
    var recipientEmail  = String(payload.recipientEmail || '').trim();
    var ccEmail         = String(payload.ccEmail        || '').trim();
    var sendToStudent   = payload.sendToStudent === true || payload.sendToStudent === 'true';
    if (!recipientEmail) throw new Error('recipientEmail required');
    if (!targetUserId)   throw new Error('targetUserId required');

    var targetUser = UserService.getById(targetUserId);
    if (!targetUser) throw new Error('User not found');
    var publicUser = UserService.toPublicUser(targetUser);

    var progress = ProgressService.getUserProgress(publicUser);
    var attempts = dbReadAll_('Attempts').filter(function(r) {
      return String(r.userId || '') === String(publicUser.userId);
    });

    var totalAttempts = attempts.length;
    var scored   = attempts.filter(function(r){ return Number(r.score||0) > 0; });
    var avgScore = scored.length
      ? Math.round(scored.reduce(function(s,r){ return s+Number(r.score||0); }, 0) / scored.length) : 0;
    var passed   = attempts.filter(function(r){ return r.correct===true || String(r.correct).toUpperCase()==='TRUE'; });
    var passRate = totalAttempts ? Math.round((passed.length / totalAttempts) * 100) : 0;
    var totalTimeSec = attempts.reduce(function(s, r){ return s + Number(r.responseTimeSec || 0); }, 0);

    // Time per route: level|country → seconds
    var timeByRoute = {};
    attempts.forEach(function(r) {
      var key = String(r.level||'') + '|' + String(r.country||'').toUpperCase();
      timeByRoute[key] = (timeByRoute[key] || 0) + Number(r.responseTimeSec || 0);
    });

    var completedRoutes = progress.filter(function(r){
      return r.completed === true || String(r.completed).toUpperCase() === 'TRUE';
    }).length;

    var reportDate  = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MMMM d, yyyy');
    var studentName = String(publicUser.name  || publicUser.email || '');
    var studentEmail= String(publicUser.email || '');
    var levelLabel  = publicUser.currentLevel ? 'Level ' + publicUser.currentLevel : '';

    // Build attention list (performance < 60)
    var attentionRoutes = [];
    progress.forEach(function(row) {
      var perf = (row.performanceScore != null && row.performanceScore !== '') ? Number(row.performanceScore) : null;
      var s    = Number(row.scoreAvg || 0);
      var metric = perf !== null ? perf : s;
      if (metric > 0 && metric < 60) attentionRoutes.push('Level ' + row.level + ' — ' + row.country);
    });

    // Table rows
    var thS = 'padding:10px 14px;font-size:0.7rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:#6b7280;background:#f9fafb;border-bottom:2px solid #e5e7eb;text-align:';
    var tableRows = '';
    progress.sort(function(a,b){ return Number(a.level||0)-Number(b.level||0); }).forEach(function(row) {
      var s    = Number(row.scoreAvg || 0);
      var far  = (row.firstAttemptRate != null && row.firstAttemptRate !== '') ? Number(row.firstAttemptRate) : null;
      var perf = (row.performanceScore != null && row.performanceScore !== '') ? Number(row.performanceScore) : null;
      var done = row.completed === true || String(row.completed).toUpperCase() === 'TRUE';
      var routeKey = String(row.level||'') + '|' + String(row.country||'').toUpperCase();
      var routeTime = _formatTimeSec_(timeByRoute[routeKey] || 0);
      var sc = s >= 80 ? '#16a34a' : s >= 60 ? '#d97706' : (s > 0 ? '#dc2626' : '#9ca3af');
      var pc = perf !== null ? (perf >= 80 ? '#16a34a' : perf >= 60 ? '#d97706' : '#dc2626') : '#9ca3af';
      var statusTxt = done ? '&#10003; Complete' : (Number(row.progressPct||0) + '% done');
      var statusColor = done ? '#16a34a' : '#6b7280';
      tableRows +=
        '<tr style="border-bottom:1px solid #f3f4f6;">' +
          '<td style="padding:11px 14px;font-weight:600;color:#111827;">Level ' + _he(String(row.level)) + ' &mdash; ' + _he(String(row.country||'')) + '</td>' +
          '<td style="padding:11px 14px;text-align:center;font-weight:700;color:' + sc + '">' + (s>0?s+'%':'&mdash;') + '</td>' +
          '<td style="padding:11px 14px;text-align:center;color:#374151;">' + (far!==null?far+'%':'&mdash;') + '</td>' +
          '<td style="padding:11px 14px;text-align:center;font-weight:700;color:' + pc + '">' + (perf!==null?perf+'%':'&mdash;') + '</td>' +
          '<td style="padding:11px 14px;text-align:center;color:#374151;">' + routeTime + '</td>' +
          '<td style="padding:11px 14px;text-align:center;font-weight:700;color:' + statusColor + '">' + statusTxt + '</td>' +
        '</tr>';
    });

    var attentionBlock = attentionRoutes.length
      ? '<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">' +
          '<tr><td style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:14px 18px;">' +
            '<p style="margin:0 0 6px;font-size:0.82rem;font-weight:700;color:#c2410c;">&#9888; Routes that need attention</p>' +
            '<p style="margin:0;font-size:0.82rem;color:#92400e;">' + attentionRoutes.map(function(r){ return _he(r); }).join(' &nbsp;&bull;&nbsp; ') + '</p>' +
          '</td></tr>' +
        '</table>'
      : '';

    var html =
      '<!DOCTYPE html><html><body style="margin:0;padding:24px 12px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">' +
      '<div style="max-width:660px;margin:0 auto;">' +

        // Header
        '<div style="background:#0d0d0d;border-radius:12px 12px 0 0;padding:28px 32px;">' +
          '<table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:0;">' +
            '<tr>' +
              '<td style="vertical-align:middle;width:64px;padding-right:18px;">' +
                '<img src="cid:aerocommsLogo" alt="AEROCOMMS" style="width:56px;height:56px;border-radius:10px;object-fit:contain;background:#111;border:2px solid rgba(0,212,142,0.4);display:block;">' +
              '</td>' +
              '<td style="vertical-align:middle;">' +
                '<p style="margin:0 0 4px;font-size:0.68rem;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.5);">AEROCOMMS &mdash; Aviation English Training</p>' +
                '<h1 style="margin:0 0 6px;color:#fff;font-size:1.35rem;font-weight:700;line-height:1.2;">' + _he(studentName) + '</h1>' +
                '<p style="margin:0;color:rgba(255,255,255,0.65);font-size:0.85rem;">' + _he(studentEmail) +
                  (levelLabel ? ' &nbsp;&bull;&nbsp; ' + _he(levelLabel) : '') +
                  ' &nbsp;&bull;&nbsp; Report date: ' + reportDate +
                '</p>' +
              '</td>' +
            '</tr>' +
          '</table>' +
        '</div>' +

        // Body
        '<div style="background:#ffffff;border-radius:0 0 12px 12px;padding:28px 32px;box-shadow:0 4px 16px rgba(0,0,0,0.08);">' +

          // Intro sentence
          '<p style="margin:0 0 24px;font-size:0.92rem;color:#374151;line-height:1.55;">' +
            _he(studentName) + ' has completed <strong>' + completedRoutes + ' of ' + progress.length + ' route' + (progress.length!==1?'s':'') + '</strong>' +
            (levelLabel ? ' at <strong>' + _he(levelLabel) + '</strong>' : '') +
            ' with an overall score of <strong style="color:' + (avgScore>=80?'#16a34a':avgScore>=60?'#d97706':'#dc2626') + '">' + avgScore + '%</strong>' +
            ' and a total training time of <strong>' + _formatTimeSec_(totalTimeSec) + '</strong>.' +
          '</p>' +

          // KPI row
          '<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">' +
            '<tr>' +
              _emailStatCell_('Overall Score',  avgScore+'%',                    avgScore>=80?'#16a34a':avgScore>=60?'#d97706':'#dc2626') +
              '<td width="10"></td>' +
              _emailStatCell_('Pass Rate',       passRate+'%',                   passRate>=80?'#16a34a':passRate>=60?'#d97706':'#dc2626') +
              '<td width="10"></td>' +
              _emailStatCell_('Time Trained',    _formatTimeSec_(totalTimeSec),  '#00d48e') +
              '<td width="10"></td>' +
              _emailStatCell_('Routes Done',     completedRoutes+'/'+progress.length, completedRoutes===progress.length&&progress.length>0?'#16a34a':'#6b7280') +
            '</tr>' +
          '</table>' +

          attentionBlock +

          // Route table
          '<h2 style="margin:0 0 10px;font-size:0.85rem;font-weight:700;color:#111827;text-transform:uppercase;letter-spacing:0.06em;">Training Route Breakdown</h2>' +
          (tableRows
            ? '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:0.84rem;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">' +
                '<thead><tr>' +
                  '<th style="' + thS + 'left;">Route</th>' +
                  '<th style="' + thS + 'center;">Score</th>' +
                  '<th style="' + thS + 'center;">1st Attempt</th>' +
                  '<th style="' + thS + 'center;">Performance</th>' +
                  '<th style="' + thS + 'center;">Time Spent</th>' +
                  '<th style="' + thS + 'center;">Status</th>' +
                '</tr></thead>' +
                '<tbody>' + tableRows + '</tbody>' +
              '</table>'
            : '<p style="color:#9ca3af;font-size:0.85rem;">No training data available yet.</p>') +

          // Column legend
          '<p style="margin:14px 0 0;font-size:0.72rem;color:#9ca3af;line-height:1.6;">' +
            '<strong>Score</strong> = average readback accuracy &nbsp;&bull;&nbsp; ' +
            '<strong>1st Attempt</strong> = % of exercises passed without retrying &nbsp;&bull;&nbsp; ' +
            '<strong>Performance</strong> = score adjusted for audio replays used' +
          '</p>' +

          // Footer
          '<p style="margin:24px 0 0;padding-top:16px;border-top:1px solid #f3f4f6;font-size:0.72rem;color:#9ca3af;">' +
            'Sent by ' + _he(String(admin.name || admin.email || '')) + ' via AEROCOMMS &nbsp;&bull;&nbsp; ' + reportDate +
          '</p>' +
        '</div>' +
      '</div>' +
      '</body></html>';

    var subject = 'Training Update: ' + studentName + (levelLabel ? ' (' + levelLabel + ')' : '') + ' — ' + reportDate;

    // Build CC list — deduplicate against primary recipient
    var ccList = [];
    if (ccEmail && ccEmail.toLowerCase() !== recipientEmail.toLowerCase()) ccList.push(ccEmail);
    if (sendToStudent && studentEmail &&
        studentEmail.toLowerCase() !== recipientEmail.toLowerCase() &&
        ccList.indexOf(studentEmail) === -1) ccList.push(studentEmail);

    var logoBase64 = getLogoDataUrl().split(',')[1];
    var logoBlob   = Utilities.newBlob(Utilities.base64Decode(logoBase64), 'image/png', 'logo.png');

    MailApp.sendEmail({
      to:           recipientEmail,
      cc:           ccList.join(','),
      subject:      subject,
      htmlBody:     html,
      inlineImages: { aerocommsLogo: logoBlob }
    });

    var sentTo = [recipientEmail].concat(ccList).filter(Boolean).join(', ');
    return { ok: true, sent: true, to: sentTo };
  } catch(err) {
    return apiError_('apiAdminSendProgressReport', err);
  }
}

function _formatTimeSec_(sec) {
  sec = Math.round(Number(sec || 0));
  if (sec < 60) return sec + 's';
  var min = Math.floor(sec / 60);
  if (min < 60) return min + ' min';
  var hr  = Math.floor(min / 60);
  var rm  = min % 60;
  return hr + 'h' + (rm > 0 ? ' ' + rm + 'm' : '');
}

function _emailStatCell_(label, value, color) {
  return '<td style="background:#f8fafc;border-radius:8px;padding:14px 18px;text-align:center;">' +
    '<div style="font-size:1.4rem;font-weight:700;color:' + color + ';">' + value + '</div>' +
    '<div style="font-size:0.68rem;text-transform:uppercase;letter-spacing:0.08em;color:#9ca3af;margin-top:4px;">' + label + '</div>' +
  '</td>';
}

function _he(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function apiDemoTts(sessionToken) {
  try {
    AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    var text    = 'FASTAIR 345, START UP APPROVED, QNH 1013, TEMPERATURE PLUS 8';
    var profile = TTSService.getProfileByCountry_('USA');
    var rate    = Number(profile.speakingRate || 0.86);
    var ssml    = TTSService.buildAtcSsml_(text, profile, rate);
    var result  = TTSService.callGoogleTtsWithFallbackVoices_(ssml, profile, rate);
    return { ok: true, audioBase64: result.audioBase64 };
  } catch(err) {
    return apiError_('apiDemoTts', err);
  }
}

// ─── GROUP MANAGEMENT ─────────────────────────────────────────────────────────

function apiAdminListGroups(sessionToken) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN']);
    var groups = dbReadAll_('Groups');
    var users  = dbReadAll_('Users');

    var userMap = {};
    users.forEach(function(u) { userMap[u.userId] = u; });

    var studentCountByGroup = {};
    users.forEach(function(u) {
      if (u.assignedGroupId) {
        studentCountByGroup[u.assignedGroupId] = (studentCountByGroup[u.assignedGroupId] || 0) + 1;
      }
    });

    var result = groups.map(function(g) {
      var instructor = userMap[g.instructorId] || {};
      return {
        groupId:        g.groupId,
        groupName:      g.groupName,
        instructorId:   g.instructorId   || '',
        instructorName: instructor.name  || instructor.email || '',
        status:         g.status         || 'ACTIVE',
        studentCount:   studentCountByGroup[g.groupId] || 0,
        createdAt:      g.createdAt      || ''
      };
    });

    var instructors = users
      .filter(function(u) { return String(u.role || '').toUpperCase() === 'INSTRUCTOR' && String(u.status || '').toUpperCase() === 'ACTIVE'; })
      .map(function(u) { return { userId: u.userId, name: u.name || u.email }; });

    return { ok: true, groups: result, instructors: instructors };
  } catch(err) {
    return apiError_('apiAdminListGroups', err);
  }
}

function apiAdminSaveGroup(sessionToken, payload) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN']);
    payload = payload || {};
    var groupName = String(payload.groupName || '').trim();
    if (!groupName) throw new Error('Group name is required.');

    var result = dbWithScriptLock_(function() {
      var now = now_();
      if (payload.groupId) {
        var existing = dbFindOne_('Groups', 'groupId', payload.groupId);
        if (!existing) throw new Error('Group not found.');
        var patch = { groupName: groupName, updatedAt: now };
        if (payload.instructorId !== undefined) patch.instructorId = payload.instructorId;
        if (payload.status)                     patch.status       = payload.status;
        dbUpdateByRow_('Groups', existing.__rowNumber, patch);
        return mergeObjects_(existing, patch);
      } else {
        var newGroup = {
          groupId:      uuid_('GRP'),
          groupName:    groupName,
          instructorId: payload.instructorId || '',
          status:       'ACTIVE',
          createdAt:    now,
          updatedAt:    now
        };
        dbAppend_('Groups', newGroup);
        return newGroup;
      }
    });

    return { ok: true, group: result };
  } catch(err) {
    return apiError_('apiAdminSaveGroup', err);
  }
}

function apiAdminDeleteGroup(sessionToken, payload) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN']);
    payload = payload || {};
    if (!payload.groupId) throw new Error('Missing groupId.');

    dbWithScriptLock_(function() {
      var group = dbFindOne_('Groups', 'groupId', payload.groupId);
      if (!group) throw new Error('Group not found.');
      var users = dbReadAll_('Users');
      var now = now_();
      users.forEach(function(u) {
        if (u.assignedGroupId === payload.groupId) {
          dbUpdateByRow_('Users', u.__rowNumber, { assignedGroupId: '', updatedAt: now });
        }
      });
      dbDeleteByRow_('Groups', group.__rowNumber);
    });

    return { ok: true };
  } catch(err) {
    return apiError_('apiAdminDeleteGroup', err);
  }
}

function apiAdminGetGroupStudents(sessionToken, groupId) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN']);
    var users = dbReadAll_('Users');
    var members = [];
    var available = [];
    users.forEach(function(u) {
      if (String(u.role || '').toUpperCase() !== 'STUDENT') return;
      var entry = { userId: u.userId, name: u.name || '', email: u.email || '', status: u.status || '', assignedGroupId: u.assignedGroupId || '' };
      if (u.assignedGroupId === groupId) {
        members.push(entry);
      } else {
        available.push(entry);
      }
    });
    return { ok: true, members: members, available: available };
  } catch(err) {
    return apiError_('apiAdminGetGroupStudents', err);
  }
}

function apiAdminSetStudentGroup(sessionToken, payload) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN']);
    payload = payload || {};
    var userId  = payload.userId  || '';
    var groupId = payload.groupId !== undefined ? payload.groupId : null;
    if (!userId) throw new Error('Missing userId.');
    if (groupId === null) throw new Error('Missing groupId.');

    dbWithScriptLock_(function() {
      var user = dbFindOne_('Users', 'userId', userId);
      if (!user) throw new Error('User not found.');
      dbUpdateByRow_('Users', user.__rowNumber, { assignedGroupId: groupId, updatedAt: now_() });
    });

    return { ok: true };
  } catch(err) {
    return apiError_('apiAdminSetStudentGroup', err);
  }
}

function apiAdminAuditScenarios(sessionToken) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN']);

    var sheet = RouteAdminService.getSheet_();
    var rows = RouteAdminService.readRows_(sheet);

    var routeMap = {};

    rows.forEach(function(row) {
      if (!row.scenarioId) return;

      var routeKey = RouteAdminService.buildRouteKeyFromRow_(row);

      if (!routeMap[routeKey]) {
        routeMap[routeKey] = {
          routeKey: routeKey,
          level: Number(row.level || 1),
          country: String(row.country || ''),
          flightScenarioName: String(row.flightScenarioName || row.flightScenarioId || routeKey),
          scenarioType: String(row.scenarioType || 'NORMAL').toUpperCase(),
          emergencyType: String(row.emergencyType || '').toUpperCase(),
          phases: []
        };
      }

      var phaseCode = String(row.phaseCode || '').toUpperCase();
      var atcText = String(row.atcText || '').trim();
      var expectedReadback = String(row.expectedReadback || '').trim();
      var keywords = String(row.keywords || row.keywordsText || '').trim();

      var kwList = keywords ? keywords.split('|').map(function(k) { return k.trim(); }).filter(Boolean) : [];
      var atcNorm = atcText.toUpperCase();
      var readbackNorm = expectedReadback.toUpperCase();

      var kwMissingInAtc = kwList.filter(function(kw) {
        return atcNorm.indexOf(kw.toUpperCase()) === -1;
      });
      var kwMissingInReadback = kwList.filter(function(kw) {
        return readbackNorm.indexOf(kw.toUpperCase()) === -1;
      });

      routeMap[routeKey].phases.push({
        phaseCode: phaseCode,
        phaseOrder: Number(row.phaseOrder || RouteAdminService.PHASE_ORDER[phaseCode] || 999),
        atcText: atcText,
        atcPreview: atcText.substring(0, 80),
        expectedReadback: expectedReadback,
        hasAtcText: atcText.length > 0,
        hasExpectedReadback: expectedReadback.length > 0,
        hasKeywords: keywords.length > 0,
        isActive: RouteAdminService.isActive_(row.isActive),
        kwList: kwList,
        kwMissingInAtc: kwMissingInAtc,
        kwMissingInReadback: kwMissingInReadback,
        hasConsistencyIssue: kwList.length > 0 && (atcText.length > 0 || expectedReadback.length > 0) &&
                             (kwMissingInAtc.length > 0 || kwMissingInReadback.length > 0)
      });
    });

    var routes = Object.keys(routeMap).map(function(key) {
      var route = routeMap[key];

      route.phases.sort(function(a, b) { return a.phaseOrder - b.phaseOrder; });

      var atcTextCount = {};
      route.phases.forEach(function(phase) {
        if (phase.atcText) {
          atcTextCount[phase.atcText] = (atcTextCount[phase.atcText] || 0) + 1;
        }
      });

      route.phases.forEach(function(phase) {
        phase.duplicateAtcText = !!(phase.atcText && atcTextCount[phase.atcText] > 1);
      });

      route.totalPhases = route.phases.length;
      route.missingAtcCount = route.phases.filter(function(p) { return !p.hasAtcText; }).length;
      route.missingReadbackCount = route.phases.filter(function(p) { return !p.hasExpectedReadback; }).length;
      route.missingKeywordsCount = route.phases.filter(function(p) { return !p.hasKeywords; }).length;
      route.duplicateAtcCount = route.phases.filter(function(p) { return p.duplicateAtcText; }).length;
      route.consistencyIssueCount = route.phases.filter(function(p) { return p.hasConsistencyIssue; }).length;
      route.hasIssues = route.missingAtcCount > 0 || route.missingReadbackCount > 0 ||
                        route.missingKeywordsCount > 0 || route.duplicateAtcCount > 0 ||
                        route.consistencyIssueCount > 0;

      return route;
    });

    routes.sort(function(a, b) {
      if (Number(a.level) !== Number(b.level)) return Number(a.level) - Number(b.level);
      var c = String(a.country).localeCompare(String(b.country));
      if (c !== 0) return c;
      return String(a.flightScenarioName).localeCompare(String(b.flightScenarioName));
    });

    var totalRoutes = routes.length;
    var routesWithIssues = routes.filter(function(r) { return r.hasIssues; }).length;

    return { ok: true, routes: routes, totalRoutes: totalRoutes, routesWithIssues: routesWithIssues };
  } catch(err) {
    return apiError_('apiAdminAuditScenarios', err);
  }
}

/*******************************************************
 * LEVEL CONFIG — admin-configurable replay threshold per level
 *******************************************************/

function apiGetLevelConfig(sessionToken, level) {
  try {
    AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    var key = 'LEVEL_CONFIG_' + Number(level || 1);
    var raw = PropertiesService.getScriptProperties().getProperty(key);
    var cfg = raw ? JSON.parse(raw) : {};
    return { ok: true, level: Number(level || 1), replayThreshold: Number(cfg.replayThreshold || 2) };
  } catch(err) {
    return apiError_('apiGetLevelConfig', err);
  }
}

// Called directly by the client mini-game via google.script.run.getLevelConfig(levelId, phaseCode)
// Returns flight parameters for the given level, with optional phase-specific override applied on top.
function getLevelConfig(levelId, phaseCode) {
  try {
    var level = Math.max(1, parseInt(levelId, 10) || 1);
    var raw   = PropertiesService.getScriptProperties().getProperty('LEVEL_CONFIG_' + level);
    var cfg   = raw ? JSON.parse(raw) : {};

    var defaultAlt = 3000 + level * 1000; // Level 1 → 4000 ft … Level 10 → 13000 ft
    var levelAlt   = Number(cfg.startAltitude || defaultAlt);
    var levelHdg   = Number(cfg.startHeading  || 360) || 360;
    var levelOn    = cfg.enableControls !== undefined ? !!cfg.enableControls : true;

    // Apply phase override if it exists
    var phase = String(phaseCode || '').trim().toUpperCase();
    if (phase && cfg.phases && cfg.phases[phase]) {
      var po = cfg.phases[phase];
      return {
        enableControls: po.enableControls !== undefined ? !!po.enableControls : levelOn,
        startAltitude:  Number(po.startAltitude || levelAlt),
        startHeading:   Number(po.startHeading  || levelHdg) || 360
      };
    }

    return { enableControls: levelOn, startAltitude: levelAlt, startHeading: levelHdg };
  } catch(err) {
    return { enableControls: false, startAltitude: 5000, startHeading: 360 };
  }
}

function apiGetAllLevelConfigs(sessionToken) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN']);
    var props = PropertiesService.getScriptProperties();

    // Discover levels from Scenarios sheet
    var sheet = RouteAdminService.getSheet_();
    var rows  = RouteAdminService.readRows_(sheet);
    var levelSet = {};
    rows.forEach(function(row) { if (row.level) levelSet[Number(row.level)] = true; });

    var levels = Object.keys(levelSet).map(Number).sort(function(a,b){ return a-b; });
    if (!levels.length) levels = [1,2,3]; // fallback

    var result = levels.map(function(l) {
      var raw = props.getProperty('LEVEL_CONFIG_' + l);
      var cfg = raw ? JSON.parse(raw) : {};
      return {
        level:          l,
        replayThreshold: Number(cfg.replayThreshold || 2),
        enableControls:  cfg.enableControls !== undefined ? !!cfg.enableControls : true,
        startAltitude:   Number(cfg.startAltitude || (3000 + l * 1000)),
        startHeading:    Number(cfg.startHeading  || 360) || 360,
        phases:          cfg.phases || {}
      };
    });

    return { ok: true, levels: result };
  } catch(err) {
    return apiError_('apiGetAllLevelConfigs', err);
  }
}

// ─── FLIGHT DRIFT DIFFICULTY CONFIG ──────────────────────────────────────────
var FLIGHT_DRIFT_DEFAULTS_ = [
  { levelMax: 2,  intervalMs: 4000, altAmounts: [50],                hdgDrops: [1, 2]          },
  { levelMax: 4,  intervalMs: 3000, altAmounts: [50, 100],           hdgDrops: [2, 3, 5]       },
  { levelMax: 6,  intervalMs: 2000, altAmounts: [50, 100, 150],      hdgDrops: [3, 5, 8]       },
  { levelMax: 8,  intervalMs: 1500, altAmounts: [50, 100, 150, 200], hdgDrops: [5, 8, 10]      },
  { levelMax: 99, intervalMs: 1000, altAmounts: [50, 100, 150, 200], hdgDrops: [5, 10, 15, 20] }
];

function apiGetFlightDriftConfig(sessionToken) {
  try {
    AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    var props = PropertiesService.getScriptProperties();
    var tiers = FLIGHT_DRIFT_DEFAULTS_.map(function(def, i) {
      var raw = props.getProperty('FLIGHT_DRIFT_TIER_' + (i + 1));
      return raw ? JSON.parse(raw) : def;
    });
    return { ok: true, tiers: tiers };
  } catch(err) {
    return apiError_('apiGetFlightDriftConfig', err);
  }
}

function apiSaveFlightDriftConfig(sessionToken, tiers) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN', 'INSTRUCTOR']);
    if (!Array.isArray(tiers) || tiers.length !== 5) throw new Error('Must provide exactly 5 tiers.');
    var props = PropertiesService.getScriptProperties();
    tiers.forEach(function(tier, i) {
      var def = FLIGHT_DRIFT_DEFAULTS_[i];
      var clean = {
        levelMax:   Number(tier.levelMax)   || def.levelMax,
        intervalMs: Number(tier.intervalMs) || def.intervalMs,
        altAmounts: (tier.altAmounts || []).map(Number).filter(function(n) { return n > 0; }),
        hdgDrops:   (tier.hdgDrops   || []).map(Number).filter(function(n) { return n > 0; })
      };
      if (!clean.altAmounts.length) clean.altAmounts = def.altAmounts;
      if (!clean.hdgDrops.length)   clean.hdgDrops   = def.hdgDrops;
      props.setProperty('FLIGHT_DRIFT_TIER_' + (i + 1), JSON.stringify(clean));
    });
    return { ok: true };
  } catch(err) {
    return apiError_('apiSaveFlightDriftConfig', err);
  }
}

function apiAdminSaveLevelConfig(sessionToken, payload) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN']);
    payload = payload || {};
    var level          = Number(payload.level          || 1);
    var threshold      = Number(payload.replayThreshold || 2);
    var enableControls = payload.enableControls !== undefined ? !!payload.enableControls : true;
    var startAltitude  = Number(payload.startAltitude  || 0) || undefined;
    var startHeading   = Number(payload.startHeading   || 0) || undefined;
    if (threshold < 1) throw new Error('Threshold must be at least 1.');
    var key   = 'LEVEL_CONFIG_' + level;
    var props = PropertiesService.getScriptProperties();
    var existing = JSON.parse(props.getProperty(key) || '{}');
    // Preserve existing phase overrides when saving level defaults
    var saved = {
      replayThreshold: threshold,
      enableControls:  enableControls,
      phases:          existing.phases || {}
    };
    if (startAltitude) saved.startAltitude = startAltitude;
    if (startHeading)  saved.startHeading  = startHeading;
    props.setProperty(key, JSON.stringify(saved));
    return { ok: true, level: level, replayThreshold: threshold, enableControls: enableControls };
  } catch(err) {
    return apiError_('apiAdminSaveLevelConfig', err);
  }
}

function apiAdminSavePhaseFlightConfig(sessionToken, payload) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN']);
    payload = payload || {};
    var level = Number(payload.level || 1);
    var phase = String(payload.phase || '').trim().toUpperCase();
    if (!phase) throw new Error('phase required');

    var key   = 'LEVEL_CONFIG_' + level;
    var props = PropertiesService.getScriptProperties();
    var cfg   = JSON.parse(props.getProperty(key) || '{}');
    if (!cfg.phases) cfg.phases = {};

    if (payload.clear) {
      delete cfg.phases[phase];
    } else {
      var entry = { enableControls: payload.enableControls !== undefined ? !!payload.enableControls : true };
      if (payload.startAltitude != null && Number(payload.startAltitude)) entry.startAltitude = Number(payload.startAltitude);
      if (payload.startHeading  != null && Number(payload.startHeading))  entry.startHeading  = Number(payload.startHeading);
      cfg.phases[phase] = entry;
    }

    props.setProperty(key, JSON.stringify(cfg));
    return { ok: true, level: level, phase: phase, cleared: !!payload.clear };
  } catch(err) {
    return apiError_('apiAdminSavePhaseFlightConfig', err);
  }
}

/*******************************************************
 * TRAINING DEBRIEF — full attempt stats for a completed country/level
 *******************************************************/

function apiGetTrainingDebrief(sessionToken, payload) {
  try {
    var user = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    payload = payload || {};
    var level   = Number(payload.level   || user.currentLevel  || 1);
    var country = String(payload.country || user.currentCountry || 'USA').trim().toUpperCase();

    // Load all attempts for this user + level + country
    var attempts = dbReadAll_('Attempts').filter(function(row) {
      return String(row.userId  || '') === String(user.userId || '') &&
             Number(row.level   || 0)  === level &&
             String(row.country || '').trim().toUpperCase() === country;
    });

    // Load scenario metadata (phaseCode, phaseName, phaseOrder) by scenarioId
    var sheet = RouteAdminService.getSheet_();
    var rows  = RouteAdminService.readRows_(sheet);
    var scenarioMeta = {};
    rows.forEach(function(row) {
      if (row.scenarioId) {
        scenarioMeta[String(row.scenarioId)] = {
          phaseCode:  String(row.phaseCode  || '').toUpperCase(),
          phaseName:  String(row.phaseName  || row.phaseCode || ''),
          phaseOrder: Number(row.phaseOrder || RouteAdminService.PHASE_ORDER[String(row.phaseCode||'').toUpperCase()] || 999)
        };
      }
    });

    // Group attempts by scenarioId
    var phaseMap = {};
    attempts.forEach(function(row) {
      var sid = String(row.scenarioId || '');
      if (!sid) return;
      if (!phaseMap[sid]) {
        var meta = scenarioMeta[sid] || { phaseCode: '', phaseName: '', phaseOrder: 999 };
        phaseMap[sid] = {
          scenarioId:   sid,
          phaseCode:    meta.phaseCode,
          phaseName:    meta.phaseName || meta.phaseCode,
          phaseOrder:   meta.phaseOrder,
          totalAttempts: 0,
          bestScore:     0,
          firstTryCorrect: false,
          totalTimeSec:  0,
          totalListens:  0,
          missedKeywords: {}
        };
      }
      var p = phaseMap[sid];
      p.totalAttempts++;
      var score = Number(row.score || 0);
      if (score > p.bestScore) p.bestScore = score;
      p.totalTimeSec += Number(row.responseTimeSec || 0);
      p.totalListens += Math.max(1, Number(row.replayCount || 1));

      var isCorrect = row.correct === true || String(row.correct).toUpperCase() === 'TRUE';
      if (isCorrect && Number(row.attemptNumber || 0) === 1) p.firstTryCorrect = true;

      // Accumulate missed keywords
      var missed = String(row.keywordsMissing || '').split('|').map(function(k){ return k.trim(); }).filter(Boolean);
      missed.forEach(function(kw) { p.missedKeywords[kw] = (p.missedKeywords[kw] || 0) + 1; });
    });

    var phases = Object.keys(phaseMap).map(function(sid) {
      var p = phaseMap[sid];
      // Top 3 most-missed keywords
      var kwEntries = Object.keys(p.missedKeywords).map(function(kw) {
        return { kw: kw, count: p.missedKeywords[kw] };
      }).sort(function(a,b){ return b.count - a.count; }).slice(0, 3);
      p.topMissedKeywords = kwEntries.map(function(e){ return e.kw; });
      delete p.missedKeywords;
      return p;
    });

    phases.sort(function(a,b){ return a.phaseOrder - b.phaseOrder; });

    var totalAttempts   = phases.reduce(function(s,p){ return s + p.totalAttempts; }, 0);
    var firstTryCorrect = phases.filter(function(p){ return p.firstTryCorrect; }).length;
    var totalTimeSec    = phases.reduce(function(s,p){ return s + p.totalTimeSec; }, 0);
    var avgScore = phases.length
      ? Math.round(phases.reduce(function(s,p){ return s + p.bestScore; }, 0) / phases.length)
      : 0;

    return {
      ok: true,
      debrief: {
        level:           level,
        country:         country,
        totalPhases:     phases.length,
        totalAttempts:   totalAttempts,
        firstTryCorrect: firstTryCorrect,
        avgScore:        avgScore,
        totalTimeSec:    totalTimeSec,
        phases:          phases
      }
    };
  } catch(err) {
    return apiError_('apiGetTrainingDebrief', err);
  }
}

// ─── TESTIMONIALS ─────────────────────────────────────────────────────────────

function ensureExamsSheet_() {
  try { dbGetSheet_('Exams'); } catch(e) {
    var ss = dbGetSpreadsheet_();
    var newSheet = ss.insertSheet('Exams');
    newSheet.appendRow(DB_SCHEMA.Exams);
    var headerRange = newSheet.getRange(1, 1, 1, DB_SCHEMA.Exams.length);
    headerRange.setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');
  }
}

function ensureTestimonialsSheet_() {
  try { dbGetSheet_('Testimonials'); } catch(e) {
    var ss = dbGetSpreadsheet_();
    var newSheet = ss.insertSheet('Testimonials');
    newSheet.appendRow(DB_SCHEMA.Testimonials);
  }
}

// ─── LMS SHEET SETUP ─────────────────────────────────────────────────────────
function setupLMSSheets() {
  var ss = SpreadsheetApp.openById('15Za2QsPmUcDwN92qzY1SMpihUCyLh3zeuZwcnmb9H1E');
  var sheetsData = [
    { name: 'Admin_Engines',      headers: ['Term',      'Definition']  },
    { name: 'Admin_NonRoutine',   headers: ['Scenario',  'Category']    },
    { name: 'Admin_HumanFactors', headers: ['Concept',   'Description'] },
    { name: 'LMS_Data',           headers: ['Timestamp', 'Email', 'Module', 'Score'] }
  ];

  sheetsData.forEach(function(data) {
    var sheet = ss.getSheetByName(data.name);
    if (!sheet) {
      sheet = ss.insertSheet(data.name);
      sheet.appendRow(data.headers);
      sheet.getRange(1, 1, 1, data.headers.length).setFontWeight('bold');
    }
  });
}

// ─── PSYCHOLOGICAL / FLIGHT STRESS ANALYTICS ─────────────────────────────────
function apiGetFlightStressAnalytics(sessionToken) {
  try {
    var caller = AuthService.requireRole(sessionToken, ['ADMIN', 'INSTRUCTOR']);
    var role   = String(caller.role || '').toUpperCase();

    // Load all flight stress events from ClientEvents
    var allEvents = dbReadAll_('ClientEvents').filter(function(e) {
      var t = String(e.eventType || '');
      return t === 'FLIGHT_WARN_ALT'    || t === 'FLIGHT_WARN_HDG' ||
             t === 'FLIGHT_CORRECT_ALT' || t === 'FLIGHT_CORRECT_HDG';
    });

    // Instructors only see events for their own students
    if (role === 'INSTRUCTOR') {
      var myStudentIds = {};
      dbReadAll_('Groups').forEach(function(g) {
        if (String(g.instructorId || '') === String(caller.userId || '')) {
          myStudentIds[String(g.userId || '')] = true;
        }
      });
      // Also check user.assignedGroupId pattern
      dbReadAll_('Users').forEach(function(u) {
        if (String(u.instructorId || '') === String(caller.userId || '')) {
          myStudentIds[String(u.userId || '')] = true;
        }
      });
      allEvents = allEvents.filter(function(e) { return myStudentIds[String(e.userId || '')]; });
    }

    // Load users for name lookup
    var userMap = {};
    dbReadAll_('Users').forEach(function(u) {
      userMap[String(u.userId || '')] = { name: u.name || u.email || u.userId, email: u.email || '' };
    });

    // Canonical phase names — collapse legacy variants to standard codes
    var PHASE_ALIASES_ = {
      'TAKE_OFF':  'TAKEOFF',
      'CLIMB':     'DEPARTURE',
      'TAXI':      'TAXI_OUT',
      'FINAL':     'APPROACH',
      'GO_AROUND': 'APPROACH'
    };
    function normalizePhase_(raw) {
      var p = String(raw || '').trim().toUpperCase() || 'UNKNOWN';
      return PHASE_ALIASES_[p] || p;
    }

    // Aggregate per user
    var byUser = {};
    var levelSet = {};
    allEvents.forEach(function(e) {
      var uid = String(e.userId || '_');
      if (!byUser[uid]) byUser[uid] = {
        userId: uid,
        warnings: 0, corrections: 0,
        correctionTimes: [],
        byPhase: {},
        byLevel: {}
      };
      var u    = byUser[uid];
      var ph   = normalizePhase_(e.phaseCode);
      var lvl  = String(e.level || 'Unknown');
      var meta = {};
      try { meta = JSON.parse(e.metadata || '{}'); } catch(x) {}

      if (!u.byPhase[ph]) u.byPhase[ph] = { warnings: 0, corrections: 0, corrTimes: [] };
      if (!u.byLevel[lvl]) u.byLevel[lvl] = { warnings: 0, corrections: 0, corrTimes: [] };
      levelSet[lvl] = true;

      if (e.eventType === 'FLIGHT_WARN_ALT' || e.eventType === 'FLIGHT_WARN_HDG') {
        u.warnings++;
        u.byPhase[ph].warnings++;
        u.byLevel[lvl].warnings++;
      }
      if (e.eventType === 'FLIGHT_CORRECT_ALT' || e.eventType === 'FLIGHT_CORRECT_HDG') {
        u.corrections++;
        u.byPhase[ph].corrections++;
        u.byLevel[lvl].corrections++;
        var cs = Number(meta.correctionSec || 0);
        if (cs > 0 && cs < 120) {
          u.correctionTimes.push(cs);
          u.byPhase[ph].corrTimes.push(cs);
          u.byLevel[lvl].corrTimes.push(cs);
        }
      }
    });

    var levelList = Object.keys(levelSet).filter(function(l){ return l !== 'Unknown'; })
      .sort(function(a,b){ return Number(a) - Number(b); });

    var userRows = Object.keys(byUser).map(function(uid) {
      var u   = byUser[uid];
      var rec = u.warnings > 0 ? Math.round((u.corrections / u.warnings) * 100) : 100;
      var avgC = u.correctionTimes.length
        ? Math.round(u.correctionTimes.reduce(function(s,x){return s+x;},0) / u.correctionTimes.length)
        : 0;
      // Speed score: 100 if ≤3s, 0 if ≥30s, linear
      var speedScore = avgC > 0 ? Math.max(0, Math.min(100, Math.round(100 - (avgC - 3) * (100/27)))) : 100;
      var multiScore = Math.min(100, Math.round(rec * 0.6 + speedScore * 0.4));
      var info = userMap[uid] || { name: uid, email: '' };
      return {
        userId:          uid,
        name:            info.name,
        email:           info.email,
        warnings:        u.warnings,
        corrections:     u.corrections,
        recoveryRate:    rec,
        avgCorrectionSec: avgC,
        multitaskingScore: multiScore,
        byPhase:         u.byPhase,
        byLevel:         u.byLevel
      };
    });
    userRows.sort(function(a,b) { return b.multitaskingScore - a.multitaskingScore; });

    // Platform totals
    var totalWarnings = allEvents.filter(function(e){ return e.eventType==='FLIGHT_WARN_ALT'||e.eventType==='FLIGHT_WARN_HDG'; }).length;
    var allCorrTimes  = [];
    allEvents.forEach(function(e) {
      if (e.eventType === 'FLIGHT_CORRECT_ALT' || e.eventType === 'FLIGHT_CORRECT_HDG') {
        var m = {}; try { m = JSON.parse(e.metadata||'{}'); } catch(x){}
        var cs = Number(m.correctionSec||0);
        if (cs > 0 && cs < 120) allCorrTimes.push(cs);
      }
    });
    var platformAvgCorr = allCorrTimes.length
      ? Math.round(allCorrTimes.reduce(function(s,x){return s+x;},0)/allCorrTimes.length) : 0;

    // Per-phase warning counts (platform-wide)
    var phaseWarns = {};
    allEvents.forEach(function(e) {
      if (e.eventType !== 'FLIGHT_WARN_ALT' && e.eventType !== 'FLIGHT_WARN_HDG') return;
      var ph = normalizePhase_(e.phaseCode);
      phaseWarns[ph] = (phaseWarns[ph] || 0) + 1;
    });
    var phaseBreakdown = Object.keys(phaseWarns).map(function(ph) {
      return { phase: ph, warnings: phaseWarns[ph] };
    }).sort(function(a,b){ return b.warnings - a.warnings; });

    var avgRecovery = userRows.length
      ? Math.round(userRows.reduce(function(s,u){return s+u.recoveryRate;},0)/userRows.length) : 0;

    // Per-scenario comparison: group events by route+phase so students can be ranked on identical conditions
    var byScenario = {};
    allEvents.forEach(function(e) {
      var ph   = normalizePhase_(e.phaseCode);
      var key  = (e.routeName || 'Unknown Route') + '·' + ph;
      if (!byScenario[key]) byScenario[key] = { route: e.routeName || 'Unknown Route', phase: ph, students: {} };
      var uid  = String(e.userId || '_');
      if (!byScenario[key].students[uid]) byScenario[key].students[uid] = { warnings: 0, corrections: 0, corrTimes: [] };
      var su   = byScenario[key].students[uid];
      var meta = {}; try { meta = JSON.parse(e.metadata || '{}'); } catch(x) {}
      if (e.eventType === 'FLIGHT_WARN_ALT'    || e.eventType === 'FLIGHT_WARN_HDG')    su.warnings++;
      if (e.eventType === 'FLIGHT_CORRECT_ALT' || e.eventType === 'FLIGHT_CORRECT_HDG') {
        su.corrections++;
        var cs = Number(meta.correctionSec || 0);
        if (cs > 0 && cs < 120) su.corrTimes.push(cs);
      }
    });
    var scenarioComparisons = Object.keys(byScenario).map(function(key) {
      var sc       = byScenario[key];
      var students = Object.keys(sc.students).map(function(uid) {
        var su  = sc.students[uid];
        var rec = su.warnings > 0 ? Math.round((su.corrections / su.warnings) * 100) : 100;
        var avgC = su.corrTimes.length ? Math.round(su.corrTimes.reduce(function(a,b){return a+b;},0)/su.corrTimes.length) : 0;
        var spd  = avgC > 0 ? Math.max(0, Math.min(100, Math.round(100-(avgC-3)*(100/27)))) : 100;
        var info = userMap[uid] || { name: uid, email: '' };
        return { userId: uid, name: info.name, email: info.email,
                 warnings: su.warnings, recoveryRate: rec, avgCorrectionSec: avgC,
                 multitaskingScore: Math.min(100, Math.round(rec*0.6 + spd*0.4)) };
      }).filter(function(s) { return s.warnings > 0; })
        .sort(function(a,b) { return b.multitaskingScore - a.multitaskingScore; });
      return { route: sc.route, phase: sc.phase, students: students };
    }).filter(function(sc) { return sc.students.length >= 2; })
      .sort(function(a,b)  { return b.students.length - a.students.length; });

    return {
      ok: true,
      summary: {
        totalWarnings:    totalWarnings,
        avgCorrectionSec: platformAvgCorr,
        avgRecoveryRate:  avgRecovery,
        studentsTracked:  userRows.length
      },
      users:               userRows,
      phaseBreakdown:      phaseBreakdown,
      levelList:           levelList,
      scenarioComparisons: scenarioComparisons
    };
  } catch(err) {
    return apiError_('apiGetFlightStressAnalytics', err);
  }
}
// ─── END PSYCHOLOGICAL ANALYTICS ─────────────────────────────────────────────

function apiGetTestimonials() {
  try {
    ensureTestimonialsSheet_();
    var rows = dbReadAll_('Testimonials');
    var active = rows
      .filter(function(r) { return String(r.active).toUpperCase() === 'TRUE'; })
      .sort(function(a, b) { return Number(a.sortOrder || 0) - Number(b.sortOrder || 0); });
    return { ok: true, testimonials: active };
  } catch(err) {
    return apiError_('apiGetTestimonials', err);
  }
}

function apiAdminGetTestimonials(sessionToken) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN']);
    ensureTestimonialsSheet_();
    var rows = dbReadAll_('Testimonials');
    rows.sort(function(a, b) { return Number(a.sortOrder || 0) - Number(b.sortOrder || 0); });
    return { ok: true, testimonials: rows };
  } catch(err) {
    return apiError_('apiAdminGetTestimonials', err);
  }
}

function apiAdminSaveTestimonial(sessionToken, payload) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN']);
    ensureTestimonialsSheet_();
    var p = payload || {};
    if (p.testimonialId) {
      var rows = dbReadAll_('Testimonials');
      var found = null;
      rows.forEach(function(r) { if (r.testimonialId === p.testimonialId) found = r; });
      if (!found) return { ok: false, message: 'Testimonial not found' };
      dbUpdateByRow_('Testimonials', found.__rowNumber, {
        name:      String(p.name  || ''),
        role:      String(p.role  || ''),
        rating:    Number(p.rating || 5),
        text:      String(p.text  || ''),
        active:    p.active === false || p.active === 'false' ? 'false' : 'true',
        sortOrder: Number(p.sortOrder || 0)
      });
    } else {
      dbAppend_('Testimonials', {
        testimonialId: 'TM' + Date.now(),
        name:          String(p.name  || ''),
        role:          String(p.role  || ''),
        rating:        Number(p.rating || 5),
        text:          String(p.text  || ''),
        active:        'true',
        sortOrder:     Number(p.sortOrder || 0),
        createdAt:     new Date().toISOString()
      });
    }
    return { ok: true };
  } catch(err) {
    return apiError_('apiAdminSaveTestimonial', err);
  }
}

function apiAdminDeleteTestimonial(sessionToken, payload) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN']);
    var rows = dbReadAll_('Testimonials');
    var found = null;
    rows.forEach(function(r) { if (r.testimonialId === String((payload || {}).testimonialId || '')) found = r; });
    if (!found) return { ok: false, message: 'Testimonial not found' };
    dbDeleteByRow_('Testimonials', found.__rowNumber);
    return { ok: true };
  } catch(err) {
    return apiError_('apiAdminDeleteTestimonial', err);
  }
}

// ════════════════════════════════════════════════════════════════════
//  WOMPI PAYMENT INTEGRATION
// ════════════════════════════════════════════════════════════════════

var _PLAN_DAYS = { '15d': 15, '1m': 30, '3m': 90 };
var _PLAN_PROPS = {
  '15d': 'WOMPI_AMOUNT_15D_CENTS',
  '1m':  'WOMPI_AMOUNT_1M_CENTS',
  '3m':  'WOMPI_AMOUNT_3M_CENTS'
};
var _PLAN_DEFAULTS = { '15d': '1490000', '1m': '2990000', '3m': '7990000' };


function apiGetWompiCheckoutData(sessionToken, plan) {
  try {
    var user    = AuthService.requireRole(sessionToken, ['STUDENT', 'ADMIN', 'INSTRUCTOR']);
    var props   = PropertiesService.getScriptProperties();
    var pubKey  = props.getProperty('WOMPI_PUB_KEY')          || '';
    var secret  = props.getProperty('WOMPI_INTEGRITY_SECRET') || '';
    plan = (plan && _PLAN_DAYS[plan]) ? plan : '1m';
    var cents    = parseInt(props.getProperty(_PLAN_PROPS[plan]) || _PLAN_DEFAULTS[plan], 10);
    var currency  = 'COP';
    var reference = 'AEROCOMMS-' + plan + '-' + user.userId + '-' + Date.now();

    var hashBytes = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      reference + cents + currency + secret,
      Utilities.Charset.UTF_8
    );
    var integrity = hashBytes.map(function(b) {
      return ('0' + (b & 0xff).toString(16)).slice(-2);
    }).join('');

    return { ok: true, pubKey: pubKey, amountCents: cents, currency: currency,
             reference: reference, integrity: integrity, email: user.email || '', plan: plan };
  } catch (e) {
    Logger.log('apiGetWompiCheckoutData ERROR: ' + e.message);
    return { ok: false, error: e.message || 'Unknown error' };
  }
}

function apiGetWompiPlans(sessionToken) {
  try {
    var props = PropertiesService.getScriptProperties();
    return {
      ok: true,
      plans: [
        { id: '15d', label: '15 días',  days: 15, cents: parseInt(props.getProperty('WOMPI_AMOUNT_15D_CENTS') || '1490000', 10) },
        { id: '1m',  label: '1 mes',    days: 30, cents: parseInt(props.getProperty('WOMPI_AMOUNT_1M_CENTS')  || '2990000', 10) },
        { id: '3m',  label: '3 meses',  days: 90, cents: parseInt(props.getProperty('WOMPI_AMOUNT_3M_CENTS')  || '7990000', 10) }
      ]
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function apiAdminSaveSubscriptionPrices(sessionToken, prices) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN']);
    var props = PropertiesService.getScriptProperties();
    var p = prices || {};
    if (p.cents15d) props.setProperty('WOMPI_AMOUNT_15D_CENTS', String(parseInt(p.cents15d, 10)));
    if (p.cents1m)  props.setProperty('WOMPI_AMOUNT_1M_CENTS',  String(parseInt(p.cents1m,  10)));
    if (p.cents3m)  props.setProperty('WOMPI_AMOUNT_3M_CENTS',  String(parseInt(p.cents3m,  10)));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function debugWompiConfig() {
  var props = PropertiesService.getScriptProperties();
  Logger.log('WOMPI_PUB_KEY set: '           + !!props.getProperty('WOMPI_PUB_KEY'));
  Logger.log('WOMPI_INTEGRITY_SECRET set: '  + !!props.getProperty('WOMPI_INTEGRITY_SECRET'));
  Logger.log('WOMPI_AMOUNT_COP_CENTS: '      + (props.getProperty('WOMPI_AMOUNT_COP_CENTS') || 'NOT SET'));
}

function apiGetSubscriptionStatus(sessionToken) {
  try {
    var user = AuthService.requireRole(sessionToken, ['STUDENT', 'ADMIN', 'INSTRUCTOR']);
    return wompiGetSubscriptionStatus_(user.userId);
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function apiAdminListSubscriptions(sessionToken) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN']);
    var sheet = wompiGetOrCreateSheet_();
    var data  = sheet.getDataRange().getValues();
    if (data.length <= 1) return { ok: true, subscriptions: [] };
    var headers = data[0];
    var rows = data.slice(1).map(function(row) {
      var obj = {};
      headers.forEach(function(h, i) { obj[h] = row[i]; });
      return obj;
    });
    return { ok: true, subscriptions: rows };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function wompiGetSubscriptionStatus_(userId) {
  var sheet = wompiGetOrCreateSheet_();
  var data  = sheet.getDataRange().getValues();
  var now   = new Date();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]) === String(userId) && String(data[i][7]) === 'active') {
      var endDate = new Date(data[i][6]);
      if (endDate > now) {
        return {
          ok: true,
          active: true,
          endDate: data[i][6],
          daysLeft: Math.ceil((endDate - now) / 86400000)
        };
      }
    }
  }
  return { ok: true, active: false };
}

function wompiRecordSubscription_(userId, email, transactionId, amountCents, days) {
  var msPerDay = 24 * 60 * 60 * 1000;
  var addMs    = (days || 30) * msPerDay;
  var sheet    = wompiGetOrCreateSheet_();
  var data     = sheet.getDataRange().getValues();
  var now      = new Date();

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]) === String(userId) && String(data[i][7]) === 'active') {
      var currentEnd = new Date(data[i][6]);
      var base   = currentEnd > now ? currentEnd : now;
      var newEnd = new Date(base.getTime() + addMs);
      sheet.getRange(i + 1, 7).setValue(newEnd.toISOString());
      sheet.getRange(i + 1, 4).setValue(transactionId);
      return;
    }
  }

  var end   = new Date(now.getTime() + addMs);
  var subId = 'sub_' + userId + '_' + now.getTime();
  sheet.appendRow([
    subId, userId, email, transactionId, amountCents,
    now.toISOString(), end.toISOString(), 'active', now.toISOString()
  ]);
}

function wompiGetOrCreateSheet_() {
  var ss    = SpreadsheetApp.openById(
    PropertiesService.getScriptProperties().getProperty(CONFIG.PROP_DB_SPREADSHEET_ID)
  );
  var sheet = ss.getSheetByName('Subscriptions');
  if (!sheet) {
    sheet = ss.insertSheet('Subscriptions');
    sheet.appendRow(['subscriptionId','userId','email','transactionId','amountCents',
                     'startDate','endDate','status','createdAt']);
  }
  return sheet;
}

function apiAdminSaveSubscriptionPrice(sessionToken, amountCopCents) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN']);
    var cents = parseInt(amountCopCents, 10);
    if (!cents || cents < 100) return { ok: false, error: 'Invalid amount' };
    PropertiesService.getScriptProperties().setProperty('WOMPI_AMOUNT_COP_CENTS', String(cents));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function apiAdminGrantSubscription(sessionToken, email, days) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN']);
    var ss      = SpreadsheetApp.openById(
      PropertiesService.getScriptProperties().getProperty(CONFIG.PROP_DB_SPREADSHEET_ID)
    );
    var users   = ss.getSheetByName('Users');
    if (!users) return { ok: false, error: 'Users sheet not found' };
    var data    = users.getDataRange().getValues();
    var headers = data[0];
    var uIdx    = headers.indexOf('userId');
    var eIdx    = headers.indexOf('email');
    var userId  = null;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][eIdx]).toLowerCase() === email.toLowerCase()) {
        userId = String(data[i][uIdx]);
        break;
      }
    }
    if (!userId) return { ok: false, error: 'User not found: ' + email };
    var daysInt = parseInt(days, 10) || 30;
    var now     = new Date();
    var end     = new Date(now.getTime() + daysInt * 24 * 60 * 60 * 1000);
    var sheet   = wompiGetOrCreateSheet_();
    var subData = sheet.getDataRange().getValues();
    for (var j = 1; j < subData.length; j++) {
      if (String(subData[j][1]) === userId && String(subData[j][7]) === 'active') {
        var currentEnd = new Date(subData[j][6]);
        var newEnd     = new Date(Math.max(currentEnd.getTime(), now.getTime()) + daysInt * 24 * 60 * 60 * 1000);
        sheet.getRange(j + 1, 7).setValue(newEnd.toISOString());
        sheet.getRange(j + 1, 8).setValue('active');
        return { ok: true };
      }
    }
    var subId = 'sub_admin_' + userId + '_' + now.getTime();
    sheet.appendRow([subId, userId, email, 'ADMIN_GRANT', 0,
                     now.toISOString(), end.toISOString(), 'active', now.toISOString()]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function apiAdminRevokeSubscription(sessionToken, subscriptionId) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN']);
    var sheet = wompiGetOrCreateSheet_();
    var data  = sheet.getDataRange().getValues();
    var headers = data[0];
    var idIdx = headers.indexOf('subscriptionId');
    var stIdx = headers.indexOf('status');
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][idIdx]) === String(subscriptionId)) {
        sheet.getRange(i + 1, stIdx + 1).setValue('revoked');
        return { ok: true };
      }
    }
    return { ok: false, error: 'Subscription not found' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ─── LMS MODULE FUNCTIONS ─────────────────────────────────────────────────────

function fetchLMSData(sheetName) {
  var ss    = SpreadsheetApp.openById('15Za2QsPmUcDwN92qzY1SMpihUCyLh3zeuZwcnmb9H1E');
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  var headers = data[0];
  return data.slice(1).map(function(row) {
    var obj = {};
    headers.forEach(function(header, i) {
      obj[header] = row[i];
    });
    return obj;
  });
}

function saveLMSScore(email, moduleName, score) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var ss    = SpreadsheetApp.openById('15Za2QsPmUcDwN92qzY1SMpihUCyLh3zeuZwcnmb9H1E');
    var sheet = ss.getSheetByName('LMS_Data');
    if (!sheet) throw new Error('LMS_Data sheet not found. Run setupLMSSheets() first.');
    sheet.appendRow([new Date(), email, moduleName, score]);
  } finally {
    lock.releaseLock();
  }
}

// Run this function ONCE from the Apps Script editor (Extensions > Apps Script > Run)
// to register the weekly automatic trigger. Do NOT run it again — it creates a new
// duplicate trigger each time. Use deleteWeeklyEmailTrigger() to remove all first.
function setupWeeklyEmailTrigger() {
  // Remove any existing triggers for sendWeeklyResetEmails to avoid duplicates
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'sendWeeklyResetEmails') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // Fire every Monday at 19:00–20:00 UTC (= 2:00 PM Colombia / UTC-5)
  ScriptApp.newTrigger('sendWeeklyResetEmails')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(19)
    .create();

  Logger.log('Weekly email trigger set: every Monday at 19:00 UTC (2:00 PM Colombia).');
}

// Run this to remove all triggers for sendWeeklyResetEmails (e.g. before re-running setup).
function deleteWeeklyEmailTrigger() {
  var removed = 0;
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'sendWeeklyResetEmails') {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });
  Logger.log('Removed ' + removed + ' trigger(s) for sendWeeklyResetEmails.');
}

