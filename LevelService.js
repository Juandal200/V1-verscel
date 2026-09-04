/**
 * A level is a row, not an edit.
 *
 * Level 10 had eight working scenarios, passed every content check, and still showed
 * up as a grey card reading "Training Level" — because a level's name, icon and
 * description lived in LEVEL_THEMES inside the client. Adding a level meant editing
 * two files and deploying, which is why ten levels of content had nine levels of
 * identity.
 *
 * Everything else about a level already came from the sheet: its scenarios, phases,
 * countries, audio, grading, progress. This closes the last gap, so levels 10 to 20
 * are content and nothing else.
 *
 * Read setupLevelsSheet() first — it seeds the nine that exist today from the values
 * the client is using, so nothing changes on screen until a row is edited.
 */

var LEVELS_SHEET_ = 'Levels';

/** The nine the client currently hardcodes, so seeding changes nothing visually. */
var _LEVEL_SEED_ = [
  [1, 'ATC Basics',              '🛫', 'ATC Basics',              'Read-backs, call signs and the phraseology every exchange is built from.'],
  [2, 'Taxi & Departure',        '🛬', 'Taxi & Departure',        'Ground movement, holding points and departure clearances.'],
  [3, 'Takeoff & Climb',         '📡', 'Takeoff & Climb',         'Line-up, take-off clearance and the initial climb.'],
  [4, 'En-Route',                '🌐', 'En-Route',                'Level changes, direct routings and frequency transfers.'],
  [5, 'Oceanic & International', '🌊', 'Oceanic & International', 'Position reports, oceanic clearances and long-haul procedure.'],
  [6, 'Weather Operations',      '🌩', 'Weather Operations',      'Deviations, turbulence reports and significant weather.'],
  [7, 'Approach & Descent',      '📉', 'Approach & Descent',      'Descent planning, vectors and approach clearances.'],
  [8, 'Landing & Go-Around',     '🛩', 'Landing & Go-Around',     'Landing clearance, go-arounds and runway vacation.'],
  [9, 'Emergency Procedures',    '🚨', 'Emergency Procedures',    'Declare and handle emergencies — MAYDAY, PAN-PAN and distress.']
];

/**
 * Create the sheet and seed the nine levels that already exist.
 *
 * Levels 1 to 9 are seeded as FOUNDATION. Any level found in Scenarios above that is
 * seeded as OPERATIONAL with its number for a name, so it stops rendering as
 * "Training Level" the moment this runs and can be named properly afterwards.
 */
function setupLevelsSheet() {
  // Same accessor the other setup functions use.
  var ss = SpreadsheetApp.openById(
    PropertiesService.getScriptProperties().getProperty(CONFIG.PROP_DB_SPREADSHEET_ID));
  var sh = ss.getSheetByName(LEVELS_SHEET_);
  var created = false;
  if (!sh) {
    sh = ss.insertSheet(LEVELS_SHEET_);
    sh.appendRow(DB_SCHEMA[LEVELS_SHEET_]);
    created = true;
  }

  var have = {};
  try {
    dbReadAll_(LEVELS_SHEET_).forEach(function(r) { have[Number(r.level)] = true; });
  } catch (e) {}

  var now = new Date().toISOString();
  var added = 0;

  _LEVEL_SEED_.forEach(function(row) {
    if (have[row[0]]) return;
    dbAppend_(LEVELS_SHEET_, {
      level: row[0], name: row[1], icon: row[2], tag: row[3], description: row[4],
      accent: '', groupKey: 'FOUNDATION', groupName: 'Training',
      phases: '', isActive: 'TRUE', createdAt: now, updatedAt: now
    });
    added++;
  });

  // Anything the scenarios already carry that nobody has named.
  var maxSeen = 0;
  try {
    readSheetObjectsV5Hard_('Scenarios').forEach(function(r) {
      if (String(r.isActive).toUpperCase() === 'FALSE') return;
      maxSeen = Math.max(maxSeen, Number(r.level || 0));
    });
  } catch (e) {}

  for (var l = 10; l <= maxSeen; l++) {
    if (have[l]) continue;
    dbAppend_(LEVELS_SHEET_, {
      level: l, name: 'Operational ' + (l - 9), icon: '🎖', tag: 'Operational',
      description: 'Operational-level communication: heavier vocabulary, non-routine situations.',
      accent: '', groupKey: 'OPERATIONAL', groupName: 'Operational',
      phases: '', isActive: 'TRUE', createdAt: now, updatedAt: now
    });
    added++;
  }

  // A level published a moment ago should be reachable now, not when a ten-minute
  // cache happens to expire.
  try { clearLevelCapsCache(); } catch (e) {}

  var msg = (created ? 'Created ' : 'Found ') + LEVELS_SHEET_ + ' sheet.\n' +
            '  seeded ' + added + ' level(s)\n' +
            '  highest level in Scenarios: ' + maxSeen + '\n' +
            '  Edit the rows to rename anything. No deploy needed.';
  Logger.log(msg);
  return msg;
}

