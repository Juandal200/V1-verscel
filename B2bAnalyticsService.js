/*******************************************************
 * B2bAnalyticsService.js
 * Backend for Phase 4: B2B Analytics API
 *
 * REST concept → GAS function mapping
 *   GET /api/b2b/analytics/:companyId/kpis         → apiB2bGetKpis(sessionToken, companyId)
 *   GET /api/b2b/analytics/:companyId/performance  → apiB2bGetPerformance(sessionToken, companyId)
 *   GET /api/b2b/analytics/:companyId/risk         → apiB2bGetRisk(sessionToken, companyId)
 *
 * Tenant Isolation: a user may only query their own companyId.
 * ADMIN role bypasses the check.
 *
 * N+1 prevention: each service method calls fetchTenantData_() which
 * reads every required sheet exactly once, then does all filtering and
 * aggregation in-memory via a single pass per collection.
 *******************************************************/

var B2bAnalyticsService = (function() {

  // ─────────────────────────────────────────────────────────────────────
  // § 0 · Private helpers
  // ─────────────────────────────────────────────────────────────────────

  function str_(v) { return String(v == null ? '' : v).trim(); }
  function num_(v) { var n = Number(v); return isNaN(n) ? null : n; }
  function bool_(v) {
    if (v === true  || v === 1) return true;
    if (v === false || v === 0) return false;
    var s = String(v || '').toUpperCase().trim();
    return s === 'TRUE' || s === '1' || s === 'YES';
  }

  function avg_(nums) {
    var valid = nums.filter(function(n) { return n != null && !isNaN(n); });
    if (!valid.length) return null;
    var sum = valid.reduce(function(s, n) { return s + n; }, 0);
    return Math.round((sum / valid.length) * 10) / 10;
  }

  function parseMeta_(row) {
    try {
      var raw = str_(row.metadata);
      return raw ? JSON.parse(raw) : {};
    } catch(e) { return {}; }
  }

  function isoNow_() { return new Date().toISOString(); }

  // ─────────────────────────────────────────────────────────────────────
  // § 1 · Tenant isolation gate
  // ─────────────────────────────────────────────────────────────────────

  function assertTenantAccess_(user, companyId) {
    var cid = str_(companyId);
    if (!cid) {
      throw { code: 'INVALID_COMPANY_ID', message: 'companyId is required.' };
    }
    var role        = str_(user.role).toUpperCase();
    var userCompany = str_(user.companyId);

    // ADMIN can query any company
    if (role === 'ADMIN') return;

    // Every other role (INSTRUCTOR, STUDENT) must belong to the requested company
    if (userCompany !== cid) {
      throw {
        code: 'TENANT_FORBIDDEN',
        message: 'Access denied: you do not belong to company ' + cid + '.'
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // § 2 · Single-pass data fetcher — reads each sheet exactly once
  // ─────────────────────────────────────────────────────────────────────

  function fetchTenantData_(companyId) {
    var cid = str_(companyId);

    // ── Read raw sheets (safe — returns [] if sheet absent) ───────────
    var allUsers    = [];
    var allEvents   = [];
    var allAttempts = [];
    try { allUsers    = dbReadAll_('Users');        } catch(e) {}
    try { allEvents   = dbReadAll_('ClientEvents'); } catch(e) {}
    try { allAttempts = dbReadAll_('Attempts');     } catch(e) {}

    // ── Build userId index for this company ───────────────────────────
    var tenantUsers = allUsers.filter(function(u) {
      return str_(u.companyId) === cid;
    });
    var tenantUserIds = {};
    tenantUsers.forEach(function(u) {
      var uid = str_(u.userId);
      if (uid) tenantUserIds[uid] = true;
    });

    // ── Filter events: companyId column (Phase 1+) OR userId fallback ─
    var tenantEvents = allEvents.filter(function(ev) {
      return str_(ev.companyId) === cid ||
             tenantUserIds[str_(ev.userId)];
    });

    // ── Filter attempts via userId membership ─────────────────────────
    var tenantAttempts = allAttempts.filter(function(a) {
      return tenantUserIds[str_(a.userId)];
    });

    return {
      users:    tenantUsers,
      userIds:  tenantUserIds,
      events:   tenantEvents,
      attempts: tenantAttempts
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // § 3 · GET /api/b2b/analytics/:companyId/kpis
  // ─────────────────────────────────────────────────────────────────────

  function getKpis(user, companyId) {
    assertTenantAccess_(user, companyId);

    var data        = fetchTenantData_(companyId);
    var totalPilots = data.users.length;

    // Active pilots: ≥ 1 event in the last 30 days
    var THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
    var cutoff = Date.now() - THIRTY_DAYS_MS;
    var activePilotIds = {};
    data.events.forEach(function(ev) {
      var ts = new Date(str_(ev.timestamp)).getTime();
      if (!isNaN(ts) && ts >= cutoff) {
        var uid = str_(ev.userId);
        if (uid) activePilotIds[uid] = true;
      }
    });
    var activePilots = Object.keys(activePilotIds).length;

    // Unique sessions: one row per sessionId, take max durationSec
    var sessionMaxDur = {};
    data.events.forEach(function(ev) {
      var sid = str_(ev.sessionId);
      var dur = num_(ev.durationSec) || 0;
      if (sid) {
        if (sessionMaxDur[sid] == null || dur > sessionMaxDur[sid]) {
          sessionMaxDur[sid] = dur;
        }
      }
    });
    var sessionKeys      = Object.keys(sessionMaxDur);
    var totalSessions    = sessionKeys.length;
    var totalSec         = sessionKeys.reduce(function(s, sid) { return s + sessionMaxDur[sid]; }, 0);
    var totalSimHours    = Math.round((totalSec / 3600) * 100) / 100;

    return {
      ok:          true,
      companyId:   companyId,
      generatedAt: isoNow_(),
      kpis: {
        totalPilots:             totalPilots,
        activePilots:            activePilots,
        activePilotsPercentage:  totalPilots > 0
                                   ? Math.round((activePilots / totalPilots) * 100)
                                   : 0,
        totalSessions:           totalSessions,
        totalSimulatedHours:     totalSimHours,
        averageSessionsPerPilot: totalPilots > 0
                                   ? Math.round((totalSessions / totalPilots) * 10) / 10
                                   : 0
      }
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // § 4 · GET /api/b2b/analytics/:companyId/performance
  // ─────────────────────────────────────────────────────────────────────

  function getPerformance(user, companyId) {
    assertTenantAccess_(user, companyId);

    var data = fetchTenantData_(companyId);

    // Filter to scenario_completed events only (single pass)
    var completedEvents = data.events.filter(function(ev) {
      return str_(ev.eventType).toLowerCase() === 'scenario_completed';
    });

    // Accumulate Phase 2 rich fields from event metadata (if present)
    var reactionTimes = [], opReadiness = [], stressRes = [], improvDeltas = [];
    completedEvents.forEach(function(ev) {
      var meta = parseMeta_(ev);

      if (meta.cognitive) {
        var rt = num_(meta.cognitive.reactionTimeMs);
        if (rt != null && rt > 0) reactionTimes.push(rt);
      }
      if (meta.longitudinal) {
        var or_ = num_(meta.longitudinal.operationalReadinessScore);
        var sr  = num_(meta.longitudinal.stressResilienceScore);
        if (or_ != null) opReadiness.push(or_);
        if (sr  != null) stressRes.push(sr);
      }
      if (meta.pedagogical && meta.pedagogical.learningMetrics) {
        var id = num_(meta.pedagogical.learningMetrics.improvementDelta);
        if (id != null) improvDeltas.push(id);
      }
    });

    // Pass rate from Attempts (reliable, no Phase 2 dependency)
    var passCount     = 0;
    var totalAttempts = data.attempts.length;
    data.attempts.forEach(function(a) {
      if (bool_(a.correct)) passCount++;
    });

    // Improvement velocity: Phase 2 improvementDelta if collected, else
    // derive from per-pilot score trajectory in Attempts (first → last).
    var velocities = [];
    if (!improvDeltas.length) {
      var pilotTimeline = {};
      data.attempts.forEach(function(a) {
        var uid   = str_(a.userId);
        var score = num_(a.score);
        var ts    = str_(a.createdAt);
        if (!uid || score == null) return;
        if (!pilotTimeline[uid]) pilotTimeline[uid] = [];
        pilotTimeline[uid].push({ score: score, ts: ts });
      });
      Object.keys(pilotTimeline).forEach(function(uid) {
        var sorted = pilotTimeline[uid].sort(function(a, b) {
          return a.ts < b.ts ? -1 : 1;
        });
        if (sorted.length >= 2) {
          velocities.push(sorted[sorted.length - 1].score - sorted[0].score);
        }
      });
    }

    var improvementVelocity = improvDeltas.length ? avg_(improvDeltas) : avg_(velocities);

    return {
      ok:          true,
      companyId:   companyId,
      generatedAt: isoNow_(),
      performance: {
        passRate:                         totalAttempts > 0
                                            ? Math.round((passCount / totalAttempts) * 100)
                                            : null,
        improvementVelocity:              improvementVelocity,
        // Phase 2 cognitive / longitudinal — null until scoring pipeline populates them
        averageReactionTimeMs:            avg_(reactionTimes),
        averageOperationalReadinessScore: avg_(opReadiness),
        averageStressResilienceScore:     avg_(stressRes),
        // Let the caller know which data source each metric came from
        _sources: {
          passRate:            'Attempts',
          improvementVelocity: improvDeltas.length > 0
                                 ? 'ClientEvents.metadata.pedagogical'
                                 : 'Attempts.score_trajectory',
          cognitiveMetrics:    reactionTimes.length > 0
                                 ? 'ClientEvents.metadata.cognitive'
                                 : 'not_yet_collected'
        }
      }
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // § 5 · GET /api/b2b/analytics/:companyId/risk
  // ─────────────────────────────────────────────────────────────────────

  var HIGH_RISK_THRESHOLD = 0.50; // pass rate below 50% over ≥ 3 attempts = high risk

  function getRisk(user, companyId) {
    assertTenantAccess_(user, companyId);

    var data = fetchTenantData_(companyId);

    var completedEvents = data.events.filter(function(ev) {
      return str_(ev.eventType).toLowerCase() === 'scenario_completed';
    });

    // ── High-risk pilots ─────────────────────────────────────────────
    var pilotStats = {};
    data.attempts.forEach(function(a) {
      var uid = str_(a.userId);
      if (!uid) return;
      if (!pilotStats[uid]) pilotStats[uid] = { pass: 0, total: 0 };
      pilotStats[uid].total++;
      if (bool_(a.correct)) pilotStats[uid].pass++;
    });
    var highRiskPilotCount = Object.keys(pilotStats).filter(function(uid) {
      var s = pilotStats[uid];
      return s.total >= 3 && (s.pass / s.total) < HIGH_RISK_THRESHOLD;
    }).length;

    // ── Recurrent critical mistakes (Phase 2 aeronautical; count per pilot) ──
    // A mistake is "recurrent" when the same pilot triggers safety-critical
    // errors in 2+ distinct sessions.
    var pilotCriticalSessions = {};
    var totalSafetyCritical   = 0;
    completedEvents.forEach(function(ev) {
      var meta = parseMeta_(ev);
      if (!meta.aeronautical) return;
      var n = num_(meta.aeronautical.safetyCriticalMistakes);
      if (n == null || n <= 0) return;
      totalSafetyCritical += n;
      var uid = str_(ev.userId);
      var sid = str_(ev.sessionId);
      if (uid && sid) {
        if (!pilotCriticalSessions[uid]) pilotCriticalSessions[uid] = {};
        pilotCriticalSessions[uid][sid] = true;
      }
    });
    var recurrentCriticalMistakes = Object.keys(pilotCriticalSessions).filter(function(uid) {
      return Object.keys(pilotCriticalSessions[uid]).length >= 2;
    }).length;
    // Fall back to raw count if no Phase 2 data
    if (!completedEvents.some(function(ev) { return parseMeta_(ev).aeronautical; })) {
      recurrentCriticalMistakes = null;
    }

    // ── Most common failure patterns: top missed keywords ────────────
    var keywordFailMap = {};
    data.attempts.forEach(function(a) {
      var missing = str_(a.keywordsMissing);
      if (!missing) return;
      missing.split('|').forEach(function(kw) {
        kw = kw.trim();
        if (kw) keywordFailMap[kw] = (keywordFailMap[kw] || 0) + 1;
      });
    });
    var mostCommonFailurePatterns = Object.keys(keywordFailMap)
      .map(function(kw) { return { pattern: kw, count: keywordFailMap[kw] }; })
      .sort(function(a, b) { return b.count - a.count; })
      .slice(0, 10);

    // ── Top clearance deviations ──────────────────────────────────────
    // Primary: Phase 2 aeronautical.clearanceDeviations aggregated by scenario
    var cleDevByScenario = {};
    completedEvents.forEach(function(ev) {
      var meta = parseMeta_(ev);
      if (!meta.aeronautical) return;
      var dev = num_(meta.aeronautical.clearanceDeviations);
      if (dev == null || dev <= 0) return;
      var sid = str_(ev.scenarioId) || str_(ev.phaseCode) || 'unknown';
      cleDevByScenario[sid] = (cleDevByScenario[sid] || 0) + dev;
    });
    var topClearanceDeviations = Object.keys(cleDevByScenario)
      .map(function(sid) { return { scenarioId: sid, totalDeviations: cleDevByScenario[sid] }; })
      .sort(function(a, b) { return b.totalDeviations - a.totalDeviations; })
      .slice(0, 5);

    // Fallback: scenarios with most failed attempts when Phase 2 absent
    if (!topClearanceDeviations.length) {
      var failsByScenario = {};
      data.attempts.forEach(function(a) {
        if (bool_(a.correct)) return;
        var sid = str_(a.scenarioId);
        if (sid) failsByScenario[sid] = (failsByScenario[sid] || 0) + 1;
      });
      topClearanceDeviations = Object.keys(failsByScenario)
        .map(function(sid) { return { scenarioId: sid, totalDeviations: failsByScenario[sid] }; })
        .sort(function(a, b) { return b.totalDeviations - a.totalDeviations; })
        .slice(0, 5);
    }

    // ── Most failed scenario types ────────────────────────────────────
    // Use scenario_completed events which carry scenarioType in the event row
    var failTypeMap = {};
    completedEvents.forEach(function(ev) {
      var meta   = parseMeta_(ev);
      var status = str_(meta.completionStatus).toLowerCase();
      var failed = status === 'failed' ||
                   (status !== 'passed' && meta.correct === false) ||
                   (status !== 'passed' && str_(meta.correct).toUpperCase() === 'FALSE');
      if (!failed) return;
      var scenarioType = str_(ev.scenarioType).toUpperCase() || 'STANDARD';
      var level        = str_(ev.level);
      var key          = scenarioType + (level ? ' L' + level : '');
      failTypeMap[key] = (failTypeMap[key] || 0) + 1;
    });
    // Fallback from Attempts (level as proxy) if no enriched events
    if (!Object.keys(failTypeMap).length) {
      data.attempts.forEach(function(a) {
        if (bool_(a.correct)) return;
        var key = 'L' + (str_(a.level) || '?');
        failTypeMap[key] = (failTypeMap[key] || 0) + 1;
      });
    }
    var mostFailedScenarioTypes = Object.keys(failTypeMap)
      .map(function(k) { return { scenarioType: k, failCount: failTypeMap[k] }; })
      .sort(function(a, b) { return b.failCount - a.failCount; })
      .slice(0, 5);

    return {
      ok:          true,
      companyId:   companyId,
      generatedAt: isoNow_(),
      risk: {
        highRiskPilotCount:        highRiskPilotCount,
        highRiskThreshold:         HIGH_RISK_THRESHOLD,
        recurrentCriticalMistakes: recurrentCriticalMistakes,
        mostCommonFailurePatterns: mostCommonFailurePatterns,
        topClearanceDeviations:    topClearanceDeviations,
        mostFailedScenarioTypes:   mostFailedScenarioTypes
      }
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // § 6 · Public interface
  // ─────────────────────────────────────────────────────────────────────

  return {
    getKpis:        getKpis,
    getPerformance: getPerformance,
    getRisk:        getRisk
  };

})();
