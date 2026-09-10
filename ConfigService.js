var CONFIG = {
  APP_NAME: 'Aerocomms',
  APP_VERSION: '2.0.0',
  TIMEZONE: 'America/Bogota',

  PROP_DB_SPREADSHEET_ID: 'DB_SPREADSHEET_ID',
  PROP_GOOGLE_CLIENT_ID: 'GOOGLE_CLIENT_ID',
  PROP_BOOTSTRAP_ADMIN_EMAIL: 'BOOTSTRAP_ADMIN_EMAIL',

  DEFAULT_NEW_USER_ROLE: 'STUDENT',
  // Registration is open: a new account is usable immediately. It was PENDING,
  // which meant every sign-up waited on a human before it could do anything —
  // fine when the app was invitation-only, wrong now that the free tier is what
  // sells the subscription. Someone who cannot get in cannot be sold to.
  // Access is limited by entitlement (free tier vs plan), not by approval.
  DEFAULT_NEW_USER_STATUS: 'ACTIVE',

  SESSION_TTL_SECONDS: 2592000
};

/* How many replays unlock the ATC text when no level says otherwise.
 *
 * This literal was in seven places across two runtimes - four in Codigo.js, three
 * in the client - all reading 2 and none of them knowing about the others. They
 * agreed, which is not the same as being kept in agreement: moving the intended
 * default meant finding all seven, and missing one leaves the client gating at a
 * different number than the server reports, which is exactly the confusion
 * F-0015 was raised about.
 *
 * The real value is per-level, in Script Properties under LEVEL_CONFIG_<n>. This
 * is only what answers when that is unset or unreachable.
 *
 * The client keeps its own copy, and must: sites 6 and 7 there are the fallback
 * for when the server is the thing that failed, so they cannot read this. Two
 * constants, one per runtime, both named the same thing - so a grep for
 * REPLAY_THRESHOLD finds every place the default lives. */
var DEFAULT_REPLAY_THRESHOLD = 2;

var ROLES = {
  ADMIN: 'ADMIN',
  INSTRUCTOR: 'INSTRUCTOR',
  STUDENT: 'STUDENT'
};

var USER_STATUS = {
  ACTIVE: 'ACTIVE',
  PENDING: 'PENDING',
  BLOCKED: 'BLOCKED'
};

