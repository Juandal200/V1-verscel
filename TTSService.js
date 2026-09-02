/*******************************************************
 * TTSService.gs
 * Professional ATC Text-to-Speech by country/accent
 *******************************************************/

// Airline telephony designators — add new entries here, one per line.
// These are processed before the generic airline step so names that
// overlap with skipWords (e.g. DELTA) are handled correctly.
var TELEPHONY_DESIGNATORS = [
  'FASTAIR','SPEEDBIRD','CACTUS','REACH',
  'UNITED','AMERICAN','DELTA','BRITISH',
  'NOVAIR','EUROJET','CLOUDLINE','SOLARIA','STORMJET','ALPINE','TYRRHEN',
  'DESERTAIR','EQUATOR','PACIFICA',
  'RYANAIR','EASYJET','WIZAIR','VUELING','IBERIA','LUFTHANSA',
  'FINNAIR','NORWEGIAN','TRANSAVIA','VOLOTEA','JETBLUE','SOUTHWEST','FRONTIER'
];

// Chirp3-HD voice assignments per locale.
// Accent = locale prefix (en-US-, en-GB-, etc.), character = voice name suffix.
// Male/female mixed so each session feels like a different controller.
var CHIRP3_HD_VOICES = {
  'en-US': [
    'en-US-Chirp3-HD-Achird',       // M
    'en-US-Chirp3-HD-Fenrir',       // M
    'en-US-Chirp3-HD-Puck',         // M
    'en-US-Chirp3-HD-Charon',       // M
    'en-US-Chirp3-HD-Kore',         // F
    'en-US-Chirp3-HD-Despina',      // F
    'en-US-Chirp3-HD-Zephyr'        // F
  ],
  'en-GB': [
    'en-GB-Chirp3-HD-Iapetus',      // M
    'en-GB-Chirp3-HD-Alnilam',      // M
    'en-GB-Chirp3-HD-Schedar',      // M
    'en-GB-Chirp3-HD-Umbriel',      // M
    'en-GB-Chirp3-HD-Sulafat',      // F
    'en-GB-Chirp3-HD-Aoede',        // F
    'en-GB-Chirp3-HD-Leda'          // F
  ],
  'en-AU': [
    'en-AU-Chirp3-HD-Algenib',      // M
    'en-AU-Chirp3-HD-Orus',         // M
    'en-AU-Chirp3-HD-Rasalgethi',   // M
    'en-AU-Chirp3-HD-Vindemiatrix', // F
    'en-AU-Chirp3-HD-Gacrux',       // F
    'en-AU-Chirp3-HD-Callirrhoe'    // F
  ],
  'en-IN': [
    'en-IN-Chirp3-HD-Enceladus',    // M
    'en-IN-Chirp3-HD-Sadachbia',    // M
    'en-IN-Chirp3-HD-Algieba',      // M
    'en-IN-Chirp3-HD-Erinome',      // F
    'en-IN-Chirp3-HD-Laomedeia',    // F
    'en-IN-Chirp3-HD-Achernar'      // F
  ],
  'en-CA': [
    'en-US-Chirp3-HD-Puck',         // M — en-CA Chirp3-HD not available; use en-US
    'en-US-Chirp3-HD-Achird',       // M
    'en-US-Chirp3-HD-Charon',       // M
    'en-US-Chirp3-HD-Kore',         // F
    'en-US-Chirp3-HD-Despina',      // F
    'en-US-Chirp3-HD-Zephyr'        // F
  ]
};

