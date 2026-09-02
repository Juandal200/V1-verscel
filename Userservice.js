var UserService = {
  getOrCreateFromGoogleProfile: function(profile) {
    var createdUser = null;

    var user = dbWithScriptLock_(function() {
      var now = now_();
      var bootstrapAdminEmail = normalizeEmail_(
        PropertiesService.getScriptProperties().getProperty(CONFIG.PROP_BOOTSTRAP_ADMIN_EMAIL)
      );

      var existingBySub = dbFindOne_('Users', 'googleSub', profile.googleSub);

      if (existingBySub) {
        var patchSub = {
          email: profile.email,
          updatedAt: now
        };

        dbUpdateByRow_('Users', existingBySub.__rowNumber, patchSub);
        return mergeObjects_(existingBySub, patchSub);
      }

      var existingByEmail = dbFindOne_('Users', 'email', profile.email);

      if (existingByEmail) {
        var patchEmail = {
          googleSub: profile.googleSub,
          updatedAt: now
        };

        dbUpdateByRow_('Users', existingByEmail.__rowNumber, patchEmail);
        return mergeObjects_(existingByEmail, patchEmail);
      }

      var isBootstrapAdmin = bootstrapAdminEmail && profile.email === bootstrapAdminEmail;

      var newUser = {
        userId: uuid_('USR'),
        googleSub: profile.googleSub,
        email: profile.email,
        name: profile.name,
        role: isBootstrapAdmin ? ROLES.ADMIN : CONFIG.DEFAULT_NEW_USER_ROLE,
        status: isBootstrapAdmin ? USER_STATUS.ACTIVE : CONFIG.DEFAULT_NEW_USER_STATUS,
        currentLevel: 1,
        currentCountry: 'USA',
        assignedGroupId: '',
        totalLearningSeconds: 0,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: '',
        profession: 'PILOT',
        trialStartDate: now,
        firstFlightDone: false
      };

      dbAppend_('Users', newUser);
      createdUser = newUser;

      LogService.admin(
        newUser.userId,
        'USER_CREATED',
        'Users',
        newUser.userId,
        {},
        newUser
      );

      return newUser;
    });

    // Was gated on PENDING. Opening registration made every new account ACTIVE,
    // which silently switched this off — sign-ups stopped being reported at all.
    // A registration is worth knowing about whatever state it lands in.
    if (createdUser) {
      this.notifyAdminsOfNewPendingUser_(createdUser);
      this.sendWelcomeEmail_(createdUser);
    }

    return user;
  },

  registerPendingUser: function(profile) {
    profile = profile || {};

    var email      = normalizeEmail_(profile.email);
    var name       = String(profile.name || '').trim();
    var profession = String(profile.profession || 'PILOT').trim().toUpperCase();

    var validProfessions = ['PILOT', 'CONTROLLER', 'AMT', 'FIREFIGHTER', 'DRIVER'];
    if (validProfessions.indexOf(profession) === -1) profession = 'PILOT';

    if (!email || email.indexOf('@') === -1) {
      throw new Error('Enter a valid email.');
    }

    if (!name || name.split(/\s+/).length < 2) {
      throw new Error('Enter your full name.');
    }

    var createdUser = null;

    var user = dbWithScriptLock_(function() {
      var existing = dbFindOne_('Users', 'email', email);

      if (existing) {
        return existing;
      }

      var now = now_();
      var bootstrapAdminEmail = normalizeEmail_(
        PropertiesService.getScriptProperties().getProperty(CONFIG.PROP_BOOTSTRAP_ADMIN_EMAIL)
      );
      var isBootstrapAdmin = bootstrapAdminEmail && email === bootstrapAdminEmail;

      var newUser = {
        userId: uuid_('USR'),
        googleSub: 'email:' + email,
        email: email,
        name: name,
        profession: profession,
        role: isBootstrapAdmin ? ROLES.ADMIN : CONFIG.DEFAULT_NEW_USER_ROLE,
        status: isBootstrapAdmin ? USER_STATUS.ACTIVE : CONFIG.DEFAULT_NEW_USER_STATUS,
        currentLevel: 1,
        currentCountry: 'USA',
        assignedGroupId: '',
        totalLearningSeconds: 0,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: '',
        trialStartDate: now,
        firstFlightDone: false
      };

      dbAppend_('Users', newUser);
      createdUser = newUser;

      LogService.admin(
        newUser.userId,
        'USER_REGISTERED',
        'Users',
        newUser.userId,
        {},
        newUser
      );

      return newUser;
    });

    // Was gated on PENDING. Opening registration made every new account ACTIVE,
    // which silently switched this off — sign-ups stopped being reported at all.
    // A registration is worth knowing about whatever state it lands in.
    if (createdUser) {
      this.notifyAdminsOfNewPendingUser_(createdUser);
      this.sendWelcomeEmail_(createdUser);
    }

    return {
      user: user,
      created: !!createdUser
    };
  },

  getById: function(userId) {
    return dbFindOne_('Users', 'userId', userId);
  },

  touchLastLogin: function(userId) {
    var user = dbFindOne_('Users', 'userId', userId);

    if (!user) {
      return;
    }

    dbUpdateByRow_('Users', user.__rowNumber, {
      lastLoginAt: now_(),
      updatedAt: now_()
    });
  },

  listUsersForAdmin: function() {
    return dbReadAll_('Users').map(function(user) {
      return UserService.toPublicUser(user);
    });
  },

  notifyAdminsOfNewPendingUser_: function(user) {
    try {
      var adminEmails = this.getActiveAdminEmails_();

      if (!adminEmails.length) {
        return;
      }

      var appUrl = '';

      try {
        appUrl = ScriptApp.getService().getUrl();
      } catch (urlErr) {
        appUrl = '';
      }

      var subject = 'aerocomms — New pilot registered';
      var plainBody =
        'A new user has registered and their account is active.\n\n' +
        'Name: ' + (user.name || '') + '\n' +
        'Email: ' + (user.email || '') + '\n' +
        'Role: ' + (user.role || '') + '\n' +
        'Status: ' + (user.status || '') + '\n' +
        'Created at: ' + (user.createdAt || '') + '\n\n' +
        (appUrl ? 'Open the admin panel: ' + appUrl + '\n\n' : '') +
        'Approve or block this user from Admin > Users.';

      var htmlBody = _emailWrap_(
        '<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">' +
          '<tr>' +
            '<td style="vertical-align:middle;padding-right:16px;">' +
              '<img src="cid:aerocommsLogo" alt="aerocomms" style="width:140px;height:82px;border-radius:8px;object-fit:contain;background:#000;border:2px solid rgba(0,212,142,0.3);display:block;">' +
            '</td>' +
            '<td style="vertical-align:middle;">' +
              '<div style="font-size:10px;font-weight:800;letter-spacing:2px;color:#ffffff;margin-bottom:3px;">aerocomms</div>' +
              '<div style="font-size:18px;font-weight:700;color:#dde6f0;">New pilot registered</div>' +
            '</td>' +
          '</tr>' +
        '</table>' +
        '<p style="margin:0 0 20px;font-size:14px;color:#8fa3bb;line-height:1.6;">A new user registered. Their account is active on the free tier — no approval needed.</p>' +
        '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 24px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:10px;overflow:hidden;">' +
          '<tr style="border-bottom:1px solid rgba(255,255,255,0.06);">' +
            '<td style="padding:10px 16px;font-size:12px;color:#4a6280;white-space:nowrap;">Name</td>' +
            '<td style="padding:10px 16px;font-size:13px;font-weight:600;color:#dde6f0;">' + this.escapeHtml_(user.name || '') + '</td>' +
          '</tr>' +
          '<tr style="border-bottom:1px solid rgba(255,255,255,0.06);">' +
            '<td style="padding:10px 16px;font-size:12px;color:#4a6280;white-space:nowrap;">Email</td>' +
            '<td style="padding:10px 16px;font-size:13px;font-weight:600;color:#dde6f0;">' + this.escapeHtml_(user.email || '') + '</td>' +
          '</tr>' +
          '<tr style="border-bottom:1px solid rgba(255,255,255,0.06);">' +
            '<td style="padding:10px 16px;font-size:12px;color:#4a6280;white-space:nowrap;">Role</td>' +
            '<td style="padding:10px 16px;font-size:13px;font-weight:600;color:#dde6f0;">' + this.escapeHtml_(user.role || '') + '</td>' +
          '</tr>' +
          '<tr style="border-bottom:1px solid rgba(255,255,255,0.06);">' +
            '<td style="padding:10px 16px;font-size:12px;color:#4a6280;white-space:nowrap;">Status</td>' +
            '<td style="padding:10px 16px;font-size:13px;font-weight:700;color:#f59e0b;">' + this.escapeHtml_(user.status || '') + '</td>' +
          '</tr>' +
          '<tr>' +
            '<td style="padding:10px 16px;font-size:12px;color:#4a6280;white-space:nowrap;">Registered</td>' +
            '<td style="padding:10px 16px;font-size:13px;font-weight:600;color:#dde6f0;">' + this.escapeHtml_(user.createdAt || '') + '</td>' +
          '</tr>' +
        '</table>' +
        (appUrl
          ? '<table cellpadding="0" cellspacing="0"><tr><td style="background:#101d33;border-radius:9px;"><a href="' + this.escapeHtml_(appUrl) + '" style="display:inline-block;padding:12px 24px;font-size:13px;font-weight:800;color:#07101e;text-decoration:none;letter-spacing:0.5px;">Open admin panel &#8594;</a></td></tr></table>'
          : '') +
        '<p style="margin:20px 0 0;font-size:12px;color:#2d4a63;">Approve or block this user from Admin &gt; Users.</p>'
      );

      var logoBase64 = getLogoDataUrl().split(',')[1];
      var logoBlob   = Utilities.newBlob(Utilities.base64Decode(logoBase64), 'image/png', 'logo.png');

      MailApp.sendEmail({
        to:           adminEmails.join(','),
        subject:      subject,
        body:         plainBody,
        htmlBody:     htmlBody,
        inlineImages: { aerocommsLogo: logoBlob }
      });

      LogService.admin(
        user.userId,
        'NEW_USER_ADMIN_NOTIFICATION_SENT',
        'Users',
        user.userId,
        {},
        { recipients: adminEmails, userEmail: user.email }
      );
    } catch (err) {
      Logger.log('[notifyAdminsOfNewPendingUser_] ' + (err && err.message ? err.message : err));
    }
  },

  getActiveAdminEmails_: function() {
    var emailMap = {};
    var bootstrapAdminEmail = normalizeEmail_(
      PropertiesService.getScriptProperties().getProperty(CONFIG.PROP_BOOTSTRAP_ADMIN_EMAIL)
    );

    if (bootstrapAdminEmail) {
      emailMap[bootstrapAdminEmail] = true;
    }

    dbReadAll_('Users').forEach(function(row) {
      var role = String(row.role || '').toUpperCase();
      var status = String(row.status || '').toUpperCase();
      var email = normalizeEmail_(row.email);

      if (email && role === ROLES.ADMIN && status === USER_STATUS.ACTIVE) {
        emailMap[email] = true;
      }
    });

    return Object.keys(emailMap);
  },

  escapeHtml_: function(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  updateUserByAdmin: function(payload, adminUser) {
    if (!payload || !payload.userId) {
      throw new Error('Missing userId.');
    }

    var allowedRoles = [ROLES.ADMIN, ROLES.INSTRUCTOR, ROLES.STUDENT];
    var allowedStatus = [USER_STATUS.ACTIVE, USER_STATUS.PENDING, USER_STATUS.BLOCKED];

    if (payload.role && allowedRoles.indexOf(payload.role) === -1) {
      throw new Error('Invalid role.');
    }

    if (payload.status && allowedStatus.indexOf(payload.status) === -1) {
      throw new Error('Invalid status.');
    }

    var activatedUser = null;

    var updated = dbWithScriptLock_(function() {
      var user = dbFindOne_('Users', 'userId', payload.userId);

      if (!user) {
        throw new Error('User not found.');
      }

      var before = mergeObjects_({}, user);

      var patch = {
        updatedAt: now_()
      };

      if (payload.role) {
        patch.role = payload.role;
      }

      if (payload.status) {
        patch.status = payload.status;
      }

      if (payload.assignedGroupId !== undefined) {
        patch.assignedGroupId = payload.assignedGroupId;
      }

      if (payload.currentLevel !== undefined) {
        patch.currentLevel = payload.currentLevel;
      }

      if (payload.currentCountry !== undefined) {
        patch.currentCountry = payload.currentCountry;
      }

      dbUpdateByRow_('Users', user.__rowNumber, patch);

      var result = mergeObjects_(user, patch);

      if (
        String(before.status || '').toUpperCase() !== USER_STATUS.ACTIVE &&
        String(result.status || '').toUpperCase() === USER_STATUS.ACTIVE
      ) {
        activatedUser = result;
      }

      LogService.admin(
        adminUser.userId,
        'USER_UPDATED',
        'Users',
        result.userId,
        before,
        result
      );

      return result;
    });

    if (activatedUser) {
      this.notifyUserOfActivation_(activatedUser);
    }

    return updated;
  },

  /* ─── Welcome ──────────────────────────────────────────────────────────────
   * Sent once, on registration.
   *
   * Until now a new account received nothing but a six-digit login code with no
   * context — someone signed up, typed a number, and arrived with no idea what
   * they had. That was survivable when every account was approved by hand and a
   * human was in the loop. Registration is open now and the free tier is the shop
   * window, so this is the one moment we have their attention outside the app.
   *
   * Three jobs, in order of what actually helps them: say what they already have,
   * get the app onto their phone, and only then mention what the plans add. Led
   * with the price it would read as an invoice rather than a welcome.
   *
   * Never throws. A failed welcome must not fail a registration — the account is
   * the thing that matters, and an email can be resent.
   * ───────────────────────────────────────────────────────────────────────── */
  sendWelcomeEmail_: function(user) {
    try {
      if (!user || !user.email) return;

      // The live domain is a Vercel setting and appears nowhere in this repo, so
      // it is read from a Script Property. Set APP_URL there and a domain change
      // never needs a deploy. The fallback is only so a fresh install still sends
      // a working link.
      var appUrl = '';
      try {
        appUrl = String(PropertiesService.getScriptProperties().getProperty('APP_URL') || '').trim();
      } catch (e) {}
      if (!appUrl) appUrl = 'https://aerocomms.vercel.app';
      var installUrl = appUrl.replace(/\/+$/, '') + '/install';

      var firstName = String(user.name || '').trim().split(/\s+/)[0] || '';
      var greeting  = firstName ? 'Welcome, ' + firstName + '.' : 'Welcome.';

      function row(icon, title, text) {
        return '<tr><td style="padding:0 0 14px;">' +
          '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>' +
            '<td width="26" valign="top" style="font-size:16px;line-height:1.4;">' + icon + '</td>' +
            '<td valign="top" style="font-size:14px;line-height:1.55;color:#c8d3e0;">' +
              '<strong style="color:#ffffff;">' + title + '</strong><br>' +
              '<span style="color:#8fa3bb;">' + text + '</span>' +
            '</td>' +
          '</tr></table></td></tr>';
      }

      var htmlBody = _emailWrap_(
        '<p style="margin:0 0 4px;font-size:11px;font-weight:800;letter-spacing:2.5px;' +
          'color:#ffffff;text-align:center;">aerocomms</p>' +
        '<p style="margin:0 0 22px;font-size:12px;color:#7d8ea3;letter-spacing:1px;' +
          'text-align:center;">Aviation English Interactive Campus</p>' +

        '<h1 style="margin:0 0 10px;font-size:22px;line-height:1.3;color:#ffffff;">' +
          greeting + '</h1>' +
        '<p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#c8d3e0;">' +
          'Your account is ready — there is nothing to approve and nothing to pay. ' +
          'Here is what you can do right now:</p>' +

        '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">' +
          row('✈️', 'Level 1 of the ATC radio simulator',
              'Real clearances read by real controller voices. You fly the aircraft and work the radio at the same time.') +
          row('📝', 'One full ICAO mock test',
              'The complete examination, marked against all six ICAO descriptors.') +
        '</table>' +

        '<p style="margin:18px 0 22px;font-size:13px;line-height:1.6;color:#8fa3bb;">' +
          'The free plan does not expire. Take your time.</p>' +

        '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ' +
          'style="background:#101d33;border:1px solid #1d2f4d;border-radius:12px;margin:0 0 22px;">' +
          '<tr><td style="padding:18px 20px;">' +
            '<p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#ffffff;">' +
              'Put it on your phone</p>' +
            '<p style="margin:0 0 14px;font-size:13px;line-height:1.6;color:#8fa3bb;">' +
              'Opens full screen, works without signal, and remembers you. Two taps.</p>' +
            '<a href="' + installUrl + '" ' +
              'style="display:inline-block;background:#ffffff;color:#0b1220;text-decoration:none;' +
              'font-size:14px;font-weight:800;padding:12px 24px;border-radius:10px;">' +
              'Add aerocomms to my phone</a>' +
          '</td></tr>' +
        '</table>' +

        '<p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#8fa3bb;">' +
          'When you are ready for more, the paid plans open the rest of the levels, ' +
          'add emergency scenarios and give you more attempts at the mock test. ' +
          'You will find them inside the app — no rush.</p>' +

        '<p style="margin:22px 0 0;font-size:13px;line-height:1.6;color:#8fa3bb;">' +
          'Reply to this email if anything is unclear. A person reads it.</p>' +

        '<p style="margin:26px 0 0;text-align:center;">' +
          '<a href="' + appUrl + '" style="color:#ffffff;text-decoration:none;font-size:14px;' +
            'font-weight:700;">Open aerocomms →</a></p>'
      );

      var plainBody =
        greeting + '\n\n' +
        'Your account is ready. Nothing to approve, nothing to pay.\n\n' +
        'On the free plan you get:\n' +
        '  - Level 1 of the ATC radio simulator\n' +
        '  - One full ICAO mock test, marked on all six descriptors\n' +
        'It does not expire.\n\n' +
        'Put it on your phone: ' + installUrl + '\n\n' +
        'When you are ready, the paid plans open the rest of the levels, add ' +
        'emergency scenarios and give you more mock test attempts.\n\n' +
        'Open aerocomms: ' + appUrl + '\n\n' +
        'Reply to this email if anything is unclear.';

      MailApp.sendEmail({
        to:       user.email,
        subject:  'aerocomms — Welcome aboard',
        body:     plainBody,
        htmlBody: htmlBody
      });
    } catch (err) {
      // Logged, never thrown. An account that exists without a welcome is a minor
      // problem; a registration that fails because an email did is not.
      Logger.log('[sendWelcomeEmail_] ' + (err && err.message ? err.message : err));
    }
  },

  notifyUserOfActivation_: function(user) {
    try {
      var props = PropertiesService.getScriptProperties();
      var appUrl =
        props.getProperty('APP_URL') ||
        props.getProperty('WEB_APP_URL') ||
        props.getProperty('APP_DEPLOY_URL') ||
        '';
      if (!appUrl) {
        try { appUrl = ScriptApp.getService().getUrl(); } catch(e) {}
      }

      var subject = 'aerocomms — Your account is now active';

      var plainBody =
        'Hello ' + (user.name || user.email) + ',\n\n' +
        'Great news — your account has been approved and is now active.\n\n' +
        'You can now log in to ' + CONFIG.APP_NAME + ' and start practicing your ATC read-backs.\n\n' +
        (appUrl ? 'Log in here: ' + appUrl + '\n\n' : '') +
        'Welcome aboard!';

      var htmlBody = _emailWrap_(
        '<table width="100%" cellpadding="0" cellspacing="0" style="text-align:center;margin-bottom:28px;">' +
          '<tr><td>' +
            '<img src="cid:aerocommsLogo" alt="aerocomms" style="width:160px;height:93px;border-radius:8px;object-fit:contain;background:#000;border:2px solid rgba(0,212,142,0.35);">' +
          '</td></tr>' +
          '<tr><td style="padding-top:14px;font-size:10px;font-weight:800;letter-spacing:2.5px;color:#ffffff;">aerocomms</td></tr>' +
          '<tr><td style="padding-top:4px;font-size:12px;color:#4a6280;letter-spacing:1px;">Aviation English Interactive Campus</td></tr>' +
        '</table>' +
        '<div style="background:rgba(0,212,142,0.07);border:1px solid rgba(0,212,142,0.2);border-radius:12px;padding:20px 24px;margin:0 0 24px;text-align:center;">' +
          '<div style="font-size:28px;margin-bottom:8px;">&#10003;</div>' +
          '<div style="font-size:16px;font-weight:700;color:#ffffff;">Account Approved</div>' +
        '</div>' +
        '<p style="margin:0 0 8px;font-size:15px;color:#dde6f0;">Hello, <strong>' + this.escapeHtml_(user.name || user.email) + '</strong></p>' +
        '<p style="margin:0 0 24px;font-size:14px;color:#8fa3bb;line-height:1.7;">Your account has been approved by an administrator. You can now log in and start practising your ATC phraseology on the ICAO Simulator.</p>' +
        (appUrl
          ? '<table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;"><tr><td style="background:#101d33;border-radius:9px;"><a href="' + this.escapeHtml_(appUrl) + '" style="display:inline-block;padding:13px 28px;font-size:13px;font-weight:800;color:#07101e;text-decoration:none;letter-spacing:0.5px;">Open ICAO Trainer &#8594;</a></td></tr></table>'
          : '') +
        '<p style="margin:0;font-size:12px;color:#2d4a63;text-align:center;">If you did not register for this service, you can safely ignore this email.</p>'
      );

      var logoBase64Act = getLogoDataUrl().split(',')[1];
      var logoBlobAct   = Utilities.newBlob(Utilities.base64Decode(logoBase64Act), 'image/png', 'logo.png');
      MailApp.sendEmail({
        to: user.email,
        subject: subject,
        body: plainBody,
        htmlBody: htmlBody,
        inlineImages: { aerocommsLogo: logoBlobAct }
      });

      LogService.admin(
        user.userId,
        'USER_ACTIVATION_EMAIL_SENT',
        'Users',
        user.userId,
        {},
        { recipient: user.email }
      );
    } catch (err) {
      Logger.log('[notifyUserOfActivation_] ' + (err && err.message ? err.message : err));
    }
  },

  deleteUserByAdmin: function(payload, adminUser) {
    if (!payload || !payload.userId) {
      throw new Error('Missing userId.');
    }

    return dbWithScriptLock_(function() {
      var user = dbFindOne_('Users', 'userId', payload.userId);

      if (!user) {
        throw new Error('User not found.');
      }

      if (adminUser && adminUser.userId === user.userId) {
        throw new Error('You cannot delete your own user.');
      }

      var role = String(user.role || '').toUpperCase();
      var status = String(user.status || '').toUpperCase();

      if (role === ROLES.ADMIN && status === USER_STATUS.ACTIVE) {
        var remainingActiveAdmins = dbReadAll_('Users').filter(function(row) {
          return row.userId !== user.userId &&
            String(row.role || '').toUpperCase() === ROLES.ADMIN &&
            String(row.status || '').toUpperCase() === USER_STATUS.ACTIVE;
        });

        if (!remainingActiveAdmins.length) {
          throw new Error('Cannot delete the last active admin.');
        }
      }

      var before = mergeObjects_({}, user);
      dbDeleteByRow_('Users', user.__rowNumber);

      LogService.admin(
        adminUser.userId,
        'USER_DELETED',
        'Users',
        user.userId,
        before,
        {}
      );

      return before;
    });
  },

  toPublicUser: function(user) {
    return {
      userId:               user.userId,
      email:                user.email,
      name:                 user.name,
      role:                 user.role,
      status:               user.status,
      currentLevel:         Number(user.currentLevel || 1),
      currentCountry:       user.currentCountry || 'USA',
      assignedGroupId:      user.assignedGroupId || '',
      totalLearningSeconds: Number(user.totalLearningSeconds || 0),
      createdAt:            user.createdAt || '',
      lastLoginAt:          user.lastLoginAt || '',
      trialStartDate:       user.trialStartDate || '',
      firstFlightDone:      lmsBool_(user.firstFlightDone),
      profession:   String(user.profession  || 'PILOT').toUpperCase(),
      // B2B enrichment — empty string for standard B2C accounts
      companyId:    String(user.companyId   || ''),
      licenseType:  String(user.licenseType || ''),
      cohortId:     String(user.assignedGroupId || ''), // semantic alias; instructorId injected by apiGetMe
      instructorId: ''
    };
  }
};

// ─── Bulk invite ─────────────────────────────────────────────────────────────
// Edit INVITE_LIST below, then run bulkInviteUsers() once from the editor.
// Each entry: { email: '...', name: '...', role: 'STUDENT' }
// role can be 'STUDENT', 'INSTRUCTOR', or 'ADMIN'

var INVITE_LIST = [
  { email: 'n40r1799@gmail.com',                  name: 'Nicolas Orjuela',              role: 'STUDENT' },
  { email: 'villawolf9912@gmail.com',              name: 'Valentina Villalobos',         role: 'STUDENT' },
  { email: 'asanzamo@hotmail.es',                  name: 'Aniuska Tayn Sánchez',         role: 'STUDENT' },
  { email: 'ivan_ruiz45@live.com',                 name: 'Ivan Ruiz',                    role: 'STUDENT' },
  { email: 'eduardoaugustogm96@gmail.com',         name: 'Eduardo Gómez',                role: 'STUDENT' },
  { email: 'diegofer1999.df@gmail.com',            name: 'Diego Fernandez',              role: 'STUDENT' },
  { email: 'angelabarragan381@gmail.com',          name: 'Angela Barragán',              role: 'STUDENT' },
  { email: 'inzuazty@gmail.com',                   name: 'Harry Castañeda',              role: 'STUDENT' },
  { email: 'edwinmoquete29@gmail.com',             name: 'Edwin Moquete',                role: 'STUDENT' },
  { email: 'jdiegolr95@gmail.com',                 name: 'Juan Rua',                     role: 'STUDENT' },
  { email: 'juanpgarciaguzman@hotmail.com',        name: 'Juan Garcia',                  role: 'STUDENT' },
  { email: 'pablitoborreh@hotmail.com',            name: 'Pablo Borré Hernández',        role: 'STUDENT' },
  { email: 'angel2601go@gmail.com',                name: 'Juan Ángel Garcia',            role: 'STUDENT' },
  { email: 'aepb41067@gmail.com',                  name: 'Esteban Buitrago',             role: 'STUDENT' },
  { email: 'angelicaac1320@gmail.com',             name: 'Angelica Alvarez',             role: 'STUDENT' },
  { email: 'andres.ortega.mahecha@gmail.com',      name: 'Andres Ortega',                role: 'STUDENT' },
  { email: 'luisfierro94@hotmail.com',             name: 'Luis Fierro',                  role: 'STUDENT' },
  { email: 'juan.hurtado55@hotmail.com',           name: 'Juan Hurtado',                 role: 'STUDENT' },
  { email: 'jdrp147@hotmail.com',                  name: 'Javier David Rueda Pulido',    role: 'STUDENT' },
  { email: 'dhernandez202120@gmail.com',           name: 'David Hernandez',              role: 'STUDENT' },
  { email: 'jebs.ceo@gmail.com',                   name: 'Edward Blanquicett',           role: 'STUDENT' },
  { email: 'conde.pilot@outlook.com',              name: 'Marco Barrera',                role: 'STUDENT' },
  { email: 'rogger8792@gmail.com',                 name: 'Rogger Robayo',                role: 'STUDENT' },
  { email: 'marianaromej25@gmail.com',             name: 'Mariana Romero',               role: 'STUDENT' },
  { email: 'sadidv1@hotmail.com',                  name: 'Jose Valencia',                role: 'STUDENT' },
  { email: 'sadidv1@gmail.com',                    name: 'Jose Sadid Valencia Oidor',    role: 'STUDENT' },
  { email: 'julioduranfac@hotmail.com',            name: 'Julio Duran',                  role: 'STUDENT' },
  { email: 'juanes120502@gmail.com',               name: 'Juan Esteban Cespedes',        role: 'STUDENT' },
  { email: 'rubencuadros185@gmail.com',            name: 'Ruben Cuadros',                role: 'STUDENT' },
];

function bulkInviteUsers() {
  var appUrl  = 'https://www.icaoaerocomms.com/';

  var results = { created: [], skipped: [], failed: [] };

  INVITE_LIST.forEach(function(entry) {
    var email = normalizeEmail_(entry.email || '');
    var name  = String(entry.name  || '').trim();
    var role  = String(entry.role  || 'STUDENT').toUpperCase();

    if (!email || email.indexOf('@') === -1) {
      results.failed.push({ email: email, reason: 'Invalid email' });
      return;
    }
    if (!name) {
      results.failed.push({ email: email, reason: 'Missing name' });
      return;
    }
    if (!ROLES[role]) role = ROLES.STUDENT;

    try {
      var created = false;
      var user = dbWithScriptLock_(function() {
        var existing = dbFindOne_('Users', 'email', email);
        if (existing) return existing;

        var now     = now_();
        var newUser = {
          userId:               uuid_('USR'),
          googleSub:            'email:' + email,
          email:                email,
          name:                 name,
          role:                 role,
          status:               USER_STATUS.ACTIVE,
          currentLevel:         1,
          currentCountry:       'USA',
          assignedGroupId:      '',
          totalLearningSeconds: 0,
          createdAt:            now,
          updatedAt:            now,
          lastLoginAt:          ''
        };
        dbAppend_('Users', newUser);
        created = true;
        LogService.admin(newUser.userId, 'USER_BULK_INVITED', 'Users', newUser.userId, {}, newUser);
        return newUser;
      });

      if (!created) {
        results.skipped.push({ email: email, reason: 'Already exists' });
        return;
      }

      // Send invite email
      var subject  = 'You\'ve been invited to ' + CONFIG.APP_NAME;
      var greeting = 'Hello, ' + name.split(' ')[0] + '!';

      var plainBody =
        greeting + '\n\n' +
        'You have been invited to ' + CONFIG.APP_NAME + ' — an ATC phraseology simulator.\n\n' +
        'Your account is ready. Sign in with your Google account (' + email + ') at the link below:\n\n' +
        (appUrl ? appUrl + '\n\n' : '') +
        'Welcome aboard!';

      var htmlBody = _emailWrap_(
        '<table width="100%" cellpadding="0" cellspacing="0" style="text-align:center;margin-bottom:28px;">' +
          '<tr><td>' +
            '<img src="cid:aerocommsLogo" alt="aerocomms" style="width:160px;height:93px;border-radius:8px;object-fit:contain;background:#000;border:2px solid rgba(0,212,142,0.35);">' +
          '</td></tr>' +
          '<tr><td style="padding-top:14px;font-size:10px;font-weight:800;letter-spacing:2.5px;color:#ffffff;">aerocomms</td></tr>' +
          '<tr><td style="padding-top:4px;font-size:12px;color:#4a6280;letter-spacing:1px;">Aviation English Interactive Campus</td></tr>' +
        '</table>' +
        '<div style="background:rgba(0,212,142,0.07);border:1px solid rgba(0,212,142,0.2);border-radius:12px;padding:20px 24px;margin:0 0 24px;text-align:center;">' +
          '<div style="font-size:28px;margin-bottom:8px;">&#9992;</div>' +
          '<div style="font-size:16px;font-weight:700;color:#ffffff;">You\'ve been invited</div>' +
        '</div>' +
        '<p style="margin:0 0 8px;font-size:15px;color:#dde6f0;">Hello, <strong>' + UserService.escapeHtml_(name) + '</strong></p>' +
        '<p style="margin:0 0 24px;font-size:14px;color:#8fa3bb;line-height:1.7;">' +
          'Your account on <strong>' + CONFIG.APP_NAME + '</strong> is ready. ' +
          'Sign in with your Google account (<strong>' + UserService.escapeHtml_(email) + '</strong>) to get started.' +
        '</p>' +
        (appUrl
          ? '<table cellpadding="0" cellspacing="0" style="margin:0 auto 24px;"><tr><td style="background:#101d33;border-radius:9px;">' +
              '<a href="' + UserService.escapeHtml_(appUrl) + '" style="display:inline-block;padding:13px 28px;font-size:13px;font-weight:800;color:#07101e;text-decoration:none;letter-spacing:0.5px;">Open ' + CONFIG.APP_NAME + ' &#8594;</a>' +
            '</td></tr></table>'
          : '') +
        '<p style="margin:0;font-size:12px;color:#2d4a63;text-align:center;">If you were not expecting this invitation, you can safely ignore this email.</p>'
      );

      var logoBase64Inv = getLogoDataUrl().split(',')[1];
      var logoBlobInv   = Utilities.newBlob(Utilities.base64Decode(logoBase64Inv), 'image/png', 'logo.png');
      MailApp.sendEmail({ to: email, subject: subject, body: plainBody, htmlBody: htmlBody, inlineImages: { aerocommsLogo: logoBlobInv } });
      results.created.push({ email: email, name: name, role: role });

    } catch(err) {
      results.failed.push({ email: email, reason: err && err.message ? err.message : String(err) });
    }
  });

  Logger.log('=== BULK INVITE RESULTS ===');
  Logger.log('Created & invited : ' + results.created.length);
  Logger.log('Skipped (exists)  : ' + results.skipped.length);
  Logger.log('Failed            : ' + results.failed.length);
  if (results.failed.length)  Logger.log('Failures: '  + JSON.stringify(results.failed));
  if (results.skipped.length) Logger.log('Skipped: '   + JSON.stringify(results.skipped));
  Logger.log('Created: ' + JSON.stringify(results.created));
  return results;
}

function mergeObjects_(base, patch) {
  var output = {};

  Object.keys(base || {}).forEach(function(key) {
    output[key] = base[key];
  });

  Object.keys(patch || {}).forEach(function(key) {
    output[key] = patch[key];
  });

  return output;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * ONE-OFF — release the accounts stranded by the old approval gate.
 *
 * Registration used to create users as PENDING, waiting on an admin. Now it
 * creates them ACTIVE. That change does nothing for anyone who signed up before
 * it: they are still PENDING and still cannot log in, and nobody is coming to
 * approve them. These two functions find and release them.
 *
 * Run from the editor — Userservice.gs.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Reports who is stranded. Changes nothing. */
function checkPendingUsers() {
  var rows = dbReadAll_('Users').filter(function(u) {
    return String(u.status || '').toUpperCase() === 'PENDING';
  });
  if (!rows.length) {
    Logger.log('No PENDING users — nothing stranded.');
    return 'No PENDING users.';
  }
  var out = [rows.length + ' user(s) stuck on PENDING:'];
  rows.forEach(function(u) {
    out.push('  ' + (u.email || '(no email)') + '  ' + (u.name || '') +
             '  registered ' + (u.createdAt || '?'));
  });
  out.push('Run activateAllPendingUsers to release them.');
  var msg = out.join('\n');
  Logger.log(msg);
  return msg;
}

/**
 * Sets every PENDING user to ACTIVE. Safe to run twice — a user already ACTIVE
 * is not matched. BLOCKED users are deliberately untouched: blocking is a
 * decision someone made, not a queue they are waiting in.
 */
function activateAllPendingUsers() {
  var rows = dbReadAll_('Users').filter(function(u) {
    return String(u.status || '').toUpperCase() === 'PENDING';
  });
  if (!rows.length) {
    Logger.log('No PENDING users — nothing to do.');
    return 'Nothing to do.';
  }
  var stamp = now_();
  var done = 0;
  rows.forEach(function(u) {
    dbUpdateByRow_('Users', u.__rowNumber, { status: 'ACTIVE', updatedAt: stamp });
    done++;
  });
  var msg = 'Activated ' + done + ' user(s). They can now sign in on the free tier.';
  Logger.log(msg);
  return msg;
}