var DB_SCHEMA = {
  Users: [
    'userId',
    'googleSub',
    'email',
    'name',
    'role',
    'status',
    'currentLevel',
    'currentCountry',
    'assignedGroupId',
    'totalLearningSeconds',
    'createdAt',
    'updatedAt',
    'lastLoginAt',
    'companyId',
    'licenseType',
    'profession',
    'trialStartDate',
    'firstFlightDone'
  ],

  Groups: [
    'groupId',
    'groupName',
    'instructorId',
    'status',
    'createdAt',
    'updatedAt'
  ],

  /* What a level IS, as data rather than as code.
   *
   * Level 10 had eight working scenarios, passed every content check, and rendered as
   * an anonymous grey card reading "Training Level" — because its name, icon and
   * description lived in LEVEL_THEMES in the client and nobody had added a tenth
   * entry. Adding a level meant editing two files and deploying.
   *
   * A level is now a row. `group` is what the student sees on the front: levels
   * sharing one open together under a single card, so 10 to 20 can present as
   * "Operational" without eleven cards on the home screen. */
  Levels: [
    'level',        // the number the scenarios carry
    'name',         // "Emergency Procedures"
    'icon',         // one emoji
    'tag',          // the short label on the card
    'description',  // one sentence
    'accent',       // hex, or blank to inherit the group's
    'groupKey',     // FOUNDATION | OPERATIONAL — blank means it stands alone
    'groupName',    // "Operational" — what the shared card is called
    'phases',       // comma-separated, shown on the card
    'isActive',
    'createdAt',
    'updatedAt'
  ],

  Scenarios: [
    'scenarioId',
    'scenarioOrder',
    'level',
    'country',
    'flightScenarioId',
    'flightScenarioName',
    'phaseCode',
    'phaseName',
    'phaseOrder',
    'scenarioType',
    'emergencyType',
    'context',
    'atcText',
    'expectedReadback',
    'keywords',
    'imageFileId',
    'videoUrl',
    'audioUrl',
    'isActive',
    'version',
    'createdBy',
    'createdAt',
    'updatedAt',
    // Columns 24-27 already exist in the sheet and were simply never declared here.
    // Because dbReadAll_ maps by POSITION, an undeclared column is invisible — and
    // the next field appended to this list lands on top of it, which is exactly what
    // targetAltitude did to phaseLabel. Declared in the order the sheet holds them.
    'phaseLabel',
    // col25 carries a blank header in the sheet and unknown contents. Named only so
    // that appending a real field does not land on it; nothing reads it.
    'legacyColumn25',
    'emergencyTriggerPhase',
    'keywordsText',
    // The altitude ATC instructed, stated rather than inferred. It drives the
    // deviation warning and the analytics behind it, so it is assessment data and
    // should not be re-derived from prose on every run.
    'targetAltitude'
  ],

  Attempts: [
    'attemptId',
    'userId',
    'groupId',
    'scenarioId',
    'level',
    'country',
    'atcText',
    'studentAnswer',
    'expectedAnswer',
    'keywordsOk',
    'keywordsMissing',
    'score',
    'correct',
    'responseTimeSec',
    'attemptNumber',
    'createdAt',
    'replayCount',
    'phaseCode',
    'sessionId',
    // Appended, never inserted. dbAppend_ writes by column INDEX, so a field placed
    // mid-schema would silently reassign the meaning of every existing row.
    //
    // Whether a pilot ACTS on a clearance is part of what an ICAO test measures, and
    // the simulator was already watching it — the drift alarm knew the deviation and
    // the correction time and threw both away. An attempt row now carries the whole
    // picture: was the read-back right, how long they took to say it, how many times
    // they needed to hear it, and whether they flew what they had just read back.
    'altDeviationFt',    // worst deviation from the cleared altitude, in feet
    'altSecondsOff',     // total seconds spent outside the tolerance
    // How obstructed the radio was, 0 to 1, from the level. Recorded so the question
    // "does harder radio produce more replays" can be answered from the data rather
    // than argued about — replayCount is already on the row beside it.
    'radioDifficulty'
  ],

  Progress: [
    'progressId',
    'userId',
    'level',
    'country',
    'completedScenarios',
    'totalScenarios',
    'progressPct',
    'scoreAvg',
    'unlocked',
    'completed',
    'completedAt',
    'updatedAt',
    'firstAttemptRate',
    'avgCompleteness',
    'consistencyScore',
    'avgReplays',
    'performanceScore',
    'trendScore',
    'trendLabel',
    // Share of phases answered correctly first time in the run that set scoreAvg.
    // Appended, never inserted: dbAppend_ writes by column index.
    'sessionFirstTryPct'
],

  LearningTime: [
    'sessionId',
    'userId',
    'startTime',
    'endTime',
    'durationSec',
    'level',
    'country',
    'createdAt'
  ],

  Certificates: [
    'certificateId',
    'userId',
    'level',
    'country',
    'scoreAvg',
    'issuedAt',
    'pdfFileId',
    'validationCode'
  ],

  // The ICAO test item bank. These were hardcoded constants in the client, so
  // every candidate sat the identical 12 recordings in the identical order and
  // changing a word meant a code deploy. bank + isActive allow several sets.
  // Pre-rendered ATC audio for the simulator. Keyed on the LINE rather than the
  // scenario: the same clearance can recur across levels, and an identical line in
  // the same voice is one file. Several rows per line is the point — a variant is
  // a different controller saying the same thing.
  ScenarioAudio: [
    'audioId',
    'textHash',      // fingerprint of the spoken text — an edited line re-renders
    'country',
    'voice',
    'speakingRate',
    'fileId',        // Drive
    'chars',
    'sample',        // first 60 characters, so the sheet is readable by a human
    'createdAt'
  ],

  /* Sessions were never persisted.
   *
   * createSession writes to CacheService and then to this sheet as a "fallback
   * that survives cache eviction". That write has never once succeeded: the sheet
   * had no schema entry, so dbAppend_ threw on every login, and the throw was
   * swallowed by a try/catch that assumed the cache was enough.
   *
   * It is not. CacheService caps a TTL at six hours, so the thirty-day session
   * token was backed by at most six hours of storage — and less whenever the cache
   * was evicted, which a cache is entitled to do at any time. That is why signing
   * in did not last: not a slow server, not the home cache, the session itself.
   */
  Sessions: [
    'token',
    'userId',
    'email',
    'role',
    'createdAt',
    'expiresAt'
  ],

  IcaoTestItems: [
    'itemId',
    'bank',
    'itemType',
    'section',
    'orderIndex',
    'voice',
    'lang',
    'script',
    'transcript',
    'label',
    'imageUrl',
    'description',
    'isActive',
    'createdAt',
    'updatedAt',
    'audioFileId',
    // Seconds of answer time this row opens for the candidate. Blank or 0 means
    // the row only plays and moves on — every intro, transition and closing line.
    // Timing lives beside the content so a new version is still only data entry.
    'answerSeconds'
  ],

  IcaoTestSectionReports: [
    'reportId',
    'userId',
    'bank',
    'scope',
    'section',
    'pronunciation',
    'structure',
    'vocabulary',
    'fluency',
    'comprehension',
    'interactions',
    'strength',
    'improve',
    'note',
    'createdAt'
  ],

  IcaoTestResults: [
    'resultId',
    'userId',
    'band',
    'bandLabel',
    'score',
    'replayAvg',
    'scenarioResultsJson',
    'completedAt',
    'retakeAuthorized'
  ],

  Testimonials: [
    'testimonialId',
    'name',
    'role',
    'rating',
    'text',
    'active',
    'sortOrder',
    'createdAt'
  ],

  AdminLogs: [
    'logId',
    'actorUserId',
    'action',
    'entity',
    'entityId',
    'beforeJson',
    'afterJson',
    'createdAt'
  ],

  ErrorLogs: [
    'errorId',
    'source',
    'message',
    'stack',
    'userId',
    'createdAt'
  ],

  Config: [
    'key',
    'value',
    'description',
    'updatedAt'
  ],
  LoginCodes: [
    'codeId',
    'email',
    'name',
    'codeHash',
    'status',
    'expiresAt',
    'attempts',
    'createdAt',
    'usedAt'
  ],

  ClientEvents: [
    'eventId',
    'timestamp',
    'userId',
    'email',
    'name',
    'role',
    'eventType',
    'level',
    'country',
    'scenarioType',
    'emergencyType',
    'flightScenarioId',
    'routeName',
    'scenarioId',
    'phaseCode',
    'metadata',
    'userAgent',
    'sessionId',
    'durationSec',
    'companyId',
    'cohortId',
    'instructorId',
    'licenseType',
    'eventVersion',
    'scenarioDifficulty',
    'workloadIndex'
  ],

  UserFeedback: [
    'feedbackId',
    'timestamp',
    'sessionId',
    'userId',
    'email',
    'role',
    'feedbackType',
    'difficulty',
    'exitReason',
    'wouldUseAgain',
    'freeText',
    'level',
    'country',
    'scenarioId',
    'phaseCode',
    'stars'
  ],

  Exams: [
    'examRowId',
    'userId',
    'examNum',
    'attemptNumber',
    'score',
    'passed',
    'routeId',
    'scenarioIds',
    'attemptedAt'
  ],

  Placement: [
    'placementId',
    'userId',
    'email',
    'name',
    'timestamp',
    'round1Score',
    'round2Score',
    'placedAtLevel'
  ],

  Modules: [
    'moduleId',
    'title',
    'topic',
    'description',
    'moduleOrder',
    'status',
    'badgeImageUrl',
    'evalTimeLimitMinutes',
    'createdAt',
    'updatedAt'
  ],

  ModuleVideos: [
    'videoId',
    'moduleId',
    'section',
    'youtubeUrl',
    'title',
    'videoOrder',
    'createdAt'
  ],

  ModuleQuiz: [
    'questionId',
    'moduleId',
    'section',
    'videoId',
    'questionOrder',
    'question',
    'optionsJson',
    'correctIndex',
    'explanation',
    'xpReward',
    'videoTimestamp',
    'questionType',
    'audioScript',
    'createdAt'
  ],

  ModuleQuizAnswers: [
    'userId',
    'quizId',
    'moduleId',
    'answeredAt'
  ],

  ModuleScenarios: [
    'linkId',
    'moduleId',
    'scenarioId',
    'createdAt'
  ],

  ModuleForum: [
    'postId',
    'moduleId',
    'section',
    'userId',
    'userName',
    'parentPostId',
    'body',
    'editedAt',
    'createdAt'
  ],

  ModuleForumLikes: [
    'likeId',
    'postId',
    'moduleId',
    'userId',
    'createdAt'
  ],

  ModuleProgress: [
    'progressId',
    'userId',
    'moduleId',
    'introVideoWatched',
    'introForumPosted',
    'introCompleted',
    'explanationVideosWatched',
    'explanationForumPosted',
    'quizScore',
    'quizLastAttemptAt',
    'quizAttempts',
    'quizPassed',
    'explanationCompleted',
    'grammarScore',
    'grammarAttempts',
    'grammarLastAttemptAt',
    'grammarPassed',
    'grammarCompletedAt',
    'listeningShortScore',
    'listeningShortAttempts',
    'listeningShortLastAttemptAt',
    'listeningShortPassed',
    'listeningLongScore',
    'listeningLongAttempts',
    'listeningLongLastAttemptAt',
    'listeningLongPassed',
    'listeningCompletedAt',
    'speakingSubmitted',
    'speakingScore',
    'speakingGraded',
    'speakingCompletedAt',
    'scenariosPassed',
    'applicationCompleted',
    'evalScore',
    'evalLastAttemptAt',
    'evalAttempts',
    'evalPassed',
    'evalBestScore',
    'quizBestScore',
    'grammarBestScore',
    'listeningShortBestScore',
    'listeningLongBestScore',
    'badgeEarned',
    'badgeEarnedAt',
    'timeSpentIntroSec',
    'timeSpentExplanationSec',
    'timeSpentApplicationSec',
    'timeSpentEvalSec',
    'completedAt',
    'updatedAt'
  ],

  UserActivity: [
    'userId',
    'totalActiveSeconds',
    'updatedAt'
  ],

  ModuleGrammar: [
    'exerciseId',
    'moduleId',
    'exerciseOrder',
    'type',
    'prompt',
    'optionsJson',
    'correctAnswer',
    'explanation',
    'xpReward',
    'createdAt'
  ],

  ModuleListening: [
    'clipId',
    'moduleId',
    'clipOrder',
    'format',
    'title',
    'script',
    'languageCode',
    'voiceName',
    'questionsJson',
    'createdAt'
  ],

  ModuleSpeakingPrompt: [
    'promptId',
    'moduleId',
    'promptOrder',
    'type',
    'title',
    'promptText',
    'imageUrl',
    'rubricJson',
    'createdAt'
  ],

  ModuleSpeakingSubmission: [
    'submissionId',
    'userId',
    'moduleId',
    'promptId',
    'responseText',
    'submittedAt',
    'status',
    'raterScore',
    'raterFeedback',
    'gradedAt',
    'raterId'
  ],

  LmsXp: [
    'userId',
    'lmsXp',
    'weeklyXp',
    'weeklyResetAt'
  ],

  UserStreaks: [
    'userId',
    'streakDays',
    'lastActiveAt',
    'longestStreak'
  ],
  DailyChallenge: [
    'Challenge_ID', 'Day_Index', 'Title', 'Country'
  ],
  DailyChallengeItems: [
    'Item_ID', 'Challenge_ID', 'Item_Order', 'Audio_Script',
    'Question_Text', 'Option_A', 'Option_B', 'Option_C', 'Option_D', 'Correct_Option'
  ],
  DailyChallengeLog: [
    'Log_ID', 'User_ID', 'Date', 'Challenge_ID', 'Completed', 'Items_Done', 'Timestamp'
  ],
  StreakFreezes: [
    'User_ID', 'Freezes', 'Updated_At'
  ]
};