/**
 * Every level's identity, for the client.
 *
 * Returns [] rather than failing when the sheet is absent: the client keeps its
 * built-in nine as a fallback, so a missing sheet is a cosmetic regression rather
 * than a blank level map.
 */
function apiGetLevelMeta(sessionToken) {
  try {
    AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    var rows;
    try { rows = dbReadAll_(LEVELS_SHEET_); }
    catch (e) { return { ok: true, levels: [], note: 'no Levels sheet yet' }; }

    var out = [];
    rows.forEach(function(r) {
      if (String(r.isActive).toUpperCase() === 'FALSE') return;
      var n = Number(r.level || 0);
      if (!n) return;
      out.push({
        level:       n,
        name:        String(r.name || '').trim(),
        icon:        String(r.icon || '').trim(),
        tag:         String(r.tag  || '').trim(),
        description: String(r.description || '').trim(),
        accent:      String(r.accent || '').trim(),
        groupKey:    String(r.groupKey  || '').trim().toUpperCase(),
        groupName:   String(r.groupName || '').trim(),
        phases:      String(r.phases || '').split(',').map(function(p) { return p.trim(); })
                       .filter(function(p) { return p; })
      });
    });
    out.sort(function(a, b) { return a.level - b.level; });
    return { ok: true, levels: out };
  } catch (err) {
    return apiError_('apiGetLevelMeta', err);
  }
}

/**
 * How far each plan reaches, computed rather than written down.
 *
 * FULL was sold as twenty levels while ten existed, because the number was typed into
 * ACCESS_PLANS_ and nothing compared it to the content. Basic stops at the end of the
 * foundation group; Full reaches whatever exists. Add level 21 and Full covers it the
 * day its scenarios land.
 */
var _LEVEL_CAPS_CACHE_KEY_ = 'levelcaps_v1';

function levelCapsFromContent_() {
  // Cached, because this is asked on nearly every request and answers with something
  // that changes when a level is published — which is to say, almost never.
  //
  // It read the whole Levels sheet and all eighty Scenario rows, and it sits inside
  // _accessFor_, which apiGetMe calls. So it did not slow two screens down, it slowed
  // every authenticated call down, and the two paths with the tightest deadlines —
  // Begin Exam at thirty seconds, the proxy at forty-five — were simply the first to
  // give up. Ten minutes is short enough that a newly published level appears almost
  // at once and long enough that nobody waits for it twice.
  try {
    var hit = CacheService.getScriptCache().get(_LEVEL_CAPS_CACHE_KEY_);
    if (hit) {
      var c = JSON.parse(hit);
      if (c && c.basic && c.full) return c;
    }
  } catch (e) {}

  var caps = _levelCapsCompute_();
  try {
    CacheService.getScriptCache().put(_LEVEL_CAPS_CACHE_KEY_, JSON.stringify(caps), 600);
  } catch (e) {}
  return caps;
}

/** Drops the cached caps, so a newly published level is reachable immediately. */
function clearLevelCapsCache() {
  try { CacheService.getScriptCache().remove(_LEVEL_CAPS_CACHE_KEY_); } catch (e) {}
  Logger.log('Level caps cache cleared.');
  return 'Level caps cache cleared.';
}

