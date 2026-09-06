var LogService = {
  admin: function(actorUserId, action, entity, entityId, beforeObj, afterObj) {
    try {
      dbAppend_('AdminLogs', {
        logId: uuid_('LOG'),
        actorUserId: actorUserId || '',
        action: action || '',
        entity: entity || '',
        entityId: entityId || '',
        beforeJson: safeJson_(beforeObj),
        afterJson: safeJson_(afterObj),
        createdAt: now_()
      });
    } catch (err) {
      console.error(err);
    }
  },

  error: function(source, err, userId) {
    try {
      dbAppend_('ErrorLogs', {
        errorId: uuid_('ERR'),
        source: source || '',
        message: err && err.message ? err.message : String(err),
        stack: err && err.stack ? err.stack : '',
        userId: userId || '',
        createdAt: now_()
      });
    } catch (logErr) {
      console.error(logErr);
    }
  }
};

/**
 * Where the client's grader and the server's disagree.
 *
 * The cockpit grades the read-back locally so a student gets an answer at once,
 * then the server's verdict replaces it. Nobody knew how often the two differed,
 * which meant nobody knew whether the round trip was earning its keep or whether
 * the local grader was quietly telling students the wrong thing for a second.
 *
 * Written to ErrorLogs at INFO so it is one place rather than a new sheet. Read it
 * with checkGraderAgreement().
 */
function apiLogGraderDisagreement(sessionToken, payload) {
  try {
    var user = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    payload = payload || {};
    LogService.info('graderDisagreement', JSON.stringify({
      level:      payload.level,
      country:    payload.country,
      scenarioId: String(payload.scenarioId || ''),
      clientSaid: payload.clientSaid === true,
      serverSaid: payload.serverSaid === true,
      answer:     String(payload.answer || '').slice(0, 500)
    }), user.userId);
    return { ok: true };
  } catch (err) {
    // A diagnostic must never be the thing that breaks an exercise.
    return { ok: false };
  }
}

/** Prints how often the two graders differed, and on which scenarios. */
function checkGraderAgreement() {
  var rows = [];
  try {
    rows = dbReadAll_('ErrorLogs').filter(function (r) {
      return String(r.context || r.source || '') === 'graderDisagreement';
    });
  } catch (e) {}
  if (!rows.length) {
    var msg = 'No disagreements recorded. Either the two graders agree, or nobody ' +
              'has trained since this shipped.';
    Logger.log(msg);
    return msg;
  }
  var byScenario = {};
  rows.forEach(function (r) {
    var d = {};
    try { d = JSON.parse(String(r.message || '{}')); } catch (e) {}
    var k = String(d.scenarioId || '?');
    byScenario[k] = byScenario[k] || { total: 0, clientTooKind: 0, clientTooHarsh: 0 };
    byScenario[k].total++;
    if (d.clientSaid && !d.serverSaid) byScenario[k].clientTooKind++;
    if (!d.clientSaid && d.serverSaid) byScenario[k].clientTooHarsh++;
  });
  var out = ['DISAGREEMENTS: ' + rows.length, ''];
  Object.keys(byScenario).sort(function (a, b) {
    return byScenario[b].total - byScenario[a].total;
  }).forEach(function (k) {
    var v = byScenario[k];
    out.push('  ' + k + '   ' + v.total + ' total   ' +
             v.clientTooKind + ' the client passed and the server failed   ' +
             v.clientTooHarsh + ' the other way round');
  });
  var msg = out.join('\n');
  Logger.log(msg);
  return msg;
}
