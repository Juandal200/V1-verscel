var AttemptService = {
  submitAttempt: function(user, payload) {
    // Wrap the whole submission in a read scope. Attempts, Scenarios and Progress
    // are each read twice across this call graph; inside the scope the second read
    // of each is served from memory. Everything here writes through dbAppend_ /
    // dbUpdateByRow_, so the cache stays correct.
    var self = this;
    return dbWithReadScope_(function() { return self._submitAttempt_(user, payload); });
  },

  _submitAttempt_: function(user, payload) {
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
      phaseCode: String(scenario.phaseCode || ''),
      // Identifies one run of a route, so a retry can be scored as a whole
      // session rather than blended into the running per-scenario bests.
      sessionId: String(payload.sessionId || '')
    };

    dbWithScriptLock_(function() {
      dbAppend_('Attempts', attempt);
    });

    var progress = ProgressService.updateUserProgress(user, scenario);
    var lmsXpTotal;
    var lmsStreakDays;
    try {
      if (evaluation.correct) {
        lmsXpTotal = lmsAddXp_(user.userId, 25);
        // Return the new count so the client can tell an increment from a
        // same-day refresh and celebrate only when the streak actually grows.
        lmsStreakDays = lmsUpdateStreak_(user.userId);
      }
    } catch(e) {}

    return {
      ok: true,
      attempt: attempt,
      evaluation: evaluation,
      progress: progress,
      expectedAnswer: scenario.expectedReadback,
      lmsXpTotal: lmsXpTotal,
      lmsStreakDays: lmsStreakDays
    };
  },

  // Simple grading normalizer: uppercase, strip punctuation, collapse spaces.
  // Keeps digits as digits — no ICAO expansion — so "27" stays "27".
  normalizeForGrading_: function(text) {
    return String(text || '')
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      // Sheets write thousands split: "3 000", "2 500". Rejoin before any token
      // extraction, otherwise the digit regexes capture the tail ("000", "500")
      // and the server ends up demanding that fragment as a required readback.
      .replace(/\b(\d{1,2}) (\d{3})\b/g, '$1$2')
      .trim();
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

    // The curated keywords column is the authority: it is hand-authored per
    // scenario AND it is exactly what the UI shows the student as required
    // elements. extractSemanticTokens_ is a heuristic guesser — when the two
    // disagree the student is graded on a rubric they were never shown, which
    // is how a fully-correct readback ends up marked incorrect.
    // Keywords first; the extractor is now only the fallback.
    if (keywords && keywords.length) {
      var kwAnswer = this.normalizeText_(answer);
      var kwOk = [];
      var kwMissing = [];
      keywords.forEach(function(keyword) {
        var nk = self.normalizeText_(keyword);
        if (nk && kwAnswer.indexOf(nk) !== -1) kwOk.push(keyword);
        else kwMissing.push(keyword);
      });
      return {
        correct: kwMissing.length === 0,
        score: Math.round((kwOk.length / keywords.length) * 100),
        keywordsOk: kwOk,
        keywordsMissing: kwMissing
      };
    }

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

    // Rejoin split thousands ("3 000" → "3000") before digit expansion, so the
    // expected readback and the student answer normalize the same way.
    out = out.replace(/\b(\d{1,2}) (\d{3})\b/g, '$1$2');

    // Spoken altitudes → digits. ICAO phraseology for 3000 ft is "THREE
    // THOUSAND", but the sheet writes "3 000" — without this the student is
    // penalised precisely for using correct phraseology.
    // All three forms ("3 000", "THREE THOUSAND", "THREE ZERO ZERO ZERO")
    // must canonicalise to the same string.
    // _n must span TWO digit-words: ICAO says "ONE ZERO THOUSAND" for 10 000.
    // A single-word group binds only "ZERO THOUSAND" -> 0, silently deleting
    // the leading digit and (worse) collapsing the keyword to a short string
    // that then matches unrelated answers.
    var _w2d = { ZERO: 0, ONE: 1, TWO: 2, THREE: 3, FOUR: 4,
                 FIVE: 5, SIX: 6, SEVEN: 7, EIGHT: 8, NINE: 9, NINER: 9 };
    var _d = '(?:ZERO|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINER|NINE|\\d)';
    var _n = '(?:' + _d + '(?: ' + _d + ')?|\\d{1,2})';
    function _val(tok) {
      return Number(String(tok).split(' ').map(function(t) {
        return /^\d+$/.test(t) ? t : String(_w2d[t]);
      }).join(''));
    }

    out = out
      .replace(new RegExp('\\b(' + _n + ') THOUSAND (' + _n + ') HUNDRED\\b', 'g'),
               function(_, a, b) { return String(_val(a) * 1000 + _val(b) * 100); })
      .replace(new RegExp('\\b(' + _n + ') THOUSAND\\b', 'g'),
               function(_, a) { return String(_val(a) * 1000); })
      .replace(new RegExp('\\b(' + _n + ') HUNDRED\\b', 'g'),
               function(_, a) { return String(_val(a) * 100); });


    // Aircraft types: students write "B777" / "A320"; the sheet says "BOEING 777".
    // MUST run before digit expansion — in "B777" there is no word boundary between
    // the letter and the digits, so \b(\d+)\b never fires and the token survives as
    // a literal "B777" that can never match "BOEING SEVEN SEVEN SEVEN".
    // Model families are pinned (Boeing 7xx, Airbus 2xx/3xx, Embraer 1xx) rather
    // than matching any letter+3-digits, which would swallow waypoint names.
    out = out
      .replace(/\bB-?(7\d{2})\b/g,   'BOEING $1')
      .replace(/\bA-?([23]\d{2})\b/g, 'AIRBUS $1')
      .replace(/\bE-?(1\d{2})\b/g,   'EMBRAER $1')
      .replace(/\bCRJ-?(\d{3})\b/g,  'CRJ $1');

    // Turn amounts and headings are spoken in tens, not ICAO digits: a 360-degree
    // turn is "three sixty", a 270 is "two seventy", a 180 is "one eighty". The
    // sheet writes the numeral, so without this the two forms could never meet —
    // which is what made SCN-L7 Approach unpassable, and why its keyword cell had
    // grown to demand BOTH "360 TURN LEFT" and "THREE SIXTY TURN LEFT".
    // Must run before digit expansion, like the THOUSAND rule above.
    var _TENS = { TWENTY: 20, THIRTY: 30, FORTY: 40, FIFTY: 50,
                  SIXTY: 60, SEVENTY: 70, EIGHTY: 80, NINETY: 90 };
    var _TW = 'TWENTY|THIRTY|FORTY|FIFTY|SIXTY|SEVENTY|EIGHTY|NINETY';
    out = out
      .replace(new RegExp('\\b(ONE|TWO|THREE) (' + _TW + ')\\b', 'g'),
               function(_, h, t) {
                 var hv = { ONE: 1, TWO: 2, THREE: 3 }[h];
                 return String(hv * 100 + _TENS[t]);
               })
      .replace(new RegExp('\\b(' + _TW + ')\\b', 'g'),
               function(t) { return String(_TENS[t]); });
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
      // Students type abbreviations. RW was on the CLIENT normalizer only, so
      // "rw 27" scored correct on screen and incorrect in the database — the exact
      // divergence that left SCN-L6-007 unpassable. Both sides must carry the
      // identical set; add here and in Scripts.html _clientNormalizeText together.
      .replace(/\bRWY\b/g,     'RUNWAY')
      .replace(/\bRW\b/g,      'RUNWAY')
      .replace(/\bTWY\b/g,     'TAXIWAY')
      .replace(/\bSPD\b/g,     'SPEED')
      .replace(/\bACFT\b/g,    'AIRCRAFT')
      .replace(/\bHDG\b/g,     'HEADING')
      // British/American spelling. The platform runs UK, US, AU, IN and CA
      // environments, so both forms appear in scenario text AND in what students
      // type — "extended CENTRE line" against "extended CENTER line" is not a
      // read-back error. Canonicalise on both sides so either is accepted.
      .replace(/\bCENTRE\b/g,        'CENTER')
      .replace(/\bCENTRELINE\b/g,    'CENTERLINE')
      .replace(/\bMETRE(S?)\b/g,     'METER$1')
      .replace(/\bKILOMETRE(S?)\b/g, 'KILOMETER$1')
      .replace(/\bMANOEUVRE(S?)\b/g, 'MANEUVER$1')
      .replace(/\bTYRE(S?)\b/g,      'TIRE$1')
      .replace(/\bAUTHORISED\b/g,    'AUTHORIZED')
      .replace(/\bAUTHORISATION\b/g, 'AUTHORIZATION')
      .replace(/\bANALYSE\b/g,       'ANALYZE');

    // Step 3: strip punctuation and collapse whitespace
    out = out.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();

    // Step 4: normalize aviation compound word variants
    // Hyphens already became spaces in step 3, so TAKE-OFF → TAKE OFF → TAKEOFF
    out = out
      // Progressive forms too: a pilot reads back "going around" / "taking off",
      // while the keyword cell says "go around" / "take off". Without these the
      // correct phraseology scores zero on that element.
      .replace(/\bTAK(?:E|ING)\s*OFF\b/g,   'TAKEOFF')
      .replace(/\bPUSH(?:ING)?\s*BACK\b/g,  'PUSHBACK')
      .replace(/\bGO(?:ING)?\s*AROUND\b/g,  'GOAROUND')
      .replace(/\bLIN(?:E|ING)\s*UP\b/g,    'LINEUP')
      .replace(/\bHOLD(?:ING)?\s*SHORT\b/g, 'HOLDSHORT')
      .replace(/\bSTAND(?:ING)?\s*BY\b/g,   'STANDBY')
      .replace(/\bCENTER\s*LINE\b/g, 'CENTERLINE')
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
  updateUserProgress: function(user, scenario, opts) {
    opts = opts || {};
    var level = Number(scenario.level || user.currentLevel || 1);
    var country = String(scenario.country || user.currentCountry || 'USA');

    // Match countries through normalizeCountry_ on BOTH sides. Exact string
    // comparison silently fails whenever the sheet stores a code ("GB", "IN")
    // and the stored row holds the display name ("UK", "India") — which yields
    // totalScenarios = 0 and a route that can never be completed.
    var countryKey = ProgressService.normalizeCountry_(country);

    var activeScenarios = ScenarioService.listActiveScenarios().filter(function(item) {
      return Number(item.level) === level &&
             ProgressService.normalizeCountry_(item.country) === countryKey;
    });

    var attempts = dbReadAll_('Attempts').filter(function(row) {
      return row.userId === user.userId &&
             Number(row.level) === level &&
             ProgressService.normalizeCountry_(row.country) === countryKey;
    });

    // Count totalScenarios by unique scenarioId — same dimension as completedScenarioMap.
    // Raw row count inflates the total when duplicate IDs exist in the sheet.
    var uniqueActiveIds = {};
    activeScenarios.forEach(function(s) { if (s.scenarioId) uniqueActiveIds[s.scenarioId] = true; });
    var totalScenarios = Object.keys(uniqueActiveIds).length || activeScenarios.length;

    var completedScenarioMap = {};

    attempts.forEach(function(row) {
      var isCorrect = String(row.correct).toUpperCase() === 'TRUE' || row.correct === true;

      // Only count scenarios that are still in the active set. Without this,
      // attempts against renamed or deactivated scenarioIds inflate the count
      // past the total (observed live: 9/8, progressPct 113%).
      if (isCorrect && uniqueActiveIds[row.scenarioId]) {
        completedScenarioMap[row.scenarioId] = true;
      }
    });

    var completedScenarios = Object.keys(completedScenarioMap).length;
    var progressPct = totalScenarios
      ? Math.min(100, Math.round((completedScenarios / totalScenarios) * 100))
      : 0;

    // Score: average best score per scenario across all attempts.
    // Using only correct attempts would always yield 100 (correct = all tokens matched = score 100).
    // BEST WHOLE SESSION, not a blend of bests from different runs.
    // A session is one run of the route (client-generated sessionId). Its score is
    // the average of its best score per scenario within that run, and the route's
    // stored scoreAvg is the highest such session — so a retry replaces the record
    // only when the entire run beats the previous one.
    // Legacy rows predate sessionId; bucket those by calendar day so they group
    // into plausible runs instead of collapsing into one giant session.
    var sessions = {};
    attempts.forEach(function(row) {
      var key = String(row.sessionId || '').trim() ||
                ('legacy:' + String(row.createdAt || '').slice(0, 10));
      var sid = String(row.scenarioId || row.phaseCode || '_');
      var s   = Number(row.score || 0);
      if (!sessions[key]) sessions[key] = {};
      if (sessions[key][sid] === undefined || s > sessions[key][sid]) {
        sessions[key][sid] = s;
      }
    });

    // Only a run that covered the WHOLE route can set the record. Without this a
    // student who redoes one weak phase and scores 100 on it posts a session of
    // one scenario averaging 100, which would replace a genuine full run.
    // If no full run exists yet (route in progress, or legacy rows split across
    // days), fall back to the best among the widest-coverage sessions so the
    // figure still reflects real work instead of collapsing to zero.
    var sessionStats = Object.keys(sessions).map(function(key) {
      var sKeys = Object.keys(sessions[key]);
      return {
        covered: sKeys.length,
        avg: sKeys.length
          ? Math.round(sKeys.reduce(function(sum, k) { return sum + sessions[key][k]; }, 0) / sKeys.length)
          : 0
      };
    }).filter(function(st) { return st.covered > 0; });

    var maxCovered = sessionStats.reduce(function(m, st) {
      return st.covered > m ? st.covered : m;
    }, 0);
    var qualifyingCover = (totalScenarios > 0 && maxCovered >= totalScenarios)
      ? totalScenarios
      : maxCovered;

    var scoreAvg = sessionStats.reduce(function(best, st) {
      return (st.covered >= qualifyingCover && st.avg > best) ? st.avg : best;
    }, 0);

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

    // Normalized match here too — an exact-string miss appends a SECOND Progress
    // row for the same route, and getLevelCompletion (which normalizes) then
    // keeps whichever row lands last in the sheet, masking real completion.
    var existingRows = dbReadAll_('Progress').filter(function(row) {
      return row.userId === user.userId &&
             Number(row.level) === level &&
             ProgressService.normalizeCountry_(row.country) === countryKey;
    });
    var existing = existingRows[0];

    // Fold any pre-existing duplicates: if an older row already says completed,
    // carry that forward so a historic pass is never lost.
    if (existingRows.length > 1) {
      Logger.log('[updateUserProgress] ' + existingRows.length + ' duplicate Progress rows for L' +
                 level + ' ' + countryKey + ' (rows ' +
                 existingRows.map(function(r) { return r.__rowNumber; }).join(', ') + ')');
      existingRows.forEach(function(r) {
        if (ProgressService.isCompleted_(r)) existing.completed = true;
      });
    }

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

    // opts.dryRun: compute and return the same numbers without writing anything,
    // so a bulk repair can be previewed before it touches 171 live routes.
    if (opts.dryRun) {
      return progressData;
    }

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
    // This only ever moves the caller's OWN currentLevel/currentCountry based on
    // their OWN progress, so gating it to STUDENT just froze admins on whatever
    // route they last touched — the home card kept offering a level they had
    // already finished. Instructors stay excluded: their position is a teaching
    // context, not a personal one.
    if (!user) return;
    var _role = String(user.role || '').toUpperCase();
    if (_role !== ROLES.STUDENT && _role !== ROLES.ADMIN) {
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

  // Maps every stored spelling of a country onto one canonical key.
  // AU and CA were missing, so levels 3, 6, 8, 9 and 10 never matched their
  // scenarios when a row stored the display name instead of the code.
  COUNTRY_ALIASES_: {
    US: 'USA', USA: 'USA', 'UNITED STATES': 'USA',
    GB: 'UK',  UK:  'UK',  'UNITED KINGDOM': 'UK', ENGLAND: 'UK',
    IN: 'INDIA',     INDIA: 'INDIA',
    CO: 'COLOMBIA',  COLOMBIA: 'COLOMBIA',
    AU: 'AUSTRALIA', AUSTRALIA: 'AUSTRALIA',
    CA: 'CANADA',    CANADA: 'CANADA'
  },

  normalizeCountry_: function(country) {
    var key = String(country || '').trim().toUpperCase();
    return ProgressService.COUNTRY_ALIASES_[key] || key;
  }
};
