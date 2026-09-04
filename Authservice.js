var AuthService = {
  registerUser: function(email, name, profession) {
    email = normalizeEmail_(email);
    name = String(name || '').trim();
    profession = String(profession || 'PILOT').trim().toUpperCase();

    if (!email || email.indexOf('@') === -1) {
      throw new Error('Enter a valid email.');
    }

    if (!name) {
      throw new Error('Enter your full name.');
    }

    var result = UserService.registerPendingUser({
      email: email,
      name: name,
      profession: profession
    });

    var user = result.user;

    if (result.created) {
      return {
        ok: true,
        status: user.status,
        message: user.status === USER_STATUS.ACTIVE
          ? 'Registration completed. You can sign in now.'
          : 'Registration received. An admin must approve your account before sign in.'
      };
    }

    if (user.status === USER_STATUS.ACTIVE) {
      return {
        ok: true,
        status: user.status,
        message: 'This email is already registered. Use sign in to request your access code.'
      };
    }

    return {
      ok: true,
      status: user.status,
      message: 'This email is already registered and is pending admin approval.'
    };
  },

  createOtpCode: function(email) {
    email = normalizeEmail_(email);

    if (!email || email.indexOf('@') === -1) {
      throw new Error('Enter a valid email.');
    }

    var user = dbFindOne_('Users', 'email', email);

    if (!user) {
      var bootstrapAdminEmail = normalizeEmail_(
        PropertiesService.getScriptProperties().getProperty(CONFIG.PROP_BOOTSTRAP_ADMIN_EMAIL)
      );

      if (bootstrapAdminEmail && email === bootstrapAdminEmail) {
        user = UserService.getOrCreateFromGoogleProfile({
          googleSub: 'email:' + email,
          email: email,
          name: email.split('@')[0]
        });
      }
    }

    if (!user) {
      throw new Error('No registered account found for this email. Please register first.');
    }

    if (user.status === USER_STATUS.PENDING) {
      throw new Error('Your account is pending admin approval.');
    }

    if (user.status === USER_STATUS.BLOCKED) {
      throw new Error('Your account is blocked. Contact an administrator.');
    }

    if (user.status !== USER_STATUS.ACTIVE) {
      throw new Error('Your account is not active.');
    }

    var nowMs = new Date().getTime();
    var existingCodes = dbReadAll_('LoginCodes')
      .filter(function(r) {
        return normalizeEmail_(r.email) === email &&
               r.status === 'PENDING' &&
               new Date(r.expiresAt).getTime() > nowMs;
      })
      .sort(function(a, b) {
        return String(b.createdAt).localeCompare(String(a.createdAt));
      });

    if (existingCodes.length) {
      var latest = existingCodes[0];
      var createdMs = new Date(latest.createdAt).getTime();
      var ageSeconds = Math.floor((nowMs - createdMs) / 1000);
      var expiresMs = new Date(latest.expiresAt).getTime();

      if (ageSeconds < 60) {
        var wait = 60 - ageSeconds;
        return { ok: false, cooldown: wait, message: 'Please wait ' + wait + ' second' + (wait === 1 ? '' : 's') + ' before requesting a new code.' };
      }

      if (ageSeconds < 300) {
        var minsLeft = Math.ceil((expiresMs - nowMs) / 60000);
        return { ok: true, alreadySent: true, message: 'A code was already sent to ' + email + '. Check your inbox — it expires in ' + minsLeft + ' minute' + (minsLeft === 1 ? '' : 's') + '.' };
      }
    }

    var code = String(Math.floor(100000 + Math.random() * 900000));
    var codeHash = this.hashCode_(email, code);
    var nowDate = new Date();
    var expiresDate = new Date(nowDate.getTime() + 10 * 60 * 1000);

    var item = {
      codeId: uuid_('OTP'),
      email: email,
      name: user.name || '',
      codeHash: codeHash,
      status: 'PENDING',
      expiresAt: Utilities.formatDate(expiresDate, CONFIG.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX"),
      attempts: 0,
      createdAt: now_(),
      usedAt: ''
    };

    dbWithScriptLock_(function() {
      dbAppend_('LoginCodes', item);
    });

    MailApp.sendEmail({
      to: email,
      subject: 'aerocomms — Your login code',
      htmlBody: _emailWrap_(
        '<p style="margin:0 0 4px;font-size:11px;font-weight:800;letter-spacing:2.5px;color:#ffffff;text-align:center;">aerocomms</p>' +
        '<p style="margin:0 0 20px;font-size:12px;color:#4a6280;letter-spacing:1px;text-align:center;">Aviation English Interactive Campus</p>' +
        '<p style="margin:0 0 6px;font-size:13px;color:#8fa3bb;text-align:center;letter-spacing:0.5px;">YOUR LOGIN CODE</p>' +
        '<div style="background:rgba(0,212,142,0.07);border:1px solid rgba(0,212,142,0.22);border-radius:14px;padding:22px 16px;margin:12px 0 24px;text-align:center;">' +
          '<span style="font-size:44px;font-weight:900;letter-spacing:14px;color:#ffffff;font-family:\'Courier New\',monospace;">' + code + '</span>' +
        '</div>' +
        '<p style="margin:0 0 8px;font-size:14px;color:#8fa3bb;text-align:center;">This code expires in <span style="color:#dde6f0;font-weight:700;">10 minutes</span>.</p>' +
        '<p style="margin:0;font-size:12px;color:#4a6280;text-align:center;">If you did not request this code, you can safely ignore this email.</p>'
      )
    });

    return {
      ok: true,
      message: 'Verification code sent to ' + email
    };
  },

  verifyOtpAndCreateSession: function(email, code) {
    email = normalizeEmail_(email);
    code = String(code || '').trim();

    if (!email || !code) {
      throw new Error('Email and code are required.');
    }

    var codeHash = this.hashCode_(email, code);

    // Only the check-and-consume of the one-time code needs the global lock.
    // Everything after it — user upsert, session, dashboard — used to run inside
    // it too, so a login held a mutex shared with all 41 other writers (answer
    // submission included) while it built the whole home screen. That is what
    // pushed verification past the client's 30s ceiling.
    var otpName = dbWithScriptLock_(function() {
      var rows = dbReadAll_('LoginCodes')
        .filter(function(row) {
          return normalizeEmail_(row.email) === email && row.status === 'PENDING';
        })
        .sort(function(a, b) {
          return String(b.createdAt).localeCompare(String(a.createdAt));
        });

      if (!rows.length) {
        throw new Error('No active code found. Request a new code.');
      }

      var otp = rows[0];
      var nowMs = new Date().getTime();
      var expiresMs = new Date(otp.expiresAt).getTime();

      if (nowMs > expiresMs) {
        dbUpdateByRow_('LoginCodes', otp.__rowNumber, {
          status: 'EXPIRED'
        });
        throw new Error('The code expired. Request a new one.');
      }

      var attempts = Number(otp.attempts || 0);

      if (attempts >= 5) {
        dbUpdateByRow_('LoginCodes', otp.__rowNumber, {
          status: 'BLOCKED'
        });
        throw new Error('Too many attempts. Request a new code.');
      }

      if (otp.codeHash !== codeHash) {
        dbUpdateByRow_('LoginCodes', otp.__rowNumber, {
          attempts: attempts + 1
        });
        throw new Error('Invalid code.');
      }

      dbUpdateByRow_('LoginCodes', otp.__rowNumber, {
        status: 'USED',
        usedAt: now_()
      });

      return otp.name || '';
    });

    // Past this point the code is consumed, so no concurrent request can be
    // working on this email — the lock has nothing left to protect. A single
    // read scope collapses the repeated Users reads below into one.
    return dbWithReadScope_(function() {
      var profile = {
        googleSub: 'email:' + email,
        email: email,
        name: otpName || email
      };

      var user = UserService.getOrCreateFromGoogleProfile(profile);
      UserService.touchLastLogin(user.userId);

      if (user.status !== USER_STATUS.ACTIVE) {
        return {
          ok: false,
          code: 'USER_NOT_ACTIVE',
          message: 'Tu usuario fue registrado, pero aún está pendiente de aprobación por el administrador.',
          user: UserService.toPublicUser(user)
        };
      }

      var sessionToken = AuthService.createSession(user);

      LogService.admin(
        user.userId,
        'LOGIN_OTP',
        'Users',
        user.userId,
        {},
        { email: user.email, role: user.role }
      );

      return {
        ok: true,
        sessionToken: sessionToken,
        user: UserService.toPublicUser(user),
        home: DashboardService.getHomeData(user)
      };
    });
  },

  hashCode_: function(email, code) {
    var raw = normalizeEmail_(email) + '|' + String(code || '').trim();
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw);
    return Utilities.base64Encode(bytes);
  },

  createSession: function(user) {
    var token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
    var expiresAt = Date.now() + (CONFIG.SESSION_TTL_SECONDS * 1000);

    var sessionData = {
      userId:    user.userId,
      email:     user.email,
      role:      user.role,
      createdAt: Date.now(),
      expiresAt: expiresAt
    };

    var json = JSON.stringify(sessionData);

    // Primary: CacheService (fast, max 6 h)
    CacheService.getScriptCache().put('session_' + token, json, CONFIG.SESSION_TTL_SECONDS);

    // Fallback: spreadsheet (survives cache eviction, honours SESSION_TTL_SECONDS)
    try {
      dbWithScriptLock_(function() {
        dbAppend_('Sessions', {
          token:     token,
          userId:    user.userId,
          email:     user.email,
          role:      user.role,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(expiresAt).toISOString()
        });
      });
    } catch(e) { /* non-fatal — cache is the primary path */ }

    return token;
  },

  requireSession: function(sessionToken) {
    if (!sessionToken) {
      throw new Error('Missing session token.');
    }

    // 1. Fast path: CacheService
    var raw = CacheService.getScriptCache().get('session_' + sessionToken);
    var session;

    if (raw) {
      session = JSON.parse(raw);
    } else {
      // 2. Fallback: Sessions sheet (handles cache eviction after 6 h)
      var rows = dbReadAll_('Sessions').filter(function(r) {
        return String(r.token || '') === sessionToken;
      });

      if (!rows.length) {
        throw new Error('Session expired. Please sign in again.');
      }

      session = rows[0];
      var expMs = new Date(session.expiresAt).getTime();
      if (Date.now() > expMs) {
        throw new Error('Session expired. Please sign in again.');
      }

      // Re-warm the cache so subsequent calls are fast again
      CacheService.getScriptCache().put(
        'session_' + sessionToken,
        JSON.stringify({ userId: session.userId, email: session.email, role: session.role, createdAt: Date.now(), expiresAt: expMs }),
        Math.min(21600, Math.floor((expMs - Date.now()) / 1000))
      );
    }

    var user = UserService.getById(session.userId);

    if (!user) {
      throw new Error('User not found.');
    }

    if (user.status !== USER_STATUS.ACTIVE) {
      throw new Error('User is not active.');
    }

    return user;
  },

  requireRole: function(sessionToken, allowedRoles) {
    var user = this.requireSession(sessionToken);

    if (allowedRoles.indexOf(user.role) === -1) {
      throw new Error('Unauthorized action for role: ' + user.role);
    }

    return user;
  },

  destroySession: function(sessionToken) {
    if (!sessionToken) return;
    CacheService.getScriptCache().remove('session_' + sessionToken);
    try {
      var rows = dbReadAll_('Sessions');
      for (var i = 0; i < rows.length; i++) {
        if (String(rows[i].token || '') === sessionToken && rows[i].__rowNumber) {
          dbDeleteByRow_('Sessions', rows[i].__rowNumber);
          break;
        }
      }
    } catch(e) { /* non-fatal */ }
  }
};

