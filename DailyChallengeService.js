// =============================================================================
//  DailyChallengeService.js  —  Daily ATC Listening Challenge + Streak Freeze
// =============================================================================

var DC_SHEETS = {
  CHALLENGES: 'DailyChallenge',
  ITEMS:      'DailyChallengeItems',
  LOG:        'DailyChallengeLog',
  FREEZES:    'StreakFreezes'
};

var DC_XP_REWARD   = 20;
var DC_MAX_FREEZES = 5;

// ── Sheet setup ───────────────────────────────────────────────────────────────

function ensureDailyChallengeSheets() {
  try {
    var ss = dbGetSpreadsheet_();
    [
      { name: DC_SHEETS.CHALLENGES, headers: ['Challenge_ID', 'Day_Index', 'Title'] },
      { name: DC_SHEETS.ITEMS,      headers: ['Item_ID', 'Challenge_ID', 'Item_Order', 'Audio_Script', 'Question_Text', 'Option_A', 'Option_B', 'Option_C', 'Option_D', 'Correct_Option'] },
      { name: DC_SHEETS.LOG,        headers: ['Log_ID', 'User_ID', 'Date', 'Challenge_ID', 'Completed', 'Items_Done', 'Timestamp'] },
      { name: DC_SHEETS.FREEZES,    headers: ['User_ID', 'Freezes', 'Updated_At'] }
    ].forEach(function(s) {
      if (!ss.getSheetByName(s.name)) {
        var sheet = ss.insertSheet(s.name);
        sheet.appendRow(s.headers);
        sheet.getRange(1, 1, 1, s.headers.length)
             .setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
      }
    });
    return { ok: true };
  } catch(e) {
    return { ok: false, message: e.message };
  }
}

// ── Freeze helpers (called from LMSModuleService.js as well) ──────────────────

function _dcGetFreezes_(userId) {
  try {
    var row = dbFindOne_(DC_SHEETS.FREEZES, 'User_ID', String(userId));
    return row ? Math.max(0, Math.min(DC_MAX_FREEZES, Number(row.Freezes) || 0)) : 0;
  } catch(e) { return 0; }
}

function _dcSetFreezes_(userId, count) {
  try {
    count = Math.min(DC_MAX_FREEZES, Math.max(0, Math.round(count)));
    var row = dbFindOne_(DC_SHEETS.FREEZES, 'User_ID', String(userId));
    if (row) {
      dbUpdateByRow_(DC_SHEETS.FREEZES, row.__rowNumber, { Freezes: count, Updated_At: new Date().toISOString() });
    } else {
      dbAppend_(DC_SHEETS.FREEZES, { User_ID: String(userId), Freezes: count, Updated_At: new Date().toISOString() });
    }
    return count;
  } catch(e) { return 0; }
}

