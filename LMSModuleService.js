// ─────────────────────────────────────────────────────────────────────────────
// LMSModuleService.js
// Backend for the structured LMS module system.
// 4 sections per module (Intro → Explanation → Application → Evaluation).
// Each section locks until the previous is completed.
// ─────────────────────────────────────────────────────────────────────────────

// ── Helpers ───────────────────────────────────────────────────────────────────

// mergeObjects_ lives in Userservice.gs.
//
// There were two of these, in one global scope, and they were not the same: that one
// guards against null and this one called Object.keys on it. Apps Script keeps
// whichever file it loads last, so which behaviour you got depended on file order —
// and the difference only shows when somebody passes a null, which is exactly when a
// throw is least welcome.
//
// Deleted rather than reconciled: one definition cannot drift from itself.

// Normalize GAS sheet boolean — Sheets may return TRUE/FALSE as strings
function lmsBool_(v) {
  if (v === true  || v === 'TRUE'  || v === 'true'  || v === 1) return true;
  if (v === false || v === 'FALSE' || v === 'false' || v === 0 || v === '' || v === null || v === undefined) return false;
  return !!v;
}

// ── Constants ─────────────────────────────────────────────────────────────────

var LMS_QUIZ_COOLDOWN_MS   = 15 * 60 * 1000; // 15-minute cooldown between quiz retries
var LMS_MIN_PASS_SCORE     = 85;              // % required to pass quiz / evaluation
var LMS_MIN_SCENARIOS      = 3;              // target scenarios shown in progress bar (evaluation gated by grammar+listening, not scenarios)
var LMS_FORUM_MIN_WORDS    = 3;              // minimum words in a forum post

// ── Setup ─────────────────────────────────────────────────────────────────────

function setupLMSModuleSheets() {
  var ss = dbGetSpreadsheet_();
  var sheets = [
    'Modules', 'ModuleVideos', 'ModuleQuiz', 'ModuleQuizAnswers',
    'ModuleScenarios', 'ModuleForum', 'ModuleForumLikes', 'ModuleProgress',
    'ModuleGrammar', 'ModuleListening', 'ModuleSpeakingPrompt', 'ModuleSpeakingSubmission', 'LmsXp', 'UserStreaks', 'UserActivity'
  ];

  sheets.forEach(function(name) {
    if (!ss.getSheetByName(name)) {
      var s = ss.insertSheet(name);
      s.appendRow(DB_SCHEMA[name]);
      var hdr = s.getRange(1, 1, 1, DB_SCHEMA[name].length);
      hdr.setFontWeight('bold');
      hdr.setBackground('#2d2d2d');
      Logger.log('Created sheet: ' + name);
    } else {
      Logger.log('Sheet already exists: ' + name);
    }
  });

  // Ensure existing sheets have all expected columns (adds missing headers without losing data)
  _lmsRepairSheetHeaders_(ss, 'LmsXp');
  _lmsRepairSheetHeaders_(ss, 'UserStreaks');
  _lmsRepairSheetHeaders_(ss, 'ModuleProgress');
  _lmsRepairSheetHeaders_(ss, 'ModuleQuiz');
  _lmsRepairSheetHeaders_(ss, 'Modules');
  _lmsRepairSheetHeaders_(ss, 'UserActivity');
}

// Run this once from the GAS editor to force-rewrite ModuleQuiz headers to the new schema.
function fixModuleQuizHeaders() {
  var ss = dbGetSpreadsheet_();
  var sheet = ss.getSheetByName('ModuleQuiz');
  if (!sheet) { Logger.log('ModuleQuiz sheet not found'); return; }
  var schema = DB_SCHEMA['ModuleQuiz'];
  sheet.getRange(1, 1, 1, schema.length).setValues([schema]);
  var hdr = sheet.getRange(1, 1, 1, schema.length);
  hdr.setFontWeight('bold');
  hdr.setBackground('#2d2d2d');
  Logger.log('ModuleQuiz headers updated: ' + schema.join(', '));
}

function _lmsRepairSheetHeaders_(ss, sheetName) {
  try {
    var schema = DB_SCHEMA[sheetName];
    if (!schema) return;
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return;
    var existing = sheet.getLastColumn() > 0 ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String) : [];
    schema.forEach(function(col, i) {
      if (existing.indexOf(col) === -1) {
        sheet.getRange(1, i + 1).setValue(col);
      }
    });
  } catch(e) { console.error('[_lmsRepairSheetHeaders_] ' + sheetName + ':', e); }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _lmsGetMondayIso_() {
  var d = new Date();
  var day = d.getDay();
  var diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function lmsGetTotalXp_(userId) {
  var rows = dbReadAll_('LmsXp').filter(function(r) {
    return String(r.userId || '') === String(userId);
  });
  return rows.length ? (Number(rows[0].lmsXp) || 0) : 0;
}

function lmsGetXpData_(userId) {
  var rows = dbReadAll_('LmsXp').filter(function(r) {
    return String(r.userId || '') === String(userId);
  });
  if (!rows.length) return { lmsXp: 0, weeklyXp: 0 };
  var row = rows[0];
  var thisMonday = _lmsGetMondayIso_();
  var weeklyReset = !row.weeklyResetAt || String(row.weeklyResetAt) < thisMonday;
  return {
    lmsXp: Number(row.lmsXp) || 0,
    weeklyXp: weeklyReset ? 0 : (Number(row.weeklyXp) || 0)
  };
}

function lmsAddXp_(userId, amount) {
  if (!amount) return lmsGetTotalXp_(userId);
  var rows = dbReadAll_('LmsXp');
  var existing = rows.filter(function(r) { return String(r.userId || '') === String(userId); })[0];
  var thisMonday = _lmsGetMondayIso_();
  if (existing) {
    var newTotal = (Number(existing.lmsXp) || 0) + amount;
    var weeklyReset = !existing.weeklyResetAt || String(existing.weeklyResetAt) < thisMonday;
    var newWeekly = weeklyReset ? amount : ((Number(existing.weeklyXp) || 0) + amount);
    dbUpdateByRow_('LmsXp', existing.__rowNumber, {
      lmsXp: newTotal,
      weeklyXp: newWeekly,
      weeklyResetAt: weeklyReset ? thisMonday : existing.weeklyResetAt
    });
    return newTotal;
  } else {
    dbAppend_('LmsXp', { userId: userId, lmsXp: amount, weeklyXp: amount, weeklyResetAt: thisMonday });
    return amount;
  }
}

/**
 * Minutes remaining in the CURRENT streak day, measured in the script's timezone.
 *
 * The home card was computing this in the browser as `23 - new Date().getHours()`,
 * which uses the student's device timezone. But the streak day boundary is decided
 * here, on the server, in CONFIG.TIMEZONE. Those only agree for a student sitting
 * in that timezone — anyone abroad was told they had hours left when they did not,
 * or the reverse, and lost a streak the app had said was safe.
 */
function lmsStreakMinutesLeft_() {
  try {
    var now = new Date();
    var hh = Number(Utilities.formatDate(now, CONFIG.TIMEZONE, 'HH'));
    var mm = Number(Utilities.formatDate(now, CONFIG.TIMEZONE, 'mm'));
    return Math.max(0, (24 * 60) - (hh * 60 + mm));
  } catch (e) {
    return 0;
  }
}

function lmsGetStreak_(userId) {
  try {
    var rows = dbReadAll_('UserStreaks').filter(function(r) {
      return String(r.userId || '') === String(userId);
    });
    if (!rows.length) return { streakDays: 0, longestStreak: 0, lastActiveAt: '', streakProtected: false, minutesLeftToday: lmsStreakMinutesLeft_() };
    var row = rows[0];
    var lastMid = row.lastActiveAt ? (function(ts) { var d = new Date(ts); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); })(new Date(row.lastActiveAt).getTime()) : 0;
    var todayMid = (function() { var d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); })();
    var daysSince = lastMid ? Math.round((todayMid - lastMid) / 86400000) : 999;
    var active = daysSince <= 1; // today or yesterday counts as active
    return {
      streakDays: active ? (Number(row.streakDays) || 0) : 0,
      longestStreak: Number(row.longestStreak) || 0,
      lastActiveAt: row.lastActiveAt || '',
      streakProtected: active,
      minutesLeftToday: lmsStreakMinutesLeft_(),
      // Whether TODAY is already banked. streakProtected is daysSince <= 1, i.e.
      // "today or yesterday", so it cannot answer this — and without it the card
      // urges a student to protect a streak they already secured an hour ago.
      doneToday: daysSince === 0
    };
  } catch(e) {
    return { streakDays: 0, longestStreak: 0, lastActiveAt: '', streakProtected: false };
  }
}

function lmsUpdateStreak_(userId) {
  try {
    var now = new Date();
    var nowTs = now.getTime();
    var rows = dbReadAll_('UserStreaks').filter(function(r) {
      return String(r.userId || '') === String(userId);
    });
    if (!rows.length) {
      dbAppend_('UserStreaks', { userId: userId, streakDays: 1, lastActiveAt: now.toISOString(), longestStreak: 1 });
      return 1;
    }
    var row = rows[0];
    var lastTs = row.lastActiveAt ? new Date(row.lastActiveAt).getTime() : 0;
    var streakDays = Number(row.streakDays) || 0;
    var longest = Number(row.longestStreak) || 0;

    // Compare calendar days (midnight-to-midnight) so playing at any time today
    // after playing any time yesterday always counts as the next streak day.
    var toMidnight = function(ts) {
      var d = new Date(ts);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    };
    var todayMid = toMidnight(nowTs);
    var lastMid  = lastTs ? toMidnight(lastTs) : 0;
    var daysDiff = Math.round((todayMid - lastMid) / 86400000);

    if (daysDiff === 0) {
      // Same calendar day — just refresh timestamp, no change to count
      dbUpdateByRow_('UserStreaks', row.__rowNumber, { lastActiveAt: now.toISOString() });
    } else if (daysDiff === 1) {
      // Consecutive calendar day — increment
      streakDays++;
      longest = Math.max(streakDays, longest);
      dbUpdateByRow_('UserStreaks', row.__rowNumber, { streakDays: streakDays, lastActiveAt: now.toISOString(), longestStreak: longest });
    } else {
      // Missed at least one day — use a freeze before resetting
      var freezes = 0;
      try { freezes = _dcGetFreezes_(userId); } catch(e) {}
      if (freezes > 0) {
        try { _dcSetFreezes_(userId, freezes - 1); } catch(e) {}
        dbUpdateByRow_('UserStreaks', row.__rowNumber, { lastActiveAt: now.toISOString() });
      } else {
        streakDays = 1;
        dbUpdateByRow_('UserStreaks', row.__rowNumber, { streakDays: 1, lastActiveAt: now.toISOString() });
      }
    }
    return streakDays;
  } catch(e) {
    return 0;
  }
}

function lmsGetProgress_(userId, moduleId) {
  var rows = dbReadAll_('ModuleProgress').filter(function(r) {
    return String(r.userId || '') === String(userId) &&
           String(r.moduleId || '') === String(moduleId);
  });
  return rows[0] || null;
}