function setProjectConfig() {
  // Replace with your corporate admin email, then run this function once in the Apps Script editor.
  var ADMIN_EMAIL = 'support@icaoaerocomms.com';

  if (ADMIN_EMAIL === 'YOUR_CORPORATE_EMAIL_HERE') {
    throw new Error('Edit setProjectConfig() and replace YOUR_CORPORATE_EMAIL_HERE with your actual admin email before running.');
  }

  PropertiesService.getScriptProperties().setProperties({
    BOOTSTRAP_ADMIN_EMAIL: ADMIN_EMAIL
  }, true);

  return 'Project config saved.';
}

function setupDatabase() {
  var props = PropertiesService.getScriptProperties();
  var spreadsheetId = props.getProperty(CONFIG.PROP_DB_SPREADSHEET_ID);
  var ss;

  if (spreadsheetId) {
    ss = dbGetSpreadsheet_();
  } else {
    ss = SpreadsheetApp.create(CONFIG.APP_NAME + ' - Database');
    props.setProperty(CONFIG.PROP_DB_SPREADSHEET_ID, ss.getId());
  }

  Object.keys(DB_SCHEMA).forEach(function(sheetName) {
    var sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }

    var headers = DB_SCHEMA[sheetName];

    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    } else {
      var currentHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0];
      var isEmptyHeader = currentHeaders.join('').trim() === '';

      if (isEmptyHeader) {
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      }
    }

    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#0f172a')
      .setFontColor('#ffffff');
  });

  seedInitialConfig_();

  return {
    ok: true,
    spreadsheetId: ss.getId(),
    url: ss.getUrl()
  };
}