function _levelCapsCompute_() {
  var foundationMax = 0, overallMax = 0;
  try {
    dbReadAll_(LEVELS_SHEET_).forEach(function(r) {
      if (String(r.isActive).toUpperCase() === 'FALSE') return;
      var n = Number(r.level || 0);
      if (!n) return;
      overallMax = Math.max(overallMax, n);
      if (String(r.groupKey || '').trim().toUpperCase() === 'FOUNDATION') {
        foundationMax = Math.max(foundationMax, n);
      }
    });
  } catch (e) {}

  // Nothing to go on: fall back to what the scenarios themselves show, so a missing
  // Levels sheet under-promises rather than over-promises.
  if (!overallMax) {
    // Two columns, not the whole sheet. Reading a range is the expensive part of Apps
    // Script, and this wanted the highest level number — it was pulling every column
    // of every scenario to find it.
    try {
      var sh = SpreadsheetApp.openById(
        PropertiesService.getScriptProperties().getProperty(CONFIG.PROP_DB_SPREADSHEET_ID))
        .getSheetByName('Scenarios');
      if (sh && sh.getLastRow() > 1) {
        var hdr  = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
        var lCol = hdr.indexOf('level') + 1;
        var aCol = hdr.indexOf('isActive') + 1;
        if (lCol) {
          var lo = aCol ? Math.min(lCol, aCol) : lCol;
          var hi = aCol ? Math.max(lCol, aCol) : lCol;
          var vals = sh.getRange(2, lo, sh.getLastRow() - 1, hi - lo + 1).getValues();
          var li = lCol - lo, ai = aCol ? aCol - lo : -1;
          vals.forEach(function(row) {
            if (ai >= 0 && String(row[ai]).toUpperCase() === 'FALSE') return;
            overallMax = Math.max(overallMax, Number(row[li] || 0));
          });
        }
      }
    } catch (e) {}
    foundationMax = Math.min(9, overallMax);
  }
  return { basic: foundationMax || 9, full: overallMax || 9 };
}

/** What each tier actually opens today. Run from LevelService.gs. */
function checkLevelCaps() {
  var caps = levelCapsFromContent_();
  var msg = 'PLAN REACH, from content\n' +
            '  BASIC : levels 1-' + caps.basic + '\n' +
            '  FULL  : levels 1-' + caps.full + '\n' +
            '  (ACCESS_PLANS_ says BASIC ' + ACCESS_PLANS_.BASIC.maxLevel +
            ', FULL ' + ACCESS_PLANS_.FULL.maxLevel + ')';
  Logger.log(msg);
  return msg;
}

/**
 * Prove the dispenser without writing content.
 *
 * Everything says a level is now data: its scenarios, its name, its grouping, its plan
 * reach, its place in the progress bar. That has been verified by reading the code,
 * which is not the same as being true. This creates a throwaway level 11 — two phases,
 * placeholder text — so the claim can be tested in a few minutes rather than
 * discovered to be wrong after somebody writes eight real scenarios for it.
 *
 * Run createTestLevel11() from LevelService.gs, look at the app, then run
 * deleteTestLevel11() to remove every trace.
 */