function lmsEnsureProgress_(userId, moduleId) {
  var existing = lmsGetProgress_(userId, moduleId);
  if (existing) return existing;

  var rec = {
    progressId:               uuid_('MP'),
    userId:                   userId,
    moduleId:                 moduleId,
    introVideoWatched:        false,
    introForumPosted:         false,
    introCompleted:           false,
    explanationVideosWatched: '[]',
    explanationForumPosted:   false,
    quizScore:                0,
    grammarScore:             0,
    grammarAttempts:          0,
    grammarLastAttemptAt:     '',
    grammarPassed:            false,
    grammarCompletedAt:       '',
    listeningShortScore:      0,
    listeningShortAttempts:   0,
    listeningShortLastAttemptAt: '',
    listeningShortPassed:     false,
    listeningLongScore:       0,
    listeningLongAttempts:    0,
    listeningLongLastAttemptAt: '',
    listeningLongPassed:      false,
    listeningCompletedAt:     '',
    speakingSubmitted:        false,
    speakingScore:            0,
    speakingGraded:           false,
    speakingCompletedAt:      '',
    quizLastAttemptAt:        '',
    quizAttempts:             0,
    quizPassed:               false,
    explanationCompleted:     false,
    scenariosPassed:          0,
    applicationCompleted:     false,
    evalScore:                0,
    evalLastAttemptAt:        '',
    evalAttempts:             0,
    evalPassed:               false,
    badgeEarned:              false,
    badgeEarnedAt:            '',
    timeSpentIntroSec:        0,
    timeSpentExplanationSec:  0,
    timeSpentApplicationSec:  0,
    timeSpentEvalSec:         0,
    completedAt:              '',
    updatedAt:                now_()
  };

  dbAppend_('ModuleProgress', rec);
  return rec;
}

function lmsCheckCooldown_(lastAttemptAt) {
  if (!lastAttemptAt) return null;
  var last = new Date(lastAttemptAt).getTime();
  var until = last + LMS_QUIZ_COOLDOWN_MS;
  if (Date.now() < until) return new Date(until).toISOString();
  return null;
}

function lmsSectionUnlocked_(progress, section) {
  if (section === 'intro')        return true;
  if (section === 'explanation')  return lmsBool_(progress.introCompleted);
  if (section === 'application')  return lmsBool_(progress.explanationCompleted);
  if (section === 'evaluation')   return lmsBool_(progress.applicationCompleted);
  return false;
}

function lmsScoreAnswers_(questionIds, answers, moduleId, section) {
  var questions = dbReadAll_('ModuleQuiz').filter(function(q) {
    return String(q.moduleId || '') === String(moduleId) &&
           String(q.section  || '') === String(section);
  });

  if (!questions.length) return 0;

  var answerMap = {};
  (answers || []).forEach(function(a) { answerMap[a.questionId] = Number(a.selectedIndex); });

  var correct = 0;
  questions.forEach(function(q) {
    if (answerMap[q.questionId] !== undefined &&
        Number(answerMap[q.questionId]) === Number(q.correctIndex)) {
      correct++;
    }
  });

  return Math.round((correct / questions.length) * 100);
}

// ── ADMIN: Module CRUD ────────────────────────────────────────────────────────

function apiAdminSaveModule(sessionToken, payload) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN']);
    payload = payload || {};

    var title = String(payload.title || '').trim();
    if (!title) throw new Error('Module title is required.');

    var result = dbWithScriptLock_(function() {
      var now = now_();
      if (payload.moduleId) {
        var existing = dbFindOne_('Modules', 'moduleId', payload.moduleId);
        if (!existing) throw new Error('Module not found.');
        var patch = {
          title:               title,
          topic:               String(payload.topic       || existing.topic       || '').trim(),
          description:         String(payload.description || existing.description || '').trim(),
          moduleOrder:         payload.moduleOrder !== undefined ? Number(payload.moduleOrder) : Number(existing.moduleOrder || 0),
          status:              String(payload.status       || existing.status      || 'DRAFT'),
          badgeImageUrl:       String(payload.badgeImageUrl || existing.badgeImageUrl || '').trim(),
          evalTimeLimitMinutes: payload.evalTimeLimitMinutes !== undefined ? Number(payload.evalTimeLimitMinutes) || 30 : Number(existing.evalTimeLimitMinutes || 30),
          updatedAt:           now
        };
        dbUpdateByRow_('Modules', existing.__rowNumber, patch);
        return mergeObjects_(existing, patch);
      } else {
        var newModule = {
          moduleId:             uuid_('MOD'),
          title:                title,
          topic:                String(payload.topic       || '').trim(),
          description:          String(payload.description || '').trim(),
          moduleOrder:          Number(payload.moduleOrder || 0),
          status:               'DRAFT',
          badgeImageUrl:        String(payload.badgeImageUrl || '').trim(),
          evalTimeLimitMinutes: Number(payload.evalTimeLimitMinutes || 30),
          createdAt:            now,
          updatedAt:            now
        };
        dbAppend_('Modules', newModule);
        return newModule;
      }
    });

    return { ok: true, module: result };
  } catch(err) {
    return apiError_('apiAdminSaveModule', err);
  }
}

function apiAdminListModules(sessionToken) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN', 'INSTRUCTOR']);
    var modules  = dbReadAll_('Modules').sort(function(a, b) {
      return Number(a.moduleOrder || 0) - Number(b.moduleOrder || 0);
    });
    var videos    = dbReadAll_('ModuleVideos');
    var questions = dbReadAll_('ModuleQuiz');
    var scenarios = dbReadAll_('ModuleScenarios');

    var result = modules.map(function(m) {
      return {
        moduleId:      m.moduleId,
        title:         m.title,
        topic:         m.topic,
        description:   m.description,
        moduleOrder:   m.moduleOrder,
        status:        m.status,
        badgeImageUrl: m.badgeImageUrl,
        createdAt:     m.createdAt,
        videoCount:    videos.filter(function(v)    { return v.moduleId === m.moduleId; }).length,
        questionCount: questions.filter(function(q)  { return q.moduleId === m.moduleId; }).length,
        scenarioCount: scenarios.filter(function(s)  { return s.moduleId === m.moduleId; }).length
      };
    });

    return { ok: true, modules: result };
  } catch(err) {
    return apiError_('apiAdminListModules', err);
  }
}

function apiAdminDeleteModule(sessionToken, payload) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN']);
    var moduleId = String((payload || {}).moduleId || '');
    if (!moduleId) throw new Error('moduleId required.');

    dbWithScriptLock_(function() {
      var m = dbFindOne_('Modules', 'moduleId', moduleId);
      if (!m) throw new Error('Module not found.');
      dbDeleteByRow_('Modules', m.__rowNumber);

      ['ModuleVideos','ModuleQuiz','ModuleScenarios','ModuleForum','ModuleProgress'].forEach(function(sheet) {
        var rows = dbReadAll_(sheet).filter(function(r) { return String(r.moduleId || '') === moduleId; });
        rows.slice().reverse().forEach(function(r) { dbDeleteByRow_(sheet, r.__rowNumber); });
      });
    });

    return { ok: true };
  } catch(err) {
    return apiError_('apiAdminDeleteModule', err);
  }
}

// ── ADMIN: Videos ─────────────────────────────────────────────────────────────

function apiAdminSaveModuleVideo(sessionToken, payload) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN']);
    payload = payload || {};

    var youtubeUrl = String(payload.youtubeUrl || '').trim();
    var title      = String(payload.title      || '').trim();
    var section    = String(payload.section    || '').trim();
    var moduleId   = String(payload.moduleId   || '').trim();

    if (!youtubeUrl) throw new Error('youtubeUrl is required.');
    if (!moduleId)   throw new Error('moduleId is required.');
    if (section !== 'intro' && section !== 'explanation') throw new Error('section must be intro or explanation.');

    var result = dbWithScriptLock_(function() {
      var now = now_();
      if (payload.videoId) {
        var existing = dbFindOne_('ModuleVideos', 'videoId', payload.videoId);
        if (!existing) throw new Error('Video not found.');
        var patch = {
          youtubeUrl:  youtubeUrl,
          title:       title,
          section:     section,
          videoOrder:  payload.videoOrder !== undefined ? Number(payload.videoOrder) : Number(existing.videoOrder || 0)
        };
        dbUpdateByRow_('ModuleVideos', existing.__rowNumber, patch);
        return mergeObjects_(existing, patch);
      } else {
        var newVid = {
          videoId:    uuid_('VID'),
          moduleId:   moduleId,
          section:    section,
          youtubeUrl: youtubeUrl,
          title:      title,
          videoOrder: Number(payload.videoOrder || 0),
          createdAt:  now
        };
        dbAppend_('ModuleVideos', newVid);
        return newVid;
      }
    });

    return { ok: true, video: result };
  } catch(err) {
    return apiError_('apiAdminSaveModuleVideo', err);
  }
}

function apiAdminDeleteModuleVideo(sessionToken, payload) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN']);
    var videoId = String((payload || {}).videoId || '');
    if (!videoId) throw new Error('videoId required.');

    dbWithScriptLock_(function() {
      var v = dbFindOne_('ModuleVideos', 'videoId', videoId);
      if (!v) throw new Error('Video not found.');
      dbDeleteByRow_('ModuleVideos', v.__rowNumber);
    });

    return { ok: true };
  } catch(err) {
    return apiError_('apiAdminDeleteModuleVideo', err);
  }
}

function apiAdminListModuleVideos(sessionToken, moduleId) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN']);
    moduleId = String(moduleId || '');
    if (!moduleId) throw new Error('moduleId required.');

    var videos = dbReadAll_('ModuleVideos')
      .filter(function(v) { return String(v.moduleId || '') === moduleId; })
      .sort(function(a, b) { return Number(a.videoOrder || 0) - Number(b.videoOrder || 0); });

    return { ok: true, videos: videos };
  } catch(err) {
    return apiError_('apiAdminListModuleVideos', err);
  }
}

// ── ADMIN: Quiz ───────────────────────────────────────────────────────────────

function apiAdminSaveModuleQuestion(sessionToken, payload) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN']);
    payload = payload || {};

    var question      = String(payload.question  || '').trim();
    var moduleId      = String(payload.moduleId  || '').trim();
    var section       = String(payload.section   || 'explanation').trim();
    var questionType  = String(payload.questionType || 'standard').trim();
    var audioScript   = String(payload.audioScript  || '').trim();
    var questionOrder = Number(payload.questionOrder || 0);

    if (!question) throw new Error('question is required.');
    if (!moduleId) throw new Error('moduleId is required.');

    var videoId = String(payload.videoId || '').trim();
    if (section === 'explanation' && !videoId) throw new Error('videoId is required for explanation questions.');

    var options = Array.isArray(payload.options) ? payload.options : [];
    if (options.length < 2) throw new Error('At least 2 options required.');
    var correctIndex   = Number(payload.correctIndex   || 0);
    var xpReward       = Number(payload.xpReward       || 5);
    var videoTimestamp = Number(payload.videoTimestamp  || 0);
    if (correctIndex < 0 || correctIndex >= options.length) throw new Error('Invalid correctIndex.');

    var result = dbWithScriptLock_(function() {
      var now = now_();
      if (payload.questionId) {
        var existing = dbFindOne_('ModuleQuiz', 'questionId', payload.questionId);
        if (!existing) throw new Error('Question not found.');
        var patch = {
          section:        section,
          questionOrder:  questionOrder,
          questionType:   questionType,
          audioScript:    audioScript,
          videoId:        videoId,
          question:       question,
          optionsJson:    JSON.stringify(options),
          correctIndex:   correctIndex,
          explanation:    String(payload.explanation || '').trim(),
          xpReward:       xpReward,
          videoTimestamp: videoTimestamp
        };
        dbUpdateByRow_('ModuleQuiz', existing.__rowNumber, patch);
        return mergeObjects_(existing, patch);
      } else {
        var newQ = {
          questionId:     uuid_('QST'),
          moduleId:       moduleId,
          section:        section,
          questionOrder:  questionOrder,
          questionType:   questionType,
          audioScript:    audioScript,
          videoId:        videoId,
          question:       question,
          optionsJson:    JSON.stringify(options),
          correctIndex:   correctIndex,
          explanation:    String(payload.explanation || '').trim(),
          xpReward:       xpReward,
          videoTimestamp: videoTimestamp,
          createdAt:      now
        };
        dbAppend_('ModuleQuiz', newQ);
        return newQ;
      }
    });

    return { ok: true, question: result };
  } catch(err) {
    return apiError_('apiAdminSaveModuleQuestion', err);
  }
}