/**
 * How big the login tables have grown, and how slow the login path now is.
 * Reads only — changes nothing. Run from Authservice.gs.
 */
function checkLoginPerformance() {
  var out = [];

  function timed(label, fn) {
    var t = Date.now();
    var n = null;
    try { n = fn(); } catch (e) { out.push(label + ': ERROR ' + e.message); return; }
    out.push(label + ': ' + (Date.now() - t) + ' ms' + (n === null ? '' : '  (' + n + ' rows)'));
  }

  timed('read LoginCodes', function() { return dbReadAll_('LoginCodes').length; });
  timed('read Users',      function() { return dbReadAll_('Users').length; });
  timed('read Sessions',   function() { return dbReadAll_('Sessions').length; });

  // The subscription check runs on every access decision, and it reads the whole
  // sheet rather than a range.
  timed('subscription status', function() {
    try { wompiGetSubscriptionStatus_('nobody'); } catch (e) {}
    return null;
  });

  // How much of LoginCodes is spent — every code ever issued stays for ever, and
  // verifying reads and filters all of them under a script lock.
  try {
    var rows = dbReadAll_('LoginCodes');
    var used = rows.filter(function(r) { return String(r.status || '').toUpperCase() !== 'PENDING'; }).length;
    var old  = 0, cutoff = Date.now() - 24 * 60 * 60 * 1000;
    rows.forEach(function(r) {
      var d = new Date(String(r.createdAt || ''));
      if (!isNaN(d.getTime()) && d.getTime() < cutoff) old++;
    });
    out.push('');
    out.push('LoginCodes: ' + rows.length + ' total, ' + used + ' already used, ' +
             old + ' older than a day');
    out.push('Every one of those is read and filtered on every verify, inside a script lock.');
  } catch (e) {}

  var msg = out.join('\n');
  Logger.log(msg);
  return msg;
}