function seedInitialConfig_() {
  var now = now_();

  var defaultConfig = [
    {
      key: 'MIN_SCORE_TO_UNLOCK',
      value: '70',
      description: 'Minimum score required to unlock next level or country.',
      updatedAt: now
    },
    {
      key: 'NEW_USERS_REQUIRE_APPROVAL',
      value: 'true',
      description: 'If true, new users remain PENDING until admin approval.',
      updatedAt: now
    },
    {
      key: 'DEFAULT_COUNTRY',
      value: 'USA',
      description: 'Default country/accent for new students.',
      updatedAt: now
    },
    {
      key: 'DEFAULT_LEVEL',
      value: '1',
      description: 'Default level for new students.',
      updatedAt: now
    }
  ];

  defaultConfig.forEach(function(item) {
    var existing = dbFindOne_('Config', 'key', item.key);
    if (!existing) {
      dbAppend_('Config', item);
    }
  });
}
/* setExistingDatabaseId() was here.
 *
 * It repointed the whole application at a new spreadsheet from an id pasted into the
 * source, and it was one of three such tools — the others lived in DatabaseHardFix.js
 * and Setupdatabasefix.js, both now deleted. All three did the same one-time migration
 * job, all three had already been run, and all three remained one careless Run away
 * from moving production onto a different database.
 *
 * Setting DB_SPREADSHEET_ID is a two-second edit in Project Settings → Script
 * Properties, where it is visible, audited, and not a function anyone can click by
 * accident while looking for something else. */