function apiAdminDeleteModuleQuestion(sessionToken, payload) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN']);
    var questionId = String((payload || {}).questionId || '');
    if (!questionId) throw new Error('questionId required.');

    dbWithScriptLock_(function() {
      var q = dbFindOne_('ModuleQuiz', 'questionId', questionId);
      if (!q) throw new Error('Question not found.');
      dbDeleteByRow_('ModuleQuiz', q.__rowNumber);
    });

    return { ok: true };
  } catch(err) {
    return apiError_('apiAdminDeleteModuleQuestion', err);
  }
}

function apiAdminListModuleQuestions(sessionToken, moduleId) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN']);
    moduleId = String(moduleId || '');
    if (!moduleId) throw new Error('moduleId required.');

    var questions = dbReadAll_('ModuleQuiz')
      .filter(function(q) { return String(q.moduleId || '') === moduleId; })
      .sort(function(a, b) {
        var secOrder = { explanation: 0, evaluation: 1 };
        var sd = (secOrder[String(a.section||'explanation')] || 0) - (secOrder[String(b.section||'explanation')] || 0);
        if (sd !== 0) return sd;
        var od = Number(a.questionOrder || 0) - Number(b.questionOrder || 0);
        if (od !== 0) return od;
        return Number(a.videoTimestamp || 0) - Number(b.videoTimestamp || 0);
      })
      .map(function(q) {
        var opts = [];
        try { opts = JSON.parse(q.optionsJson || '[]'); } catch(e) {}
        return {
          questionId:     q.questionId,
          moduleId:       q.moduleId,
          section:        q.section       || 'explanation',
          questionOrder:  Number(q.questionOrder || 0),
          questionType:   q.questionType  || 'standard',
          audioScript:    q.audioScript   || '',
          videoId:        q.videoId,
          question:       q.question,
          options:        opts,
          correctIndex:   Number(q.correctIndex || 0),
          explanation:    q.explanation || '',
          xpReward:       Number(q.xpReward || 5),
          videoTimestamp: Number(q.videoTimestamp || 0),
          createdAt:      q.createdAt
        };
      });

    return { ok: true, questions: questions };
  } catch(err) {
    return apiError_('apiAdminListModuleQuestions', err);
  }
}

function apiGetVideoQuizzes(sessionToken, videoId) {
  try {
    AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    videoId = String(videoId || '');
    if (!videoId) return { ok: true, data: [] };

    var quizzes = dbReadAll_('ModuleQuiz')
      .filter(function(r) { return String(r.videoId || '') === videoId; })
      .sort(function(a, b) { return Number(a.videoTimestamp || 0) - Number(b.videoTimestamp || 0); })
      .map(function(r) {
        var opts = [];
        try { opts = JSON.parse(r.optionsJson || '[]'); } catch(e) {}
        return {
          quizId:         r.questionId,
          videoId:        r.videoId,
          moduleId:       r.moduleId,
          question:       r.question,
          options:        opts,
          correctIndex:   Number(r.correctIndex || 0),
          explanation:    r.explanation || '',
          xpReward:       Number(r.xpReward || 5),
          videoTimestamp: Number(r.videoTimestamp || 0)
        };
      });

    return { ok: true, data: quizzes };
  } catch(e) {
    return apiError_('apiGetVideoQuizzes', e);
  }
}

function apiSubmitVideoQuizAnswer(sessionToken, moduleId, quizId, isCorrect) {
  try {
    var user = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    if (!isCorrect) return { ok: true, xpAwarded: 0 };
    var row = dbFindOne_('ModuleQuiz', 'questionId', quizId);
    var xp = row ? (Number(row.xpReward) || 5) : 5;
    var newTotal = lmsAddXp_(user.userId, xp);
    return { ok: true, xpAwarded: xp, lmsXpTotal: newTotal };
  } catch(e) {
    return apiError_('apiSubmitVideoQuizAnswer', e);
  }
}

// ── ADMIN: Scenario Tagging ───────────────────────────────────────────────────

function apiAdminLinkModuleScenario(sessionToken, payload) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN']);
    var moduleId   = String((payload || {}).moduleId   || '');
    var scenarioId = String((payload || {}).scenarioId || '');
    if (!moduleId || !scenarioId) throw new Error('moduleId and scenarioId required.');

    dbWithScriptLock_(function() {
      var existing = dbReadAll_('ModuleScenarios').filter(function(r) {
        return String(r.moduleId || '') === moduleId && String(r.scenarioId || '') === scenarioId;
      });
      if (existing.length) return; // already linked
      dbAppend_('ModuleScenarios', {
        linkId:     uuid_('LSC'),
        moduleId:   moduleId,
        scenarioId: scenarioId,
        createdAt:  now_()
      });
    });

    return { ok: true };
  } catch(err) {
    return apiError_('apiAdminLinkModuleScenario', err);
  }
}

function apiAdminUnlinkModuleScenario(sessionToken, payload) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN']);
    var moduleId   = String((payload || {}).moduleId   || '');
    var scenarioId = String((payload || {}).scenarioId || '');
    if (!moduleId || !scenarioId) throw new Error('moduleId and scenarioId required.');

    dbWithScriptLock_(function() {
      var rows = dbReadAll_('ModuleScenarios').filter(function(r) {
        return String(r.moduleId || '') === moduleId && String(r.scenarioId || '') === scenarioId;
      });
      rows.forEach(function(r) { dbDeleteByRow_('ModuleScenarios', r.__rowNumber); });
    });

    return { ok: true };
  } catch(err) {
    return apiError_('apiAdminUnlinkModuleScenario', err);
  }
}

function apiAdminGetModuleScenarios(sessionToken, moduleId) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN']);
    moduleId = String(moduleId || '');
    if (!moduleId) throw new Error('moduleId required.');

    var links     = dbReadAll_('ModuleScenarios').filter(function(r) { return String(r.moduleId || '') === moduleId; });
    var linkedIds = links.map(function(r) { return String(r.scenarioId); });
    var allScenarios = dbReadAll_('Scenarios');

    var linked    = allScenarios.filter(function(s) { return linkedIds.indexOf(String(s.scenarioId)) !== -1; });
    var available = allScenarios.filter(function(s) { return linkedIds.indexOf(String(s.scenarioId)) === -1; });

    return { ok: true, linked: linked, available: available };
  } catch(err) {
    return apiError_('apiAdminGetModuleScenarios', err);
  }
}

// ── FORUM ─────────────────────────────────────────────────────────────────────

function apiModuleForumGetPosts(sessionToken, moduleId, section) {
  try {
    var caller = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    moduleId = String(moduleId || '');
    section  = String(section  || '');
    if (!moduleId) throw new Error('moduleId required.');

    var posts = dbReadAll_('ModuleForum')
      .filter(function(p) {
        if (String(p.moduleId || '') !== moduleId) return false;
        if (section && String(p.section || '') !== section) return false;
        return true;
      })
      .sort(function(a, b) { return String(a.createdAt || '').localeCompare(String(b.createdAt || '')); });

    // Build userId → {profession, currentLevel} map from Users sheet
    var users = dbReadAll_('Users');
    var userMap = {};
    users.forEach(function(u) {
      userMap[String(u.userId || '')] = {
        profession:   String(u.profession || 'PILOT').toUpperCase(),
        currentLevel: Number(u.currentLevel || 1),
        xp:           0
      };
    });

    // Rank badges are XP-derived (same ladder as the topbar and leaderboard), so
    // the author's XP has to travel with the post.
    try {
      dbReadAll_('LmsXp').forEach(function(r) {
        var info = userMap[String(r.userId || '').trim()];
        if (info) info.xp = Number(r.lmsXp) || 0;
      });
    } catch (e) {}

    // Build postId → {likeCount, likedByMe} map from ModuleForumLikes
    var allLikes = dbReadAll_('ModuleForumLikes').filter(function(l) { return String(l.moduleId || '') === moduleId; });
    var likeMap = {};
    allLikes.forEach(function(l) {
      var pid = String(l.postId || '');
      if (!likeMap[pid]) likeMap[pid] = { count: 0, likedByMe: false };
      likeMap[pid].count++;
      if (String(l.userId || '') === String(caller.userId)) likeMap[pid].likedByMe = true;
    });

    var enriched = posts.map(function(p) {
      var uid  = String(p.userId || '');
      var info = userMap[uid] || { profession: 'PILOT', currentLevel: 1, xp: 0 };
      var lk   = likeMap[String(p.postId || '')] || { count: 0, likedByMe: false };
      return {
        postId:       p.postId,
        moduleId:     p.moduleId,
        section:      p.section || '',
        userId:       p.userId,
        userName:     p.userName,
        parentPostId: p.parentPostId,
        body:         p.body,
        editedAt:     p.editedAt,
        createdAt:    p.createdAt,
        userProfession:   info.profession,
        userCurrentLevel: info.currentLevel,
        userXp:           info.xp,
        likeCount:    lk.count,
        likedByMe:    lk.likedByMe
      };
    });

    return { ok: true, posts: enriched };
  } catch(err) {
    return apiError_('apiModuleForumGetPosts', err);
  }
}

function apiModuleForumLikePost(sessionToken, payload) {
  try {
    var caller = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    var postId   = String((payload || {}).postId   || '');
    var moduleId = String((payload || {}).moduleId || '');
    if (!postId || !moduleId) throw new Error('postId and moduleId required.');

    dbWithScriptLock_(function() {
      var existing = dbReadAll_('ModuleForumLikes').filter(function(l) {
        return String(l.postId || '') === postId && String(l.userId || '') === String(caller.userId);
      });
      if (existing.length) {
        dbDeleteByRow_('ModuleForumLikes', existing[0].__rowNumber);
      } else {
        dbAppend_('ModuleForumLikes', { likeId: uuid_('LKE'), postId: postId, moduleId: moduleId, userId: caller.userId, createdAt: now_() });
      }
    });

    return { ok: true };
  } catch(err) {
    return apiError_('apiModuleForumLikePost', err);
  }
}