var TTSService = {
  COUNTRY_PROFILES: {
    USA: {
      label: 'American ATC',
      languageCode: 'en-US',
      voiceNames: CHIRP3_HD_VOICES['en-US'],
      speakingRate: 0.91,
      pitch: 0,
      effectsProfileId: []
    },

    US: {
      label: 'American ATC',
      languageCode: 'en-US',
      voiceNames: CHIRP3_HD_VOICES['en-US'],
      speakingRate: 0.91,
      pitch: 0,
      effectsProfileId: []
    },

    UK: {
      label: 'British ATC',
      languageCode: 'en-GB',
      voiceNames: CHIRP3_HD_VOICES['en-GB'],
      speakingRate: 0.95,
      pitch: 0,
      effectsProfileId: []
    },

    GB: {
      label: 'British ATC',
      languageCode: 'en-GB',
      voiceNames: CHIRP3_HD_VOICES['en-GB'],
      speakingRate: 0.95,
      pitch: 0,
      effectsProfileId: []
    },

    AUSTRALIA: {
      label: 'Australian ATC',
      languageCode: 'en-AU',
      voiceNames: CHIRP3_HD_VOICES['en-AU'],
      speakingRate: 0.91,
      pitch: 0,
      effectsProfileId: []
    },

    AU: {
      label: 'Australian ATC',
      languageCode: 'en-AU',
      voiceNames: CHIRP3_HD_VOICES['en-AU'],
      speakingRate: 0.91,
      pitch: 0,
      effectsProfileId: []
    },

    INDIA: {
      label: 'Indian ATC',
      languageCode: 'en-IN',
      voiceNames: CHIRP3_HD_VOICES['en-IN'],
      speakingRate: 0.89,
      pitch: 0,
      effectsProfileId: []
    },

    IN: {
      label: 'Indian ATC',
      languageCode: 'en-IN',
      voiceNames: CHIRP3_HD_VOICES['en-IN'],
      speakingRate: 0.89,
      pitch: 0,
      effectsProfileId: []
    },

    CANADA: {
      label: 'Canadian ATC',
      languageCode: 'en-US',
      voiceNames: CHIRP3_HD_VOICES['en-CA'],
      speakingRate: 0.91,
      pitch: 0,
      effectsProfileId: []
    },

    CA: {
      label: 'Canadian ATC',
      languageCode: 'en-US',
      voiceNames: CHIRP3_HD_VOICES['en-CA'],
      speakingRate: 0.91,
      pitch: 0,
      effectsProfileId: []
    },

    COLOMBIA: {
      label: 'Colombian ATC English',
      languageCode: 'en-US',
      voiceNames: CHIRP3_HD_VOICES['en-US'],
      speakingRate: 0.87,
      pitch: 0,
      effectsProfileId: []
    },

    CO: {
      label: 'Colombian ATC English',
      languageCode: 'en-US',
      voiceNames: CHIRP3_HD_VOICES['en-US'],
      speakingRate: 0.87,
      pitch: 0,
      effectsProfileId: []
    }
  },

  generateScenarioVoice: function(user, payload) {
    payload = payload || {};

    if (!payload.scenarioId) {
      throw new Error('Missing scenarioId.');
    }

    var scenario = this.getScenarioByIdSafe_(payload.scenarioId);

    if (!scenario) {
      throw new Error('Scenario not found: ' + payload.scenarioId);
    }

    this.validateScenarioAudioAccess_(user, scenario);

    var textToRead = String(payload.text || scenario.atcText || '').trim();

    if (!textToRead) {
      throw new Error('Scenario has no ATC text.');
    }

    if (textToRead.toUpperCase() === String(scenario.country || '').trim().toUpperCase()) {
      throw new Error('Invalid ATC text. The scenario ATC text only contains the country name: ' + textToRead);
    }

    var country = String(scenario.country || user.currentCountry || 'USA').trim();
    var profile = this.getProfileByCountry_(country);

    var speakingRate = Number(payload.speakingRate || profile.speakingRate || 0.86);

    if (speakingRate < 0.25 || speakingRate > 4) {
      speakingRate = profile.speakingRate || 0.86;
    }

    // Prefer client-chosen voice; otherwise pick randomly from the profile list.
    var voices     = profile.voiceNames || [];
    var voiceToUse = String(payload.voice || '').trim() ||
                     voices[Math.floor(Math.random() * voices.length)] ||
                     voices[0] || '';

    // A pre-rendered recording beats everything else, so it is tried first.
    //
    // CacheService below it lives six hours: every line goes cold overnight, the
    // first student of the day waits through a synthesis, and the client gives up
    // after six seconds and speaks in the phone's own voice. A Drive file was
    // rendered once and is fast forever, so it is the answer whenever it exists.
    //
    // The voice is chosen from what was actually rendered rather than from the
    // profile, so a random pick can never ask for a variant that does not exist.
    // The client may still name one, and if it was rendered it is honoured.
    var pre = _scenPickRendered_(textToRead, country, payload.voice);
    if (pre) {
      return {
        ok: true,
        audioBase64:  pre.audioBase64,
        mimeType:     'audio/mp3',
        voiceProfile: profile.label,
        voiceName:    pre.voice,
        languageCode: profile.languageCode,
        speakingRate: pre.speakingRate || speakingRate,
        pitch:        profile.pitch,
        text:         textToRead,
        cached:       true,
        prerendered:  true
      };
    }

    // Serve from CacheService when available — avoids the TTS API round-trip
    var cacheKey = this.buildTtsCacheKey_(textToRead, profile, speakingRate, voiceToUse);
    var cached = this.getTtsFromCache_(cacheKey);
    if (cached) {
      return {
        ok: true,
        audioBase64: cached,
        mimeType: 'audio/mp3',
        voiceProfile: profile.label,
        voiceName: voiceToUse,
        languageCode: profile.languageCode,
        speakingRate: speakingRate,
        pitch: profile.pitch,
        text: textToRead,
        cached: true
      };
    }

    var ssml = this.buildAtcSsml_(textToRead, profile, speakingRate, voiceToUse);

    // Journey voices don't support effectsProfileId — strip it for those voices
    var isJourney = String(voiceToUse).indexOf('Journey') !== -1;
    // Put the chosen voice first; fall back to others if it fails.
    var orderedVoices  = [voiceToUse].concat(voices.filter(function(v) { return v !== voiceToUse; }));
    var profileForCall = { languageCode: profile.languageCode, pitch: isJourney ? 0 : profile.pitch,
                           effectsProfileId: isJourney ? [] : profile.effectsProfileId, voiceNames: orderedVoices };
    var result = this.callGoogleTtsWithFallbackVoices_(ssml, profileForCall, speakingRate);

    this.storeTtsInCache_(cacheKey, result.audioBase64);

    return {
      ok: true,
      audioBase64: result.audioBase64,
      mimeType: 'audio/mp3',
      voiceProfile: profile.label,
      voiceName: result.voiceName,
      languageCode: profile.languageCode,
      speakingRate: speakingRate,
      pitch: profile.pitch,
      text: textToRead,
      ssml: ssml
    };
  },

  buildTtsCacheKey_: function(text, profile, rate, voiceName) {
    var vn  = voiceName || (profile.voiceNames || [])[0] || '';
    // v6 — also busts entries from before rule 18 defaulted to speaking words.
    // Without this bump the fix is invisible: any scenario whose audio was already
    // synthesised keeps serving the clip that spells "W E T" / "S N O W" / "D R Y".
    var raw = ('v6||' + text + '||' + (profile.languageCode || '') + '||' + vn + '||' + Math.round(rate * 100)).toUpperCase();
    var h = 5381;
    for (var i = 0; i < raw.length; i++) {
      h = ((h << 5) + h + raw.charCodeAt(i)) & 0x7fffffff;
    }
    return 'TTS_' + h;
  },

  getTtsFromCache_: function(key) {
    try { return CacheService.getScriptCache().get(key); } catch (e) { return null; }
  },

  storeTtsInCache_: function(key, audioBase64) {
    try {
      // CacheService max item is ~100 KB; typical ATC phrase audio is 15–55 KB base64
      if (audioBase64 && audioBase64.length < 95000) {
        CacheService.getScriptCache().put(key, audioBase64, 21600); // 6-hour TTL
      }
    } catch (e) { /* non-fatal */ }
  },

  getProfileByCountry_: function(country) {
    var key = String(country || '').trim().toUpperCase();
    return this.COUNTRY_PROFILES[key] || this.COUNTRY_PROFILES.USA;
  },

  callGoogleTtsWithFallbackVoices_: function(ssml, profile, speakingRate) {
    var self   = this;
    var voices = profile.voiceNames || [];

    if (!voices.length) {
      throw new Error('No voices configured for profile: ' + profile.label);
    }

    var lastError = '';

    for (var i = 0; i < voices.length; i++) {
      var voiceName = voices[i];
      // Derive the correct languageCode from the voice name (e.g. 'en-CA-Neural2-B' → 'en-CA').
      // This lets a single profile mix voices from different locales (e.g. en-CA + en-US fallback).
      var parts        = String(voiceName).split('-');
      var effectiveLang = (parts.length >= 2) ? (parts[0] + '-' + parts[1]) : profile.languageCode;

      // Neural2, Journey, and Chirp3-HD may need v1beta1 fallback on some locales
      var apiVersions = (voiceName.indexOf('Neural2')   !== -1 ||
                         voiceName.indexOf('Journey')   !== -1 ||
                         voiceName.indexOf('Chirp3-HD') !== -1)
        ? ['v1', 'v1beta1'] : ['v1'];

      for (var v = 0; v < apiVersions.length; v++) {
        try {
          var audioBase64 = self.callGoogleTts_(
            ssml, voiceName, effectiveLang, speakingRate,
            profile.pitch, profile.effectsProfileId, apiVersions[v]
          );
          Logger.log('Voice OK: ' + voiceName + ' (' + apiVersions[v] + ')');
          return { audioBase64: audioBase64, voiceName: voiceName };
        } catch (err) {
          lastError = err && err.message ? err.message : String(err);
          Logger.log('Voice failed: ' + voiceName + ' (' + apiVersions[v] + ') | ' + lastError);
        }
      }
    }

    throw new Error(
      'All configured voices failed for profile "' + profile.label + '". Last error: ' + lastError + '. ' +
      'If Neural2/Wavenet voices are failing, check that: (1) Cloud Text-to-Speech API is enabled in your GCP project, ' +
      '(2) billing is enabled on the project, (3) GOOGLE_TTS_API_KEY is set to a key from the corporate project. ' +
      'Run diagnoseTtsSetup() in the Apps Script editor to pinpoint the issue.'
    );
  },

  callGoogleTts_: function(ssml, voiceName, languageCode, speakingRate, pitch, effectsProfileId, apiVersion) {
    var apiKey = PropertiesService
      .getScriptProperties()
      .getProperty('GOOGLE_TTS_API_KEY');

    if (!apiKey) {
      throw new Error('Missing GOOGLE_TTS_API_KEY. Add it in Apps Script Project Settings → Script Properties.');
    }

    var version = apiVersion || 'v1';
    var url = 'https://texttospeech.googleapis.com/' + version + '/text:synthesize?key=' + encodeURIComponent(apiKey);

    // Chirp3-HD does not support SSML or effectsProfileId/pitch in audioConfig.
    // Strip tags and unescape HTML entities to produce clean plain text.
    var isChirp3HD = String(voiceName || '').indexOf('Chirp3-HD') !== -1;

    var inputPayload;
    if (isChirp3HD) {
      var plain = String(ssml || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g,  '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/\s+/g, ' ').trim();
      inputPayload = { text: plain };
    } else {
      inputPayload = { ssml: ssml };
    }

    var audioConfig = { audioEncoding: 'MP3', speakingRate: speakingRate };
    if (!isChirp3HD) {
      audioConfig.pitch            = Number(pitch || 0);
      audioConfig.effectsProfileId = effectsProfileId && effectsProfileId.length
        ? effectsProfileId : ['telephony-class-application'];
    }

    var payload = {
      input: inputPayload,
      voice: { languageCode: languageCode, name: voiceName },
      audioConfig: audioConfig
    };

    var options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    var response = UrlFetchApp.fetch(url, options);
    var code = response.getResponseCode();
    var body = response.getContentText();

    if (code < 200 || code >= 300) {
      throw new Error('Google TTS error ' + code + ': ' + body);
    }

    var data = JSON.parse(body);

    if (!data.audioContent) {
      throw new Error('Google TTS did not return audio content.');
    }

    return data.audioContent;
  },

  buildAtcSsml_: function(atcText, profile, speakingRate, voiceName) {
    var clean = String(atcText || '').trim();
    clean = this.prepareAtcPronunciation_(clean);
    clean = this.escapeSsml_(clean);
    clean = this.addAtcPauses_(clean);
    // Journey voices don't support <prosody rate> — rate is passed via audioConfig only
    var isJourney = String(voiceName || '').indexOf('Journey') !== -1;
    if (isJourney) {
      return '<speak>' + clean + '</speak>';
    }
    return (
      '<speak>' +
        '<prosody rate="' + Math.round(Number(speakingRate || profile.speakingRate || 0.86) * 100) + '%" pitch="' + Number(profile.pitch || 0) + 'st">' +
          clean +
        '</prosody>' +
      '</speak>'
    );
  },

  addAtcPauses_: function(text) {
    return String(text || '')
      .replace(/,\s*/g,  ', <break time="200ms"/> ')
      .replace(/;\s*/g,  '; <break time="280ms"/> ')
      .replace(/\.\s*/g, '. <break time="320ms"/> ');
  },

  prepareAtcPronunciation_: function(text) {
    var self = this;
    var out = String(text || '').trim();

    // 1. Flight levels: FL250, FL10, FL100
    out = out.replace(/\bFL\s*(\d{1,4})\b/gi, function(_, n) {
      return 'flight level ' + self._expandDigitsIcao_(n);
    });

    // 2. VHF/UHF frequencies: 118.7, 121.500, 129.100
    out = out.replace(/\b(\d{3})\.(\d{1,3})\b/g, function(_, intPart, decPart) {
      return self._expandDigitsIcao_(intPart) + ' decimal ' + self._expandDigitsIcao_(decPart);
    });

    // 2b. Clock positions: "TRAFFIC 12 O'CLOCK", "TRAFFIC 2 O'CLOCK".
    //     Must run BEFORE the airline-callsign rule (step 11), which otherwise
    //     matches "TRAFFIC 12" as a telephony designator plus flight number and
    //     speaks it "Traffic one two", leaving a bare "O" to be read as a letter —
    //     which is why the clearance came out as "twelve ou".
    //     The hour is a whole number in ATC usage: "twelve o'clock", never
    //     "one two o'clock". Accepts a straight or typographic apostrophe, and
    //     none at all.
    var CLOCK_HOURS = ['', 'one', 'two', 'three', 'four', 'five', 'six',
                       'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
    out = out.replace(/\b(\d{1,2})\s*O\s*['\u2019]?\s*CLOCK\b/gi, function(_, h) {
      var n = Number(h);
      return (CLOCK_HOURS[n] || h) + " o'clock";
    });

    // 3. Runway designators: RUNWAY 27L, RWY 09R, RUNWAY 36, RWY 09
    out = out.replace(/\b(?:RUNWAY|RWY)\s+(\d{1,2})([LRClrc]?)\b/gi, function(_, num, side) {
      var sides = { L:'left', l:'left', R:'right', r:'right', C:'center', c:'center' };
      var sideWord = sides[side] ? ' ' + sides[side] : '';
      var padded = num.length === 1 ? '0' + num : num;
      return 'runway ' + self._expandDigitsIcao_(padded) + sideWord;
    });

    // 4. QNH / QFE: QNH 1013, QFE 997
    out = out.replace(/\b(QNH|QFE)\s+(\d{3,4})\b/gi, function(_, code, val) {
      return code.toUpperCase() + ' ' + self._expandDigitsIcao_(val);
    });

    // 5. Squawk codes: SQUAWK 7700, SQUAWK 2000
    out = out.replace(/\bSQUAWK\s+(\d{4})\b/gi, function(_, code) {
      return 'squawk ' + self._expandDigitsIcao_(code);
    });

    // 6. Explicit heading keyword: HEADING 270, HDG 090
    out = out.replace(/\b(?:HEADING|HDG)\s+(\d{3})\b/gi, function(_, h) {
      return 'heading ' + self._expandDigitsIcao_(h);
    });

    // 7. Wind direction: WIND 270 (followed by DEGREES or a number)
    out = out.replace(/\bWIND\s+(\d{3})\b/gi, function(_, dir) {
      return 'wind ' + self._expandDigitsIcao_(dir);
    });

    // 8. Speeds: 250 KNOTS, 160 KNOTS
    out = out.replace(/\b(\d{2,3})\s+KNOTS?\b/gi, function(_, spd) {
      return self._expandDigitsIcao_(spd) + ' knots';
    });

    // 9. Altitudes with FEET/FT: 5000 FEET, 10000 FT
    out = out.replace(/\b(\d{3,5})\s+(?:FEET|FT)\b/gi, function(_, alt) {
      return self._expandAltitude_(alt) + ' feet';
    });

    // 9b. Aircraft type prefixes: B747 → "Boeing 7 4 7", A320 → "Airbus 3 2 0"
    //     Runs before step 10 so the letter+digits aren't parsed as a registration.
    var TYPE_PREFIXES = { 'CRJ':'C R J', 'MD':'M D', 'B':'Boeing', 'A':'Airbus', 'E':'Embraer' };
    out = out.replace(/\b(CRJ|MD|B|A|E)(\d{2,4})\b/gi, function(_, prefix, digits) {
      return TYPE_PREFIXES[prefix.toUpperCase()] + ' ' + self._expandDigitsIcao_(digits);
    });

    // 10. Aircraft callsigns: registration pattern — 1-2 capital letters + 1-5 digits + 0-3 capital letters
    //     e.g. N172SP → November one seven two Sierra Papa
    //          G-ABCD → Golf Alpha Bravo Charlie Delta
    //          EI-ABC → Echo India Alpha Bravo Charlie
    out = out.replace(/\b([A-Z]{1,2})-?(\d{1,5})([A-Z]{0,3})\b/g, function(match, prefix, digits, suffix) {
      if ((prefix + digits + (suffix || '')).length < 3) return match;
      var result = '';
      for (var i = 0; i < prefix.length; i++) {
        result += self._icaoPhoneticLetter_(prefix[i]) + ' ';
      }
      result += self._expandDigitsIcao_(digits);
      if (suffix) {
        for (var j = 0; j < suffix.length; j++) {
          result += ' ' + self._icaoPhoneticLetter_(suffix[j]);
        }
      }
      return result.trim();
    });

    // 10b. Airline telephony designators — known pronounceable callsign words.
    //      Runs before step 11 so entries that also appear in skipWords are caught.
    var tdPattern = new RegExp(
      '\\b(' + TELEPHONY_DESIGNATORS.join('|') + ')\\s+(\\d{1,4})(?:\\s+(HEAVY|SUPER))?\\b', 'gi'
    );
    out = out.replace(tdPattern, function(_, designator, num, suffix) {
      return designator.charAt(0).toUpperCase() + designator.slice(1).toLowerCase() +
             ' ' + self._expandDigitsIcao_(num) +
             (suffix ? ' ' + suffix.toLowerCase() : '');
    });

    // 10c. Telephony designators standalone (no flight number) — title-case so TTS reads as a word
    TELEPHONY_DESIGNATORS.forEach(function(td) {
      var re = new RegExp('\\b' + td + '\\b', 'gi');
      out = out.replace(re, function(m) {
        return m.charAt(0).toUpperCase() + m.slice(1).toLowerCase();
      });
    });

    // 11. Airline callsigns: airline name (3+ letters) followed by 1-4 digits
    //     e.g. FASTAIR 345 → Fastair three four five
    out = out.replace(/\b([A-Z]{3,})\s+(\d{1,4})\b/g, function(match, airline, num) {
      var skipWords = ['RUNWAY','HEADING','CONTACT','CLIMB','DESCEND','CLEARED','SQUAWK',
                       'TEMPERATURE','MINUS','WIND','FEET','KNOTS','DEGREES','DECIMAL',
                       'FLIGHT','LEVEL','TAXIWAY','APPROACH','DEPARTURE','TOWER','GROUND',
                       'TRAFFIC','INFORMATION','CHARLIE','DELTA','ALPHA','BRAVO','FOXTROT',
                       'GOLF','HOTEL','INDIA','JULIET','KILO','LIMA','MIKE','NOVEMBER',
                       'OSCAR','PAPA','QUEBEC','ROMEO','SIERRA','TANGO','UNIFORM','VICTOR',
                       'WHISKEY','YANKEE','ZULU','ECHO'];
      if (skipWords.indexOf(airline.toUpperCase()) !== -1) return match;
      return airline.charAt(0).toUpperCase() + airline.slice(1).toLowerCase() +
             ' ' + self._expandDigitsIcao_(num);
    });

    // 12. 5-digit numbers
    out = out.replace(/\b(\d{5})\b/g, function(_, n) { return self._expandDigitsIcao_(n); });
    // 13. 4-digit numbers (transponder, time, pressures not caught above)
    out = out.replace(/\b(\d{4})\b/g, function(_, n) { return self._expandDigitsIcao_(n); });
    // 14. 3-digit numbers (headings, altitudes in hundreds, runway lengths)
    out = out.replace(/\b(\d{3})\b/g, function(_, n) { return self._expandDigitsIcao_(n); });
    // 15. 2-digit numbers
    out = out.replace(/\b(\d{2})\b/g, function(_, n) { return self._expandDigitsIcao_(n); });
    // 16. Single digits — expand to ICAO word so all voices read consistently
    out = out.replace(/\b(\d)\b/g, function(_, n) { return self._icaoDigit_(n); });

    // 17. Key abbreviations (spoken letter-by-letter in ATC)
    out = out.replace(/\bQNH\b/g,  'Q N H');
    out = out.replace(/\bQFE\b/g,  'Q F E');
    out = out.replace(/\bQFU\b/g,  'Q F U');
    out = out.replace(/\bILS\b/g,  'I L S');
    out = out.replace(/\bVOR\b/g,  'V O R');
    out = out.replace(/\bDME\b/g,  'D M E');
    out = out.replace(/\bNDB\b/g,  'N D B');
    out = out.replace(/\bATIS\b/g, 'A T I S');
    out = out.replace(/\bRWY\b/gi, 'runway');
    out = out.replace(/\bTWY\b/gi, 'taxiway');
    out = out.replace(/\bHDG\b/gi, 'heading');
    out = out.replace(/\bSPD\b/gi, 'speed');
    out = out.replace(/\bACFT\b/gi,'aircraft');
    // Genuine letter-by-letter acronyms. This list is now the ONLY thing that
    // gets spelled — see rule 18 — so anything that must not be read as a word
    // belongs here.
    out = out.replace(/\bATC\b/g,  'A T C');
    out = out.replace(/\bIFR\b/g,  'I F R');
    out = out.replace(/\bVFR\b/g,  'V F R');
    out = out.replace(/\bRVR\b/g,  'R V R');
    out = out.replace(/\bGPS\b/g,  'G P S');
    out = out.replace(/\bETA\b/g,  'E T A');
    out = out.replace(/\bETD\b/g,  'E T D');
    out = out.replace(/\bAPU\b/g,  'A P U');
    out = out.replace(/\bFMS\b/g,  'F M S');
    out = out.replace(/\bCTAF\b/g, 'C T A F');
    out = out.replace(/\bTCAS\b/g, 'T cass');
    out = out.replace(/\bRNAV\b/g, 'R nav');
    out = out.replace(/\bVNAV\b/g, 'V nav');
    out = out.replace(/\bLNAV\b/g, 'L nav');

    // 17b. Common English/aviation words that TTS reads letter-by-letter when ALL-CAPS →
    //      lowercase so they are spoken as words, not acronyms.
    var WORD_WORDS = [
      'AT','BY','IN','ON','TO','UP','OF','OR','AN','AS','IS','IT','NO','GO',
      'BAY','VIA','AND','FOR','THE','BUT','NOT','NOW','ALL','NEW','OLD','LOW',
      'AIR','ARC','PAN','RUN','SET','OUT','OFF','WAY','CAR','ODD',
      'ZERO','ONE','TWO','FOUR','FIVE','NINE','TEN','WITH','FROM','THEN','WHEN',
      'WILL','HOLD','STOP','TAXI','TURN','PUSH','PULL','LEFT','BACK','NEXT',
      'TAKE','LAND','GATE','RAMP','PARK','DOOR','FUEL',
      // Runway surface / weather conditions. Under 5 letters, so rule 18 below
      // never reaches them and TTS spells them out — "WET" became "W E T" and
      // "SNOW" became "S N O W", which is why the word was not recognisable.
      'WET','SNOW','DRY'
    ];
    var _wwPat = new RegExp('\\b(' + WORD_WORDS.join('|') + ')\\b', 'g');
    out = out.replace(_wwPat, function(w) { return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); });

    // 18. Catch-all: any remaining ALL-CAPS word of 3+ letters → title case so TTS
    //     reads it as a word rather than spelling it.
    //
    //     This was 5+, which inverted the default: every 3-4 letter word had to be
    //     enumerated in WORD_WORDS or it got spelled out. That is why WET, SNOW,
    //     DRY and OWN each surfaced separately as "W E T", "S N O W", "D R Y",
    //     "O W N" — and why the list would have kept growing one bug report at a
    //     time (ICE, FOG, RAIN, WIND, HAIL, GUST, GEAR, FLAP, FIRE, CREW...).
    //     Speaking is now the default and rule 17 above is the sole spell-out list,
    //     which is the correct way round: real acronyms are a short closed set,
    //     ordinary words are not.
    out = out.replace(/\b([A-Z]{3,})\b/g, function(m) {
      return m.charAt(0) + m.slice(1).toLowerCase();
    });

    return out;
  },

  _icaoPhoneticLetter_: function(letter) {
    var phonetic = {
      A:'Alpha',   B:'Bravo',   C:'Charlie', D:'Delta',   E:'Echo',
      F:'Foxtrot', G:'Golf',    H:'Hotel',   I:'India',   J:'Juliet',
      K:'Kilo',    L:'Lima',    M:'Mike',    N:'November',O:'Oscar',
      P:'Papa',    Q:'Quebec',  R:'Romeo',   S:'Sierra',  T:'Tango',
      U:'Uniform', V:'Victor',  W:'Whiskey', X:'X-ray',   Y:'Yankee', Z:'Zulu'
    };
    return phonetic[String(letter || '').toUpperCase()] || letter;
  },

  _icaoDigit_: function(d) {
    var map = {'0':'zero','1':'one','2':'two','3':'three','4':'four',
               '5':'five','6':'six','7':'seven','8':'eight','9':'niner'};
    return map[String(d)] || d;
  },

  _expandDigitsIcao_: function(numStr) {
    var self = this;
    return String(numStr || '').split('').map(function(d) { return self._icaoDigit_(d); }).join(' ');
  },

  _expandAltitude_: function(altStr) {
    var n = parseInt(altStr, 10);
    if (!isNaN(n) && n > 0 && n % 1000 === 0 && n <= 20000) {
      var w = ['','one','two','three','four','five','six','seven','eight','nine',
               'ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen',
               'seventeen','eighteen','nineteen','twenty'];
      return w[n / 1000] + ' thousand';
    }
    return this._expandDigitsIcao_(altStr);
  },

  escapeSsml_: function(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  },

  getScenarioByIdSafe_: function(scenarioId) {
    if (
      typeof ScenarioService !== 'undefined' &&
      ScenarioService &&
      typeof ScenarioService.getScenarioById === 'function'
    ) {
      return ScenarioService.getScenarioById(scenarioId);
    }

    return this.getScenarioByIdFromSheet_(scenarioId);
  },

  getScenarioByIdFromSheet_: function(scenarioId) {
    var ss = SpreadsheetApp.openById(this.getDatabaseId_());
    var sheet = ss.getSheetByName('Scenarios');

    if (!sheet) {
      throw new Error('Scenarios sheet not found.');
    }

    var rows = this.readSheetObjects_(sheet);

    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].scenarioId) === String(scenarioId)) {
        return rows[i];
      }
    }

    return null;
  },

  readSheetObjects_: function(sheet) {
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();

    if (lastRow < 2 || lastCol < 1) {
      return [];
    }

    var headers = sheet
      .getRange(1, 1, 1, lastCol)
      .getValues()[0]
      .map(function(h) {
        return String(h || '').trim();
      });

    var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

    return values.map(function(row) {
      var obj = {};

      headers.forEach(function(header, index) {
        if (!header) return;
        obj[header] = row[index];
      });

      return obj;
    });
  },

  getDatabaseId_: function() {
    var props = PropertiesService.getScriptProperties();

    return (
      props.getProperty('DB_SPREADSHEET_ID') ||
      props.getProperty('DATABASE_SPREADSHEET_ID') ||
      props.getProperty('SPREADSHEET_ID') ||
      props.getProperty('ICAO_DB_SPREADSHEET_ID') ||
      '1IKVJEEw8QoX9HkMJpnXNj3a20HnTl_-CjUcOJb4vgWY'
    );
  },

  validateScenarioAudioAccess_: function(user, scenario) {
    var role = String((user && user.role) || '').toUpperCase();

    Logger.log(
      '[validateScenarioAudioAccess_] user=' + (user && user.email) +
      ' role=' + role +
      ' scenarioId=' + (scenario && scenario.scenarioId) +
      ' scenarioCountry=' + (scenario && scenario.country)
    );

    if (role === 'ADMIN' || role === 'INSTRUCTOR' || role === 'STUDENT') {
      return true;
    }

    throw new Error('TTS access denied for role: ' + role);
  }
};