function createTestLevel11() {
  var now = new Date().toISOString();
  var made = { scenarios: 0, level: 0 };

  var existing = {};
  try {
    readSheetObjectsV5Hard_('Scenarios').forEach(function(r) {
      existing[String(r.scenarioId || '')] = true;
    });
  } catch (e) {}

  // Two phases is enough to prove a level exists, unlocks and can be entered. The text
  // is deliberately obvious so nobody mistakes it for content.
  var phases = [
    { code: 'STARTUP', name: 'Startup',
      atc: 'Test one one alpha, startup approved, information charlie, QNH one zero one three.',
      exp: 'Startup approved, information charlie, QNH one zero one three, test one one alpha.',
      kw:  'STARTUP APPROVED|CHARLIE|QNH|1013' },
    { code: 'TAXI', name: 'Taxi',
      atc: 'Test one one alpha, taxi to holding point alpha, runway two seven, via taxiway bravo.',
      exp: 'Taxi to holding point alpha, runway two seven, via bravo, test one one alpha.',
      kw:  'TAXI|HOLDING POINT ALPHA|RUNWAY 27|BRAVO' }
  ];

  phases.forEach(function(p, i) {
    var id = 'TESTL11_' + p.code;
    if (existing[id]) return;
    dbAppend_('Scenarios', {
      scenarioId: id, scenarioOrder: i + 1, level: 11, country: 'USA',
      flightScenarioId: 'TESTL11', flightScenarioName: 'Dispenser test',
      phaseCode: p.code, phaseName: p.name, phaseOrder: i + 1,
      scenarioType: 'NORMAL', emergencyType: '',
      context: 'A throwaway phase created by createTestLevel11. Safe to delete.',
      atcText: p.atc, expectedReadback: p.exp, keywords: p.kw,
      imageFileId: '', videoUrl: '', audioUrl: '', isActive: 'TRUE',
      version: '1', createdBy: 'createTestLevel11', createdAt: now, updatedAt: now,
      phaseLabel: p.name
    });
    made.scenarios++;
  });

  var haveLevel = false;
  try {
    dbReadAll_(LEVELS_SHEET_).forEach(function(r) { if (Number(r.level) === 11) haveLevel = true; });
  } catch (e) {}
  if (!haveLevel) {
    dbAppend_(LEVELS_SHEET_, {
      level: 11, name: 'Dispenser Test', icon: '🧪', tag: 'Test',
      description: 'A throwaway level proving a level can be added from the sheets alone.',
      accent: '', groupKey: 'OPERATIONAL', groupName: 'Operational',
      phases: 'Startup, Taxi', isActive: 'TRUE', createdAt: now, updatedAt: now
    });
    made.level = 1;
  }

  var msg = 'CREATED TEST LEVEL 11\n' +
    '  scenarios added : ' + made.scenarios + '\n' +
    '  Levels row added: ' + made.level + '\n\n' +
    'Now, WITHOUT deploying anything:\n' +
    '  1. run renderScenarioAudio in TTSService.gs\n' +
    '  2. reload the app twice on wifi\n' +
    '  3. the Operational card should now open a MENU with two levels in it\n' +
    '  4. "Dispenser Test" should be named, described and enterable\n' +
    '  5. the progress bar should count out of 11\n\n' +
    'Then run deleteTestLevel11() to remove every trace.';
  Logger.log(msg);
  return msg;
}

/** Removes everything createTestLevel11 made. Leaves no trace. */
function deleteTestLevel11() {
  var removed = { scenarios: 0, level: 0, attempts: 0, progress: 0 };

  function purge(sheet, matches, counter) {
    var rows;
    try { rows = dbReadAll_(sheet); } catch (e) { return; }
    // Bottom-up: deleting a row shifts everything below it.
    rows.slice().reverse().forEach(function(r) {
      if (!matches(r)) return;
      try { dbDeleteByRow_(sheet, r.__rowNumber); removed[counter]++; } catch (e) {}
    });
  }

  purge('Scenarios', function(r) { return String(r.scenarioId || '').indexOf('TESTL11_') === 0; }, 'scenarios');
  purge(LEVELS_SHEET_, function(r) { return Number(r.level) === 11; }, 'level');
  purge('Attempts',  function(r) { return String(r.scenarioId || '').indexOf('TESTL11_') === 0; }, 'attempts');
  purge('Progress',  function(r) { return Number(r.level) === 11; }, 'progress');

  var msg = 'REMOVED TEST LEVEL 11\n' +
    '  scenarios : ' + removed.scenarios + '\n' +
    '  Levels row: ' + removed.level + '\n' +
    '  attempts  : ' + removed.attempts + '\n' +
    '  progress  : ' + removed.progress + '\n\n' +
    'Rendered audio for those two lines stays in Drive and is harmless; ' +
    'checkScenarioAudio will list it if you want it gone.';
  Logger.log(msg);
  return msg;
}
