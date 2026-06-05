var AttemptService = {
  submitAttempt: function(user, payload) {
    if (!payload || !payload.scenarioId) {
      throw new Error('Missing scenarioId.');
    }

    // Use pre-resolved scenario if provided by apiSubmitAttempt (avoids duplicate-ID mismatch).
    var scenario = payload._resolvedScenario || ScenarioService.getScenarioById(payload.scenarioId);
    var answer = String(payload.studentAnswer || '').trim();

    if (!answer) {
      throw new Error('Student answer is required.');
    }

    this.validateScenarioAccess_(user, scenario);

    // Keywords must be an array; support both pre-filled array and pipe-separated string.
    var evalKeywords = Array.isArray(scenario.keywords)
      ? scenario.keywords
      : String(scenario.keywordsText || scenario.keywords || '').split('|').map(function(k) { return k.trim(); }).filter(Boolean);

    var evaluation = this.evaluateAnswer_(answer, evalKeywords, scenario.expectedReadback || '');

    var previousAttempts = dbReadAll_('Attempts').filter(function(row) {
      return row.userId === user.userId &&
             row.scenarioId === scenario.scenarioId;
    });

    var attemptNumber = previousAttempts.length + 1;

    var responseTimeSec = Number(payload.responseTimeSec || 0);

    if (responseTimeSec < 0 || responseTimeSec > 3600) {
      responseTimeSec = 0;
    }

    var replayCount = Number(payload.replayCount || 0);
    if (replayCount < 0 || replayCount > 1000) replayCount = 0;

    var attempt = {
      attemptId: uuid_('ATT'),
      userId: user.userId,
      groupId: user.assignedGroupId || '',
      scenarioId: scenario.scenarioId,
      level: scenario.level,
      country: scenario.country,
      atcText: scenario.atcText,
      studentAnswer: answer,
      expectedAnswer: scenario.expectedReadback,
      keywordsOk: evaluation.keywordsOk.join('|'),
      keywordsMissing: evaluation.keywordsMissing.join('|'),
      score: evaluation.score,
      correct: evaluation.correct,
      responseTimeSec: responseTimeSec,
      replayCount: replayCount,
      attemptNumber: attemptNumber,
      createdAt: now_(),
      phaseCode: String(scenario.phaseCode || '')
    };

    dbWithScriptLock_(function() {
      dbAppend_('Attempts', attempt);
    });

    var progress = ProgressService.updateUserProgress(user, scenario);

    return {
      ok: true,
      attempt: attempt,
      evaluation: evaluation,
      progress: progress,
      expectedAnswer: scenario.expectedReadback
    };
  },

  // Simple grading normalizer: uppercase, strip punctuation, collapse spaces.
  // Keeps digits as digits — no ICAO expansion — so "27" stays "27".
  normalizeForGrading_: function(text) {
    return String(text || '').toUpperCase().replace(/[^A-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  },

  extractSemanticTokens_: function(normExpected) {
    var t = normExpected;
    var tokens = [];
    var knownWord = /^(HEADING|RUNWAY|FLIGHT|APPROACH|CONTACT|CLEARED|CLIMB|DESCEND|MAINTAIN|EXPEDITE|REPORT|SQUAWK|CROSS|ENTER|HOLD|TURN|DIRECT|DEPARTURE|ARRIVAL)$/;
    var approachMatch = t.match(/\b(ILS APPROACH|VOR APPROACH|RNAV APPROACH|NDB APPROACH|VISUAL APPROACH|SURVEILLANCE APPROACH)\b/);
    if (approachMatch) tokens.push(approachMatch[1]);
    var rwyMatch = t.match(/\bRUNWAY\s+(\d{1,2}[LRC]?)\b/);
    if (rwyMatch) tokens.push('RUNWAY ' + rwyMatch[1]);
    var hdgMatch = t.match(/\bHEADING\s+(\d{2,3})\b/);
    if (hdgMatch) tokens.push('HEADING ' + hdgMatch[1]);
    if (/\bRIGHT\b/.test(t) && /\bHEADING\b/.test(t)) tokens.push('RIGHT');
    else if (/\bLEFT\b/.test(t) && /\bHEADING\b/.test(t)) tokens.push('LEFT');
    ['CLEARED', 'TAXI', 'MAINTAIN', 'EXPEDITE', 'REPORT', 'HOLD SHORT', 'LINE UP'].forEach(function(v) {
      if (t.indexOf(v) !== -1) tokens.push(v);
    });

    // CONTACT: require both the verb and the specific frequency number
    if (t.indexOf('CONTACT') !== -1) {
      tokens.push('CONTACT');
      var contactFreq = t.match(/\bCONTACT\b[^.]*?(\d{3})\b/);
      if (contactFreq) tokens.push(contactFreq[1]);
    }

    // CLIMB / DESCEND: require the verb + the altitude number as separate tokens
    if (t.indexOf('CLIMB') !== -1) {
      tokens.push('CLIMB');
      var climbNum = t.match(/\bCLIMB\b[^.]*?(\d{3,5})\b/);
      if (climbNum) tokens.push(climbNum[1]);
    }
    if (t.indexOf('DESCEND') !== -1) {
      tokens.push('DESCEND');
      var descendNum = t.match(/\bDESCEND\b[^.]*?(\d{3,5})\b/);
      if (descendNum) tokens.push(descendNum[1]);
    }
    var words = t.split(' ');
    for (var i = 0; i < words.length - 1; i++) {
      if (words[i].length >= 4 && !knownWord.test(words[i]) && /^\d{2,4}$/.test(words[i + 1])) {
        var cs = words[i] + ' ' + words[i + 1];
        if (words[i + 2] === 'HEAVY' || words[i + 2] === 'SUPER') cs += ' ' + words[i + 2];
        tokens.push(cs);
        break;
      }
    }
    return tokens;
  },

  evaluateAnswer_: function(answer, keywords, expectedReadback) {
    var self = this;
    var normExpected = expectedReadback ? this.normalizeForGrading_(expectedReadback) : '';
    if (normExpected) {
      var tokens = this.extractSemanticTokens_(normExpected);
      if (tokens.length > 0) {
        // Check each token against both digit-form and ICAO-word-form of the student answer
        // so "RUNWAY 27" matches both the typed digit "27" and spoken "TWO SEVEN".
        var normAnswerDigit = this.normalizeForGrading_(answer);
        var normAnswerIcao  = this.normalizeText_(answer);
        function _tokenFound(t) {
          if (normAnswerDigit.indexOf(t) !== -1 || normAnswerIcao.indexOf(t) !== -1) return true;
          // Convert digit tokens to ICAO-word form and check again
          var tIcao = t.replace(/\b(\d+)\b/g, function(_, n) {
            return self._digitsToIcao_(n);
          });
          return normAnswerDigit.indexOf(tIcao) !== -1 || normAnswerIcao.indexOf(tIcao) !== -1;
        }
        var missing = tokens.filter(function(t) { return !_tokenFound(t); });
        var matched = tokens.filter(function(t) { return  _tokenFound(t); });
        var score   = Math.round((matched.length / tokens.length) * 100);
        return { correct: missing.length === 0, score: score,
                 keywordsOk: matched, keywordsMissing: missing };
      }
    }
    // Fallback: legacy ICAO-word keyword matching
    var normalizedAnswer = this.normalizeText_(answer);
    // If no expected readback and no keywords, any non-empty answer is accepted.
    if (!keywords.length) {
      var hasContent = normalizedAnswer.length > 2;
      return { correct: hasContent, score: hasContent ? 100 : 0,
               keywordsOk: [], keywordsMissing: [] };
    }
    var keywordsOk = [];
    var keywordsMissing = [];
    keywords.forEach(function(keyword) {
      var normalizedKeyword = AttemptService.normalizeText_(keyword);
      if (normalizedKeyword && normalizedAnswer.indexOf(normalizedKeyword) !== -1) {
        keywordsOk.push(keyword);
      } else {
        keywordsMissing.push(keyword);
      }
    });
    return { correct: keywordsMissing.length === 0,
             score: Math.round((keywordsOk.length / keywords.length) * 100),
             keywordsOk: keywordsOk, keywordsMissing: keywordsMissing };
  },

  normalizeText_: function(value) {
    var out = String(value || '').toUpperCase().trim();

    // Accept digits written as words or as numbers interchangeably
    // Step 1: expand digit sequences to ICAO spoken form so "27" = "TWO SEVEN"
    out = out
      // Frequencies: 118.7 → ONE ONE EIGHT DECIMAL SEVEN
      .replace(/\b(\d{3})\.(\d{1,3})\b/g, function(_, i, d) {
        return AttemptService._digitsToIcao_(i) + ' DECIMAL ' + AttemptService._digitsToIcao_(d);
      })
      // FL: FL250 → FLIGHT LEVEL TWO FIVE ZERO
      .replace(/\bFL\s*(\d{1,4})\b/g, function(_, n) {
        return 'FLIGHT LEVEL ' + AttemptService._digitsToIcao_(n);
      })
      // Remaining digit sequences (runway nums, headings, altitudes, etc.)
      .replace(/\b(\d+)\b/g, function(_, n) {
        return AttemptService._digitsToIcao_(n);
      });

    // Step 2: accept common spoken variations
    out = out
      .replace(/\bNINE\b/g,    'NINER')      // students often write NINE instead of NINER
      .replace(/\bOH\b/g,      'ZERO')       // "oh" used for zero in casual speech
      .replace(/\bPOINT\b/g,   'DECIMAL')    // "point" instead of "decimal"
      .replace(/\bDOT\b/g,     'DECIMAL')
      .replace(/\./g,          ' DECIMAL ')  // literal dot → DECIMAL (e.g. 118.7 mid-word, or typed dot)
      .replace(/\bFT\b/g,      'FEET')
      .replace(/\bKTS?\b/g,    'KNOTS')
      .replace(/\bRWY\b/g,     'RUNWAY')
      .replace(/\bHDG\b/g,     'HEADING');

    // Step 3: strip punctuation and collapse whitespace
    out = out.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();

    // Step 4: normalize aviation compound word variants
    // Hyphens already became spaces in step 3, so TAKE-OFF → TAKE OFF → TAKEOFF
    out = out
      .replace(/\bTAKE\s*OFF\b/g,   'TAKEOFF')
      .replace(/\bPUSH\s*BACK\b/g,  'PUSHBACK')
      .replace(/\bGO\s*AROUND\b/g,  'GOAROUND')
      .replace(/\bLINE\s*UP\b/g,    'LINEUP')
      .replace(/\bHOLD\s*SHORT\b/g, 'HOLDSHORT')
      .replace(/\bSTAND\s*BY\b/g,   'STANDBY')
      .replace(/\bTOUCH\s*DOWN\b/g, 'TOUCHDOWN')
      .replace(/\bWIND\s*SHEAR\b/g, 'WINDSHEAR')
      .replace(/\bCROSS\s*WIND\b/g, 'CROSSWIND')
      .replace(/\bTAIL\s*WIND\b/g,  'TAILWIND')
      .replace(/\bHEAD\s*WIND\b/g,  'HEADWIND');

    return out;
  },

  _digitsToIcao_: function(numStr) {
    var map = {'0':'ZERO','1':'ONE','2':'TWO','3':'THREE','4':'FOUR',
               '5':'FIVE','6':'SIX','7':'SEVEN','8':'EIGHT','9':'NINER'};
    return String(numStr || '').split('').map(function(d) {
      return map[d] || d;
    }).join(' ');
  },

  validateScenarioAccess_: function(user, scenario) {
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

    if (role === ROLES.ADMIN || role === ROLES.INSTRUCTOR) {
      return true;
    }

    if (role === ROLES.STUDENT) {
      var scenarioLevel = Number((scenario && scenario.level) || 1);
      if (scenarioLevel > 1 && !ProgressService.canUserAccessLevel(user, scenarioLevel)) {
        throw new Error('This level is locked. Complete previous levels first.');
      }
      return true;
    }

    throw new Error('Access denied for role: ' + role);
  }
};

var ProgressService = {
  updateUserProgress: function(user, scenario) {
    var level = Number(scenario.level || user.currentLevel || 1);
    var country = String(scenario.country || user.currentCountry || 'USA');

    var activeScenarios = ScenarioService.listActiveScenarios().filter(function(item) {
      return Number(item.level) === level &&
             String(item.country).toUpperCase() === country.toUpperCase();
    });

    var attempts = dbReadAll_('Attempts').filter(function(row) {
      return row.userId === user.userId &&
             Number(row.level) === level &&
             String(row.country).toUpperCase() === country.toUpperCase();
    });

    var completedScenarioMap = {};

    attempts.forEach(function(row) {
      var isCorrect = String(row.correct).toUpperCase() === 'TRUE' || row.correct === true;

      if (isCorrect) {
        completedScenarioMap[row.scenarioId] = true;
      }
    });

    var completedScenarios = Object.keys(completedScenarioMap).length;
    var totalScenarios = activeScenarios.length;
    var progressPct = totalScenarios
      ? Math.min(100, Math.round((completedScenarios / totalScenarios) * 100))
      : 0;

    // Score: average best score per scenario across all attempts.
    // Using only correct attempts would always yield 100 (correct = all tokens matched = score 100).
    var bestPerScenario = {};
    attempts.forEach(function(row) {
      var sid = String(row.scenarioId || row.phaseCode || '_');
      var s   = Number(row.score || 0);
      if (bestPerScenario[sid] === undefined || s > bestPerScenario[sid]) {
        bestPerScenario[sid] = s;
      }
    });
    var scenarioKeys = Object.keys(bestPerScenario);
    var scoreAvg = scenarioKeys.length
      ? Math.round(
          scenarioKeys.reduce(function(sum, k) { return sum + bestPerScenario[k]; }, 0) / scenarioKeys.length
        )
      : 0;

    // ── New performance metrics ────────────────────────────────────────────
    // Use only the FIRST attempt per scenario (attemptNumber === 1) so retries
    // don't inflate scores and replayCount tracks the student's genuine comprehension.

    // Map scenarioId → first-attempt row
    var firstAttemptMap = {};
    attempts.forEach(function(row) {
      if (Number(row.attemptNumber) === 1) {
        firstAttemptMap[String(row.scenarioId || '_')] = row;
      }
    });
    var firstAttemptKeys = Object.keys(firstAttemptMap);
    var totalFirstAttempts = firstAttemptKeys.length;

    // firstAttemptRate: % of attempted scenarios where attempt 1 was correct
    var firstCorrectCount = firstAttemptKeys.filter(function(sid) {
      var r = firstAttemptMap[sid];
      return r.correct === true || String(r.correct).toUpperCase() === 'TRUE';
    }).length;
    var firstAttemptRate = totalFirstAttempts
      ? Math.round((firstCorrectCount / totalFirstAttempts) * 100) : 0;

    // avgCompleteness: average score of first attempts (genuine comprehension, not retry score)
    var avgCompleteness = totalFirstAttempts
      ? Math.round(firstAttemptKeys.reduce(function(sum, sid) {
          return sum + Number(firstAttemptMap[sid].score || 0);
        }, 0) / totalFirstAttempts)
      : 0;

    // consistencyScore: % of scenarios where first-attempt score was >= 70
    var consistentCount = firstAttemptKeys.filter(function(sid) {
      return Number(firstAttemptMap[sid].score || 0) >= 70;
    }).length;
    var consistencyScore = totalFirstAttempts
      ? Math.round((consistentCount / totalFirstAttempts) * 100) : 0;

    // avgReplays: average replayCount on first attempts per scenario
    var avgReplays = totalFirstAttempts
      ? Math.round(
          (firstAttemptKeys.reduce(function(sum, sid) {
            return sum + Number(firstAttemptMap[sid].replayCount || 0);
          }, 0) / totalFirstAttempts) * 10
        ) / 10
      : 0;

    // performanceScore: scoreAvg penalised for excess replays.
    // Each full replay above 1 costs 3 points, capped at -30.
    var replayPenalty = Math.min(30, Math.max(0, Math.floor(avgReplays - 1) * 3));
    var performanceScore = Math.max(0, Math.round(scoreAvg - replayPenalty));

    // trendScore / trendLabel: improvement trajectory across the level.
    // Sort first-attempt rows by createdAt, split into early vs recent halves,
    // compare average scores. Requires at least 4 data points to be meaningful.
    var trendScore = null;
    var trendLabel = null;
    if (totalFirstAttempts >= 4) {
      var sortedFirstAttempts = firstAttemptKeys
        .map(function(sid) { return firstAttemptMap[sid]; })
        .sort(function(a, b) {
          return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
        });
      var half       = Math.floor(sortedFirstAttempts.length / 2);
      var earlyRows  = sortedFirstAttempts.slice(0, half);
      var recentRows = sortedFirstAttempts.slice(sortedFirstAttempts.length - half);
      var earlyAvg   = earlyRows.reduce(function(s, r)  { return s + Number(r.score || 0); }, 0) / earlyRows.length;
      var recentAvg  = recentRows.reduce(function(s, r) { return s + Number(r.score || 0); }, 0) / recentRows.length;
      trendScore = Math.round(recentAvg - earlyAvg);
      trendLabel = trendScore >= 10 ? 'improving' : trendScore <= -10 ? 'declining' : 'stable';
    }
    // ── End new metrics ────────────────────────────────────────────────────

    var completed = totalScenarios > 0 && completedScenarios >= totalScenarios;

    var existing = dbReadAll_('Progress').filter(function(row) {
      return row.userId === user.userId &&
             Number(row.level) === level &&
             String(row.country).toUpperCase() === country.toUpperCase();
    })[0];

    // Never downgrade a completed route — once done, it stays done.
    // scoreAvg on redo: keep the best session average achieved.
    if (existing && (existing.completed === true || String(existing.completed).toUpperCase() === 'TRUE')) {
      completed = true;
      scoreAvg  = Math.max(scoreAvg, Number(existing.scoreAvg || 0));
    }

    var progressData = {
      progressId: existing ? existing.progressId : uuid_('PRG'),
      userId: user.userId,
      level: level,
      country: country,
      completedScenarios: completedScenarios,
      totalScenarios: totalScenarios,
      progressPct: progressPct,
      scoreAvg: scoreAvg,
      unlocked: true,
      completed: completed,
      completedAt: completed
        ? (existing && existing.completedAt ? existing.completedAt : now_())
        : '',
      updatedAt: now_(),
      firstAttemptRate: firstAttemptRate,
      avgCompleteness:  avgCompleteness,
      consistencyScore: consistencyScore,
      avgReplays:       avgReplays,
      performanceScore: performanceScore,
      trendScore:       trendScore !== null ? trendScore : '',
      trendLabel:       trendLabel !== null ? trendLabel : ''
    };

    // Track whether this call is the moment a country route transitions to complete
    var isNewlyCompleted = completed &&
      !(existing && (existing.completed === true || String(existing.completed).toUpperCase() === 'TRUE'));

    dbWithScriptLock_(function() {
      if (existing) {
        dbUpdateByRow_('Progress', existing.__rowNumber, progressData);
      } else {
        dbAppend_('Progress', progressData);
      }
    });

    this.syncUserCoursePosition_(user, progressData);

    // If a country route just completed, check whether the full level is now done
    // and apply any active VR bonus. This runs outside the lock (read-only check + own lock).
    if (isNewlyCompleted) {
      try {
        var levelComp = ProgressService.getLevelCompletion(user, level);
        if (levelComp.completed) {
          progressData.levelJustCompleted = true;
          var vrBonus = (typeof _vrApplyLevelCompletionBonus_ === 'function')
            ? _vrApplyLevelCompletionBonus_(user, level)
            : null;
          if (vrBonus) progressData.vrBonusEarned = vrBonus;
        }
      } catch(e) {
        Logger.log('[updateUserProgress] VR bonus check error: ' + e.message);
      }
    }

    return progressData;
  },

  getUserProgress: function(user) {
    return dbReadAll_('Progress').filter(function(row) {
      return row.userId === user.userId;
    });
  },

  getLevelCompletion: function(user, level) {
    var levelNumber = Number(level || 1);
    var activeScenarios = ScenarioService.listActiveScenarios().filter(function(item) {
      return Number(item.level || 1) === levelNumber;
    });

    var countriesMap = {};
    activeScenarios.forEach(function(item) {
      var countryKey = ProgressService.normalizeCountry_(item.country);
      if (!countryKey) return;
      if (!countriesMap[countryKey]) {
        countriesMap[countryKey] = {
          totalScenarios: 0,
          completedScenarios: 0,
          completed: false
        };
      }
      countriesMap[countryKey].totalScenarios += 1;
    });

    var progressMap = {};
    dbReadAll_('Progress').filter(function(row) {
      return String(row.userId || '') === String(user.userId || '') &&
             Number(row.level || 1) === levelNumber;
    }).forEach(function(row) {
      progressMap[ProgressService.normalizeCountry_(row.country)] = row;
    });

    var countryKeys = Object.keys(countriesMap);
    var completedCountries = 0;

    countryKeys.forEach(function(countryKey) {
      var progress = progressMap[countryKey];
      if (progress && ProgressService.isCompleted_(progress)) {
        completedCountries++;
      }
    });

    return {
      level: levelNumber,
      totalCountries: countryKeys.length,
      completedCountries: completedCountries,
      completed: countryKeys.length === 0 || completedCountries >= countryKeys.length
    };
  },

  canUserAccessLevel: function(user, level) {
    var role = String((user && user.role) || '').toUpperCase();
    var requestedLevel = Number(level || 1);

    if (role === ROLES.ADMIN || role === ROLES.INSTRUCTOR) {
      return true;
    }

    if (requestedLevel <= 1) {
      return true;
    }

    for (var i = 1; i < requestedLevel; i++) {
      if (!this.getLevelCompletion(user, i).completed) {
        return false;
      }
    }

    return true;
  },

  syncUserCoursePosition_: function(user, currentProgress) {
    if (!user || String(user.role || '').toUpperCase() !== ROLES.STUDENT) {
      return;
    }

    var target = this.getNextCourseTarget_(user, currentProgress);
    if (!target) {
      return;
    }

    var userRow = UserService.getById(user.userId);
    if (!userRow) {
      return;
    }

    dbUpdateByRow_('Users', userRow.__rowNumber, {
      currentLevel: target.level,
      currentCountry: target.country,
      updatedAt: now_()
    });
  },

  getNextCourseTarget_: function(user, currentProgress) {
    var activeScenarios = ScenarioService.listActiveScenarios();
    var courseMap = {};

    activeScenarios.forEach(function(item) {
      var level = Number(item.level || 1);
      var country = String(item.country || '').trim();
      var countryKey = ProgressService.normalizeCountry_(country);

      if (!level || !countryKey) {
        return;
      }

      if (!courseMap[level]) {
        courseMap[level] = {};
      }

      if (!courseMap[level][countryKey]) {
        courseMap[level][countryKey] = {
          level: level,
          country: country,
          totalScenarios: 0
        };
      }

      courseMap[level][countryKey].totalScenarios += 1;
    });

    var progressMap = {};

    dbReadAll_('Progress').filter(function(row) {
      return String(row.userId || '') === String(user.userId || '');
    }).forEach(function(row) {
      progressMap[Number(row.level || 1) + '||' + ProgressService.normalizeCountry_(row.country)] = row;
    });

    if (currentProgress) {
      progressMap[
        Number(currentProgress.level || 1) + '||' + ProgressService.normalizeCountry_(currentProgress.country)
      ] = currentProgress;
    }

    var levels = Object.keys(courseMap).map(Number).sort(function(a, b) {
      return a - b;
    });

    for (var i = 0; i < levels.length; i++) {
      var level = levels[i];
      var countryKeys = Object.keys(courseMap[level]).sort();

      for (var j = 0; j < countryKeys.length; j++) {
        var key = countryKeys[j];
        var progress = progressMap[level + '||' + key];

        if (!progress || !this.isCompleted_(progress)) {
          return {
            level: level,
            country: courseMap[level][key].country
          };
        }
      }
    }

    if (currentProgress) {
      return {
        level: Number(currentProgress.level || user.currentLevel || 1),
        country: String(currentProgress.country || user.currentCountry || 'USA')
      };
    }

    return null;
  },

  isCompleted_: function(row) {
    return row && (row.completed === true || String(row.completed).toUpperCase() === 'TRUE');
  },

  normalizeCountry_: function(country) {
    var key = String(country || '').trim().toUpperCase();
    if (key === 'US') return 'USA';
    if (key === 'GB') return 'UK';
    if (key === 'IN') return 'INDIA';
    if (key === 'CO') return 'COLOMBIA';
    return key;
  }
};