function setTtsConfig() {
  // Paste your new corporate Google Cloud TTS API key here, then run this function once.
  // Steps to get the key:
  //   1. Go to console.cloud.google.com → select your corporate project
  //   2. APIs & Services → Enable "Cloud Text-to-Speech API"
  //   3. Enable billing on the project (required for Neural2 / Wavenet voices)
  //   4. APIs & Services → Credentials → Create API Key
  var YOUR_TTS_API_KEY = 'PASTE_YOUR_NEW_API_KEY_HERE';

  if (YOUR_TTS_API_KEY === 'PASTE_YOUR_NEW_API_KEY_HERE') {
    throw new Error('Edit setTtsConfig() and replace PASTE_YOUR_NEW_API_KEY_HERE with your actual API key before running.');
  }

  PropertiesService.getScriptProperties().setProperty(
    'GOOGLE_TTS_API_KEY',
    YOUR_TTS_API_KEY
  );

  return 'TTS API key saved.';
}
/* The brand images are files, not literals.
 *
 * These two functions returned base64 data URLs: 250,510 and 88,850 characters,
 * 339,364 of the 366,555 bytes of this file. Ninety-two per cent of the heaviest
 * file in the project was two pictures.
 *
 * The logo was embedded three times in the initial document and the avatar once,
 * so about 751 KB of base64 shipped inside the HTML on every open. Gzip barely
 * helped — underneath is an already-compressed PNG, so it only recovered base64's
 * own expansion — and none of it was cacheable, because it lived inside the HTML.
 * sw.js is network-first for navigation on purpose, so that weight was paid every
 * single time the app was opened.
 *
 * They are now static files with content-hashed names, served by Vercel and
 * cacheable indefinitely. Rename the file when the picture changes and the hash
 * changes with it; test/brand-assets.test.js asserts the constants below match
 * the files actually on disk, so the two cannot drift apart in silence.
 *
 * Callers that need the BYTES — the seven emails that inline the logo — use
 * getLogoBlob_() below. An email cannot reference a URL of the app and expect it
 * to render. */
