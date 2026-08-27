/**
 * Altitude targets for simulator scenarios.
 *
 * The target used to be parsed out of atcText at runtime, on every scenario, every
 * time. That is inference standing in for data: it drives the deviation warning,
 * the beep and the FLIGHT_WARN_ALT / FLIGHT_CORRECT_ALT analytics, so it is part of
 * how a student is assessed — and it was failing silently. A scenario whose
 * clearance read "3,000 FEET" produced no target at all, which looks identical on
 * screen to one that works: no amber card, no warning, no beep, and no way for the
 * author to know.
 *
 * The target now lives in the Scenarios sheet. These functions fill it in from what
 * is already written, and report what could not be read.
 */

var SCEN_ALT_PHASES_ = { DEPARTURE: 1, CRUISE: 1, DESCEND: 1 };

var SCEN_PHASE_ALIASES_ = {
  'TAKE_OFF': 'TAKEOFF', 'CLIMB': 'DEPARTURE', 'DESCENT': 'DESCEND',
  'TAXIOUT': 'TAXI_OUT', 'TAXIIN': 'TAXI_IN'
};

function _scenNormPhase_(code) {
  var c = String(code || '').trim().toUpperCase().replace(/\s+/g, '_').replace(/-/g, '_');
  return SCEN_PHASE_ALIASES_[c] || c;
}

var SCEN_DIGIT_ = { ZERO:0, ONE:1, TWO:2, THREE:3, FOUR:4, FIVE:5, SIX:6, SEVEN:7, EIGHT:8, NINE:9 };
var SCEN_THOUS_ = { ONE:1, TWO:2, THREE:3, FOUR:4, FIVE:5, SIX:6, SEVEN:7, EIGHT:8, NINE:9,
                    TEN:10, ELEVEN:11, TWELVE:12 };

/**
 * Reads an altitude out of an ATC clearance.
 *
 * Two faults from the client version are fixed here, because this is the one place
 * that has to read the existing text correctly.
 *
 * Thousands separators broke it. /\b(\d{3,5})\s+FEET\b/ against "3,000 FEET" put the
 * word boundary after the comma and captured "000" — which then failed the sanity
 * range and produced nothing. Every separator is stripped first, so "3,000", "3 000"
 * and "3000" all read the same.
 *
 * And the fallbacks never ran. Each branch was guarded by `altitude === null`, but a
 * bad match had already set it to 0 — not null — so the spoken forms below were
 * skipped, and the range check that would have rejected it only ran at the very end.
 * Each branch now validates its own result before claiming the slot.
 */
function scenParseAltitude_(text) {
  if (!text) return null;

  // Strip thousands separators between digit groups, and nothing else.
  var t = String(text).toUpperCase().replace(/(\d)[, \s](\d{3})\b/g, '$1$2');

  function ok(a) { return (a !== null && a >= 500 && a <= 45000) ? a : null; }
  var m, v;

  m = t.match(/\bFLIGHT\s+LEVEL\s+(\d{2,3})\b/);
  if (m) { v = ok(parseInt(m[1], 10) * 100); if (v !== null) return v; }

  m = t.match(/\bFLIGHT\s+LEVEL\s+((?:ZERO|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE)(?:\s+(?:ZERO|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE)){1,2})\b/);
  if (m) {
    var fl = m[1].split(/\s+/).map(function(w) { return SCEN_DIGIT_[w]; }).join('');
    v = ok(parseInt(fl, 10) * 100); if (v !== null) return v;
  }

  // "3000 FEET", and also "MAINTAIN 3000" / "DESCEND TO 3000" with no unit.
  m = t.match(/\b(\d{3,5})\s*(?:FEET|FT)\b/);
  if (m) { v = ok(parseInt(m[1], 10)); if (v !== null) return v; }

  m = t.match(/\b(?:MAINTAIN|CLIMB|DESCEND|ALTITUDE|HEIGHT)(?:\s+(?:TO|AND\s+MAINTAIN))?\s+(\d{3,5})\b/);
  if (m) { v = ok(parseInt(m[1], 10)); if (v !== null) return v; }

  m = t.match(/\b(ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|ELEVEN|TWELVE)\s+THOUSAND\b/);
  if (m) { v = ok(SCEN_THOUS_[m[1]] * 1000); if (v !== null) return v; }

  return null;
}