function _dcAddFreezes_(userId, amount) {
  return _dcSetFreezes_(userId, _dcGetFreezes_(userId) + amount);
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function _dcTodayStr_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function _dcGetTodayChallengeId_(challenges) {
  if (!challenges || !challenges.length) return null;
  var sorted = challenges.slice().sort(function(a, b) {
    return Number(a.Day_Index || 0) - Number(b.Day_Index || 0);
  });
  var LAUNCH_DATE = new Date('2026-08-18T00:00:00Z');
  var dayIndex    = Math.floor((Date.now() - LAUNCH_DATE.getTime()) / 86400000);
  var idx         = ((dayIndex % sorted.length) + sorted.length) % sorted.length;
  return String(sorted[idx].Challenge_ID);
}

// ── API: Get today's challenge ────────────────────────────────────────────────

function apiGetDailyChallenge(sessionToken) {
  try {
    var user       = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    var challenges = dbReadAll_(DC_SHEETS.CHALLENGES);
    var freezes    = _dcGetFreezes_(user.userId);

    if (!challenges.length) return { ok: true, challenge: null, streakFreezes: freezes };

    var todayId = _dcGetTodayChallengeId_(challenges);
    if (!todayId)  return { ok: true, challenge: null, streakFreezes: freezes };

    var challengeRow = challenges.filter(function(r) {
      return String(r.Challenge_ID) === todayId;
    })[0];
    if (!challengeRow) return { ok: true, challenge: null, streakFreezes: freezes };

    var items = dbReadAll_(DC_SHEETS.ITEMS)
      .filter(function(r) { return String(r.Challenge_ID) === todayId; })
      .sort(function(a, b) { return Number(a.Item_Order) - Number(b.Item_Order); })
      .map(function(r) {
        return {
          itemOrder:    Number(r.Item_Order),
          audioScript:  String(r.Audio_Script  || ''),
          questionText: String(r.Question_Text || ''),
          optionA:      String(r.Option_A      || ''),
          optionB:      String(r.Option_B      || ''),
          optionC:      String(r.Option_C      || ''),
          optionD:      String(r.Option_D      || '')
        };
      });

    var today       = _dcTodayStr_();
    var alreadyDone = dbReadAll_(DC_SHEETS.LOG).some(function(r) {
      return String(r.User_ID)      === String(user.userId) &&
             String(r.Challenge_ID) === todayId &&
             String(r.Date)         === today &&
             String(r.Completed)    === 'true';
    });

    return {
      ok: true,
      challenge: {
        challengeId: String(challengeRow.Challenge_ID),
        title:       String(challengeRow.Title || 'Daily Challenge'),
        items:       items,
        totalItems:  items.length,
        alreadyDone: alreadyDone
      },
      streakFreezes: freezes
    };
  } catch(e) {
    return { ok: false, message: e.message };
  }
}

// ── API: Get TTS audio for one item ──────────────────────────────────────────

function apiGetDailyChallengeAudio(sessionToken, challengeId, itemOrder) {
  try {
    AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    var items = dbReadAll_(DC_SHEETS.ITEMS).filter(function(r) {
      return String(r.Challenge_ID) === String(challengeId) &&
             Number(r.Item_Order)   === Number(itemOrder);
    });
    if (!items.length) return { ok: false, message: 'Item not found.' };

    var script = String(items[0].Audio_Script || '').trim();
    if (!script) return { ok: false, message: 'No audio script for this item.' };

    var cacheKey = 'dc_' + String(challengeId) + '_' + String(itemOrder);
    var cached   = TTSService.getTtsFromCache_(cacheKey);
    if (cached)  return { ok: true, audioBase64: cached, mimeType: 'audio/mp3', cached: true };

    var profile = TTSService.getProfileByCountry_('USA');
    var voices  = profile.voiceNames || [];
    var voice   = voices[0] || '';
    var rate    = profile.speakingRate || 0.9;
    var ssml    = TTSService.buildAtcSsml_(script, profile, rate, voice);
    var result  = TTSService.callGoogleTtsWithFallbackVoices_(ssml, {
      languageCode:     profile.languageCode,
      pitch:            profile.pitch,
      effectsProfileId: profile.effectsProfileId,
      voiceNames:       voices
    }, rate);

    TTSService.storeTtsInCache_(cacheKey, result.audioBase64);
    return { ok: true, audioBase64: result.audioBase64, mimeType: 'audio/mp3', voiceName: result.voiceName };
  } catch(e) {
    return { ok: false, message: e.message };
  }
}

// ── API: Submit one answer ────────────────────────────────────────────────────

function apiSubmitDailyChallengeAnswer(sessionToken, challengeId, itemOrder, answer) {
  try {
    var user     = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    var allItems = dbReadAll_(DC_SHEETS.ITEMS).filter(function(r) {
      return String(r.Challenge_ID) === String(challengeId);
    });
    var item = allItems.filter(function(r) {
      return Number(r.Item_Order) === Number(itemOrder);
    })[0];
    if (!item) return { ok: false, message: 'Item not found.' };

    var correct    = String(answer).trim().toUpperCase() === String(item.Correct_Option || '').trim().toUpperCase();
    var totalItems = allItems.length;
    var isLast     = Number(itemOrder) >= totalItems;

    var xpAwarded     = 0;
    var freezeAwarded = 0;
    var newStreakDays  = null;
    var newFreezes    = _dcGetFreezes_(user.userId);

    if (correct && isLast) {
      // Script lock prevents concurrent double-completion (race condition on last item)
      var lock = LockService.getScriptLock();
      var acquired = false;
      try { lock.tryLock(4000); acquired = true; } catch(e) {}

      var today = _dcTodayStr_();
      // Count existing completions BEFORE appending (used for first-completion freeze)
      var allLogsBefore = dbReadAll_(DC_SHEETS.LOG).filter(function(r) {
        return String(r.User_ID) === String(user.userId) && String(r.Completed) === 'true';
      });
      var prevCompletionCount = allLogsBefore.length;

      var alreadyDone = allLogsBefore.some(function(r) {
        return String(r.Challenge_ID) === String(challengeId) &&
               String(r.Date)         === today;
      });

      if (!alreadyDone) {
        dbAppend_(DC_SHEETS.LOG, {
          Log_ID:       String(Date.now()),
          User_ID:      String(user.userId),
          Date:         today,
          Challenge_ID: String(challengeId),
          Completed:    'true',
          Items_Done:   String(totalItems),
          Timestamp:    new Date().toISOString()
        });

        lmsAddXp_(user.userId, DC_XP_REWARD);
        xpAwarded    = DC_XP_REWARD;
        newStreakDays = lmsUpdateStreak_(user.userId);

        // Freeze: first completion ever (use pre-append count)
        if (prevCompletionCount === 0) {
          _dcAddFreezes_(user.userId, 1);
          freezeAwarded = 1;
        } else if (newStreakDays > 0 && newStreakDays % 3 === 0) {
          // Every 3 consecutive days
          _dcAddFreezes_(user.userId, 1);
          freezeAwarded = 1;
        }
        newFreezes = _dcGetFreezes_(user.userId);
      }

      if (acquired) { try { lock.releaseLock(); } catch(e) {} }
    }

    return {
      ok:            true,
      correct:       correct,
      isLast:        isLast,
      xpAwarded:     xpAwarded,
      freezeAwarded: freezeAwarded,
      newStreakDays:  newStreakDays,
      newFreezes:    newFreezes
    };
  } catch(e) {
    return { ok: false, message: e.message };
  }
}

// ── API: Purchase streak freeze with XP ──────────────────────────────────────

function apiPurchaseStreakFreeze(sessionToken) {
  try {
    var user    = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    var XP_COST = 500;
    var current = _dcGetFreezes_(user.userId);
    if (current >= DC_MAX_FREEZES) {
      return { ok: false, message: 'You already have the maximum ' + DC_MAX_FREEZES + ' freezes.' };
    }
    var xpRow     = dbFindOne_('LmsXp', 'userId', String(user.userId));
    var currentXp = xpRow ? (Number(xpRow.lmsXp) || 0) : 0;
    if (currentXp < XP_COST) {
      return { ok: false, message: 'Not enough XP. You need ' + XP_COST + ' XP to purchase a freeze.' };
    }
    if (xpRow) {
      dbUpdateByRow_('LmsXp', xpRow.__rowNumber, { lmsXp: currentXp - XP_COST });
    }
    var newCount = _dcAddFreezes_(user.userId, 1);
    return { ok: true, newFreezes: newCount, newXp: currentXp - XP_COST };
  } catch(e) {
    return { ok: false, message: e.message };
  }
}

// ── API: Admin — list challenges ──────────────────────────────────────────────

function apiAdminListDailyChallenges(sessionToken) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN']);
    var challenges = dbReadAll_(DC_SHEETS.CHALLENGES).sort(function(a, b) {
      return Number(a.Day_Index || 0) - Number(b.Day_Index || 0);
    });
    var items = dbReadAll_(DC_SHEETS.ITEMS);
    return {
      ok: true,
      challenges: challenges.map(function(c) {
        var cItems = items.filter(function(i) {
          return String(i.Challenge_ID) === String(c.Challenge_ID);
        }).sort(function(a, b) { return Number(a.Item_Order) - Number(b.Item_Order); });
        return {
          challengeId: String(c.Challenge_ID),
          dayIndex:    Number(c.Day_Index || 0),
          title:       String(c.Title || ''),
          items: cItems.map(function(i) {
            return {
              itemOrder:     Number(i.Item_Order),
              audioScript:   String(i.Audio_Script   || ''),
              questionText:  String(i.Question_Text  || ''),
              optionA:       String(i.Option_A        || ''),
              optionB:       String(i.Option_B        || ''),
              optionC:       String(i.Option_C        || ''),
              optionD:       String(i.Option_D        || ''),
              correctOption: String(i.Correct_Option  || 'A')
            };
          })
        };
      })
    };
  } catch(e) {
    return { ok: false, message: e.message };
  }
}