var BRAND_LOGO_FILE_   = '/brand/logo.d1689057.png';
var BRAND_AVATAR_FILE_ = '/brand/avatar.72df6915.png';

/* Where the app is served from.
 *
 * This is the FIFTH place in the project that works out a base URL, and that is
 * worth naming rather than hiding. The others are ScriptApp.getService().getUrl()
 * at Userservice 237 and 561, TourService 664 and 743, EnvService 92 and
 * Gamification 398, and an APP_URL property chain at Userservice 456 and 556 —
 * so some emails link to /exec and others to the Vercel domain.
 *
 * This one cannot use getService().getUrl(): Apps Script does not serve
 * /brand/logo.png. It follows the fullest of the existing chains rather than
 * inventing a sixth answer. Consolidating all of them is filed as its own ticket,
 * because it changes which URL students receive in emails and that is not this
 * ticket's business. */
function appBaseUrl_() {
  var url = '';
  try {
    var props = PropertiesService.getScriptProperties();
    url = String(props.getProperty('APP_URL') ||
                 props.getProperty('WEB_APP_URL') ||
                 props.getProperty('APP_DEPLOY_URL') || '').trim();
  } catch (e) {}
  if (!url) url = 'https://aerocomms.vercel.app';
  return url.replace(/\/+$/, '');
}

function getLogoUrl() {
  return appBaseUrl_() + BRAND_LOGO_FILE_;
}

/* The logo as bytes, for the seven emails that inline it.
 *
 * MailApp's inlineImages needs a Blob and the message is read outside the app, so
 * a URL into the app is no use. Fetched from the same static file the browser
 * gets, which keeps one copy of the picture rather than a second literal kept
 * here for email alone.
 *
 * Returns null rather than throwing. A brand image is not worth failing a
 * password email over: every caller sends without the logo instead. */