/**
 * Fills targetAltitude from atcText for every altitude-phase scenario that has none.
 *
 * DRY RUN by default — logs what it would write and changes nothing. Pass true to
 * apply. Never overwrites a value already in the sheet: once a human has set one,
 * it wins over anything read out of prose.
 */
function seedScenarioTargets(apply) {
  var sheet   = dbGetSheet_('Scenarios');
  var headers = DB_SCHEMA.Scenarios;
  var col     = headers.indexOf('targetAltitude') + 1;
  if (!col) { Logger.log('targetAltitude column missing — run repairSheetHeaders() first.'); return; }

  var rows = dbReadAll_('Scenarios');
  var wouldWrite = 0, alreadySet = 0, unreadable = 0, notAltPhase = 0;
  var misses = [];

  rows.forEach(function(r) {
    if (String(r.isActive).toUpperCase() === 'FALSE') return;
    if (!SCEN_ALT_PHASES_[_scenNormPhase_(r.phaseCode)]) { notAltPhase++; return; }

    if (String(r.targetAltitude || '').trim() !== '') { alreadySet++; return; }

    var alt = scenParseAltitude_(r.atcText);
    if (alt === null) {
      unreadable++;
      misses.push('L' + r.level + ' ' + r.country + ' ' + r.phaseCode + ' — ' +
                  String(r.atcText || '').slice(0, 70));
      return;
    }
    wouldWrite++;
    if (apply) sheet.getRange(r.__rowNumber, col).setValue(alt);
  });

  Logger.log((apply ? 'APPLIED' : 'DRY RUN — nothing written') +
             '\n  altitude-phase scenarios read : ' + (wouldWrite + alreadySet + unreadable) +
             '\n  target already set            : ' + alreadySet +
             '\n  target ' + (apply ? 'written' : 'would be written') + '  : ' + wouldWrite +
             '\n  could NOT be read             : ' + unreadable +
             '\n  skipped (not an altitude phase): ' + notAltPhase);
  misses.slice(0, 40).forEach(function(m) { Logger.log('  UNREADABLE  ' + m); });
  if (misses.length > 40) Logger.log('  … and ' + (misses.length - 40) + ' more');

  return { ok: true, written: wouldWrite, alreadySet: alreadySet, unreadable: unreadable };
}

/** No-arg wrapper — the Apps Script Run button cannot pass arguments. */
function applyScenarioTargets() {
  return seedScenarioTargets(true);
}

/**
 * Every altitude-phase scenario with no usable target — the ones where the warning,
 * the beep and the deviation analytics are silently doing nothing.
 */
function checkScenarioTargets() {
  var rows = dbReadAll_('Scenarios');
  var bad = [], good = 0;

  rows.forEach(function(r) {
    if (String(r.isActive).toUpperCase() === 'FALSE') return;
    if (!SCEN_ALT_PHASES_[_scenNormPhase_(r.phaseCode)]) return;

    var stated = String(r.targetAltitude || '').trim();
    if (stated !== '' && Number(stated) >= 500 && Number(stated) <= 45000) { good++; return; }
    if (stated !== '') {
      bad.push('L' + r.level + ' ' + r.country + ' ' + r.phaseCode +
               ' — targetAltitude "' + stated + '" is not a usable altitude');
      return;
    }
    if (scenParseAltitude_(r.atcText) !== null) { good++; return; }  // fallback still works
    bad.push('L' + r.level + ' ' + r.country + ' ' + r.phaseCode + ' — no target, and none ' +
             'readable from: ' + String(r.atcText || '').slice(0, 70));
  });

  Logger.log('Altitude-phase scenarios with a working target: ' + good);
  Logger.log('Without one: ' + bad.length);
  bad.forEach(function(b) { Logger.log('  NO TARGET  ' + b); });
  if (!bad.length) Logger.log('Every altitude-phase scenario has a target.');
  return { ok: !bad.length, good: good, missing: bad.length, detail: bad };
}