/*******************************************************
 * Manual test helpers
 *******************************************************/

function testTtsConfig() {
  var apiKey = PropertiesService.getScriptProperties().getProperty('GOOGLE_TTS_API_KEY');

  if (!apiKey) {
    throw new Error('GOOGLE_TTS_API_KEY no está configurada.');
  }

  Logger.log('GOOGLE_TTS_API_KEY configurada correctamente.');

  return {
    ok: true,
    message: 'GOOGLE_TTS_API_KEY configurada correctamente.'
  };
}


function testTtsServiceManual() {
  var result = TTSService.callGoogleTtsWithFallbackVoices_(
    '<speak><prosody rate="86%" pitch="-2st">Fastair three four five, <break time="200ms"/> start up approved, <break time="180ms"/> temperature minus two.</prosody></speak>',
    TTSService.COUNTRY_PROFILES.USA,
    0.86
  );

  Logger.log(JSON.stringify({
    ok: true,
    voiceName: result.voiceName,
    audioLength: result.audioBase64.length
  }, null, 2));

  return {
    ok: true,
    voiceName: result.voiceName,
    audioLength: result.audioBase64.length
  };
}


function diagnoseTtsSetup() {
  var props = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty('GOOGLE_TTS_API_KEY');
  var report = { apiKeySet: false, neural2Works: false, wavenetWorks: false, standardWorks: false, errors: [] };

  if (!apiKey) {
    report.errors.push('GOOGLE_TTS_API_KEY is not set in Script Properties. Run setTtsConfig() first.');
    Logger.log(JSON.stringify(report, null, 2));
    return report;
  }

  report.apiKeySet = true;

  var testSsml = '<speak><prosody rate="86%" pitch="-2st">Fastair three four five, start up approved.</prosody></speak>';
  var tiers = [
    { name: 'Neural2',  voice: 'en-US-Neural2-D',   lang: 'en-US', reportKey: 'neural2Works'  },
    { name: 'Wavenet',  voice: 'en-US-Wavenet-D',   lang: 'en-US', reportKey: 'wavenetWorks'  },
    { name: 'Standard', voice: 'en-US-Standard-D',  lang: 'en-US', reportKey: 'standardWorks' }
  ];

  tiers.forEach(function(tier) {
    try {
      var result = TTSService.callGoogleTts_(testSsml, tier.voice, tier.lang, 0.86, -2, ['telephony-class-application']);
      report[tier.reportKey] = !!(result && result.length > 0);
    } catch (err) {
      report[tier.reportKey] = false;
      report.errors.push(tier.name + ' failed: ' + (err && err.message ? err.message : String(err)));
    }
  });

  if (report.neural2Works) {
    report.voiceQuality = 'EXCELLENT — Neural2 is working (natural sound).';
  } else if (report.wavenetWorks) {
    report.voiceQuality = 'GOOD — Wavenet is working but Neural2 is not. Enable billing on the GCP project for Neural2 access.';
  } else if (report.standardWorks) {
    report.voiceQuality = 'POOR — Only Standard voices work (robotic sound). Enable billing on the GCP project to unlock Neural2/Wavenet.';
  } else {
    report.voiceQuality = 'BROKEN — No voices work. Check that the Cloud TTS API is enabled and the API key is valid.';
  }

  Logger.log(JSON.stringify(report, null, 2));
  return report;
}