function apiModuleForumSavePost(sessionToken, payload) {
  try {
    var caller = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    payload = payload || {};

    var moduleId     = String(payload.moduleId     || '').trim();
    var section      = String(payload.section      || '').trim();
    var body         = String(payload.body         || '').trim();
    var parentPostId = String(payload.parentPostId || '').trim();

    if (!moduleId) throw new Error('moduleId required.');
    if (!body)     throw new Error('Post body required.');

    // Enforce 3-word minimum (at least LMS_FORUM_MIN_WORDS words required)
    if (body.split(/\s+/).filter(function(w) { return w.length > 0; }).length < LMS_FORUM_MIN_WORDS) {
      throw new Error('Post must be at least ' + LMS_FORUM_MIN_WORDS + ' words.');
    }

    var result = dbWithScriptLock_(function() {
      var now = now_();
      if (payload.postId) {
        // Edit — only own post (admin can edit any)
        var existing = dbFindOne_('ModuleForum', 'postId', payload.postId);
        if (!existing) throw new Error('Post not found.');
        if (String(caller.role).toUpperCase() !== 'ADMIN' &&
            String(existing.userId) !== String(caller.userId)) {
          throw new Error('You can only edit your own posts.');
        }
        var patch = { body: body, editedAt: now };
        dbUpdateByRow_('ModuleForum', existing.__rowNumber, patch);
        return mergeObjects_(existing, patch);
      } else {
        var newPost = {
          postId:       uuid_('POS'),
          moduleId:     moduleId,
          section:      section || 'intro',
          userId:       caller.userId,
          userName:     caller.name || caller.email || '',
          parentPostId: parentPostId,
          body:         body,
          editedAt:     '',
          createdAt:    now
        };
        dbAppend_('ModuleForum', newPost);

        // Award XP + mark forum participation
        var xpForPost = parentPostId ? 10 : 20;
        lmsAddXp_(caller.userId, xpForPost);

        if (!parentPostId && (!section || section === 'intro')) {
          var progForForum = lmsEnsureProgress_(caller.userId, moduleId);
          if (!lmsBool_(progForForum.introForumPosted)) {
            var fp = { introForumPosted: true, updatedAt: now };
            if (lmsBool_(progForForum.introVideoWatched)) fp.introCompleted = true;
            dbUpdateByRow_('ModuleProgress', progForForum.__rowNumber, fp);
          }
        }
        if (!parentPostId && section === 'explanation') {
          var progExp = lmsEnsureProgress_(caller.userId, moduleId);
          if (!lmsBool_(progExp.explanationForumPosted)) {
            var fpExp = { explanationForumPosted: true, updatedAt: now };
            if (!lmsBool_(progExp.explanationCompleted)) {
              var hasExpQuiz = dbReadAll_('ModuleQuiz').some(function(q) {
                return String(q.moduleId || '') === moduleId && String(q.section || '') === 'explanation';
              });
              if (hasExpQuiz) {
                if (lmsBool_(progExp.quizPassed)) fpExp.explanationCompleted = true;
              } else {
                var ew = []; try { ew = JSON.parse(progExp.explanationVideosWatched || '[]'); } catch(e) {}
                var allExpVids = dbReadAll_('ModuleVideos').filter(function(v) {
                  return String(v.moduleId || '') === moduleId && String(v.section || '') === 'explanation';
                });
                if (allExpVids.length && allExpVids.every(function(v) { return ew.indexOf(String(v.videoId)) !== -1; })) {
                  fpExp.explanationCompleted = true;
                }
              }
            }
            dbUpdateByRow_('ModuleProgress', progExp.__rowNumber, fpExp);
          }
        }

        return newPost;
      }
    });

    var lmsXpTotal = lmsGetTotalXp_(caller.userId);
    return { ok: true, post: result, lmsXpTotal: lmsXpTotal };
  } catch(err) {
    return apiError_('apiModuleForumSavePost', err);
  }
}

function apiModuleForumDeletePost(sessionToken, payload) {
  try {
    var caller = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    var postId = String((payload || {}).postId || '');
    if (!postId) throw new Error('postId required.');

    dbWithScriptLock_(function() {
      var p = dbFindOne_('ModuleForum', 'postId', postId);
      if (!p) throw new Error('Post not found.');
      if (String(caller.role).toUpperCase() !== 'ADMIN' &&
          String(p.userId) !== String(caller.userId)) {
        throw new Error('You can only delete your own posts.');
      }
      dbDeleteByRow_('ModuleForum', p.__rowNumber);
    });

    return { ok: true };
  } catch(err) {
    return apiError_('apiModuleForumDeletePost', err);
  }
}

// ── STUDENT: Module data ──────────────────────────────────────────────────────

function apiModuleGetAll(sessionToken) {
  try {
    var caller  = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    var modules = dbReadAll_('Modules')
      .filter(function(m) { return String(m.status || '') === 'ACTIVE'; })
      .sort(function(a, b) { return Number(a.moduleOrder || 0) - Number(b.moduleOrder || 0); });

    var allProgress = dbReadAll_('ModuleProgress').filter(function(r) {
      return String(r.userId || '') === String(caller.userId);
    });

    var progressMap = {};
    allProgress.forEach(function(p) { progressMap[p.moduleId] = p; });

    var result = modules.map(function(m, idx) {
      var prog = progressMap[m.moduleId] || null;
      // Module is unlocked if it's first, or previous module is completed
      var prevModule   = idx > 0 ? modules[idx - 1] : null;
      var prevProgress = prevModule ? progressMap[prevModule.moduleId] : null;
      var unlocked     = idx === 0 || !!(prevProgress && prevProgress.completedAt);

      var scenariosPassed = prog ? Number(prog.scenariosPassed || 0) : 0;
      var evalScore       = prog ? Number(prog.evalScore       || 0) : 0;
      var evalAttempts    = prog ? Number(prog.evalAttempts    || 0) : 0;
      var appScore        = Math.min(100, Math.round((scenariosPassed / 3) * 100));
      var moduleScore     = evalAttempts > 0 ? Math.round(appScore * 0.4 + evalScore * 0.6) : null;

      return {
        moduleId:      m.moduleId,
        title:         m.title,
        topic:         m.topic,
        description:   m.description,
        moduleOrder:   Number(m.moduleOrder || 0),
        badgeImageUrl: m.badgeImageUrl,
        unlocked:      unlocked,
        completed:     !!(prog && prog.completedAt),
        badgeEarned:   !!(prog && lmsBool_(prog.badgeEarned)),
        score:         moduleScore,
        sections: {
          intro:       { unlocked: unlocked,                                              completed: !!(prog && lmsBool_(prog.introCompleted)) },
          explanation: { unlocked: !!(prog && lmsBool_(prog.introCompleted)),             completed: !!(prog && lmsBool_(prog.explanationCompleted)) },
          application: { unlocked: !!(prog && lmsBool_(prog.explanationCompleted)),       completed: !!(prog && lmsBool_(prog.applicationCompleted)) },
          evaluation:  { unlocked: !!(prog && lmsBool_(prog.applicationCompleted)),       completed: !!(prog && lmsBool_(prog.evalPassed)) }
        }
      };
    });

    return { ok: true, modules: result };
  } catch(err) {
    return apiError_('apiModuleGetAll', err);
  }
}

function apiModuleGetDetail(sessionToken, moduleId) {
  try {
    var caller = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    moduleId = String(moduleId || '');
    if (!moduleId) throw new Error('moduleId required.');

    var module = dbFindOne_('Modules', 'moduleId', moduleId);
    if (!module) throw new Error('Module not found.');

    var videos = dbReadAll_('ModuleVideos')
      .filter(function(v) { return String(v.moduleId || '') === moduleId; })
      .sort(function(a, b) { return Number(a.videoOrder || 0) - Number(b.videoOrder || 0); });

    var questions = dbReadAll_('ModuleQuiz')
      .filter(function(q) { return String(q.moduleId || '') === moduleId; })
      .sort(function(a, b) { return Number(a.questionOrder || 0) - Number(b.questionOrder || 0); })
      .map(function(q) {
        var opts = [];
        try { opts = JSON.parse(q.optionsJson || '[]'); } catch(e) {}
        return {
          questionId:    q.questionId,
          section:       q.section,
          question:      q.question,
          options:       opts,
          questionOrder: Number(q.questionOrder || 0),
          questionType:  q.questionType || 'standard',
          hasAudio:      !!(q.audioScript && String(q.audioScript).trim())
          // correctIndex and audioScript intentionally omitted for students
        };
      });

    var linkedIds  = dbReadAll_('ModuleScenarios')
      .filter(function(r) { return String(r.moduleId || '') === moduleId; })
      .map(function(r) { return String(r.scenarioId); });

    var scenarios = dbReadAll_('Scenarios').filter(function(s) {
      return linkedIds.indexOf(String(s.scenarioId)) !== -1 && String(s.isActive) !== 'false';
    });

    var prog = lmsGetProgress_(caller.userId, moduleId);

    var watchedIds = [];
    if (prog) { try { watchedIds = JSON.parse(prog.explanationVideosWatched || '[]'); } catch(e) {} }

    // ── Auto-heal: set explanationCompleted if conditions are already met ──
    if (prog && !lmsBool_(prog.explanationCompleted)) {
      var expVideos  = videos.filter(function(v) { return String(v.section || '') === 'explanation'; });
      var hasExpQuiz = questions.some(function(q) { return String(q.section || '') === 'explanation'; });
      var allExpWatched = expVideos.length === 0 ||
        expVideos.every(function(v) { return watchedIds.indexOf(String(v.videoId)) !== -1; });

      if (allExpWatched && !hasExpQuiz) {
        dbUpdateByRow_('ModuleProgress', prog.__rowNumber, { explanationCompleted: true, updatedAt: now_() });
        prog.explanationCompleted = true;
      } else if (lmsBool_(prog.quizPassed)) {
        // Quiz passed but explanationCompleted wasn't set — heal it
        dbUpdateByRow_('ModuleProgress', prog.__rowNumber, { explanationCompleted: true, updatedAt: now_() });
        prog.explanationCompleted = true;
      }
    }

    var cooldownUntil    = prog ? lmsCheckCooldown_(prog.quizLastAttemptAt)     : null;
    var evalCooldown     = prog ? lmsCheckCooldown_(prog.evalLastAttemptAt)     : null;
    var grammarCooldown  = prog ? lmsCheckCooldown_(prog.grammarLastAttemptAt)  : null;

    var grammarExercises = dbReadAll_('ModuleGrammar')
      .filter(function(g) { return String(g.moduleId || '') === moduleId; })
      .sort(function(a, b) { return Number(a.exerciseOrder || 0) - Number(b.exerciseOrder || 0); })
      .map(function(g) {
        var opts = [];
        try { opts = JSON.parse(g.optionsJson || '[]'); } catch(e) {}
        return {
          exerciseId:    g.exerciseId,
          exerciseOrder: Number(g.exerciseOrder || 0),
          type:          g.type,
          prompt:        g.prompt,
          options:       opts,
          explanation:   g.explanation
          // correctAnswer intentionally omitted for students
        };
      });

    var listeningClips = dbReadAll_('ModuleListening')
      .filter(function(c) { return String(c.moduleId || '') === moduleId; })
      .sort(function(a, b) { return Number(a.clipOrder || 0) - Number(b.clipOrder || 0); })
      .map(function(c) {
        var qs = [];
        try { qs = JSON.parse(c.questionsJson || '[]'); } catch(e) {}
        return {
          clipId:       c.clipId,
          clipOrder:    Number(c.clipOrder || 0),
          format:       c.format,
          title:        c.title,
          languageCode: c.languageCode || 'en-GB',
          voiceName:    c.voiceName   || '',
          questions:    qs.map(function(q) { return { questionId: q.questionId, question: q.question, options: q.options }; })
          // script and correctIndex intentionally omitted for students
        };
      });

    var listeningShortCooldown = prog ? lmsCheckCooldown_(prog.listeningShortLastAttemptAt) : null;
    var listeningLongCooldown  = prog ? lmsCheckCooldown_(prog.listeningLongLastAttemptAt)  : null;

    var speakingPrompts = dbReadAll_('ModuleSpeakingPrompt')
      .filter(function(p) { return String(p.moduleId || '') === moduleId; })
      .sort(function(a, b) { return Number(a.promptOrder || 0) - Number(b.promptOrder || 0); })
      .map(function(p) {
        return {
          promptId:    p.promptId,
          promptOrder: Number(p.promptOrder || 0),
          type:        p.type,
          title:       p.title,
          promptText:  p.promptText,
          imageUrl:    p.imageUrl || ''
        };
      });

    var speakingSubmissions = prog ? dbReadAll_('ModuleSpeakingSubmission').filter(function(s) {
      return String(s.userId || '') === String(caller.userId) && String(s.moduleId || '') === moduleId;
    }).map(function(s) {
      return {
        submissionId:  s.submissionId,
        promptId:      s.promptId,
        responseText:  s.responseText,
        submittedAt:   s.submittedAt,
        status:        s.status,
        raterScore:    s.raterScore !== '' && s.raterScore !== undefined ? Number(s.raterScore) : null,
        raterFeedback: s.raterFeedback || '',
        gradedAt:      s.gradedAt || ''
      };
    }) : [];

    return {
      ok: true,
      module: {
        moduleId:            module.moduleId,
        title:               module.title,
        topic:               module.topic,
        description:         module.description,
        badgeImageUrl:       module.badgeImageUrl,
        evalTimeLimitMinutes: module.evalTimeLimitMinutes ? Number(module.evalTimeLimitMinutes) : 30
      },
      videos:               videos,
      questions:            questions,
      scenarios:            scenarios,
      grammarExercises:     grammarExercises,
      listeningClips:       listeningClips,
      speakingPrompts:      speakingPrompts,
      speakingSubmissions:  speakingSubmissions,
      progress: prog ? {
        introVideoWatched:        lmsBool_(prog.introVideoWatched),
        introForumPosted:         lmsBool_(prog.introForumPosted),
        introCompleted:           lmsBool_(prog.introCompleted),
        explanationVideosWatched: watchedIds,
        explanationForumPosted:   lmsBool_(prog.explanationForumPosted),
        quizScore:                Number(prog.quizScore    || 0),
        quizAttempts:             Number(prog.quizAttempts || 0),
        quizPassed:               lmsBool_(prog.quizPassed),
        quizCooldownUntil:        cooldownUntil,
        explanationCompleted:     lmsBool_(prog.explanationCompleted),
        grammarScore:             Number(prog.grammarScore    || 0),
        grammarAttempts:          Number(prog.grammarAttempts || 0),
        grammarPassed:            lmsBool_(prog.grammarPassed),
        grammarCooldownUntil:     grammarCooldown,
        listeningShortScore:      Number(prog.listeningShortScore    || 0),
        listeningShortAttempts:   Number(prog.listeningShortAttempts || 0),
        listeningShortPassed:     lmsBool_(prog.listeningShortPassed),
        listeningShortCooldown:   listeningShortCooldown,
        listeningLongScore:       Number(prog.listeningLongScore    || 0),
        listeningLongAttempts:    Number(prog.listeningLongAttempts || 0),
        listeningLongPassed:      lmsBool_(prog.listeningLongPassed),
        listeningLongCooldown:    listeningLongCooldown,
        speakingSubmitted:        lmsBool_(prog.speakingSubmitted),
        speakingScore:            prog.speakingScore !== '' && prog.speakingScore !== undefined ? Number(prog.speakingScore) : null,
        speakingGraded:           lmsBool_(prog.speakingGraded),
        scenariosPassed:          Number(prog.scenariosPassed || 0),
        applicationCompleted:     lmsBool_(prog.applicationCompleted),
        evalScore:                Number(prog.evalScore    || 0),
        evalAttempts:             Number(prog.evalAttempts  || 0),
        evalPassed:               lmsBool_(prog.evalPassed),
        evalCooldownUntil:        evalCooldown,
        badgeEarned:              lmsBool_(prog.badgeEarned)
      } : null
    };
  } catch(err) {
    return apiError_('apiModuleGetDetail', err);
  }
}

