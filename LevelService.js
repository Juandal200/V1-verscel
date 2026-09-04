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
function levelCapsFromContent_() {
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
    try {
      readSheetObjectsV5Hard_('Scenarios').forEach(function(r) {
        if (String(r.isActive).toUpperCase() === 'FALSE') return;
        overallMax = Math.max(overallMax, Number(r.level || 0));
      });
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