/**
 * Creates the Sessions sheet and reports whether sessions can now persist.
 *
 * createSession has always tried to write there and always failed silently — the
 * sheet had no schema entry, dbAppend_ threw, and a try/catch discarded it on the
 * assumption the cache was sufficient. It was not: CacheService caps a TTL at six
 * hours, so a thirty-day token was backed by six hours of storage at best. That is
 * why signing in did not last.
 *
 * Run once from the editor — Authservice.gs. Safe to run again.
 */
function setupSessionsSheet() {
  var ss = SpreadsheetApp.openById(
    PropertiesService.getScriptProperties().getProperty(CONFIG.PROP_DB_SPREADSHEET_ID));

  var sheet = ss.getSheetByName('Sessions');
  var created = false;
  if (!sheet) {
    sheet = ss.insertSheet('Sessions');
    sheet.appendRow(DB_SCHEMA.Sessions);
    sheet.setFrozenRows(1);
    created = true;
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(DB_SCHEMA.Sessions);
    sheet.setFrozenRows(1);
  }

  // Prove it end to end rather than assume: write a row, read it back, remove it.
  var ok = false, err = '';
  try {
    var probe = 'probe_' + Utilities.getUuid();
    dbAppend_('Sessions', {
      token: probe, userId: 'PROBE', email: 'probe@local', role: 'STUDENT',
      createdAt: new Date().toISOString(), expiresAt: new Date().toISOString()
    });
    var found = dbReadAll_('Sessions').filter(function(r) { return String(r.token) === probe; });
    ok = found.length === 1;
    if (found.length) sheet.deleteRow(found[0].__rowNumber);
  } catch (e) { err = e.message; }

  var msg = (created ? 'Created the Sessions sheet.' : 'Sessions sheet already existed.') + '\n' +
            (ok ? 'Write and read verified — sessions now persist for '
                  + Math.round(CONFIG.SESSION_TTL_SECONDS / 86400) + ' days.'
                : 'STILL FAILING: ' + (err || 'row did not read back')) + '\n' +
            'Existing sessions are unaffected; new logins will persist from now on.';
  Logger.log(msg);
  return msg;
}

