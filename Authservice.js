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
      subject: 'AEROCOMMS — Your login code',
      htmlBody: _emailWrap_(
        '<table width="100%" cellpadding="0" cellspacing="0" style="text-align:center;margin-bottom:24px;">' +
          '<tr><td><img src="' + getLogoDataUrl() + '" alt="AEROCOMMS" style="width:72px;height:72px;border-radius:8px;object-fit:contain;background:#000;border:2px solid rgba(0,212,142,0.35);"></td></tr>' +
          '<tr><td style="padding-top:14px;font-size:11px;font-weight:800;letter-spacing:2.5px;text-transform:uppercase;color:#00d48e;">AEROCOMMS</td></tr>' +
          '<tr><td style="padding-top:3px;font-size:12px;color:#4a6280;letter-spacing:1px;">ICAO Trainer Pro</td></tr>' +
        '</table>' +
        '<p style="margin:0 0 6px;font-size:13px;color:#8fa3bb;text-align:center;letter-spacing:0.5px;">YOUR LOGIN CODE</p>' +
        '<div style="background:rgba(0,212,142,0.07);border:1px solid rgba(0,212,142,0.22);border-radius:14px;padding:22px 16px;margin:12px 0 24px;text-align:center;">' +
          '<span style="font-size:44px;font-weight:900;letter-spacing:14px;color:#00d48e;font-family:\'Courier New\',monospace;">' + code + '</span>' +
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

    return dbWithScriptLock_(function() {
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

      var profile = {
        googleSub: 'email:' + email,
        email: email,
        name: otp.name || email
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
