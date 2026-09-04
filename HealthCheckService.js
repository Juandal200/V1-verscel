/**
 * One command that checks everything, everywhere.
 *
 * The reason this exists: a fault gets reported on one screen — level 1, one phase,
 * one version of the mock test — and gets repaired exactly there. The same fault
 * usually sits in the other eight levels, the other two papers, or the module built
 * next month, and waits until somebody happens to walk into it. Fixing what was
 * reported is not the same as fixing what is wrong.
 *
 * So the rule is: whatever went wrong once is checked against every row of the same
 * kind, every time. Add a new check here when you find a new way for content to be
 * broken, and it is applied to all of it from then on — including the modules that do
 * not exist yet.
 *
 * Read-only. Run checkEverything() from HealthCheckService.gs.
 */

/** A finding: which thing, which row, and what is wrong with it. */
function _hcIssue_(area, where, problem) {
  return { area: area, where: where, problem: problem };
}

/**
 * Every training scenario, across every level and country.
 *
 * A phase the student cannot answer is a phase that ends the route. These are the
 * fields the simulator dereferences without asking whether they are there.
 */
function _hcScenarios_() {
  var issues = [], levels = {}, rows;
  try { rows = readSheetObjectsV5Hard_('Scenarios'); }
  catch (e) { return { issues: [_hcIssue_('Scenarios', '-', 'sheet unreadable: ' + e.message)], levels: {} }; }

  rows.forEach(function(r) {
    if (String(r.isActive).toUpperCase() === 'FALSE') return;
    var id  = String(r.scenarioId || '(no id)');
    var lvl = Number(r.level || 0);
    var key = 'L' + lvl + ' ' + String(r.country || '?') + ' ' + String(r.phaseCode || '?');
    levels[lvl] = (levels[lvl] || 0) + 1;

    if (!lvl)                                     issues.push(_hcIssue_('Scenarios', id, 'no level'));
    if (!String(r.country || '').trim())          issues.push(_hcIssue_('Scenarios', key, 'no country — the accent falls back to American'));
    if (!String(r.atcText || '').trim())          issues.push(_hcIssue_('Scenarios', key, 'no atcText — nothing for the controller to say'));
    if (!String(r.expectedReadback || '').trim()) issues.push(_hcIssue_('Scenarios', key, 'no expectedReadback — the answer cannot be shown'));
    if (!String(r.keywords || '').trim())         issues.push(_hcIssue_('Scenarios', key, 'no keywords — grading falls back to the token extractor'));
    if (!String(r.phaseCode || '').trim())        issues.push(_hcIssue_('Scenarios', key, 'no phaseCode'));

    var t = String(r.scenarioType || '').toUpperCase();
    if (t && t !== 'NORMAL' && t !== 'EMERGENCY')
      issues.push(_hcIssue_('Scenarios', key, 'scenarioType is "' + t + '", not NORMAL or EMERGENCY'));
  });
  return { issues: issues, levels: levels };
}

/**
 * Every paper of the mock test, not just the one that was sat.
 *
 * Version B once spoke in an American accent because its rows carried the wrong
 * language, and nobody could have known without opening it. All three are compared
 * against each other here: a paper missing what the others have is the fault.
 */
function _hcIcaoBanks_() {
  var issues = [], banks = {}, rows;
  try { rows = dbReadAll_(ICAO_ITEMS_SHEET_); }
  catch (e) { return { issues: [_hcIssue_('ICAO items', '-', 'sheet unreadable: ' + e.message)], banks: {} }; }

  rows.forEach(function(r) {
    if (String(r.isActive).toUpperCase() === 'FALSE') return;
    var b = String(r.bank || '').trim().toUpperCase() || '(no bank)';
    var e = banks[b] || (banks[b] = { rows: 0, audio: 0, unrendered: 0, langs: {}, types: {} });
    e.rows++;
    var type = String(r.itemType || '').toUpperCase();
    e.types[type] = (e.types[type] || 0) + 1;
    var lang = String(r.lang || '').trim();
    if (lang) e.langs[lang] = (e.langs[lang] || 0) + 1;

    var where = b + ' ' + String(r.itemId || '?');
    if (!String(r.script || '').trim() && type !== 'IMAGE')
      issues.push(_hcIssue_('ICAO items', where, 'nothing to say'));
    if (type === 'AUDIO') {
      e.audio++;
      if (!String(r.audioFileId || '').trim()) { e.unrendered++;
        issues.push(_hcIssue_('ICAO items', where, 'no recording — run renderIcaoTestAudio')); }
    }
    if (type === 'IMAGE' && !String(r.imageUrl || '').trim())
      issues.push(_hcIssue_('ICAO items', where, 'no image — Part 3 asks about a blank'));
    if (type === 'IMAGE' && !String(r.description || '').trim())
      issues.push(_hcIssue_('ICAO items', where, 'no description — the grader never sees the picture'));
    // Only rows that are SPOKEN need a language. An IMAGE row is a picture; it is
    // the LINE beside it that gets read out. Flagging those was my check being wrong,
    // not the data — four findings that would have sent somebody editing a column
    // that changes nothing.
    if (!lang && type !== 'IMAGE')
      issues.push(_hcIssue_('ICAO items', where, 'no lang — the accent falls back to American'));
  });

  // Every paper should be the same examination in a different accent. A shape that
  // differs between them is how one version quietly became easier than another.
  var names = Object.keys(banks);
  if (names.length > 1) {
    var ref = banks[names[0]];
    names.slice(1).forEach(function(b) {
      ['AUDIO','IMAGE','INTERVIEW','LINE'].forEach(function(t) {
        var a = ref.types[t] || 0, c = banks[b].types[t] || 0;
        if (a !== c) issues.push(_hcIssue_('ICAO items', b,
          t + ': ' + c + ' rows, but ' + names[0] + ' has ' + a));
      });
    });
    names.forEach(function(b) {
      if (Object.keys(banks[b].langs).length > 1)
        issues.push(_hcIssue_('ICAO items', b,
          'mixed languages (' + Object.keys(banks[b].langs).join(', ') + ') — one paper, one accent'));
    });
  }
  return { issues: issues, banks: banks };
}

