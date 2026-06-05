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