// ── STUDENT: Progress actions ─────────────────────────────────────────────────

function apiModuleMarkVideoWatched(sessionToken, payload) {
  try {
    var caller   = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    var moduleId = String((payload || {}).moduleId || '');
    var videoId  = String((payload || {}).videoId  || '');
    if (!moduleId || !videoId) throw new Error('moduleId and videoId required.');

    var video = dbFindOne_('ModuleVideos', 'videoId', videoId);
    if (!video) throw new Error('Video not found.');

    var xpAwarded = 0;
    var updated = dbWithScriptLock_(function() {
      var prog = lmsEnsureProgress_(caller.userId, moduleId);
      var now  = now_();

      if (video.section === 'intro') {
        if (!lmsBool_(prog.introVideoWatched)) {
          xpAwarded = 15;
          var patch = { introVideoWatched: true, updatedAt: now };
          if (lmsBool_(prog.introForumPosted)) patch.introCompleted = true;
          dbUpdateByRow_('ModuleProgress', prog.__rowNumber, patch);
          return mergeObjects_(prog, patch);
        }
      } else if (video.section === 'explanation') {
        var watched = [];
        try { watched = JSON.parse(prog.explanationVideosWatched || '[]'); } catch(e) {}
        var alreadyWatched = watched.indexOf(videoId) !== -1;
        if (!alreadyWatched) { watched.push(videoId); xpAwarded = 15; }

        var allExpVideos = dbReadAll_('ModuleVideos').filter(function(v) {
          return String(v.moduleId || '') === moduleId && v.section === 'explanation';
        });
        var allWatched = allExpVideos.every(function(v) { return watched.indexOf(String(v.videoId)) !== -1; });

        var patch2 = { explanationVideosWatched: JSON.stringify(watched), updatedAt: now };
        if (allWatched && !lmsBool_(prog.explanationCompleted) && lmsBool_(prog.explanationForumPosted)) {
          var hasQuiz = dbReadAll_('ModuleQuiz').some(function(q) {
            return String(q.moduleId || '') === moduleId && String(q.section || '') === 'explanation';
          });
          if (!hasQuiz) patch2.explanationCompleted = true;
        }
        dbUpdateByRow_('ModuleProgress', prog.__rowNumber, patch2);
        return mergeObjects_(prog, patch2);
      }

      return prog;
    });

    if (xpAwarded > 0) lmsAddXp_(caller.userId, xpAwarded);
    var lmsXpTotal = lmsGetTotalXp_(caller.userId);
    return { ok: true, progress: updated, lmsXpTotal: lmsXpTotal };
  } catch(err) {
    return apiError_('apiModuleMarkVideoWatched', err);
  }
}

function apiModuleSubmitQuiz(sessionToken, payload) {
  try {
    var caller  = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    payload     = payload || {};
    var moduleId = String(payload.moduleId || '');
    var section  = String(payload.section  || ''); // 'explanation' or 'evaluation'
    var answers  = Array.isArray(payload.answers) ? payload.answers : [];

    if (!moduleId) throw new Error('moduleId required.');
    if (section !== 'explanation' && section !== 'evaluation') throw new Error('Invalid section.');

    var result = dbWithScriptLock_(function() {
      var prog = lmsEnsureProgress_(caller.userId, moduleId);
      var now  = now_();

      // Check section is unlocked
      if (!lmsSectionUnlocked_(prog, section)) throw new Error('Section not yet unlocked.');

      // Enforce cooldown
      var lastAt = section === 'explanation' ? prog.quizLastAttemptAt : prog.evalLastAttemptAt;
      var cooldown = lmsCheckCooldown_(lastAt);
      if (cooldown) return { cooldownUntil: cooldown, blocked: true };

      var score  = lmsScoreAnswers_(answers.map(function(a){ return a.questionId; }), answers, moduleId, section);
      var passed = score >= LMS_MIN_PASS_SCORE;
      var patch  = { updatedAt: now };

      var xpAwarded = 0;
      if (section === 'explanation') {
        patch.quizScore         = score;
        patch.quizLastAttemptAt = now;
        patch.quizAttempts      = Number(prog.quizAttempts || 0) + 1;
        if (score > Number(prog.quizBestScore || 0)) patch.quizBestScore = score;
        if (passed && !lmsBool_(prog.quizPassed)) {
          patch.quizPassed = true;
          if (lmsBool_(prog.explanationForumPosted)) patch.explanationCompleted = true;
          xpAwarded = 50;
        }
      } else {
        patch.evalScore         = score;
        patch.evalLastAttemptAt = now;
        patch.evalAttempts      = Number(prog.evalAttempts || 0) + 1;
        if (score > Number(prog.evalBestScore || 0)) patch.evalBestScore = score;
        if (passed && !lmsBool_(prog.evalPassed) && lmsBool_(prog.applicationCompleted)) {
          patch.evalPassed    = true;
          patch.badgeEarned   = true;
          patch.badgeEarnedAt = now;
          patch.completedAt   = now;
          xpAwarded = 50;
        }
      }
      dbUpdateByRow_('ModuleProgress', prog.__rowNumber, patch);
      return { score: score, passed: passed, blocked: false, xpAwarded: xpAwarded };
    });

    if (result.xpAwarded > 0) lmsAddXp_(caller.userId, result.xpAwarded);
    var lmsXpTotal = lmsGetTotalXp_(caller.userId);
    return { ok: true, score: result.score, passed: result.passed, cooldownUntil: result.cooldownUntil || null, lmsXpTotal: lmsXpTotal };
  } catch(err) {
    return apiError_('apiModuleSubmitQuiz', err);
  }
}

function apiModuleRecordScenarioPassed(sessionToken, payload) {
  try {
    var caller   = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    var moduleId = String((payload || {}).moduleId || '');
    if (!moduleId) throw new Error('moduleId required.');

    var updated = dbWithScriptLock_(function() {
      var prog = lmsEnsureProgress_(caller.userId, moduleId);
      var now  = now_();

      if (!lmsSectionUnlocked_(prog, 'application')) throw new Error('Application section not yet unlocked.');

      var count = Number(prog.scenariosPassed || 0) + 1;
      var patch = { scenariosPassed: count, updatedAt: now };

      dbUpdateByRow_('ModuleProgress', prog.__rowNumber, patch);
      return mergeObjects_(prog, patch);
    });

    return { ok: true, scenariosPassed: Number(updated.scenariosPassed) };
  } catch(err) {
    return apiError_('apiModuleRecordScenarioPassed', err);
  }
}

function apiModuleLogTime(sessionToken, payload) {
  try {
    var caller   = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    var moduleId = String((payload || {}).moduleId || '');
    var section  = String((payload || {}).section  || '');
    var seconds  = Number((payload || {}).seconds  || 0);

    if (!moduleId || !section || seconds <= 0) return { ok: true }; // silently ignore

    dbWithScriptLock_(function() {
      var prog = lmsEnsureProgress_(caller.userId, moduleId);
      var field = {
        intro:       'timeSpentIntroSec',
        explanation: 'timeSpentExplanationSec',
        application: 'timeSpentApplicationSec',
        evaluation:  'timeSpentEvalSec'
      }[section];
      if (!field) return;
      var patch = { updatedAt: now_() };
      patch[field] = Number(prog[field] || 0) + seconds;
      dbUpdateByRow_('ModuleProgress', prog.__rowNumber, patch);
    });

    return { ok: true };
  } catch(err) {
    return apiError_('apiModuleLogTime', err);
  }
}

// ── Grammar Station ───────────────────────────────────────────────────────────

var LMS_GRAMMAR_PASS_SCORE = 85;
var LMS_GRAMMAR_XP         = 30;

function _gradeGrammarAnswer_(exercise, rawAnswer) {
  var correct = String(exercise.correctAnswer || '').trim();
  var answer  = String(rawAnswer || '').trim();
  if (exercise.type === 'fill_blank') {
    return answer.toLowerCase() === correct.toLowerCase();
  }
  // mcq and error_id: compare as numbers (sheet may store as number or string)
  return Number(answer) === Number(correct);
}