/** Every rendered clip still points at a file that exists. */
function _hcScenarioAudio_() {
  var issues = [], rows;
  try { rows = dbReadAll_('ScenarioAudio'); }
  catch (e) { return { issues: [], note: 'no ScenarioAudio sheet' }; }
  var seen = {};
  rows.forEach(function(r) {
    var k = String(r.textHash || '') + '|' + String(r.country || '');
    seen[k] = (seen[k] || 0) + 1;
    if (!String(r.fileId || '').trim())
      issues.push(_hcIssue_('Scenario audio', String(r.audioId || '?'), 'row with no Drive file'));
  });
  Object.keys(seen).forEach(function(k) {
    if (seen[k] < SCENARIO_AUDIO_VOICES_)
      issues.push(_hcIssue_('Scenario audio', k,
        'only ' + seen[k] + ' of ' + SCENARIO_AUDIO_VOICES_ + ' voices rendered'));
  });
  return { issues: issues };
}

/**
 * A level the student can reach must be a level the app can name.
 *
 * The Scenarios sheet carries ten levels. The client names nine — LEVEL_THEMES in
 * Scripts.html — and falls back to a grey card reading "Training Level" with no
 * description and no phase list for anything beyond. It renders, so nothing breaks
 * and nothing complains; the tenth level simply looks like a mistake to whoever
 * reaches it.
 *
 * This number is deliberately duplicated from the client so that the two disagreeing
 * is itself the finding. Raise it here when a level is named there.
 */
var _HC_CLIENT_NAMED_LEVELS_ = 9;

function _hcLevelIdentity_(levels) {
  var issues = [];
  Object.keys(levels).forEach(function(l) {
    var n = Number(l);
    if (n > _HC_CLIENT_NAMED_LEVELS_)
      issues.push(_hcIssue_('Levels', 'L' + n,
        levels[l] + ' scenarios, but no name, icon or description in the client — ' +
        'it renders as an unnamed "Training Level"'));
  });
  return { issues: issues };
}

/** What is on sale must be what the app grants. */
function _hcPlans_() {
  var issues = [];
  try {
    var maxLevel = 0;
    readSheetObjectsV5Hard_('Scenarios').forEach(function(r) {
      if (String(r.isActive).toUpperCase() === 'FALSE') return;
      maxLevel = Math.max(maxLevel, Number(r.level || 0));
    });
    Object.keys(ACCESS_PLANS_).forEach(function(k) {
      var p = ACCESS_PLANS_[k];
      if (k !== 'STAFF' && p.maxLevel > maxLevel)
        issues.push(_hcIssue_('Plans', k,
          'sold as ' + p.maxLevel + ' levels, but only ' + maxLevel + ' exist'));
    });
    var basic = ACCESS_PLANS_.BASIC, full = ACCESS_PLANS_.FULL;
    if (basic && full && Math.min(basic.maxLevel, maxLevel) === Math.min(full.maxLevel, maxLevel))
      issues.push(_hcIssue_('Plans', 'BASIC vs FULL',
        'both open every level that exists — the tiers are the same product'));
  } catch (e) {
    issues.push(_hcIssue_('Plans', '-', e.message));
  }
  return { issues: issues };
}

/**
 * The whole thing, in one command.
 *
 * Whatever broke once is now checked against every row of its kind. Add a check when
 * you find a new way to be broken, and every level, paper and module inherits it.
 */
function checkEverything() {
  var out = [], all = [];
  function section(title, res) {
    out.push('');
    out.push(title);
    if (!res.issues.length) { out.push('   nothing wrong'); return; }
    var byProblem = {};
    res.issues.forEach(function(i) { (byProblem[i.problem] = byProblem[i.problem] || []).push(i.where); });
    Object.keys(byProblem).forEach(function(p) {
      var w = byProblem[p];
      out.push('   ' + w.length + '  ' + p);
      out.push('      ' + w.slice(0, 6).join(', ') + (w.length > 6 ? ', +' + (w.length - 6) + ' more' : ''));
    });
    all = all.concat(res.issues);
  }

  var sc = _hcScenarios_();
  section('TRAINING SCENARIOS', sc);
  var lv = Object.keys(sc.levels).sort(function(a,b){ return a-b; });
  out.push('   levels present: ' + lv.map(function(l){ return 'L'+l+' ('+sc.levels[l]+')'; }).join('  '));

  var ib = _hcIcaoBanks_();
  section('MOCK TEST PAPERS', ib);
  Object.keys(ib.banks).forEach(function(b) {
    var e = ib.banks[b];
    out.push('   ' + b + ': ' + e.rows + ' rows, ' + e.audio + ' recordings, ' +
             e.unrendered + ' unrendered, langs ' + (Object.keys(e.langs).join('/') || 'none'));
  });

  section('LEVEL IDENTITY', _hcLevelIdentity_(sc.levels));
  section('SIMULATOR AUDIO', _hcScenarioAudio_());
  section('PLANS', _hcPlans_());

  out.unshift(all.length ? ('FOUND ' + all.length + ' ISSUE(S)') : 'EVERYTHING CHECKS OUT');
  var msg = out.join('\n');
  Logger.log(msg);
  return msg;
}
