// ─────────────────────────────────────────────────────────────────────────────
// LMSModuleService.js
// Backend for the structured LMS module system.
// 4 sections per module (Intro → Explanation → Application → Evaluation).
// Each section locks until the previous is completed.
// ─────────────────────────────────────────────────────────────────────────────

// ── Helpers ───────────────────────────────────────────────────────────────────

function mergeObjects_(base, patch) {
  var out = {};
  Object.keys(base).forEach(function(k) { out[k] = base[k]; });
  Object.keys(patch).forEach(function(k) { out[k] = patch[k]; });
  return out;
}

// Normalize GAS sheet boolean — Sheets may return TRUE/FALSE as strings
function lmsBool_(v) {
  if (v === true  || v === 'TRUE'  || v === 'true'  || v === 1) return true;
  if (v === false || v === 'FALSE' || v === 'false' || v === 0 || v === '' || v === null || v === undefined) return false;
  return !!v;
}

// ── Constants ─────────────────────────────────────────────────────────────────

var LMS_QUIZ_COOLDOWN_MS   = 15 * 60 * 1000; // 15-minute cooldown between quiz retries
var LMS_MIN_PASS_SCORE     = 85;              // % required to pass quiz / evaluation
var LMS_MIN_SCENARIOS      = 3;              // scenarios needed to unlock evaluation
var LMS_FORUM_MIN_WORDS    = 3;              // minimum words in a forum post

// ── Setup ─────────────────────────────────────────────────────────────────────