function listGoogleTtsVoicesForLanguage(languageCode) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('GOOGLE_TTS_API_KEY');

  if (!apiKey) {
    throw new Error('GOOGLE_TTS_API_KEY no está configurada.');
  }

  languageCode = languageCode || 'en-US';

  var url =
    'https://texttospeech.googleapis.com/v1/voices?languageCode=' +
    encodeURIComponent(languageCode) +
    '&key=' +
    encodeURIComponent(apiKey);

  var response = UrlFetchApp.fetch(url, {
    method: 'get',
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  var body = response.getContentText();

  if (code < 200 || code >= 300) {
    throw new Error('Google voices:list error ' + code + ': ' + body);
  }

  var data = JSON.parse(body);
  var voices = data.voices || [];

  Logger.log(JSON.stringify(voices.map(function(v) {
    return {
      name: v.name,
      languageCodes: v.languageCodes,
      ssmlGender: v.ssmlGender
    };
  }), null, 2));

  return voices;
}

// Run this in the GAS editor to find which scenarios will fail TTS
function diagnoseScenarioTts() {
  var ss    = SpreadsheetApp.openById(
    PropertiesService.getScriptProperties().getProperty('DB_SPREADSHEET_ID') ||
    SpreadsheetApp.getActiveSpreadsheet().getId()
  );
  var sheet = ss.getSheetByName('Scenarios');
  if (!sheet) { Logger.log('ERROR: Scenarios sheet not found.'); return; }

  var data    = sheet.getDataRange().getValues();
  var headers = data[0].map(function(h) { return String(h).trim(); });
  var knownCountries = ['USA','US','UK','GB','AUSTRALIA','AU','INDIA','IN','CANADA','CA','COLOMBIA','CO'];
  var issues  = [];

  data.slice(1).forEach(function(row, i) {
    var obj = {};
    headers.forEach(function(h, j) { obj[h] = row[j]; });
    var id      = String(obj.scenarioId   || '').trim();
    var atc     = String(obj.atcText      || '').trim();
    var country = String(obj.country      || '').trim().toUpperCase();
    var name    = String(obj.flightScenarioName || '').trim();
    var active  = String(obj.isActive     || '').trim().toUpperCase();
    var isActive = (active === 'TRUE' || active === 'ACTIVE' || active === 'YES' || active === '1');

    if (!isActive) return; // skip inactive rows

    var rowProblems = [];
    if (!id)  rowProblems.push('MISSING scenarioId');
    if (!atc) rowProblems.push('EMPTY atcText — TTS will fail');
    if (atc && country && atc.toUpperCase() === country) rowProblems.push('atcText equals country name');
    if (country && knownCountries.indexOf(country) === -1) rowProblems.push('Unknown country "' + country + '" — falls back to USA voice');

    if (rowProblems.length) {
      issues.push('Row ' + (i + 2) + ' [' + (id || 'NO ID') + ']: ' + rowProblems.join(' | '));
    }
  });

  if (issues.length === 0) {
    Logger.log('✓ All active scenarios look good for TTS.');
  } else {
    Logger.log('ISSUES FOUND (' + issues.length + '):\n' + issues.join('\n'));
  }
  return issues;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * SCENARIO AUDIO — PHASE 0: measure before building
 *
 * The simulator synthesises every ATC line at the moment it is needed, waits six
 * seconds, and hands the line to the phone's own voice if it has not arrived. The
 * server cache that would prevent that is CacheService with a six-hour life, so
 * nothing is ever permanently fast — a line that played instantly this morning is
 * a cold synthesis tonight.
 *
 * Pre-rendering to Drive fixes it the way it fixed the ICAO test. But how big that
 * job is depends entirely on how many distinct lines there are, and nobody knows.
 * This counts them, and changes nothing.
 *
 * Run from the editor — TTSService.gs.
 * ═══════════════════════════════════════════════════════════════════════════ */
function checkScenarioAudioSize() {
  var rows = dbReadAll_('Scenarios');
  var active = rows.filter(function(s) {
    return String(s.isActive).toUpperCase() !== 'FALSE' && String(s.atcText || '').trim();
  });

  // Distinct TEXT, not distinct scenario. The same clearance appears across
  // countries and levels, and an identical line in the same voice is one file —
  // which is the difference between a manageable render and an unmanageable one.
  var byCountry = {}, uniqText = {}, uniqPair = {}, chars = 0;
  active.forEach(function(s) {
    var text    = String(s.atcText || '').trim();
    var country = String(s.country || 'USA').trim().toUpperCase();
    byCountry[country] = (byCountry[country] || 0) + 1;
    uniqText[text] = true;
    uniqPair[country + '|' + text] = true;
    chars += text.length;
  });

  var pairs = Object.keys(uniqPair).length;
  var out = [];
  out.push('SCENARIOS: ' + rows.length + ' rows, ' + active.length + ' active with ATC text');
  out.push('DISTINCT LINES: ' + Object.keys(uniqText).length);
  out.push('DISTINCT line+country PAIRS: ' + pairs + '  ← this is what gets rendered');
  out.push('');
  out.push('By country:');
  Object.keys(byCountry).sort().forEach(function(c) {
    out.push('   ' + c + ': ' + byCountry[c]);
  });
  out.push('');
  // The ICAO render managed roughly one clip every 2.5 seconds including the Drive
  // write, and Apps Script stops at six minutes — so this is really "how many runs".
  var perVariant = Math.ceil(pairs * 2.5 / 60);
  out.push('ESTIMATE, one voice per line:');
  out.push('   ~' + pairs + ' files, ~' + perVariant + ' min of synthesis' +
           '  (~' + Math.ceil(perVariant / 5) + ' run(s) of renderScenarioAudio)');
  out.push('   ~' + Math.round(chars / 1000) + 'k characters of TTS billing, once');
  out.push('   ~' + Math.round(pairs * 35 / 1024) + ' MB on Drive');
  out.push('');
  out.push('With 3 voices per line, multiply all three by three.');

  var msg = out.join('\n');
  Logger.log(msg);
  return msg;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * SCENARIO AUDIO — PHASE 1: render every ATC line to Drive, permanently
 *
 * Phase 0 counted 80 distinct lines. Three voices each is 240 files and about
 * 9 MB, which makes variants affordable rather than a luxury — so they are built
 * in from the start rather than bolted on later.
 *
 * Why Drive and not the cache: CacheService lives six hours, so every line goes
 * cold overnight and the first student of the day waits through a synthesis. A
 * Drive file is rendered once and is fast forever.
 *
 * Resumable on purpose. Apps Script stops at six minutes, so this renders until it
 * is nearly out of time, writes what it has, and says how much is left. Running it
 * again continues; running it after everything is done is a no-op.
 * ═══════════════════════════════════════════════════════════════════════════ */
var SCENARIO_AUDIO_SHEET_  = 'ScenarioAudio';
var SCENARIO_AUDIO_FOLDER_ = 'aerocomms Simulator ATC Audio';
var SCENARIO_AUDIO_VOICES_ = 3;      // variants per line
var SCENARIO_RENDER_BUDGET_MS_ = 4.5 * 60 * 1000;   // stop before the 6-minute wall

function _scenAudioSheet_() {
  var ss = SpreadsheetApp.openById(
    PropertiesService.getScriptProperties().getProperty(CONFIG.PROP_DB_SPREADSHEET_ID));
  var sheet = ss.getSheetByName(SCENARIO_AUDIO_SHEET_);
  if (!sheet) {
    sheet = ss.insertSheet(SCENARIO_AUDIO_SHEET_);
    sheet.appendRow(DB_SCHEMA[SCENARIO_AUDIO_SHEET_]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function _scenAudioFolder_() {
  var it = DriveApp.getFoldersByName(SCENARIO_AUDIO_FOLDER_);
  return it.hasNext() ? it.next() : DriveApp.createFolder(SCENARIO_AUDIO_FOLDER_);
}

// Short, stable, and dependent on the text. Edit a clearance and its fingerprint
// changes, so the old clip stops matching and is re-rendered rather than being
// served under wording nobody wrote.
function _scenTextHash_(text) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5,
                                    String(text || '').trim(), Utilities.Charset.UTF_8);
  return raw.map(function(b) { return ('0' + (b & 0xff).toString(16)).slice(-2); })
            .join('').substring(0, 12);
}

/**
 * Renders every active scenario's ATC line, in several voices, to Drive.
 * Safe to run repeatedly — it skips what exists and resumes where it stopped.
 * Run from the editor — TTSService.gs.
 */
function renderScenarioAudio() {
  var started = Date.now();
  var sheet   = _scenAudioSheet_();
  var folder  = _scenAudioFolder_();

  // What is already rendered, keyed the way it will be looked up.
  var have = {};
  var existing = dbReadAll_(SCENARIO_AUDIO_SHEET_);
  existing.forEach(function(r) {
    have[String(r.textHash) + '|' + String(r.country) + '|' + String(r.voice)] = true;
  });

  // One entry per distinct line+country. The same clearance in two levels is one
  // render, not two.
  var wanted = {};
  dbReadAll_('Scenarios').forEach(function(s) {
    if (String(s.isActive).toUpperCase() === 'FALSE') return;
    var text = String(s.atcText || '').trim();
    if (!text) return;
    var country = String(s.country || 'USA').trim().toUpperCase();
    wanted[_scenTextHash_(text) + '|' + country] = { text: text, country: country };
  });

  var todo = [];
  Object.keys(wanted).forEach(function(k) {
    var w       = wanted[k];
    var profile = TTSService.getProfileByCountry_(w.country);
    var voices  = (profile.voiceNames || []).slice(0, SCENARIO_AUDIO_VOICES_);
    voices.forEach(function(v) {
      if (!have[k + '|' + v]) todo.push({ key: k, text: w.text, country: w.country,
                                          voice: v, profile: profile });
    });
  });

  if (!todo.length) {
    var doneMsg = 'Nothing to render — every line has ' + SCENARIO_AUDIO_VOICES_ +
                  ' voice(s). ' + existing.length + ' file(s) on record.';
    Logger.log(doneMsg);
    return doneMsg;
  }

  var done = 0, failed = 0, stopped = false;
  for (var i = 0; i < todo.length; i++) {
    if (Date.now() - started > SCENARIO_RENDER_BUDGET_MS_) { stopped = true; break; }
    var t = todo[i];
    try {
      var rate   = Number(t.profile.speakingRate || 0.95);
      var ssml   = TTSService.buildAtcSsml_(t.text, t.profile, rate, t.voice);
      var result = TTSService.callGoogleTtsWithFallbackVoices_(
        ssml, { languageCode: t.profile.languageCode, pitch: t.profile.pitch,
                effectsProfileId: t.profile.effectsProfileId, voiceNames: [t.voice] }, rate);
      if (!result || !result.audioBase64) throw new Error('no audio returned');

      var parts = t.key.split('|');
      var blob  = Utilities.newBlob(Utilities.base64Decode(result.audioBase64), 'audio/mpeg',
                                    parts[0] + '__' + parts[1] + '__' + t.voice + '.mp3');
      var file  = folder.createFile(blob);

      dbAppend_(SCENARIO_AUDIO_SHEET_, {
        audioId:      'sa_' + parts[0] + '_' + t.voice,
        textHash:     parts[0],
        country:      t.country,
        voice:        t.voice,
        speakingRate: rate,
        fileId:       file.getId(),
        chars:        t.text.length,
        sample:       t.text.substring(0, 60),
        createdAt:    new Date().toISOString()
      });
      done++;
    } catch (e) {
      Logger.log('FAILED ' + t.country + ' ' + t.voice + ': ' + e.message);
      failed++;
    }
  }

  var left = todo.length - done - failed;
  var msg = 'Rendered ' + done + ', failed ' + failed + ', remaining ' + left +
            (stopped ? '\nStopped before the six-minute limit — run renderScenarioAudio again.'
                     : (left ? '' : '\nComplete.'));
  Logger.log(msg);
  return msg;
}

/** Reports coverage: which lines have audio, in how many voices, and which have none. */
function checkScenarioAudio() {
  var rendered = {};
  try {
    dbReadAll_(SCENARIO_AUDIO_SHEET_).forEach(function(r) {
      var k = String(r.textHash) + '|' + String(r.country);
      (rendered[k] = rendered[k] || []).push(String(r.voice));
    });
  } catch (e) {
    Logger.log('No ' + SCENARIO_AUDIO_SHEET_ + ' sheet yet — run renderScenarioAudio.');
    return 'Not set up.';
  }

  var lines = {}, missing = [];
  dbReadAll_('Scenarios').forEach(function(s) {
    if (String(s.isActive).toUpperCase() === 'FALSE') return;
    var text = String(s.atcText || '').trim();
    if (!text) return;
    var k = _scenTextHash_(text) + '|' + String(s.country || 'USA').trim().toUpperCase();
    lines[k] = true;
    if (!rendered[k]) missing.push(String(s.scenarioId || '?') + ' (' + text.substring(0, 40) + '…)');
  });

  var total = Object.keys(lines).length;
  var withAudio = Object.keys(lines).filter(function(k) { return !!rendered[k]; }).length;
  var full = Object.keys(lines).filter(function(k) {
    return (rendered[k] || []).length >= SCENARIO_AUDIO_VOICES_;
  }).length;

  var out = [];
  out.push(total + ' distinct line+country pair(s)');
  out.push('   ' + withAudio + ' have at least one recording');
  out.push('   ' + full + ' have all ' + SCENARIO_AUDIO_VOICES_ + ' voices');
  out.push('   ' + (total - withAudio) + ' have none — these still synthesise live');
  if (missing.length) {
    out.push('');
    out.push('Without audio:');
    missing.slice(0, 15).forEach(function(m) { out.push('   ' + m); });
    if (missing.length > 15) out.push('   … and ' + (missing.length - 15) + ' more');
  }
  var msg = out.join('\n');
  Logger.log(msg);
  return msg;
}

/* ─── PHASE 2: serve what was rendered ────────────────────────────────────────
 * Finds a recording for a line and returns it, choosing at random between the
 * voices that exist so the same clearance is not always the same controller.
 *
 * Returns null rather than throwing when a line has no recording: a half-rendered
 * library is the normal state during a render, and the caller falls through to
 * live synthesis exactly as before.
 * ─────────────────────────────────────────────────────────────────────────── */

// The sheet is read once per execution and held. A route asks for eight or nine
// lines in a few minutes, and reading the whole sheet for each of them is most of
// the latency this phase exists to remove.
var _SCEN_AUDIO_INDEX_ = null;

function _scenAudioIndex_() {
  if (_SCEN_AUDIO_INDEX_) return _SCEN_AUDIO_INDEX_;
  var idx = {};
  try {
    dbReadAll_(SCENARIO_AUDIO_SHEET_).forEach(function(r) {
      var fileId = String(r.fileId || '').trim();
      if (!fileId) return;
      var k = String(r.textHash) + '|' + String(r.country || '').toUpperCase();
      (idx[k] = idx[k] || []).push({
        voice: String(r.voice || ''), fileId: fileId,
        speakingRate: Number(r.speakingRate || 0) || null
      });
    });
  } catch (e) { /* sheet not created yet — every line falls through to synthesis */ }
  _SCEN_AUDIO_INDEX_ = idx;
  return idx;
}

function _scenPickRendered_(text, country, preferredVoice) {
  var key  = _scenTextHash_(text) + '|' + String(country || 'USA').trim().toUpperCase();
  var list = _scenAudioIndex_()[key];
  if (!list || !list.length) return null;

  var pick = null;
  var want = String(preferredVoice || '').trim();
  if (want) {
    for (var i = 0; i < list.length; i++) if (list[i].voice === want) { pick = list[i]; break; }
  }
  // Random among what exists, which is the point of rendering more than one.
  if (!pick) pick = list[Math.floor(Math.random() * list.length)];

  // The bytes are cached separately from the index. Reading a Drive file is the
  // slow part, and the six-hour life is fine here because losing it costs a Drive
  // read rather than a synthesis.
  var cacheKey = 'scenaud_' + pick.fileId;
  try {
    var hit = CacheService.getScriptCache().get(cacheKey);
    if (hit) return { audioBase64: hit, voice: pick.voice, speakingRate: pick.speakingRate };
  } catch (e) {}

  try {
    var b64 = Utilities.base64Encode(DriveApp.getFileById(pick.fileId).getBlob().getBytes());
    try {
      if (b64.length < 95000) CacheService.getScriptCache().put(cacheKey, b64, 21600);
    } catch (e) {}
    return { audioBase64: b64, voice: pick.voice, speakingRate: pick.speakingRate };
  } catch (e) {
    // The row points at a file that is gone. Fall through to synthesis rather
    // than fail the line, and say so, because it means the sheet is stale.
    Logger.log('[scenario audio] missing Drive file ' + pick.fileId + ': ' + e.message);
    return null;
  }
}