function apiGrammarSubmit(sessionToken, payload) {
  try {
    var caller   = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    var moduleId = String((payload || {}).moduleId || '');
    var answers  = (payload || {}).answers || {}; // { exerciseId: rawAnswer, ... }
    if (!moduleId) throw new Error('moduleId required.');

    var exercises = dbReadAll_('ModuleGrammar')
      .filter(function(g) { return String(g.moduleId || '') === moduleId; });

    if (!exercises.length) return { ok: false, error: 'No grammar exercises found for this module.' };

    var result = dbWithScriptLock_(function() {
      var prog = lmsEnsureProgress_(caller.userId, moduleId);
      if (!lmsSectionUnlocked_(prog, 'application')) throw new Error('Application section not yet unlocked.');

      var cooldown = lmsCheckCooldown_(prog.grammarLastAttemptAt);
      if (cooldown) return { blocked: true, cooldown: cooldown };

      var totalQ = exercises.length;
      var correct = 0;
      var results = [];
      exercises.forEach(function(ex) {
        var raw    = answers[ex.exerciseId];
        var passed = _gradeGrammarAnswer_(ex, raw);
        if (passed) correct++;
        results.push({ exerciseId: ex.exerciseId, correct: passed, correctAnswer: ex.correctAnswer, explanation: ex.explanation });
      });

      var score    = Math.round((correct / totalQ) * 100);
      var passed   = score >= LMS_GRAMMAR_PASS_SCORE;
      var attempts = Number(prog.grammarAttempts || 0) + 1;
      var now      = now_();
      var patch    = { grammarScore: score, grammarAttempts: attempts, grammarLastAttemptAt: now, updatedAt: now };

      if (score > Number(prog.grammarBestScore || 0)) patch.grammarBestScore = score;
      var xpAwarded = 0;
      if (passed && !lmsBool_(prog.grammarPassed)) {
        patch.grammarPassed      = true;
        patch.grammarCompletedAt = now;
        if (lmsBool_(prog.listeningShortPassed) && lmsBool_(prog.listeningLongPassed)) {
          patch.applicationCompleted = true;
        }
        xpAwarded = LMS_GRAMMAR_XP;
      }
      dbUpdateByRow_('ModuleProgress', prog.__rowNumber, patch);
      return { score: score, passed: passed, correct: correct, total: totalQ, attempts: attempts,
               results: results, xpAwarded: xpAwarded,
               applicationCompleted: !!(patch.applicationCompleted || lmsBool_(prog.applicationCompleted)) };
    });

    if (result.blocked) return { ok: false, error: 'Cooldown active until ' + result.cooldown, grammarCooldownUntil: result.cooldown };

    var lmsXpTotal = null;
    if (result.xpAwarded > 0) {
      try { lmsXpTotal = lmsAddXp_(caller.userId, result.xpAwarded); } catch(e) {}
    }
    // Streak counts ANY graded exercise the student got right, not only runs that
    // award XP. A retake awards no XP but still marks the day active — the same
    // rule the simulator already applies per phase.
    if (Number(result.correct || 0) > 0) {
      try { lmsUpdateStreak_(caller.userId); } catch(e) {}
    }

    return {
      ok:                   true,
      score:                result.score,
      passed:               result.passed,
      correct:              result.correct,
      total:                result.total,
      attempts:             result.attempts,
      results:              result.results,
      lmsXpTotal:           lmsXpTotal,
      applicationCompleted: result.applicationCompleted
    };
  } catch(err) {
    return apiError_('apiGrammarSubmit', err);
  }
}

// ── Grammar Admin CRUD ────────────────────────────────────────────────────────

function apiGrammarAdminList(sessionToken, moduleId) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN', 'INSTRUCTOR']);
    moduleId = String(moduleId || '');
    if (!moduleId) throw new Error('moduleId required.');

    var exercises = dbReadAll_('ModuleGrammar')
      .filter(function(g) { return String(g.moduleId || '') === moduleId; })
      .sort(function(a, b) { return Number(a.exerciseOrder || 0) - Number(b.exerciseOrder || 0); })
      .map(function(g) {
        var opts = [];
        try { opts = JSON.parse(g.optionsJson || '[]'); } catch(e) {}
        return {
          exerciseId:    g.exerciseId,
          exerciseOrder: Number(g.exerciseOrder || 0),
          type:          g.type,
          prompt:        g.prompt,
          options:       opts,
          correctAnswer: g.correctAnswer,
          explanation:   g.explanation,
          xpReward:      Number(g.xpReward || 0)
        };
      });

    return { ok: true, exercises: exercises };
  } catch(err) {
    return apiError_('apiGrammarAdminList', err);
  }
}

function apiGrammarAdminSave(sessionToken, payload) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN', 'INSTRUCTOR']);
    var p          = payload || {};
    var moduleId   = String(p.moduleId || '');
    var type       = String(p.type || '');
    var prompt     = String(p.prompt || '').trim();
    var options    = Array.isArray(p.options) ? p.options : [];
    var correct    = String(p.correctAnswer || '').trim();
    var explanation = String(p.explanation || '').trim();
    var order      = Number(p.exerciseOrder || 0);

    if (!moduleId || !type || !prompt || !correct) throw new Error('moduleId, type, prompt, and correctAnswer are required.');
    if (['mcq', 'fill_blank', 'error_id'].indexOf(type) === -1) throw new Error('Invalid exercise type.');

    var optsJson = JSON.stringify(options);
    var now = now_();

    if (p.exerciseId) {
      var existing = dbFindOne_('ModuleGrammar', 'exerciseId', String(p.exerciseId));
      if (!existing) throw new Error('Exercise not found.');
      dbUpdateByRow_('ModuleGrammar', existing.__rowNumber, {
        type: type, prompt: prompt, optionsJson: optsJson,
        correctAnswer: correct, explanation: explanation,
        exerciseOrder: order
      });
      return { ok: true, exerciseId: p.exerciseId };
    } else {
      var id = uuid_('GR');
      dbAppend_('ModuleGrammar', {
        exerciseId: id, moduleId: moduleId, exerciseOrder: order,
        type: type, prompt: prompt, optionsJson: optsJson,
        correctAnswer: correct, explanation: explanation,
        xpReward: LMS_GRAMMAR_XP, createdAt: now
      });
      return { ok: true, exerciseId: id };
    }
  } catch(err) {
    return apiError_('apiGrammarAdminSave', err);
  }
}

function apiGrammarAdminDelete(sessionToken, exerciseId) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN', 'INSTRUCTOR']);
    exerciseId = String(exerciseId || '');
    if (!exerciseId) throw new Error('exerciseId required.');
    var existing = dbFindOne_('ModuleGrammar', 'exerciseId', exerciseId);
    if (!existing) throw new Error('Exercise not found.');
    dbDeleteByRow_('ModuleGrammar', existing.__rowNumber);
    return { ok: true };
  } catch(err) {
    return apiError_('apiGrammarAdminDelete', err);
  }
}

// ── Listening Station ─────────────────────────────────────────────────────────

var LMS_LISTENING_PASS_SCORE = 85;
var LMS_LISTENING_XP         = 25; // per format (short / long)

function apiListeningGetClipAudio(sessionToken, clipId) {
  try {
    AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    clipId = String(clipId || '');
    if (!clipId) throw new Error('clipId required.');

    var clip = dbFindOne_('ModuleListening', 'clipId', clipId);
    if (!clip) throw new Error('Listening clip not found.');

    var script = String(clip.script || '').trim();
    if (!script) throw new Error('Clip has no script.');

    var langCode  = String(clip.languageCode || 'en-GB');
    var voiceName = String(clip.voiceName || '').trim();
    var profile   = TTSService.getProfileByCountry_(langCode === 'en-US' ? 'USA' : langCode === 'en-AU' ? 'AU' : 'UK');
    var voices    = profile.voiceNames || [];
    var voice     = voiceName || voices[Math.floor(Math.random() * voices.length)] || voices[0] || '';
    var rate      = profile.speakingRate || 0.9;

    var cacheKey = TTSService.buildTtsCacheKey_(script, profile, rate, voice);
    var cached   = TTSService.getTtsFromCache_(cacheKey);
    if (cached) return { ok: true, audioBase64: cached, mimeType: 'audio/mp3', cached: true };

    var ssml   = TTSService.buildAtcSsml_(script, profile, rate, voice);
    var result = TTSService.callGoogleTtsWithFallbackVoices_(ssml, { languageCode: profile.languageCode, pitch: profile.pitch, effectsProfileId: profile.effectsProfileId, voiceNames: [voice].concat(voices.filter(function(v) { return v !== voice; })) }, rate);

    TTSService.storeTtsInCache_(cacheKey, result.audioBase64);

    return { ok: true, audioBase64: result.audioBase64, mimeType: 'audio/mp3', voiceName: result.voiceName };
  } catch(err) {
    return apiError_('apiListeningGetClipAudio', err);
  }
}

function apiListeningSubmit(sessionToken, payload) {
  try {
    var caller   = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    var moduleId = String((payload || {}).moduleId || '');
    var format   = String((payload || {}).format   || ''); // 'short' | 'long'
    var answers  = (payload || {}).answers || {};          // { questionId: selectedIndex, ... }
    if (!moduleId) throw new Error('moduleId required.');
    if (format !== 'short' && format !== 'long') throw new Error('format must be short or long.');

    var clips = dbReadAll_('ModuleListening').filter(function(c) {
      return String(c.moduleId || '') === moduleId && String(c.format || '') === format;
    });
    if (!clips.length) return { ok: false, error: 'No ' + format + ' listening clips found for this module.' };

    var totalQ = 0, correct = 0;
    clips.forEach(function(clip) {
      var qs = [];
      try { qs = JSON.parse(clip.questionsJson || '[]'); } catch(e) {}
      qs.forEach(function(q) {
        totalQ++;
        var given = String(answers[q.questionId] !== undefined ? answers[q.questionId] : '');
        if (given === String(q.correctIndex)) correct++;
      });
    });
    if (!totalQ) return { ok: false, error: 'No questions found for this format.' };

    var result = dbWithScriptLock_(function() {
      var prog = lmsEnsureProgress_(caller.userId, moduleId);
      if (!lmsSectionUnlocked_(prog, 'application')) throw new Error('Application section not yet unlocked.');
      if (!lmsBool_(prog.grammarPassed)) throw new Error('Grammar station must be completed first.');

      var cdField  = format === 'short' ? 'listeningShortLastAttemptAt' : 'listeningLongLastAttemptAt';
      var cooldown = lmsCheckCooldown_(prog[cdField]);
      if (cooldown) return { blocked: true, cooldown: cooldown };

      var score    = Math.round((correct / totalQ) * 100);
      var passed   = score >= LMS_LISTENING_PASS_SCORE;
      var attField = format === 'short' ? 'listeningShortAttempts'  : 'listeningLongAttempts';
      var scoField = format === 'short' ? 'listeningShortScore'     : 'listeningLongScore';
      var pasField = format === 'short' ? 'listeningShortPassed'    : 'listeningLongPassed';
      var bestField= format === 'short' ? 'listeningShortBestScore' : 'listeningLongBestScore';
      var attempts = Number(prog[attField] || 0) + 1;
      var now      = now_();
      var patch    = { updatedAt: now };
      patch[scoField] = score;
      patch[attField] = attempts;
      patch[cdField]  = now;
      if (score > Number(prog[bestField] || 0)) patch[bestField] = score;

      var xpAwarded = 0;
      if (passed && !lmsBool_(prog[pasField])) {
        patch[pasField] = true;
        var shortPassed = format === 'short' ? true : lmsBool_(prog.listeningShortPassed);
        var longPassed  = format === 'long'  ? true : lmsBool_(prog.listeningLongPassed);
        if (shortPassed && longPassed) {
          patch.listeningCompletedAt = now;
          if (lmsBool_(prog.grammarPassed)) patch.applicationCompleted = true;
        }
        xpAwarded = LMS_LISTENING_XP;
      }
      dbUpdateByRow_('ModuleProgress', prog.__rowNumber, patch);
      return { score: score, passed: passed, correct: correct, total: totalQ, attempts: attempts,
               xpAwarded: xpAwarded,
               applicationCompleted: !!(patch.applicationCompleted || lmsBool_(prog.applicationCompleted)) };
    });

    if (result.blocked) return { ok: false, error: 'Cooldown active.', cooldownUntil: result.cooldown };

    var lmsXpTotal = null;
    if (result.xpAwarded > 0) {
      try { lmsXpTotal = lmsAddXp_(caller.userId, result.xpAwarded); } catch(e) {}
    }
    // Streak counts ANY graded exercise the student got right, not only runs that
    // award XP. A retake awards no XP but still marks the day active — the same
    // rule the simulator already applies per phase.
    if (Number(result.correct || 0) > 0) {
      try { lmsUpdateStreak_(caller.userId); } catch(e) {}
    }

    return {
      ok:                   true,
      score:                result.score,
      passed:               result.passed,
      correct:              result.correct,
      total:                result.total,
      attempts:             result.attempts,
      lmsXpTotal:           lmsXpTotal,
      applicationCompleted: result.applicationCompleted
    };
  } catch(err) {
    return apiError_('apiListeningSubmit', err);
  }
}