function setupLMSModuleSheets() {
  var ss = dbGetSpreadsheet_();
  var sheets = [
    'Modules', 'ModuleVideos', 'ModuleQuiz',
    'ModuleScenarios', 'ModuleForum', 'ModuleForumLikes', 'ModuleProgress', 'LmsXp', 'UserStreaks'
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
  } catch(e) {}
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

function lmsGetStreak_(userId) {
  try {
    var rows = dbReadAll_('UserStreaks').filter(function(r) {
      return String(r.userId || '') === String(userId);
    });
    if (!rows.length) return { streakDays: 0, longestStreak: 0, lastActiveAt: '', streakProtected: false };
    var row = rows[0];
    var hoursSince = row.lastActiveAt ? (Date.now() - new Date(row.lastActiveAt).getTime()) / (1000 * 60 * 60) : 999;
    var active = hoursSince < 48;
    return {
      streakDays: active ? (Number(row.streakDays) || 0) : 0,
      longestStreak: Number(row.longestStreak) || 0,
      lastActiveAt: row.lastActiveAt || '',
      streakProtected: active
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
    var hoursSince = (nowTs - lastTs) / (1000 * 60 * 60);
    var streakDays = Number(row.streakDays) || 0;
    var longest = Number(row.longestStreak) || 0;
    if (hoursSince < 24) {
      dbUpdateByRow_('UserStreaks', row.__rowNumber, { lastActiveAt: now.toISOString() });
    } else if (hoursSince < 48) {
      streakDays++;
      longest = Math.max(streakDays, longest);
      dbUpdateByRow_('UserStreaks', row.__rowNumber, { streakDays: streakDays, lastActiveAt: now.toISOString(), longestStreak: longest });
    } else {
      streakDays = 1;
      dbUpdateByRow_('UserStreaks', row.__rowNumber, { streakDays: 1, lastActiveAt: now.toISOString() });
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
    quizScore:                0,
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
  if (section === 'explanation')  return !!progress.introCompleted;
  if (section === 'application')  return !!progress.explanationCompleted;
  if (section === 'evaluation')   return !!progress.applicationCompleted;
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
          title:         title,
          topic:         String(payload.topic       || existing.topic       || '').trim(),
          description:   String(payload.description || existing.description || '').trim(),
          moduleOrder:   payload.moduleOrder !== undefined ? Number(payload.moduleOrder) : Number(existing.moduleOrder || 0),
          status:        String(payload.status       || existing.status      || 'DRAFT'),
          badgeImageUrl: String(payload.badgeImageUrl || existing.badgeImageUrl || '').trim(),
          updatedAt:     now
        };
        dbUpdateByRow_('Modules', existing.__rowNumber, patch);
        return mergeObjects_(existing, patch);
      } else {
        var newModule = {
          moduleId:      uuid_('MOD'),
          title:         title,
          topic:         String(payload.topic       || '').trim(),
          description:   String(payload.description || '').trim(),
          moduleOrder:   Number(payload.moduleOrder || 0),
          status:        'DRAFT',
          badgeImageUrl: String(payload.badgeImageUrl || '').trim(),
          createdAt:     now,
          updatedAt:     now
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

    var question  = String(payload.question  || '').trim();
    var moduleId  = String(payload.moduleId  || '').trim();
    var videoId   = String(payload.videoId   || '').trim();

    if (!question) throw new Error('question is required.');
    if (!moduleId) throw new Error('moduleId is required.');
    if (!videoId)  throw new Error('videoId is required.');

    var options = Array.isArray(payload.options) ? payload.options : [];
    if (options.length < 2) throw new Error('At least 2 options required.');
    var correctIndex    = Number(payload.correctIndex    || 0);
    var xpReward        = Number(payload.xpReward        || 5);
    var videoTimestamp  = Number(payload.videoTimestamp  || 0);
    if (correctIndex < 0 || correctIndex >= options.length) throw new Error('Invalid correctIndex.');

    var result = dbWithScriptLock_(function() {
      var now = now_();
      if (payload.questionId) {
        var existing = dbFindOne_('ModuleQuiz', 'questionId', payload.questionId);
        if (!existing) throw new Error('Question not found.');
        var patch = {
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
      .sort(function(a, b) { return Number(a.videoTimestamp || 0) - Number(b.videoTimestamp || 0); })
      .map(function(q) {
        var opts = [];
        try { opts = JSON.parse(q.optionsJson || '[]'); } catch(e) {}
        return {
          questionId:     q.questionId,
          moduleId:       q.moduleId,
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
    lmsAddXp_(user.userId, xp);
    return { ok: true, xpAwarded: xp };
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
        currentLevel: Number(u.currentLevel || 1)
      };
    });

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
      var info = userMap[uid] || { profession: 'PILOT', currentLevel: 1 };
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

    // Enforce 3-word minimum
    if (body.split(/\s+/).filter(function(w) { return w.length > 0; }).length <= LMS_FORUM_MIN_WORDS) {
      throw new Error('Post must be more than ' + LMS_FORUM_MIN_WORDS + ' words.');
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
          var progForForum = lmsGetProgress_(caller.userId, moduleId);
          if (progForForum && !lmsBool_(progForForum.introForumPosted)) {
            var fp = { introForumPosted: true, updatedAt: now };
            if (lmsBool_(progForForum.introVideoWatched)) fp.introCompleted = true;
            dbUpdateByRow_('ModuleProgress', progForForum.__rowNumber, fp);
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

      return {
        moduleId:      m.moduleId,
        title:         m.title,
        topic:         m.topic,
        description:   m.description,
        moduleOrder:   Number(m.moduleOrder || 0),
        badgeImageUrl: m.badgeImageUrl,
        unlocked:      unlocked,
        completed:     !!(prog && prog.completedAt),
        badgeEarned:   !!(prog && prog.badgeEarned),
        sections: {
          intro:       { unlocked: unlocked,                                   completed: !!(prog && prog.introCompleted) },
          explanation: { unlocked: !!(prog && prog.introCompleted),             completed: !!(prog && prog.explanationCompleted) },
          application: { unlocked: !!(prog && prog.explanationCompleted),       completed: !!(prog && prog.applicationCompleted) },
          evaluation:  { unlocked: !!(prog && prog.applicationCompleted),       completed: !!(prog && prog.evalPassed) }
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
          questionOrder: Number(q.questionOrder || 0)
          // correctIndex intentionally omitted for students
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

    var cooldownUntil = prog ? lmsCheckCooldown_(prog.quizLastAttemptAt) : null;
    var evalCooldown  = prog ? lmsCheckCooldown_(prog.evalLastAttemptAt)  : null;

    return {
      ok: true,
      module: {
        moduleId:      module.moduleId,
        title:         module.title,
        topic:         module.topic,
        description:   module.description,
        badgeImageUrl: module.badgeImageUrl
      },
      videos:    videos,
      questions: questions,
      scenarios: scenarios,
      progress: prog ? {
        introVideoWatched:       lmsBool_(prog.introVideoWatched),
        introForumPosted:        lmsBool_(prog.introForumPosted),
        introCompleted:          lmsBool_(prog.introCompleted),
        explanationVideosWatched: watchedIds,
        quizScore:               Number(prog.quizScore   || 0),
        quizAttempts:            Number(prog.quizAttempts || 0),
        quizPassed:              lmsBool_(prog.quizPassed),
        quizCooldownUntil:       cooldownUntil,
        explanationCompleted:    lmsBool_(prog.explanationCompleted),
        scenariosPassed:         Number(prog.scenariosPassed || 0),
        applicationCompleted:    lmsBool_(prog.applicationCompleted),
        evalScore:               Number(prog.evalScore    || 0),
        evalAttempts:            Number(prog.evalAttempts  || 0),
        evalPassed:              lmsBool_(prog.evalPassed),
        evalCooldownUntil:       evalCooldown,
        badgeEarned:             lmsBool_(prog.badgeEarned)
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
        if (allWatched && !lmsBool_(prog.explanationCompleted)) {
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
        if (passed && !lmsBool_(prog.quizPassed)) {
          patch.quizPassed           = true;
          patch.explanationCompleted = true;
          xpAwarded = 50;
        }
      } else {
        patch.evalScore         = score;
        patch.evalLastAttemptAt = now;
        patch.evalAttempts      = Number(prog.evalAttempts || 0) + 1;
        if (passed && !lmsBool_(prog.evalPassed)) {
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
      if (count >= LMS_MIN_SCENARIOS) patch.applicationCompleted = true;

      dbUpdateByRow_('ModuleProgress', prog.__rowNumber, patch);
      return mergeObjects_(prog, patch);
    });

    return { ok: true, scenariosPassed: Number(updated.scenariosPassed), applicationCompleted: !!updated.applicationCompleted };
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