// ── API: Admin — save / update challenge ──────────────────────────────────────

function apiAdminSaveDailyChallenge(sessionToken, payload) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN']);
    ensureDailyChallengeSheets();
    payload = payload || {};

    var isNew       = !payload.challengeId;
    var challengeId = isNew ? ('DC_' + Date.now()) : String(payload.challengeId);
    var title       = String(payload.title || 'Daily Challenge').trim();

    var existing = dbReadAll_(DC_SHEETS.CHALLENGES);
    var dayIndex  = (payload.dayIndex !== undefined && payload.dayIndex !== null)
      ? Number(payload.dayIndex)
      : (existing.length
          ? Math.max.apply(null, existing.map(function(r) { return Number(r.Day_Index || 0); })) + 1
          : 1);

    if (isNew) {
      dbAppend_(DC_SHEETS.CHALLENGES, { Challenge_ID: challengeId, Day_Index: dayIndex, Title: title });
    } else {
      var row = dbFindOne_(DC_SHEETS.CHALLENGES, 'Challenge_ID', challengeId);
      if (row) dbUpdateByRow_(DC_SHEETS.CHALLENGES, row.__rowNumber, { Title: title, Day_Index: dayIndex });
    }

    // Remove existing items for this challenge then re-insert
    var ss        = dbGetSpreadsheet_();
    var itemSheet = ss.getSheetByName(DC_SHEETS.ITEMS);
    if (itemSheet) {
      var data    = itemSheet.getDataRange().getValues();
      var headers = data[0].map(function(h) { return String(h); });
      var cidIdx  = headers.indexOf('Challenge_ID');
      for (var r = data.length - 1; r >= 1; r--) {
        if (String(data[r][cidIdx]) === challengeId) itemSheet.deleteRow(r + 1);
      }
    }

    (payload.items || []).forEach(function(item, idx) {
      dbAppend_(DC_SHEETS.ITEMS, {
        Item_ID:       challengeId + '_' + (idx + 1),
        Challenge_ID:  challengeId,
        Item_Order:    idx + 1,
        Audio_Script:  String(item.audioScript  || '').trim(),
        Question_Text: String(item.questionText || '').trim(),
        Option_A:      String(item.optionA      || '').trim(),
        Option_B:      String(item.optionB      || '').trim(),
        Option_C:      String(item.optionC      || '').trim(),
        Option_D:      String(item.optionD      || '').trim(),
        Correct_Option: String(item.correctOption || 'A').trim().toUpperCase()
      });
    });

    return { ok: true, challengeId: challengeId };
  } catch(e) {
    return { ok: false, message: e.message };
  }
}

// ── API: Admin — delete challenge ─────────────────────────────────────────────

function apiAdminDeleteDailyChallenge(sessionToken, challengeId) {
  try {
    AuthService.requireRole(sessionToken, ['ADMIN']);
    challengeId = String(challengeId || '');

    var row = dbFindOne_(DC_SHEETS.CHALLENGES, 'Challenge_ID', challengeId);
    if (row) {
      var sheet = dbGetSpreadsheet_().getSheetByName(DC_SHEETS.CHALLENGES);
      if (sheet) sheet.deleteRow(row.__rowNumber);
    }

    var itemSheet = dbGetSpreadsheet_().getSheetByName(DC_SHEETS.ITEMS);
    if (itemSheet) {
      var data    = itemSheet.getDataRange().getValues();
      var headers = data[0].map(function(h) { return String(h); });
      var cidIdx  = headers.indexOf('Challenge_ID');
      for (var r = data.length - 1; r >= 1; r--) {
        if (String(data[r][cidIdx]) === challengeId) itemSheet.deleteRow(r + 1);
      }
    }
    return { ok: true };
  } catch(e) {
    return { ok: false, message: e.message };
  }
}