function getLogoBlob_() {
  try {
    var res = UrlFetchApp.fetch(getLogoUrl(), { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) {
      Logger.log('[brand] logo fetch returned ' + res.getResponseCode());
      return null;
    }
    return res.getBlob().setName('logo.png');
  } catch (e) {
    Logger.log('[brand] logo fetch failed: ' + e.message);
    return null;
  }
}

/* ───────────────────────────────────────────────────────────────────────────
 * The email palette.
 *
 * Email cannot read a CSS variable — every mail client strips custom properties
 * and many strip <style> entirely — so the tokens in Styles.html cannot reach a
 * message. This is their counterpart: one object, stated once, that every email
 * body in every service file paints from.
 *
 * Before this existed each email chose its own colours where it was written, and
 * eight files drifted apart. Sixteen places still carried #00d48e, the teal the
 * app itself retired. Two different values were both "body text". And the two
 * dimmest greys, used for the tagline and the legal footnote, sat at 2.99:1 and
 * 2.03:1 against the card — below the 4.5:1 a reader needs, which is why those
 * lines looked like a smudge rather than words.
 *
 * Every value here is checked against the card it is painted on. See
 * test/email-palette.test.js, which will not let a new one in unchecked.
 * ─────────────────────────────────────────────────────────────────────────── */
var EMAIL_PALETTE_ = {
  bg:     '#000000',   // the page behind the card — the app's own ground
  card:   '#0b1220',   // navy, barely lifted off black
  edge:   '#16233a',   // border, visible without drawing attention
  panel:  '#101d33',   // a block inside the card: a code, a stat, a callout
  text:   '#dde6f0',   // body copy                       14.85:1
  muted:  '#8fa3bb',   // secondary copy                   7.24:1
  faint:  '#6c8099',   // taglines, footnotes, timestamps  4.62:1
  accent: '#ffffff',   // the brand mark. White, as in the app.
  ink:    '#07101e',   // text on a white or accent fill  19.06:1
  green:  '#22c55e',   // correct, complete                8.22:1
  amber:  '#f59e0b',   // streak, attention                8.72:1
  red:    '#ef4444',   // failed, expired                  4.98:1

  /* The progress report is the one email that is a document rather than a
   * message: an instructor sends it to a student or a parent, and it is read
   * alongside other paperwork and sometimes printed. So it stays light while
   * every other email is dark — and it is light the way the app is light. Each
   * value below is the app's own light theme, so the report a parent opens and
   * the screen the student works on are recognisably the same product.
   *
   * It used to be a cool blue-grey borrowed from a framework, with a green and
   * an amber that failed contrast on white at 3.30:1 and 3.19:1 — the two
   * colours the score column is printed in. */
  report: {
    page:       '#f2f1ec',  // the app's light --bg
    sheet:      '#fffefc',  // the app's light --panel, opaque for mail
    header:     '#14304d',  // the app's light --accent
    rule:       '#dcdad2',  // table outline and header underline
    hair:       '#eae8e0',  // between rows
    cell:       '#f7f6f1',  // a stat block
    text:       '#1c1c1a',  // the app's light --text     16.93:1
    body:       '#3a3a36',  // paragraphs and figures      11.33:1
    faint:      '#5c5c58',  // the app's light --muted      6.66:1
    dim:        '#75756f',  // a value that is absent       4.60:1
    good:       '#166534',  // the app's light --green      7.07:1
    warn:       '#92400e',  // the app's light --yellow     7.03:1
    bad:        '#b91c1c',  // the app's light --red        6.42:1
    noticeBg:   '#fdf3e7',
    noticeEdge: '#e8d3b4',
    noticeInk:  '#7c3a06',  //                              7.77:1
    noticeBody: '#6b3a10'   //                              8.56:1
  }
};

// Short alias. These colours are used inside long HTML concatenations where the
// full name would be most of the line.
var EC_ = EMAIL_PALETTE_;


/* ─── Email shell ─────────────────────────────────────────────────────────────
 * Every email the platform sends passes through here, so this is the one place
 * their appearance is decided.
 *
 * Built for a phone first, because that is where these are read — a login code
 * is opened on the device someone is about to sign in on. The old shell used
 * 36px of side padding inside a 520px card, which on a 360px screen left the
 * text in a narrow channel with the card edges cutting in.
 *
 * Tables rather than divs, and inline styles rather than classes, because that is
 * what mail clients reliably render — Outlook in particular ignores much of the
 * rest. The one <style> block carries only the mobile padding, which Apple Mail
 * and iOS honour and everything else safely ignores, so the layout is correct
 * without it.
 *
 * Black with navy: the app is black, and a navy card lifts the content off the
 * background without turning it grey. Green stays as the single accent, used
 * once, on the rule above the content.
 * ─────────────────────────────────────────────────────────────────────────── */
function _emailWrap_(bodyHtml) {
  var P      = EMAIL_PALETTE_;
  var BG     = P.bg;
  var CARD   = P.card;
  var EDGE   = P.edge;
  // White. It was mint green, which is a fourth colour and the loudest thing in
  // the message. As the only bright mark on a black and navy card it does the same
  // job — says the email is from a designed product — without importing a palette
  // the brand does not use.
  var ACCENT = P.accent;
  var MUTED  = P.faint;

  return (
    '<!DOCTYPE html>' +
    '<html><head>' +
      '<meta charset="utf-8">' +
      // Without this, mobile clients render at desktop width and scale down —
      // which is what makes an email arrive as unreadably small text.
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<meta name="color-scheme" content="dark">' +
      // Tells clients this is already a dark design, so they do not invert it and
      // hand the reader black text on a black card.
      '<meta name="supported-color-schemes" content="dark">' +
      '<style>' +
        '@media only screen and (max-width:600px){' +
          '.ac-pad{padding:24px 20px 22px !important;}' +
          '.ac-foot{padding:14px 20px !important;}' +
          '.ac-outer{padding:18px 10px !important;}' +
        '}' +
      '</style>' +
    '</head>' +
    '<body style="margin:0;padding:0;background:' + BG + ';">' +
    // A table, 100% wide, is the only layout every client agrees on.
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ' +
      'style="background:' + BG + ';margin:0;padding:0;">' +
      '<tr><td align="center" class="ac-outer" style="padding:36px 16px;">' +

        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ' +
          'style="max-width:520px;background:' + CARD + ';border:1px solid ' + EDGE + ';' +
          'border-radius:16px;overflow:hidden;">' +

          '<tr><td style="height:3px;line-height:3px;font-size:0;background:' + ACCENT + ';">&nbsp;</td></tr>' +

          '<tr><td class="ac-pad" style="padding:32px 34px 28px;' +
            'font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Arial,sans-serif;' +
            // 15px minimum: below that iOS Mail starts scaling the whole message.
            'font-size:15px;line-height:1.6;color:' + P.text + ';">' +
            bodyHtml +
          '</td></tr>' +

          '<tr><td class="ac-foot" style="border-top:1px solid ' + EDGE + ';padding:16px 34px;' +
            'background:' + BG + ';">' +
            '<p style="margin:0;font-size:11px;line-height:1.55;color:' + MUTED + ';' +
              'text-align:center;font-family:-apple-system,BlinkMacSystemFont,Arial,sans-serif;">' +
              'aerocomms &mdash; Aviation English Interactive Campus.<br>' +
              'You are receiving this because you have an account on this platform.' +
            '</p>' +
          '</td></tr>' +

        '</table>' +
      '</td></tr>' +
    '</table>' +
    '</body></html>'
  );
}


function getPilotAvatarUrl() {
  return appBaseUrl_() + BRAND_AVATAR_FILE_;
}