/**
 * Are the session rows in the order the code reads them?
 *
 * The Sessions sheet was created by something other than setupSessionsSheet, with its
 * own header order: sessionToken, userId, email, role, expiresAt, createdAt. The
 * schema says token, userId, email, role, createdAt, expiresAt — columns five and six
 * the other way round.
 *
 * dbReadAll_ maps by SCHEMA position and never looks at row 1, so a row written by the
 * older convention has its two dates read the wrong way round: the code would take the
 * creation time as the expiry, and treat a session as expired the moment it was made.
 * A row written by dbAppend_ is correct.
 *
 * This says which rows are which, by looking at the values rather than the labels — an
 * expiry is always later than a creation, so a row where the "expiry" precedes the
 * "creation" was written the other way round.
 *
 * Read-only. Run checkSessionColumnOrder() from Authservice.gs.
 */
function checkSessionColumnOrder() {
  var rows;
  try { rows = dbReadAll_('Sessions'); }
  catch (e) { Logger.log('Sessions unreadable: ' + e.message); return 'unreadable'; }

  var ok = 0, swapped = 0, unreadable = 0, examples = [];
  rows.forEach(function(r) {
    var c = new Date(r.createdAt).getTime();
    var x = new Date(r.expiresAt).getTime();
    if (isNaN(c) || isNaN(x)) { unreadable++; return; }
    if (x > c) { ok++; return; }
    swapped++;
    if (examples.length < 5) {
      examples.push('  row ' + r.__rowNumber + '  created=' + r.createdAt + '  expires=' + r.expiresAt);
    }
  });

  var out = [];
  out.push('SESSIONS: ' + rows.length + ' row(s)');
  out.push('  read correctly       : ' + ok);
  out.push('  dates the wrong way  : ' + swapped);
  out.push('  dates unreadable     : ' + unreadable);
  if (examples.length) { out.push(''); out.push('EXAMPLES'); examples.forEach(function(e) { out.push(e); }); }
  out.push('');
  out.push(swapped
    ? 'Those rows were written before the schema convention and read as already\n' +
      'expired, which logs that person out. They are safe to delete — a deleted\n' +
      'session only means signing in again.'
    : 'Every row is in schema order. The header row is mislabelled but the data is\n' +
      'correct, so repairSheetHeaders can relabel it safely.');

  var msg = out.join('\n');
  Logger.log(msg);
  return msg;
}