// ── Listening Admin CRUD ──────────────────────────────────────────────────────

function apiListeningAdminList(sessionToken, moduleId) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN', 'INSTRUCTOR']);
    moduleId = String(moduleId || '');
    if (!moduleId) throw new Error('moduleId required.');

    var clips = dbReadAll_('ModuleListening')
      .filter(function(c) { return String(c.moduleId || '') === moduleId; })
      .sort(function(a, b) { return Number(a.clipOrder || 0) - Number(b.clipOrder || 0); })
      .map(function(c) {
        var qs = [];
        try { qs = JSON.parse(c.questionsJson || '[]'); } catch(e) {}
        return { clipId: c.clipId, clipOrder: Number(c.clipOrder || 0), format: c.format, title: c.title, script: c.script, languageCode: c.languageCode, voiceName: c.voiceName, questions: qs };
      });

    return { ok: true, clips: clips };
  } catch(err) {
    return apiError_('apiListeningAdminList', err);
  }
}

function apiListeningAdminSave(sessionToken, payload) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN', 'INSTRUCTOR']);
    var p        = payload || {};
    var moduleId = String(p.moduleId  || '');
    var format   = String(p.format    || '');
    var title    = String(p.title     || '').trim();
    var script   = String(p.script    || '').trim();
    var langCode  = String(p.languageCode || 'en-GB');
    var voiceName = String(p.voiceName   || '').trim();
    var order    = Number(p.clipOrder || 0);
    var questions = Array.isArray(p.questions) ? p.questions : [];

    if (!moduleId || !format || !title || !script) throw new Error('moduleId, format, title, and script are required.');
    if (format !== 'short' && format !== 'long') throw new Error('format must be short or long.');

    var questionsJson = JSON.stringify(questions.map(function(q, i) {
      return {
        questionId:   q.questionId || uuid_('LQ'),
        question:     String(q.question || ''),
        options:      Array.isArray(q.options) ? q.options : [],
        correctIndex: Number(q.correctIndex || 0)
      };
    }));

    var now = now_();

    if (p.clipId) {
      var existing = dbFindOne_('ModuleListening', 'clipId', String(p.clipId));
      if (!existing) throw new Error('Clip not found.');
      dbUpdateByRow_('ModuleListening', existing.__rowNumber, {
        format: format, title: title, script: script, languageCode: langCode,
        voiceName: voiceName, clipOrder: order, questionsJson: questionsJson
      });
      return { ok: true, clipId: p.clipId };
    } else {
      var id = uuid_('LC');
      dbAppend_('ModuleListening', {
        clipId: id, moduleId: moduleId, clipOrder: order, format: format,
        title: title, script: script, languageCode: langCode, voiceName: voiceName,
        questionsJson: questionsJson, createdAt: now
      });
      return { ok: true, clipId: id };
    }
  } catch(err) {
    return apiError_('apiListeningAdminSave', err);
  }
}

function apiListeningAdminDelete(sessionToken, clipId) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN', 'INSTRUCTOR']);
    clipId = String(clipId || '');
    if (!clipId) throw new Error('clipId required.');
    var existing = dbFindOne_('ModuleListening', 'clipId', clipId);
    if (!existing) throw new Error('Clip not found.');
    dbDeleteByRow_('ModuleListening', existing.__rowNumber);
    return { ok: true };
  } catch(err) {
    return apiError_('apiListeningAdminDelete', err);
  }
}

// ── Eval listening question audio ────────────────────────────────────────────

function apiEvalGetQuestionAudio(sessionToken, questionId) {
  try {
    AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    questionId = String(questionId || '');
    if (!questionId) throw new Error('questionId required.');

    var q = dbFindOne_('ModuleQuiz', 'questionId', questionId);
    if (!q) throw new Error('Question not found.');

    var script = String(q.audioScript || '').trim();
    if (!script) throw new Error('Question has no audio script.');

    var profile = TTSService.getProfileByCountry_('UK');
    var voices  = profile.voiceNames || [];
    var voice   = voices[Math.floor(Math.random() * voices.length)] || voices[0] || '';
    var rate    = profile.speakingRate || 0.9;

    var cacheKey = TTSService.buildTtsCacheKey_(script, profile, rate, voice);
    var cached   = TTSService.getTtsFromCache_(cacheKey);
    if (cached) return { ok: true, audioBase64: cached, mimeType: 'audio/mp3', cached: true };

    var ssml   = TTSService.buildAtcSsml_(script, profile, rate, voice);
    var result = TTSService.callGoogleTtsWithFallbackVoices_(ssml, { languageCode: profile.languageCode, pitch: profile.pitch, effectsProfileId: profile.effectsProfileId, voiceNames: [voice].concat(voices.filter(function(v) { return v !== voice; })) }, rate);

    TTSService.storeTtsInCache_(cacheKey, result.audioBase64);

    return { ok: true, audioBase64: result.audioBase64, mimeType: 'audio/mp3', voiceName: result.voiceName };
  } catch(err) {
    return apiError_('apiEvalGetQuestionAudio', err);
  }
}

// ── Active time tracking ──────────────────────────────────────────────────────

function apiTrackActiveTime(sessionToken, seconds) {
  try {
    var caller = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    seconds = Math.max(0, Math.min(Number(seconds) || 0, 3600));
    if (!seconds) return { ok: true };

    dbWithScriptLock_(function() {
      var existing = dbFindOne_('UserActivity', 'userId', caller.userId);
      var now = now_();
      if (existing) {
        dbUpdateByRow_('UserActivity', existing.__rowNumber, {
          totalActiveSeconds: Number(existing.totalActiveSeconds || 0) + seconds,
          updatedAt: now
        });
      } else {
        dbAppend_('UserActivity', { userId: caller.userId, totalActiveSeconds: seconds, updatedAt: now });
      }
    });
    return { ok: true };
  } catch(err) {
    return apiError_('apiTrackActiveTime', err);
  }
}

// ── Progress report ───────────────────────────────────────────────────────────

function apiGetProgressReport(sessionToken, targetUserId) {
  try {
    var caller = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    var isElevated = caller.role === 'ADMIN' || caller.role === 'INSTRUCTOR';

    // Students can only fetch their own report
    var userId = (isElevated && targetUserId) ? String(targetUserId) : String(caller.userId);

    // Instructors may only view students in their own groups
    if (caller.role === 'INSTRUCTOR' && targetUserId && String(targetUserId) !== String(caller.userId)) {
      var myGroups = dbReadAll_('Groups').filter(function(g) {
        return String(g.instructorId || '') === String(caller.userId);
      });
      var myGroupIds = myGroups.map(function(g) { return String(g.groupId); });
      var targetUser_ = dbFindOne_('Users', 'userId', userId);
      if (!targetUser_ || myGroupIds.indexOf(String(targetUser_.assignedGroupId || '')) === -1) {
        throw new Error('Access denied: student is not in your groups.');
      }
    }

    var modules   = dbReadAll_('Modules')
      .filter(function(m) { return String(m.status || '') === 'ACTIVE'; })
      .sort(function(a, b) { return Number(a.moduleOrder || 0) - Number(b.moduleOrder || 0); });

    var allProgress = dbReadAll_('ModuleProgress')
      .filter(function(p) { return String(p.userId || '') === userId; });

    var progMap = {};
    allProgress.forEach(function(p) { progMap[String(p.moduleId)] = p; });

    var activity = dbFindOne_('UserActivity', 'userId', userId);
    var totalActiveSeconds = Number((activity || {}).totalActiveSeconds || 0);

    // Resolve target user name
    var targetUser = null;
    if (isElevated && targetUserId) {
      try {
        var users = dbReadAll_('Users');
        targetUser = users.find(function(u) { return String(u.userId) === String(userId); }) || null;
      } catch(e) {}
    }

    var moduleRows = modules.map(function(m) {
      var p = progMap[String(m.moduleId)] || {};
      var hasShort = p.listeningShortBestScore !== '' && p.listeningShortBestScore !== null && p.listeningShortBestScore !== undefined;
      var hasLong  = p.listeningLongBestScore  !== '' && p.listeningLongBestScore  !== null && p.listeningLongBestScore  !== undefined;
      var lisCount = (hasShort ? 1 : 0) + (hasLong ? 1 : 0);
      var lisBest  = (hasShort ? Number(p.listeningShortBestScore) : 0) + (hasLong ? Number(p.listeningLongBestScore) : 0);
      var listeningBest = lisCount > 0 ? Math.round(lisBest / lisCount) : null;

      var hasQuizBest   = p.quizBestScore    !== '' && p.quizBestScore    !== null && p.quizBestScore    !== undefined;
      var hasGrammarBest= p.grammarBestScore !== '' && p.grammarBestScore !== null && p.grammarBestScore !== undefined;
      var hasEvalBest   = p.evalBestScore    !== '' && p.evalBestScore    !== null && p.evalBestScore    !== undefined;

      return {
        moduleId:      m.moduleId,
        title:         m.title,
        topic:         m.topic || '',
        badgeImageUrl: m.badgeImageUrl || '',
        completed:     lmsBool_(p.evalPassed),
        quizBest:      hasQuizBest    ? Number(p.quizBestScore)    : null,
        grammarBest:   hasGrammarBest ? Number(p.grammarBestScore) : null,
        listeningBest: listeningBest,
        evalBest:      hasEvalBest    ? Number(p.evalBestScore)    : null,
        grammarPassed:        lmsBool_(p.grammarPassed),
        listeningShortPassed: lmsBool_(p.listeningShortPassed),
        listeningLongPassed:  lmsBool_(p.listeningLongPassed),
        evalPassed:           lmsBool_(p.evalPassed),
        completedAt:   p.completedAt || p.badgeEarnedAt || ''
      };
    });

    return {
      ok:                 true,
      userId:             userId,
      userName:           targetUser ? (targetUser.name || targetUser.email || '') : (caller.name || caller.email || ''),
      totalActiveSeconds: totalActiveSeconds,
      modules:            moduleRows
    };
  } catch(err) {
    return apiError_('apiGetProgressReport', err);
  }
}

// ── Admin: list users for progress lookup ─────────────────────────────────────

