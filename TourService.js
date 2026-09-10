/*******************************************************
 * TourService.js
 * Weekly Tour season system — tours, career points,
 * streak multipliers, medallions, and commendations.
 *
 * Sheets used (auto-created on first call):
 *   Commendations  — earned achievement records
 *******************************************************/

var TourService = (function () {

  // ─── Constants ────────────────────────────────────────────────────────────

  // XP base per level — decreasing curve, index = level number
  var XP_BASE = [0, 500, 450, 400, 350, 300, 260, 220, 180, 140, 100];

  // Career Points: base 50 CP per level, +10% per consecutive level that week.
  // Level 1 = 50 CP, Level 2 = 55 CP, … Level 10 = 95 CP → 725 CP for a full week.
  var CP_BASE = 50;
  var CP_STEP = 0.10;

  // Commendation chain definitions
  /* The commendations were awarded only at tour close. There is no tour close, so
   * nothing awards them and nothing reads them — the definitions went with the
   * code that used them. The Commendations sheet is left alone: a refactor does
   * not destroy data. */

  // ─── Sheet helpers ─────────────────────────────────────────────────────────

  function _ss() { return dbGetSpreadsheet_(); }


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

  function _cpForLevels(n) {
    var total = 0;
    for (var i = 0; i < Math.min(n, 10); i++) {
      total += Math.round(CP_BASE * (1 + CP_STEP * i));
    }
    return total;
  }

  // ─── Public: Weekly leaderboard ───────────────────────────────────────────

  /* Monday 00:00 UTC, computed. No sheet, no tour, no side effects.
   *
   * This board used to open with getActiveTour(), which on an expired tour ran the
   * entire weekly snapshot inline — so opening the rankings tab was a SECOND door
   * to the 49-second cold start, and closing the one on the boot path would not
   * have shut it. */
  function _thisWeekStart_() {
    var d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));   // back to Monday
    return d;
  }

  function getWeeklyLeaderboard(limit) {
    var ss         = _ss();
    // Double XP was a property of a tour. There are no tours.
    var isDoubleXp = false;
    var progRows   = _readSheet(ss, 'Progress');

    // Weekly XP: only levels updated since Monday
    var byUserWeekly  = _aggregateProgress(progRows, null, _thisWeekStart_());
    // All-time levels: no date filter — used for rank/tier badge
    var byUserAllTime = _aggregateProgress(progRows, null, null);
    var userMap         = _buildUserMap(ss);
    var levelCountryMap = _buildLevelCountryMap_(ss);
    var safeLimit = Math.min(limit || 20, 100);

    // _vrWeekKey_ lives in Código.js and is the one place the week key is spelled.
    // Apps Script shares a global scope, so it is called rather than copied.
    var vrBonuses = _getVrBonusesByUserForTour_(ss, _vrWeekKey_());

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
      isDoubleXp: false,
      data:      entries.slice(0, safeLimit).map(function (p, i) {
        return { rank: i + 1, name: p.name, email: p.email,
                 totalXp: p.totalXp, completedLevels: p.completedLevels,
                 weeklyCP: p.weeklyCP,
                 allTimeLevels: p.allTimeLevels, maxLevel: p.maxLevel };
      })
    };
  }

  // ─── Public: Career leaderboard ───────────────────────────────────────────

  /* All-time XP, derived from Progress every time.
   *
   * This used to aggregate careerPoints out of TourProgress snapshots, and fall
   * back to deriving from Progress only when no tour had ever closed. The snapshot
   * is gone, so the fallback is the only honest source — and it was already
   * written, already correct, and already the path a new deployment took. */
  function getCareerLeaderboard(limit) {
    var ss              = _ss();
    var safeLimit       = Math.min(limit || 20, 100);
    var userMap         = _buildUserMap(ss);
    var progRows        = _readSheet(ss, 'Progress');
    var raw             = _aggregateProgress(progRows, null, null);
    var levelCountryMap = _buildLevelCountryMap_(ss);

    var entries = Object.keys(raw).map(function (uid) {
      var calc = _calcUserXp(raw[uid].levels, false, raw[uid].levelCountries, levelCountryMap);
      var u    = userMap[uid] || {};
      return {
        userId:          uid,
        name:            String(u['name'] || u['email'] || uid),
        email:           String(u['email'] || ''),
        profession:      String(u['profession'] || 'PILOT').toUpperCase(),
        totalXp:         calc.totalXp,
        completedLevels: calc.completedLevels,
        maxLevel:        raw[uid].maxLevel || 1
      };
    }).filter(function (e) { return e.totalXp > 0 || e.completedLevels > 0; });

    entries.sort(function (a, b) {
      return b.totalXp - a.totalXp || b.completedLevels - a.completedLevels;
    });

    return {
      ok:   true,
      data: entries.slice(0, safeLimit).map(function (p, i) {
        return { rank: i + 1, name: p.name, email: p.email,
                 totalXp: p.totalXp, completedLevels: p.completedLevels,
                 maxLevel: p.maxLevel };
      })
    };
  }

  // ─── Public: My career stats ───────────────────────────────────────────────

  /* One student's standing, in XP.
   *
   * Medallions, commendations and the streak of consecutive 10/10 weeks were all
   * read out of the weekly snapshot. With no snapshot there is nothing behind
   * them, and a card that reports zero for ever is worse than a card that is not
   * there — so they are not reported rather than reported empty. */
  function getMyCareerStats(user) {
    var ss  = _ss();
    var uid = String(user.userId || '').trim();

    var progRows        = _readSheet(ss, 'Progress');
    var raw             = _aggregateProgress(progRows, uid, null);
    var levelCountryMap = _buildLevelCountryMap_(ss);
    var mine            = raw[uid] || { levels: {}, levelCountries: {}, maxLevel: 0 };
    var calc            = _calcUserXp(mine.levels, false, mine.levelCountries, levelCountryMap);

    return {
      ok:              true,
      totalXp:         calc.totalXp,
      completedLevels: calc.completedLevels,
      maxLevel:        mine.maxLevel || 1
    };
  }

  var PROFESSION_TIER_LABELS_ = {
    'PILOT':       { junior: 'Junior Captain',     senior: 'Senior Captain',     instructor: 'Instructor Captain',     chief: 'Chief Pilot'        },
    'CONTROLLER':  { junior: 'Junior Controller',  senior: 'Senior Controller',  instructor: 'Instructor Controller',  chief: 'Chief Controller'   },
    'AMT':         { junior: 'Junior AMT',         senior: 'Senior AMT',         instructor: 'Instructor AMT',         chief: 'Chief AMT'          },
    'FIREFIGHTER': { junior: 'Junior Firefighter', senior: 'Senior Firefighter', instructor: 'Instructor Firefighter', chief: 'Chief Firefighter'  },
    'DRIVER':      { junior: 'Junior Driver',      senior: 'Senior Driver',      instructor: 'Instructor Driver',      chief: 'Chief Driver'       }
  };

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
    getWeeklyLeaderboard:   getWeeklyLeaderboard,
    getCareerLeaderboard:   getCareerLeaderboard,
    getMyCareerStats:       getMyCareerStats,
    cpForLevels:            _cpForLevels,
    xpBaseTable:            XP_BASE
  };

})();
