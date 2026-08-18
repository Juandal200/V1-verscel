/*******************************************************
 * PushService.js — Web Push Notification support
 * Stores push subscriptions and returns at-risk users
 * for streak reminder notifications.
 *
 * ONE-TIME SETUP: Run setupPushSubscriptionsSheet() once
 * from the GAS editor to create the required sheet.
 *******************************************************/

function setupPushSubscriptionsSheet() {
  var ss = SpreadsheetApp.openById(
    PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID')
  );
  if (ss.getSheetByName('PushSubscriptions')) {
    Logger.log('PushSubscriptions sheet already exists.');
    return;
  }
  var sheet = ss.insertSheet('PushSubscriptions');
  sheet.getRange(1, 1, 1, 5).setValues([['userId','endpoint','p256dh','auth','createdAt']]);
  sheet.getRange(1, 1, 1, 5).setFontWeight('bold');
  Logger.log('PushSubscriptions sheet created.');
}

function apiSavePushSubscription(payload) {
  try {
    var sessionToken = String((payload && payload.sessionToken) || '');
    var sub          = (payload && payload.subscription) || {};

    var user = AuthService.requireSession(sessionToken);

    var endpoint = String(sub.endpoint || '');
    if (!endpoint) return { ok: false, error: 'No endpoint' };

    var p256dh = String((sub.keys && sub.keys.p256dh) || '');
    var auth   = String((sub.keys && sub.keys.auth)   || '');

    // Replace any existing subscription for this user (delete from bottom to
    // avoid row-number shifting if multiple rows exist).
    var existing = dbReadAll_('PushSubscriptions').filter(function(r) {
      return String(r.userId || '') === String(user.id);
    }).sort(function(a, b) { return b.__rowNumber - a.__rowNumber; });

    existing.forEach(function(r) {
      dbDeleteByRow_('PushSubscriptions', r.__rowNumber);
    });

    dbAppend_('PushSubscriptions', {
      userId:    user.id,
      endpoint:  endpoint,
      p256dh:    p256dh,
      auth:      auth,
      createdAt: new Date().toISOString()
    });

    return { ok: true };
  } catch(e) {
    return { ok: false, error: String(e.message || e) };
  }
}

function apiGetAtRiskPushUsers(payload) {
  try {
    var secret   = String((payload && payload.cronSecret) || '');
    var expected = PropertiesService.getScriptProperties().getProperty('CRON_SECRET') || '';
    if (!expected || secret !== expected) return { ok: false, error: 'Unauthorized' };

    var now           = Date.now();
    var MIN_HOURS_MS  = 20 * 60 * 60 * 1000; // haven't practiced in 20+ h
    var MAX_HOURS_MS  = 48 * 60 * 60 * 1000; // streak expires after 48 h

    var atRisk = dbReadAll_('UserStreaks').filter(function(r) {
      if ((Number(r.streakDays) || 0) < 2) return false;
      if (!r.lastActiveAt) return false;
      var elapsed = now - new Date(r.lastActiveAt).getTime();
      return elapsed >= MIN_HOURS_MS && elapsed < MAX_HOURS_MS;
    });

    if (!atRisk.length) return { ok: true, users: [] };

    var atRiskIds = atRisk.map(function(r) { return String(r.userId); });

    var subMap = {};
    dbReadAll_('PushSubscriptions').forEach(function(s) {
      var uid = String(s.userId || '');
      if (atRiskIds.indexOf(uid) !== -1) subMap[uid] = s;
    });

    var users = [];
    atRisk.forEach(function(r) {
      var uid = String(r.userId);
      var sub = subMap[uid];
      if (!sub || !sub.endpoint) return;
      users.push({
        userId:     uid,
        streakDays: Number(r.streakDays) || 0,
        endpoint:   String(sub.endpoint),
        p256dh:     String(sub.p256dh || ''),
        auth:       String(sub.auth   || '')
      });
    });

    return { ok: true, users: users };
  } catch(e) {
    return { ok: false, error: String(e.message || e) };
  }
}