function apiProgressSearchUsers(sessionToken, query) {
  try {
    var caller = AuthService.requireRole(sessionToken, ['ADMIN', 'INSTRUCTOR']);
    query = String(query || '').toLowerCase().trim();

    var allUsers = dbReadAll_('Users');

    // Instructors can only search students in their own groups
    var allowedUserIds = null;
    if (caller.role === 'INSTRUCTOR') {
      var myGroups = dbReadAll_('Groups').filter(function(g) {
        return String(g.instructorId || '') === String(caller.userId);
      });
      var myGroupIds = myGroups.map(function(g) { return String(g.groupId); });
      allowedUserIds = {};
      allUsers.forEach(function(u) {
        if (myGroupIds.indexOf(String(u.assignedGroupId || '')) !== -1) {
          allowedUserIds[String(u.userId)] = true;
        }
      });
    }

    var users = allUsers
      .filter(function(u) {
        if (allowedUserIds && !allowedUserIds[String(u.userId)]) return false;
        if (!query) return true;
        return (String(u.name || '') + ' ' + String(u.email || '')).toLowerCase().indexOf(query) !== -1;
      })
      .slice(0, 30)
      .map(function(u) { return { userId: u.userId, name: u.name || '', email: u.email || '', role: u.role || '' }; });
    return { ok: true, users: users };
  } catch(err) {
    return apiError_('apiProgressSearchUsers', err);
  }
}

// ── Speaking Production Station ───────────────────────────────────────────────

function apiSpeakingSubmit(sessionToken, payload) {
  try {
    var caller    = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    var moduleId  = String((payload || {}).moduleId || '');
    var responses = (payload || {}).responses || []; // [{ promptId, responseText }]
    if (!moduleId) throw new Error('moduleId required.');
    if (!responses.length) throw new Error('At least one response required.');

    var prog = lmsEnsureProgress_(caller.userId, moduleId);
    if (!lmsSectionUnlocked_(prog, 'application')) throw new Error('Application section not yet unlocked.');
    if (lmsBool_(prog.speakingSubmitted)) return { ok: false, error: 'Already submitted. Awaiting review.' };

    var now = now_();
    responses.forEach(function(r) {
      var text = String(r.responseText || '').trim();
      if (!text) return;
      dbAppend_('ModuleSpeakingSubmission', {
        submissionId: uuid_('SS'),
        userId:       caller.userId,
        moduleId:     moduleId,
        promptId:     String(r.promptId || ''),
        responseText: text,
        submittedAt:  now,
        status:       'pending',
        raterScore:   '',
        raterFeedback: '',
        gradedAt:     '',
        raterId:      ''
      });
    });

    dbUpdateByRow_('ModuleProgress', prog.__rowNumber, { speakingSubmitted: true, updatedAt: now });

    return { ok: true, submitted: responses.length };
  } catch(err) {
    return apiError_('apiSpeakingSubmit', err);
  }
}

// ── Speaking Admin CRUD ───────────────────────────────────────────────────────

function apiSpeakingAdminList(sessionToken, moduleId) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN', 'INSTRUCTOR']);
    moduleId = String(moduleId || '');
    if (!moduleId) throw new Error('moduleId required.');

    var prompts = dbReadAll_('ModuleSpeakingPrompt')
      .filter(function(p) { return String(p.moduleId || '') === moduleId; })
      .sort(function(a, b) { return Number(a.promptOrder || 0) - Number(b.promptOrder || 0); })
      .map(function(p) {
        return { promptId: p.promptId, promptOrder: Number(p.promptOrder || 0), type: p.type, title: p.title, promptText: p.promptText, imageUrl: p.imageUrl || '', rubricJson: p.rubricJson || '' };
      });

    return { ok: true, prompts: prompts };
  } catch(err) {
    return apiError_('apiSpeakingAdminList', err);
  }
}

function apiSpeakingAdminSave(sessionToken, payload) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN', 'INSTRUCTOR']);
    var p         = payload || {};
    var moduleId  = String(p.moduleId   || '');
    var type      = String(p.type       || '');
    var title     = String(p.title      || '').trim();
    var promptTxt = String(p.promptText || '').trim();
    var imageUrl  = String(p.imageUrl   || '').trim();
    var rubric    = String(p.rubricJson  || '').trim();
    var order     = Number(p.promptOrder || 0);

    if (!moduleId || !type || !title || !promptTxt) throw new Error('moduleId, type, title, and promptText are required.');
    if (['image_description', 'interview'].indexOf(type) === -1) throw new Error('type must be image_description or interview.');

    var now = now_();

    if (p.promptId) {
      var existing = dbFindOne_('ModuleSpeakingPrompt', 'promptId', String(p.promptId));
      if (!existing) throw new Error('Prompt not found.');
      dbUpdateByRow_('ModuleSpeakingPrompt', existing.__rowNumber, {
        type: type, title: title, promptText: promptTxt, imageUrl: imageUrl,
        rubricJson: rubric, promptOrder: order
      });
      return { ok: true, promptId: p.promptId };
    } else {
      var id = uuid_('SP');
      dbAppend_('ModuleSpeakingPrompt', {
        promptId: id, moduleId: moduleId, promptOrder: order, type: type,
        title: title, promptText: promptTxt, imageUrl: imageUrl,
        rubricJson: rubric, createdAt: now
      });
      return { ok: true, promptId: id };
    }
  } catch(err) {
    return apiError_('apiSpeakingAdminSave', err);
  }
}

function apiSpeakingAdminDelete(sessionToken, promptId) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN', 'INSTRUCTOR']);
    promptId = String(promptId || '');
    if (!promptId) throw new Error('promptId required.');
    var existing = dbFindOne_('ModuleSpeakingPrompt', 'promptId', promptId);
    if (!existing) throw new Error('Prompt not found.');
    dbDeleteByRow_('ModuleSpeakingPrompt', existing.__rowNumber);
    return { ok: true };
  } catch(err) {
    return apiError_('apiSpeakingAdminDelete', err);
  }
}

// ── Speaking Rater Dashboard ──────────────────────────────────────────────────

function apiSpeakingRaterGetQueue(sessionToken) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN', 'INSTRUCTOR']);

    var submissions = dbReadAll_('ModuleSpeakingSubmission');
    var prompts     = dbReadAll_('ModuleSpeakingPrompt');
    var modules     = dbReadAll_('Modules');
    var users       = dbReadAll_('Users');

    var promptMap = {};
    prompts.forEach(function(p) { promptMap[p.promptId] = p; });
    var moduleMap = {};
    modules.forEach(function(m) { moduleMap[m.moduleId] = m; });
    var userMap = {};
    users.forEach(function(u) { userMap[u.userId] = u; });

    var result = submissions.map(function(s) {
      var prompt  = promptMap[s.promptId] || {};
      var module_ = moduleMap[s.moduleId] || {};
      var user    = userMap[s.userId]     || {};
      return {
        submissionId:  s.submissionId,
        userId:        s.userId,
        userName:      user.name  || user.email || s.userId,
        userEmail:     user.email || '',
        moduleId:      s.moduleId,
        moduleTitle:   module_.title || s.moduleId,
        promptId:      s.promptId,
        promptTitle:   prompt.title    || '',
        promptType:    prompt.type     || '',
        promptText:    prompt.promptText || '',
        imageUrl:      prompt.imageUrl  || '',
        rubric:        prompt.rubricJson || '',
        responseText:  s.responseText  || '',
        submittedAt:   s.submittedAt   || '',
        status:        s.status        || 'pending',
        raterScore:    s.raterScore !== '' && s.raterScore !== undefined ? Number(s.raterScore) : null,
        raterFeedback: s.raterFeedback || '',
        gradedAt:      s.gradedAt      || ''
      };
    }).sort(function(a, b) {
      // Pending first, then by submittedAt descending
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;
      return String(b.submittedAt).localeCompare(String(a.submittedAt));
    });

    return { ok: true, submissions: result };
  } catch(err) {
    return apiError_('apiSpeakingRaterGetQueue', err);
  }
}

function apiSpeakingRaterGrade(sessionToken, payload) {
  try {
    var caller        = AuthService.requireRole(sessionToken, ['ADMIN', 'INSTRUCTOR']);
    var submissionId  = String((payload || {}).submissionId  || '');
    var raterScore    = Number((payload || {}).raterScore);
    var raterFeedback = String((payload || {}).raterFeedback || '').trim();

    if (!submissionId) throw new Error('submissionId required.');
    if (isNaN(raterScore) || raterScore < 0 || raterScore > 100) throw new Error('raterScore must be 0–100.');

    var sub = dbFindOne_('ModuleSpeakingSubmission', 'submissionId', submissionId);
    if (!sub) throw new Error('Submission not found.');
    if (String(sub.status) === 'graded') throw new Error('Already graded.');
    if (String(sub.userId) === String(caller.userId)) throw new Error('Cannot grade your own submission.');
    var prompt = dbFindOne_('ModuleSpeakingPrompt', 'promptId', sub.promptId);
    if (!prompt || String(prompt.moduleId) !== String(sub.moduleId)) throw new Error('Submission integrity error.');

    var now = now_();
    dbUpdateByRow_('ModuleSpeakingSubmission', sub.__rowNumber, {
      status:        'graded',
      raterScore:    raterScore,
      raterFeedback: raterFeedback,
      gradedAt:      now,
      raterId:       caller.userId
    });

    // Check if all submissions for this user+module are now graded
    var allSubs = dbReadAll_('ModuleSpeakingSubmission').filter(function(s) {
      return String(s.userId || '') === String(sub.userId) && String(s.moduleId || '') === String(sub.moduleId);
    });
    var allGraded = allSubs.every(function(s) {
      return s.submissionId === submissionId ? true : String(s.status) === 'graded';
    });

    if (allGraded) {
      var scores = allSubs.map(function(s) {
        return s.submissionId === submissionId ? raterScore : Number(s.raterScore || 0);
      });
      var avgScore = Math.round(scores.reduce(function(a, b) { return a + b; }, 0) / scores.length);

      var prog = lmsGetProgress_(sub.userId, sub.moduleId);
      if (prog) {
        dbUpdateByRow_('ModuleProgress', prog.__rowNumber, {
          speakingScore:       avgScore,
          speakingGraded:      true,
          speakingCompletedAt: now,
          updatedAt:           now
        });
      }
    }

    return { ok: true, allGraded: allGraded };
  } catch(err) {
    return apiError_('apiSpeakingRaterGrade', err);
  }
}

// ── ADMIN: Progress overview ──────────────────────────────────────────────────

function apiAdminGetModuleProgress(sessionToken, moduleId) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN', 'INSTRUCTOR']);
    moduleId = String(moduleId || '');
    if (!moduleId) throw new Error('moduleId required.');

    var allProgress = dbReadAll_('ModuleProgress').filter(function(r) {
      return String(r.moduleId || '') === moduleId;
    });

    var users = dbReadAll_('Users');
    var userMap = {};
    users.forEach(function(u) { userMap[u.userId] = u; });

    var result = allProgress.map(function(p) {
      var u = userMap[p.userId] || {};
      return {
        userId:                  p.userId,
        name:                    u.name  || u.email || '',
        email:                   u.email || '',
        introCompleted:          !!p.introCompleted,
        explanationCompleted:    !!p.explanationCompleted,
        quizScore:               Number(p.quizScore   || 0),
        quizAttempts:            Number(p.quizAttempts || 0),
        applicationCompleted:    !!p.applicationCompleted,
        scenariosPassed:         Number(p.scenariosPassed || 0),
        evalScore:               Number(p.evalScore    || 0),
        evalAttempts:            Number(p.evalAttempts  || 0),
        badgeEarned:             !!p.badgeEarned,
        timeSpentTotalSec:       Number(p.timeSpentIntroSec || 0) + Number(p.timeSpentExplanationSec || 0) +
                                 Number(p.timeSpentApplicationSec || 0) + Number(p.timeSpentEvalSec || 0),
        completedAt:             p.completedAt || ''
      };
    });

    return { ok: true, progress: result };
  } catch(err) {
    return apiError_('apiAdminGetModuleProgress', err);
  }
}
