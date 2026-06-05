/*******************************************************
 * TourService.js
 * Weekly Tour season system — tours, career points,
 * streak multipliers, medallions, and commendations.
 *
 * Sheets used (auto-created on first call):
 *   Tours          — one row per weekly tour
 *   TourProgress   — snapshot per user per tour (written on tour close)
 *   Commendations  — earned achievement records
 *******************************************************/

var TourService = (function () {

  // ─── Constants ────────────────────────────────────────────────────────────

  var SHEETS = {
    TOURS:         'Tours',
    TOUR_PROGRESS: 'TourProgress',
    COMMENDATIONS: 'Commendations'
  };

  // XP base per level — decreasing curve, index = level number
  var XP_BASE = [0, 500, 450, 400, 350, 300, 260, 220, 180, 140, 100];

  // Career Points: base 50 CP per level, +10% per consecutive level that week.
  // Level 1 = 50 CP, Level 2 = 55 CP, … Level 10 = 95 CP → 725 CP for a full week.
  var CP_BASE = 50;
  var CP_STEP = 0.10;

  // Streak bonus % — consecutive tours with 10/10 completion
  function _streakBonus(n) {
    if (n >= 5) return 25;
    if (n >= 4) return 15;
    if (n >= 3) return 10;
    if (n >= 2) return 5;
    return 0;
  }

  // Commendation chain definitions
  var COMMENDATIONS = [
    { key: 'first_flight',     label: 'First Flight',     icon: '✈',  desc: 'Complete your first tour',                next: 'iron_wings'     },
    { key: 'iron_wings',       label: 'Iron Wings',       icon: '🔩', desc: '4 consecutive full-completion tours',     next: 'steel_wings'    },
    { key: 'steel_wings',      label: 'Steel Wings',      icon: '⚙',  desc: '8 consecutive full-completion tours',     next: 'gold_wings'     },
    { key: 'gold_wings',       label: 'Gold Wings',       icon: '🏅', desc: '12 consecutive full-completion tours',    next: null             },
    { key: 'top_of_class',     label: 'Top of Class',     icon: '🥇', desc: '#1 on any weekly leaderboard',            next: 'ace_pilot'      },
    { key: 'ace_pilot',        label: 'Ace Pilot',        icon: '🎯', desc: '#1 on 3 weekly leaderboards',             next: 'squadron_leader'},
    { key: 'squadron_leader',  label: 'Squadron Leader',  icon: '🦅', desc: '#1 on 6 weekly leaderboards',             next: null             },
    { key: 'perfect_approach', label: 'Perfect Approach', icon: '💯', desc: '90 %+ on every level in a single tour',  next: 'precision_pilot'},
    { key: 'precision_pilot',  label: 'Precision Pilot',  icon: '🎖', desc: 'Perfect Approach in 3 different tours',  next: null             },
    { key: 'comeback',         label: 'Comeback',         icon: '🔥', desc: 'Returned after 2+ missed weeks (7+ lvls)',next: null             }
  ];

  // ─── Sheet helpers ─────────────────────────────────────────────────────────

  function _ss() { return dbGetSpreadsheet_(); }

  function _ensureSheet(ss, name, headers) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
    return sheet;
  }

  function _readSheet(ss, name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) return [];
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return [];
    var hdrs = data[0].map(function (h) { return String(h); });
    return data.slice(1).map(function (row) {
      var obj = {};
      hdrs.forEach(function (h, i) { obj[h] = row[i]; });
      return obj;
    });
  }

  function _isoNow() { return new Date().toISOString(); }

  // ─── Tour date helpers ─────────────────────────────────────────────────────

  // Monday 19:00 UTC (= Monday 2:00 PM Colombia / UTC-5) of the week containing d
  function _weekStart(d) {
    var date = new Date(d);
    var day  = date.getUTCDay();                    // 0=Sun
    var diff = (day === 0) ? -6 : 1 - day;         // shift to Monday
    date.setUTCDate(date.getUTCDate() + diff);
    date.setUTCHours(19, 0, 0, 0);
    // If d is Monday before 19:00 UTC, it belongs to the previous week
    if (date > new Date(d)) {
      date.setUTCDate(date.getUTCDate() - 7);
    }
    return date;
  }

  // ISO week number
  function _isoWeek(d) {
    var date = new Date(d);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
    var yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  }

  function _tourId(d) {
    var y = d.getUTCFullYear();
    var w = _isoWeek(d);
    return 'TOUR_' + y + '_W' + (w < 10 ? '0' + w : w);
  }

  // ─── Tour lifecycle ────────────────────────────────────────────────────────

  function getActiveTour() {
    var ss    = _ss();
    var sheet = _ensureSheet(ss, SHEETS.TOURS,
      ['tourId','weekNumber','startDate','endDate','isActive','isDoubleXp','createdAt']);
    var tours = _readSheet(ss, SHEETS.TOURS);
    var now   = new Date();

    // Find currently active tour
    var active = null;
    for (var i = 0; i < tours.length; i++) {
      if (String(tours[i].isActive).toLowerCase() === 'true') {
        active = tours[i]; break;
      }
    }

    if (active) {
      var end = new Date(active.endDate);
      if (end > now) {
        // Still running — return with countdown
        active.daysRemaining = Math.ceil((end - now) / 86400000);
        active.hoursRemaining = Math.ceil((end - now) / 3600000);
        return active;
      }
      // Expired — close it and snapshot all users
      _closeTourRow(sheet, active.tourId);
      _snapshotAllUsers(ss, active);
    }

    // Create next tour
    return _createTour(ss, sheet, tours.length + 1);
  }

  function _closeTourRow(sheet, tourId) {
    var data = sheet.getDataRange().getValues();
    var hdrs = data[0].map(function (h) { return String(h); });
    var idCol  = hdrs.indexOf('tourId') + 1;
    var actCol = hdrs.indexOf('isActive') + 1;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][idCol - 1]) === String(tourId)) {
        sheet.getRange(i + 1, actCol).setValue('false');
        return;
      }
    }
  }

  function _createTour(ss, sheet, weekNum) {
    var now   = new Date();
    var start = _weekStart(now);
    var end   = new Date(start.getTime() + 7 * 86400000);
    var id    = _tourId(now);

    // Double XP: ~1-in-6 chance, never on the very first tour
    var isDoubleXp = (weekNum > 1 && Math.random() < (1 / 6));

    sheet.appendRow([id, weekNum, start.toISOString(), end.toISOString(),
                     'true', isDoubleXp ? 'true' : 'false', _isoNow()]);

    return {
      tourId: id, weekNumber: weekNum,
      startDate: start.toISOString(), endDate: end.toISOString(),
      isActive: 'true', isDoubleXp: isDoubleXp ? 'true' : 'false',
      daysRemaining: 7, hoursRemaining: 168
    };
  }

  // ─── Progress aggregation helpers ─────────────────────────────────────────

  // Build a map of level → required country count from active Scenarios rows.
  // Used to match the simulator's definition: a level is "complete" only when
  // all its configured country routes are marked complete in Progress.
  function _buildLevelCountryMap_(ss) {
    var rows = _readSheet(ss, 'Scenarios');
    var map  = {}; // level → { countryKey: true }
    rows.forEach(function (row) {
      var active = String(row['isActive'] || '').trim().toUpperCase();
      if (active !== 'TRUE' && active !== 'ACTIVE' && active !== 'YES' && active !== '1') return;
      var lvl     = parseInt(row['level'], 10) || 0;
      var country = String(row['country'] || '').trim().toUpperCase();
      if (lvl < 1 || !country) return;
      if (!map[lvl]) map[lvl] = {};
      map[lvl][country] = true;
    });
    var countMap = {};
    Object.keys(map).forEach(function (lvl) {
      countMap[lvl] = Object.keys(map[lvl]).length;
    });
    return countMap; // { 1: 3, 2: 2, ... }
  }

  // Build per-level map from Progress rows, optionally filtered to rows >= sinceDate.
  // Tracks completion per (level, country) so _calcUserXp can require ALL countries done.
  function _aggregateProgress(progRows, filterUserId, sinceDate) {
    var byUser = {};
    progRows.forEach(function (row) {
      var uid = String(row['userId'] || '').trim();
      if (!uid) return;
      if (filterUserId && uid !== filterUserId) return;

      // Date filter for weekly board.
      // Rows with no timestamp are treated as pre-tour (excluded) so old
      // completed=TRUE data never silently bleeds into this week's rankings.
      if (sinceDate) {
        var ts = row['updatedAt'] || row['createdAt'] || row['timestamp'];
        if (!ts) return; // no timestamp → treat as older than tourStart
        var d = ts instanceof Date ? ts : new Date(String(ts));
        if (isNaN(d.getTime()) || d < sinceDate) return;
      }

      var lvl       = parseInt(row['level'], 10) || 0;
      var country   = String(row['country'] || '').trim().toUpperCase();
      var score     = parseFloat(row['scoreAvg']) || 0;
      var completed = String(row['completed'] || '').toLowerCase();
      var isDone    = (completed === 'true' || completed === '1' || completed === 'yes');

      if (lvl < 1) return;
      if (!byUser[uid]) byUser[uid] = { levels: {}, levelCountries: {}, maxLevel: 0 };

      // Per-level aggregate (best score across all country routes)
      if (!byUser[uid].levels[lvl]) byUser[uid].levels[lvl] = { bestScore: 0, completed: false };
      if (score > byUser[uid].levels[lvl].bestScore) byUser[uid].levels[lvl].bestScore = score;

      // Per-(level, country) completion tracking
      var lcKey = lvl + '||' + country;
      if (!byUser[uid].levelCountries[lcKey]) byUser[uid].levelCountries[lcKey] = false;
      if (isDone) byUser[uid].levelCountries[lcKey] = true;

      if (lvl > byUser[uid].maxLevel) byUser[uid].maxLevel = lvl;
    });
    return byUser;
  }

  // Compute XP and completedLevels from per-level map for one user.
  // levelCountryMap: { level: requiredCountryCount } — if supplied, a level only
  // counts as completed when ALL its country routes are done (matching the simulator).
  function _calcUserXp(levelsMap, isDoubleXp, levelCountries, levelCountryMap) {
    var totalXp = 0, completedLevels = 0, allPerfect = true;
    Object.keys(levelsMap).forEach(function (k) {
      var ld  = levelsMap[k];
      var lvl = parseInt(k, 10);

      // Determine if this level is truly complete using all-countries check when possible.
      var levelDone = false;
      if (levelCountries && levelCountryMap) {
        var required = levelCountryMap[lvl] || 1;
        var doneCount = 0;
        Object.keys(levelCountries).forEach(function (lcKey) {
          var parts = lcKey.split('||');
          if (parseInt(parts[0], 10) === lvl && levelCountries[lcKey] === true) doneCount++;
        });
        levelDone = doneCount >= required;
        // Sync the completed flag so downstream code is consistent
        ld.completed = levelDone;
      } else {
        levelDone = ld.completed === true;
      }

      if (!levelDone) return;
      completedLevels++;
      var base  = lvl <= 10 ? XP_BASE[lvl] : 100;
      var bonus = ld.bestScore >= 90 ? 50 : ld.bestScore >= 70 ? 25 : 0;
      var xp    = base + bonus;
      if (isDoubleXp) xp = Math.round(xp * 2);
      totalXp += xp;
      if (ld.bestScore < 90) allPerfect = false;
    });
    return { totalXp: totalXp, completedLevels: completedLevels, allPerfect: allPerfect && completedLevels === 10 };
  }

  // ─── Tour snapshot (called when a tour expires) ────────────────────────────

  function _snapshotAllUsers(ss, tour) {
    var progRows  = _readSheet(ss, 'Progress');
    if (!progRows.length) return;

    var tourStart  = new Date(tour.startDate);
    var byUser     = _aggregateProgress(progRows, null, tourStart);
    var isDoubleXp = String(tour.isDoubleXp).toLowerCase() === 'true';

    var levelCountryMap = _buildLevelCountryMap_(ss);
    var tpSheet = _ensureSheet(ss, SHEETS.TOUR_PROGRESS,
      ['userId','tourId','weekNumber','completedLevels','totalXp',
       'careerPoints','streakCount','isDoubleXp','isComeback','snapshotAt']);

    // Read existing TourProgress to compute streaks / comeback
    var existing = _readSheet(ss, SHEETS.TOUR_PROGRESS);

    // VR bonuses earned this tour (XP already credited live; CP added at snapshot)
    var vrBonuses = _getVrBonusesByUserForTour_(ss, tour.tourId);

    Object.keys(byUser).forEach(function (uid) {
      var calc   = _calcUserXp(byUser[uid].levels, isDoubleXp, byUser[uid].levelCountries, levelCountryMap);
      var vr     = vrBonuses[uid] || { xp: 0, cp: 0 };
      var cp     = _cpForLevels(calc.completedLevels);
      var streak = _currentStreak(existing, uid) + (calc.completedLevels >= 10 ? 1 : 0);
      var bonus  = _streakBonus(streak);
      var cpFinal = Math.round(cp * (1 + bonus / 100));

      // Comeback: 2× if last 2 snapshots were 0 completedLevels
      var comeback = _isComeback(existing, uid);
      if (comeback && cp > 0) cpFinal = Math.round(cp * 2);

      // VR CP bonus is flat, added after streak multiplier so it isn't inflated
      cpFinal += vr.cp;

      tpSheet.appendRow([uid, tour.tourId, tour.weekNumber,
        calc.completedLevels, calc.totalXp + vr.xp, cpFinal,
        streak, isDoubleXp ? 'true' : 'false',
        comeback ? 'true' : 'false', _isoNow()]);

      _checkCommendations(ss, uid, tour, calc.completedLevels, streak, calc.allPerfect, existing);
    });

    // Check weekly top-of-class commendations separately
    _checkWeeklyTopPilot(ss, tour, byUser, isDoubleXp, existing, levelCountryMap);
  }

  function _cpForLevels(n) {
    var total = 0;
    for (var i = 0; i < Math.min(n, 10); i++) {
      total += Math.round(CP_BASE * (1 + CP_STEP * i));
    }
    return total;
  }

  // CP value of the next level after n completed this week (0 if maxed)
  function _cpNextLevel(n) {
    if (n >= 10) return 0;
    return Math.round(CP_BASE * (1 + CP_STEP * n));
  }

  // Display multiplier string for the next level, e.g. "1.7"
  function _cpMultiplier(n) {
    return Math.round((1 + CP_STEP * n) * 10) / 10;
  }

  function _currentStreak(tpRows, userId) {
    var mine = tpRows.filter(function (r) {
      return String(r.userId || '').trim() === userId;
    }).sort(function (a, b) {
      return (parseInt(b.weekNumber, 10) || 0) - (parseInt(a.weekNumber, 10) || 0);
    });
    var streak = 0;
    for (var i = 0; i < mine.length; i++) {
      if (parseInt(mine[i].completedLevels, 10) >= 10) streak++;
      else break;
    }
    return streak;
  }

  function _isComeback(tpRows, userId) {
    var mine = tpRows.filter(function (r) {
      return String(r.userId || '').trim() === userId;
    }).sort(function (a, b) {
      return (parseInt(b.weekNumber, 10) || 0) - (parseInt(a.weekNumber, 10) || 0);
    });
    if (mine.length < 2) return false;
    return parseInt(mine[0].completedLevels, 10) === 0 &&
           parseInt(mine[1].completedLevels, 10) === 0;
  }

  // ─── Commendations ─────────────────────────────────────────────────────────

  function _checkCommendations(ss, userId, tour, completedLevels, streak, allPerfect, existingTp) {
    var commSheet = _ensureSheet(ss, SHEETS.COMMENDATIONS,
      ['userId','commendationKey','label','earnedAt','tourId']);
    var earned    = _readSheet(ss, SHEETS.COMMENDATIONS)
      .filter(function (r) { return String(r.userId || '').trim() === userId; })
      .reduce(function (acc, r) { acc[String(r.commendationKey)] = true; return acc; }, {});

    function award(key) {
      if (earned[key]) return;
      var def = COMMENDATIONS.filter(function (c) { return c.key === key; })[0];
      if (!def) return;
      commSheet.appendRow([userId, key, def.label, _isoNow(), tour.tourId]);
      earned[key] = true;
    }

    if (completedLevels > 0)  award('first_flight');
    if (streak >= 4)          award('iron_wings');
    if (streak >= 8)          award('steel_wings');
    if (streak >= 12)         award('gold_wings');
    if (allPerfect)           award('perfect_approach');

    // Check precision_pilot: perfect_approach earned in 3 tours
    var perfCount = _readSheet(ss, SHEETS.COMMENDATIONS)
      .filter(function (r) {
        return String(r.userId || '').trim() === userId &&
               String(r.commendationKey) === 'perfect_approach';
      }).length;
    if (perfCount >= 3) award('precision_pilot');

    // Comeback
    if (_isComeback(existingTp, userId) && completedLevels >= 7) award('comeback');
  }

  function _checkWeeklyTopPilot(ss, tour, byUser, isDoubleXp, existingTp, levelCountryMap) {
    // Find the user with highest XP this tour
    var best = { uid: null, xp: -1 };
    Object.keys(byUser).forEach(function (uid) {
      var calc = _calcUserXp(byUser[uid].levels, isDoubleXp, byUser[uid].levelCountries, levelCountryMap);
      if (calc.totalXp > best.xp) { best.uid = uid; best.xp = calc.totalXp; }
    });
    if (!best.uid || best.xp === 0) return;

    var commSheet = _ensureSheet(ss, SHEETS.COMMENDATIONS,
      ['userId','commendationKey','label','earnedAt','tourId']);
    var allComm = _readSheet(ss, SHEETS.COMMENDATIONS);

    // top_of_class
    var alreadyTop = allComm.some(function (r) {
      return String(r.userId || '').trim() === best.uid &&
             String(r.commendationKey) === 'top_of_class';
    });
    if (!alreadyTop) {
      var def = COMMENDATIONS.filter(function (c) { return c.key === 'top_of_class'; })[0];
      if (!def) { Logger.log('[_awardCommendations] missing COMMENDATIONS entry: top_of_class'); return; }
      commSheet.appendRow([best.uid, 'top_of_class', def.label, _isoNow(), tour.tourId]);
    }

    // ace_pilot: top_of_class count >= 3
    var topCount = allComm.filter(function (r) {
      return String(r.userId || '').trim() === best.uid &&
             String(r.commendationKey) === 'top_of_class';
    }).length + (alreadyTop ? 0 : 1);

    var hasAce = allComm.some(function (r) {
      return String(r.userId || '').trim() === best.uid &&
             String(r.commendationKey) === 'ace_pilot';
    });
    if (!hasAce && topCount >= 3) {
      var aceDef = COMMENDATIONS.filter(function (c) { return c.key === 'ace_pilot'; })[0];
      if (aceDef) commSheet.appendRow([best.uid, 'ace_pilot', aceDef.label, _isoNow(), tour.tourId]);
    }

    // squadron_leader: top_of_class count >= 6
    var hasSL = allComm.some(function (r) {
      return String(r.userId || '').trim() === best.uid &&
             String(r.commendationKey) === 'squadron_leader';
    });
    if (!hasSL && topCount >= 6) {
      var slDef = COMMENDATIONS.filter(function (c) { return c.key === 'squadron_leader'; })[0];
      if (slDef) commSheet.appendRow([best.uid, 'squadron_leader', slDef.label, _isoNow(), tour.tourId]);
    }
  }

  // ─── Public: Weekly leaderboard ───────────────────────────────────────────

  function getWeeklyLeaderboard(limit) {
    var ss         = _ss();
    var tour       = getActiveTour();
    var isDoubleXp = String(tour.isDoubleXp).toLowerCase() === 'true';
    var progRows   = _readSheet(ss, 'Progress');

    // Weekly XP: only levels updated since this tour started
    var byUserWeekly  = _aggregateProgress(progRows, null, new Date(tour.startDate));
    // All-time levels: no date filter — used for rank/tier badge
    var byUserAllTime = _aggregateProgress(progRows, null, null);
    var userMap         = _buildUserMap(ss);
    var levelCountryMap = _buildLevelCountryMap_(ss);
    var safeLimit = Math.min(limit || 20, 100);

    var vrBonuses = _getVrBonusesByUserForTour_(ss, tour.tourId);

    var entries = Object.keys(byUserWeekly).map(function (uid) {
      var weekly  = byUserWeekly[uid];
      var allTime = byUserAllTime[uid] || { levels: {}, levelCountries: {}, maxLevel: 0 };
      var calcW   = _calcUserXp(weekly.levels,  isDoubleXp, weekly.levelCountries,  levelCountryMap);
      var calcAll = _calcUserXp(allTime.levels, false,      allTime.levelCountries, levelCountryMap);
      var u       = userMap[uid] || {};
      var vr      = vrBonuses[uid] || { xp: 0, cp: 0 };
      return {
        userId:          uid,
        name:            String(u['name'] || u['email'] || uid),
        email:           String(u['email'] || ''),
        profession:      String(u['profession'] || 'PILOT').toUpperCase(),
        totalXp:         calcW.totalXp + vr.xp,
        completedLevels: calcW.completedLevels,
        weeklyCP:        _cpForLevels(calcW.completedLevels) + vr.cp,
        allTimeLevels:   calcAll.completedLevels,
        maxLevel:        allTime.maxLevel || 1
      };
    }).filter(function (e) { return e.totalXp > 0 || e.completedLevels > 0; });

    // Sort by weekly performance
    entries.sort(function (a, b) {
      if (b.completedLevels !== a.completedLevels) return b.completedLevels - a.completedLevels;
      return b.totalXp - a.totalXp;
    });

    return {
      ok:        true,
      tour:      { tourId: tour.tourId, weekNumber: tour.weekNumber,
                   daysRemaining: tour.daysRemaining, hoursRemaining: tour.hoursRemaining,
                   isDoubleXp: isDoubleXp },
      isDoubleXp: isDoubleXp,
      data:      entries.slice(0, safeLimit).map(function (p, i) {
        return { rank: i + 1, name: p.name, email: p.email,
                 totalXp: p.totalXp, completedLevels: p.completedLevels,
                 weeklyCP: p.weeklyCP,
                 allTimeLevels: p.allTimeLevels, maxLevel: p.maxLevel };
      })
    };
  }

  // ─── Public: Career leaderboard ───────────────────────────────────────────

  function getCareerLeaderboard(limit) {
    var ss        = _ss();
    var tpRows    = _readSheet(ss, SHEETS.TOUR_PROGRESS);
    var safeLimit = Math.min(limit || 20, 100);
    var userMap   = _buildUserMap(ss);

    // ── Fallback: TourProgress is empty (no tours have closed yet) ────────────
    // Derive career points from raw Progress data so the board is never blank.
    if (!tpRows.length) {
      var progRows        = _readSheet(ss, 'Progress');
      var raw             = _aggregateProgress(progRows, null, null);
      var levelCountryMap = _buildLevelCountryMap_(ss);
      var fallback = Object.keys(raw).map(function (uid) {
        var calc = _calcUserXp(raw[uid].levels, false, raw[uid].levelCountries, levelCountryMap);
        var u    = userMap[uid] || {};
        var cp   = _cpForLevels(calc.completedLevels);
        return { userId: uid, name: String(u['name'] || u['email'] || uid),
                 email: String(u['email'] || ''), totalCp: cp,
                 maxStreak: 0, toursCompleted: 0 };
      });
      fallback.sort(function (a, b) { return b.totalCp - a.totalCp; });
      return {
        ok: true, fallback: true,
        data: fallback.slice(0, safeLimit).map(function (p, i) {
          return { rank: i + 1, name: p.name, email: p.email,
                   totalCp: p.totalCp, maxStreak: 0, toursCompleted: 0 };
        })
      };
    }

    // ── Normal path: aggregate from TourProgress snapshots ───────────────────
    var byUser = {};
    tpRows.forEach(function (r) {
      var uid = String(r.userId || '').trim();
      if (!uid) return;
      var cp     = parseInt(r.careerPoints, 10) || 0;
      var streak = parseInt(r.streakCount, 10)  || 0;
      if (!byUser[uid]) byUser[uid] = { totalCp: 0, maxStreak: 0, toursCompleted: 0 };
      byUser[uid].totalCp        += cp;
      byUser[uid].toursCompleted += 1;
      if (streak > byUser[uid].maxStreak) byUser[uid].maxStreak = streak;
    });

    var entries = Object.keys(byUser).map(function (uid) {
      var agg = byUser[uid];
      var u   = userMap[uid] || {};
      return { userId: uid, name: String(u['name'] || u['email'] || uid),
               email: String(u['email'] || ''), profession: String(u['profession'] || 'PILOT').toUpperCase(),
               totalCp: agg.totalCp, maxStreak: agg.maxStreak, toursCompleted: agg.toursCompleted };
    });

    entries.sort(function (a, b) {
      return b.totalCp - a.totalCp ||
             b.maxStreak - a.maxStreak ||
             b.toursCompleted - a.toursCompleted;
    });

    return {
      ok:   true,
      data: entries.slice(0, safeLimit).map(function (p, i) {
        return { rank: i + 1, name: p.name, email: p.email,
                 totalCp: p.totalCp, maxStreak: p.maxStreak,
                 toursCompleted: p.toursCompleted };
      })
    };
  }

  // ─── Public: My career stats ───────────────────────────────────────────────

  function getMyCareerStats(user) {
    var ss  = _ss();
    var uid = String(user.userId || '').trim();
    var tour = getActiveTour();

    var tpRows = _readSheet(ss, SHEETS.TOUR_PROGRESS)
      .filter(function (r) { return String(r.userId || '').trim() === uid; })
      .sort(function (a, b) {
        return (parseInt(a.weekNumber, 10) || 0) - (parseInt(b.weekNumber, 10) || 0);
      });

    var totalCp = tpRows.reduce(function (s, r) {
      return s + (parseInt(r.careerPoints, 10) || 0);
    }, 0);

    // Current streak (consecutive 10/10 from most recent backwards)
    var streak = 0;
    for (var i = tpRows.length - 1; i >= 0; i--) {
      if (parseInt(tpRows[i].completedLevels, 10) >= 10) streak++;
      else break;
    }

    // Tour medallions — last 16 tours for visual row
    var medallions = tpRows.slice(-16).map(function (r) {
      return {
        tourId:          r.tourId,
        weekNumber:      parseInt(r.weekNumber, 10) || 0,
        completedLevels: parseInt(r.completedLevels, 10) || 0,
        careerPoints:    parseInt(r.careerPoints, 10) || 0,
        isDoubleXp:      String(r.isDoubleXp).toLowerCase() === 'true',
        isComeback:      String(r.isComeback).toLowerCase() === 'true'
      };
    });

    // Earned commendations
    var commRows = _readSheet(ss, SHEETS.COMMENDATIONS)
      .filter(function (r) { return String(r.userId || '').trim() === uid; });
    var earnedKeys = commRows.reduce(function (acc, r) {
      acc[String(r.commendationKey)] = true; return acc;
    }, {});
    var commendations = commRows.map(function (r) {
      var def = COMMENDATIONS.filter(function (c) { return c.key === r.commendationKey; })[0] || {};
      return { key: r.commendationKey, label: def.label || r.label,
               icon: def.icon || '', desc: def.desc || '',
               earnedAt: r.earnedAt, next: def.next || null };
    });

    // Next commendation to chase
    var nextComm = null;
    for (var j = 0; j < COMMENDATIONS.length; j++) {
      if (!earnedKeys[COMMENDATIONS[j].key]) { nextComm = COMMENDATIONS[j]; break; }
    }

    return {
      ok:             true,
      totalCp:        totalCp,
      currentStreak:  streak,
      streakBonusPct: _streakBonus(streak),
      medallions:     medallions,
      commendations:  commendations,
      nextCommendation: nextComm,
      activeTour: {
        tourId:        tour.tourId,
        weekNumber:    tour.weekNumber,
        daysRemaining: tour.daysRemaining,
        hoursRemaining: tour.hoursRemaining,
        isDoubleXp:    String(tour.isDoubleXp).toLowerCase() === 'true'
      }
    };
  }

  // ─── Public: Send test email to admin ────────────────────────────────────

  function sendTestEmail(user) {
    var ss         = _ss();
    var appUrl     = ScriptApp.getService().getUrl();
    var tour       = getActiveTour();
    var isDoubleXp = String(tour.isDoubleXp).toLowerCase() === 'true';
    var uid        = String(user.userId || '').trim();
    var email      = String(user.email  || '').toLowerCase().trim();
    var name       = String(user.name   || email);

    var progRows        = _readSheet(ss, 'Progress');
    var levelCountryMap = _buildLevelCountryMap_(ss);
    var byUserW     = _aggregateProgress(progRows, uid, new Date(tour.startDate));
    var byUserAll   = _aggregateProgress(progRows, uid, null);
    var wData       = byUserW[uid]   || { levels: {}, levelCountries: {} };
    var aData       = byUserAll[uid] || { levels: {}, levelCountries: {} };
    var calcW       = _calcUserXp(wData.levels,  isDoubleXp, wData.levelCountries,  levelCountryMap);
    var calcAll     = _calcUserXp(aData.levels,  false,      aData.levelCountries,  levelCountryMap);

    // Build a rank position based on all users this week
    var allByUser = _aggregateProgress(progRows, null, new Date(tour.startDate));
    var entries   = Object.keys(allByUser).map(function (uid2) {
      var u2 = allByUser[uid2];
      var c2 = _calcUserXp(u2.levels, isDoubleXp, u2.levelCountries, levelCountryMap);
      return { userId: uid2, totalXp: c2.totalXp, completedLevels: c2.completedLevels };
    }).filter(function (e) { return e.totalXp > 0 || e.completedLevels > 0; });
    entries.sort(function (a, b) {
      if (b.completedLevels !== a.completedLevels) return b.completedLevels - a.completedLevels;
      return b.totalXp - a.totalXp;
    });
    var rankPos = 0;
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].userId === uid) { rankPos = i + 1; break; }
    }
    var stats = (calcW.totalXp > 0 || calcW.completedLevels > 0)
      ? { rank: rankPos || entries.length + 1, totalXp: calcW.totalXp, completedLevels: calcW.completedLevels }
      : null;

    var testLogoBase64 = getLogoDataUrl().split(',')[1];
    var testLogoBlob   = Utilities.newBlob(Utilities.base64Decode(testLogoBase64), 'image/png', 'logo.png');
    MailApp.sendEmail({
      to:       email,
      subject:  '[TEST PREVIEW] AEROCOMMS — Tour ' + tour.weekNumber + ' · New Scenarios Available',
      htmlBody: _emailWrap_(
        '<div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:8px;padding:10px 16px;margin-bottom:20px;font-size:12px;color:#f59e0b;font-weight:700;letter-spacing:0.5px;">TEST PREVIEW — This is how the weekly email looks to your students</div>' +
        _buildWeeklyEmail_(name, stats, entries.length || 1, tour, appUrl, isDoubleXp, String(user.profession || 'PILOT').toUpperCase())
      ),
      inlineImages: { aerocommsLogo: testLogoBlob }
    });
    _logEmail_(ss, tour, email, name, 'test', stats, 'sent');

    return { ok: true, sentTo: email };
  }

  // ─── Public: Admin force-close tour ───────────────────────────────────────

  function forceCloseTour() {
    var ss    = _ss();
    var sheet = _ensureSheet(ss, SHEETS.TOURS,
      ['tourId','weekNumber','startDate','endDate','isActive','isDoubleXp','createdAt']);
    var tours = _readSheet(ss, SHEETS.TOURS);

    var active = null;
    for (var i = 0; i < tours.length; i++) {
      if (String(tours[i].isActive).toLowerCase() === 'true') {
        active = tours[i]; break;
      }
    }

    if (active) {
      _closeTourRow(sheet, active.tourId);
      _snapshotAllUsers(ss, active);
    }

    var newTour = _createTour(ss, sheet, tours.length + 1);
    return { ok: true, closedTourId: active ? active.tourId : null, newTour: newTour };
  }

  // ─── Public: Send weekly reset emails ────────────────────────────────────

  function sendWeeklyResetEmails() {
    var ss     = _ss();
    var appUrl = ScriptApp.getService().getUrl();
    var tour   = getActiveTour();
    var isDoubleXp = String(tour.isDoubleXp).toLowerCase() === 'true';

    // Build ranked list from this tour's progress
    var progRows        = _readSheet(ss, 'Progress');
    var byUser          = _aggregateProgress(progRows, null, new Date(tour.startDate));
    var levelCountryMap = _buildLevelCountryMap_(ss);

    var entries = Object.keys(byUser).map(function (uid) {
      var calc = _calcUserXp(byUser[uid].levels, isDoubleXp, byUser[uid].levelCountries, levelCountryMap);
      return { userId: uid, totalXp: calc.totalXp, completedLevels: calc.completedLevels };
    });
    entries.sort(function (a, b) {
      if (b.completedLevels !== a.completedLevels) return b.completedLevels - a.completedLevels;
      return b.totalXp - a.totalXp;
    });

    var rankMap = {};
    entries.forEach(function (e, i) {
      rankMap[e.userId] = { rank: i + 1, totalXp: e.totalXp, completedLevels: e.completedLevels };
    });
    var totalRanked = entries.length;

    // All active students
    var users = dbReadAll_('Users').filter(function (u) {
      return String(u.status || '').toUpperCase() === 'ACTIVE' &&
             String(u.role   || '').toUpperCase() === 'STUDENT';
    });

    var sent = 0, failed = 0;

    users.forEach(function (u) {
      var email = String(u.email || '').toLowerCase().trim();
      var name  = String(u.name  || email);
      if (!email) return;
      var stats      = rankMap[u.userId] || null;
      var profession = String(u.profession || 'PILOT').toUpperCase();
      try {
        var wkLogoBase64 = getLogoDataUrl().split(',')[1];
        var wkLogoBlob   = Utilities.newBlob(Utilities.base64Decode(wkLogoBase64), 'image/png', 'logo.png');
        MailApp.sendEmail({
          to:       email,
          subject:  'AEROCOMMS — Tour ' + tour.weekNumber + ' · New Scenarios Available',
          htmlBody: _emailWrap_(_buildWeeklyEmail_(name, stats, totalRanked, tour, appUrl, isDoubleXp, profession)),
          inlineImages: { aerocommsLogo: wkLogoBlob }
        });
        _logEmail_(ss, tour, email, name, 'weekly', stats, 'sent');
        sent++;
      } catch (e) {
        _logEmail_(ss, tour, email, name, 'weekly', stats, 'failed');
        failed++;
      }
    });

    return { ok: true, sent: sent, failed: failed, total: users.length };
  }

  var PROFESSION_TIER_LABELS_ = {
    'PILOT':       { junior: 'Junior Captain',     senior: 'Senior Captain',     instructor: 'Instructor Captain',     chief: 'Chief Pilot'        },
    'CONTROLLER':  { junior: 'Junior Controller',  senior: 'Senior Controller',  instructor: 'Instructor Controller',  chief: 'Chief Controller'   },
    'AMT':         { junior: 'Junior AMT',         senior: 'Senior AMT',         instructor: 'Instructor AMT',         chief: 'Chief AMT'          },
    'FIREFIGHTER': { junior: 'Junior Firefighter', senior: 'Senior Firefighter', instructor: 'Instructor Firefighter', chief: 'Chief Firefighter'  },
    'DRIVER':      { junior: 'Junior Driver',      senior: 'Senior Driver',      instructor: 'Instructor Driver',      chief: 'Chief Driver'       }
  };

  function _tierForLevels_(n, profession) {
    var prof = PROFESSION_TIER_LABELS_[String(profession || '').toUpperCase()] || PROFESSION_TIER_LABELS_['PILOT'];
    if (n >= 10) return { label: prof.chief,      color: '#990011', bg: '#1a0305' };
    if (n >= 7)  return { label: prof.instructor, color: '#DAA520', bg: '#1a1400' };
    if (n >= 4)  return { label: prof.senior,     color: '#C0C7D1', bg: '#141c24' };
    return               { label: prof.junior,    color: '#0E65F4', bg: '#051228' };
  }

  function _buildWeeklyEmail_(name, stats, totalRanked, tour, appUrl, isDoubleXp, profession) {
    var firstName = String(name || '').split(' ')[0] || name;
    var weeklyLevels = stats ? (stats.completedLevels || 0) : 0;
    var tier = _tierForLevels_(weeklyLevels, profession);

    // ── Logo (text-based — data: URLs are blocked by Gmail/Outlook) ──
    var logoBlock =
      '<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">' +
        '<tr><td align="center">' +
          '<img src="cid:aerocommsLogo" alt="AEROCOMMS" style="width:160px;height:93px;border-radius:8px;object-fit:contain;background:#000;border:2px solid rgba(0,212,142,0.35);display:block;margin:0 auto;">' +
          '<div style="padding-top:8px;font-size:11px;color:#4a6280;letter-spacing:1.5px;font-family:Arial,Helvetica,sans-serif;">ICAO TRAINER PRO</div>' +
        '</td></tr>' +
      '</table>';

    // ── Rank badge (tier earned this week) ──
    var tierBadge =
      '<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">' +
        '<tr><td align="center" style="background:' + tier.bg + ';border:1px solid ' + tier.color + ';border-radius:10px;padding:14px 20px;">' +
          '<div style="font-size:10px;font-weight:700;letter-spacing:2.5px;color:' + tier.color + ';text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;opacity:0.7;margin-bottom:4px;">THIS WEEK\'S RANK</div>' +
          '<div style="font-size:20px;font-weight:900;letter-spacing:2px;color:' + tier.color + ';font-family:Arial,Helvetica,sans-serif;">' + tier.label.toUpperCase() + '</div>' +
        '</td></tr>' +
      '</table>';

    // ── XP + position stats ──
    var statsBlock = '';
    if (stats && stats.totalXp > 0) {
      var rank      = stats.rank;
      var posColor  = rank === 1 ? '#FFD700' : rank === 2 ? '#C0C0C0' : rank === 3 ? '#CD7F32' : '#00d48e';
      var medal     = rank === 1 ? '#1' : rank === 2 ? '#2' : rank === 3 ? '#3' : '#' + rank;
      statsBlock =
        '<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">' +
          '<tr>' +
            '<td width="48%" align="center" style="background:#111111;border:1px solid #222222;border-radius:10px;padding:16px 10px;">' +
              '<div style="font-size:10px;font-weight:700;letter-spacing:2px;color:#4a6280;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;margin-bottom:6px;">Experience Points</div>' +
              '<div style="font-size:34px;font-weight:900;color:#00d48e;font-family:\'Courier New\',Courier,monospace;">' + stats.totalXp + '</div>' +
              '<div style="font-size:10px;color:#4a6280;font-family:Arial,Helvetica,sans-serif;margin-top:2px;">XP this tour</div>' +
            '</td>' +
            '<td width="4%"></td>' +
            '<td width="48%" align="center" style="background:#111111;border:1px solid #222222;border-radius:10px;padding:16px 10px;">' +
              '<div style="font-size:10px;font-weight:700;letter-spacing:2px;color:#4a6280;text-transform:uppercase;font-family:Arial,Helvetica,sans-serif;margin-bottom:6px;">Position</div>' +
              '<div style="font-size:34px;font-weight:900;color:' + posColor + ';font-family:\'Courier New\',Courier,monospace;">' + medal + '</div>' +
              '<div style="font-size:10px;color:#4a6280;font-family:Arial,Helvetica,sans-serif;margin-top:2px;">of ' + totalRanked + ' pilots</div>' +
            '</td>' +
          '</tr>' +
        '</table>';
    } else {
      statsBlock =
        '<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">' +
          '<tr><td align="center" style="background:#111111;border:1px solid #222222;border-radius:10px;padding:18px 20px;">' +
            '<div style="font-size:22px;margin-bottom:8px;">&#128747;</div>' +
            '<div style="font-size:13px;color:#8fa3bb;line-height:1.6;font-family:Arial,Helvetica,sans-serif;">You weren\'t on the board last week.<br>This week is a fresh start &mdash; every level earns XP.</div>' +
          '</td></tr>' +
        '</table>';
    }

    // ── Double XP banner ──
    var dxpBanner = isDoubleXp
      ? '<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">' +
          '<tr><td align="center" style="background:#0d0a00;border:1px solid #DAA520;border-radius:10px;padding:12px 16px;">' +
            '<span style="font-size:13px;font-weight:800;color:#f59e0b;letter-spacing:1px;font-family:Arial,Helvetica,sans-serif;">&#9889; 2&times; XP WEEK &mdash; Double career points on every completed level</span>' +
          '</td></tr>' +
        '</table>'
      : '';

    return (
      logoBlock +
      '<p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#dde6f0;font-family:Arial,Helvetica,sans-serif;">Hi ' + firstName + ',</p>' +
      '<p style="margin:0 0 20px;font-size:13px;color:#8fa3bb;line-height:1.6;font-family:Arial,Helvetica,sans-serif;">' +
        'Tour <strong style="color:#dde6f0;">' + tour.weekNumber + '</strong> is live. ' +
        '<strong style="color:#00d48e;">New scenarios are now available.</strong> ' +
        'Complete levels, earn XP, and climb the rankings before the week ends.' +
      '</p>' +
      dxpBanner +
      tierBadge +
      statsBlock +
      '<table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">' +
        '<tr><td style="background:#111111;border:1px solid #222222;border-radius:10px;padding:14px 20px;">' +
          '<p style="margin:0;font-size:12px;color:#8fa3bb;line-height:1.8;font-family:Arial,Helvetica,sans-serif;">' +
            '&#10003;&nbsp; New scenarios unlocked&nbsp;&nbsp;' +
            '&#10003;&nbsp; Weekly XP reset to zero&nbsp;&nbsp;' +
            '&#10003;&nbsp; Career Points carry forward' +
          '</p>' +
        '</td></tr>' +
      '</table>' +
      '<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">' +
        '<tr><td align="center">' +
          '<a href="' + appUrl + '" style="display:inline-block;background:#00d48e;color:#000000;font-family:Arial,Helvetica,sans-serif;font-weight:900;font-size:14px;letter-spacing:1.5px;text-transform:uppercase;padding:14px 36px;border-radius:10px;text-decoration:none;">Launch Simulator &#8594;</a>' +
        '</td></tr>' +
      '</table>' +
      '<p style="margin:8px 0 0;font-size:11px;color:#2d4a63;text-align:center;font-family:Arial,Helvetica,sans-serif;">Tour ' + tour.weekNumber + ' &nbsp;&middot;&nbsp; 7 days remaining</p>'
    );
  }

  // ─── EmailLog helpers ──────────────────────────────────────────────────────

  function _ensureEmailLog_(ss) {
    return _ensureSheet(ss, 'EmailLog',
      ['timestamp', 'tourId', 'weekNumber', 'recipientEmail', 'recipientName', 'type', 'weeklyXp', 'rank', 'status']);
  }

  function _logEmail_(ss, tour, email, name, type, stats, status) {
    var sheet = _ensureEmailLog_(ss);
    var now   = new Date();
    sheet.appendRow([
      now,
      tour.tourId    || '',
      tour.weekNumber || '',
      email,
      name,
      type,
      stats ? (stats.totalXp || 0) : 0,
      stats ? (stats.rank    || '') : '',
      status
    ]);
  }

  function getEmailLog() {
    var ss   = _ss();
    _ensureEmailLog_(ss);
    var rows = _readSheet(ss, 'EmailLog');
    // Return newest first
    rows.sort(function (a, b) {
      return new Date(b.timestamp) - new Date(a.timestamp);
    });
    return rows.slice(0, 200);
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  function _buildUserMap(ss) {
    var map = {};
    try {
      dbReadAll_('Users').forEach(function (u) {
        var uid = String(u['userId'] || '').trim();
        if (uid) map[uid] = u;
      });
    } catch (e) {}
    return map;
  }

  // ─── Exports ───────────────────────────────────────────────────────────────

  // ─── VR Bonus helpers ─────────────────────────────────────────────────────

  // Read VRBonusLog for a specific tour → { userId: { xp: N, cp: N } }
  function _getVrBonusesByUserForTour_(ss, tourId) {
    var sheet = ss.getSheetByName('VRBonusLog');
    if (!sheet) return {};
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return {};
    var hdrs = data[0].map(function(h) { return String(h); });
    var map  = {};
    data.slice(1).forEach(function(row) {
      var obj = {};
      hdrs.forEach(function(h, i) { obj[h] = row[i]; });
      var uid = String(obj['userId'] || '').trim();
      var tid = String(obj['tourId'] || '').trim();
      if (!uid || tid !== String(tourId)) return;
      if (!map[uid]) map[uid] = { xp: 0, cp: 0 };
      map[uid].xp += Number(obj['bonusXp'] || 0);
      map[uid].cp += Number(obj['bonusCp'] || 0);
    });
    return map;
  }

  // ─── Exports ───────────────────────────────────────────────────────────────

  return {
    getActiveTour:          getActiveTour,
    getWeeklyLeaderboard:   getWeeklyLeaderboard,
    getCareerLeaderboard:   getCareerLeaderboard,
    getMyCareerStats:       getMyCareerStats,
    forceCloseTour:         forceCloseTour,
    sendWeeklyResetEmails:  sendWeeklyResetEmails,
    sendTestEmail:          sendTestEmail,
    getEmailLog:            getEmailLog,
    cpForLevels:            _cpForLevels,
    cpNextLevel:            _cpNextLevel,
    cpMultiplier:           _cpMultiplier,
    xpBaseTable:            XP_BASE
  };

})();
