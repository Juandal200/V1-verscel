/**
 * ICAO Language Proficiency Test — item bank.
 *
 * These twelve recordings and two pictures used to be hardcoded constants inside
 * Scripts.html, which meant every candidate sat the identical exam in the
 * identical order for ever, and changing a single word required a code deploy.
 * They now live in the IcaoTestItems sheet, editable like Scenarios.
 *
 * The seed below is the exact content that was in the client, so running
 * setupIcaoTestItems() reproduces today's exam and nothing is lost. The client
 * still carries the same constants as a fallback: if this sheet is missing,
 * empty or unreachable, the exam runs on them rather than failing.
 *
 * No audio files exist. `script` is spoken by Google TTS at runtime;
 * `transcript` is the ground truth handed to the examiner for grading, and is
 * deliberately terser than the script.
 */

var ICAO_ITEMS_SHEET_ = 'IcaoTestItems';
var ICAO_ITEMS_BANK_  = 'DEFAULT';

var ICAO_EXAMINER_VOICE_ = 'en-GB-Chirp3-HD-Schedar';
var ICAO_EXAMINER_LANG_  = 'en-GB';

var ICAO_TEST_SEED_ = [
    { itemId:'line_open_full', itemType:'LINE', section:'1', orderIndex:10,
      voice:ICAO_EXAMINER_VOICE_, lang:ICAO_EXAMINER_LANG_,
      script:'Good day. This is your ICAO language proficiency test. We begin with Part 1, the interview.' },
    { itemId:'line_open_p2', itemType:'LINE', section:'2A', orderIndex:11,
      voice:ICAO_EXAMINER_VOICE_, lang:ICAO_EXAMINER_LANG_,
      script:'Good day. This is Part 2, listening comprehension. Press play when you are ready.' },
    { itemId:'line_open_p3', itemType:'LINE', section:'3', orderIndex:12,
      voice:ICAO_EXAMINER_VOICE_, lang:ICAO_EXAMINER_LANG_,
      script:'Good day. This is Part 3, picture description.' },
    { itemId:'line_2a_question', itemType:'LINE', section:'2A', orderIndex:1,
      voice:ICAO_EXAMINER_VOICE_, lang:ICAO_EXAMINER_LANG_,
      script:'What was the message, and who was speaking \u2014 pilot or controller, and why?' },
    { itemId:'line_part1_close', itemType:'LINE', section:'1', orderIndex:7,
      voice:ICAO_EXAMINER_VOICE_, lang:ICAO_EXAMINER_LANG_,
      script:'Thank you. That completes Part 1. Part 2 next, listening comprehension.' },
    { itemId:'line_2b_intro', itemType:'LINE', section:'2B', orderIndex:13,
      voice:ICAO_EXAMINER_VOICE_, lang:ICAO_EXAMINER_LANG_,
      script:'These recordings are longer. You may take notes if you wish.' },
    { itemId:'line_2b_question', itemType:'LINE', section:'2B', orderIndex:8,
      voice:ICAO_EXAMINER_VOICE_, lang:ICAO_EXAMINER_LANG_,
      script:'Report what you can.' },
    { itemId:'line_p3_describe', itemType:'LINE', section:'3', orderIndex:9,
      voice:ICAO_EXAMINER_VOICE_, lang:ICAO_EXAMINER_LANG_,
      script:'Please describe this picture.' },
    { itemId:'line_p3_similar', itemType:'LINE', section:'3', orderIndex:10,
      voice:ICAO_EXAMINER_VOICE_, lang:ICAO_EXAMINER_LANG_,
      script:'How is the first image similar to the second one?' },
    { itemId:'line_p3_different', itemType:'LINE', section:'3', orderIndex:11,
      voice:ICAO_EXAMINER_VOICE_, lang:ICAO_EXAMINER_LANG_,
      script:'How is the first image different to the second one?' },
    { itemId:'line_exam_end', itemType:'LINE', section:'3', orderIndex:12,
      voice:ICAO_EXAMINER_VOICE_, lang:ICAO_EXAMINER_LANG_,
      script:'Thank you. That is the end of the exam.' },
    { itemId:'line_2c_q1', itemType:'LINE', section:'2C', orderIndex:5,
      voice:ICAO_EXAMINER_VOICE_, lang:ICAO_EXAMINER_LANG_,
      script:'What questions would you ask the speaker?' },
    { itemId:'line_2c_q2', itemType:'LINE', section:'2C', orderIndex:6,
      voice:ICAO_EXAMINER_VOICE_, lang:ICAO_EXAMINER_LANG_,
      script:'What advice would you give?' },
    { itemId:'line_ack_next', itemType:'LINE', section:'2A', orderIndex:2,
      voice:ICAO_EXAMINER_VOICE_, lang:ICAO_EXAMINER_LANG_,
      script:'Thank you. Next recording.' },
    { itemId:'line_ack_next_picture', itemType:'LINE', section:'3', orderIndex:4,
      voice:ICAO_EXAMINER_VOICE_, lang:ICAO_EXAMINER_LANG_,
      script:'Thank you. Next picture.' },
    { itemId:'line_section_close', itemType:'LINE', section:'2A', orderIndex:3,
      voice:ICAO_EXAMINER_VOICE_, lang:ICAO_EXAMINER_LANG_,
      script:'Thank you. That completes this section.' },
    { itemId:'interview_1', itemType:'INTERVIEW', section:'1', orderIndex:1,
      voice:ICAO_EXAMINER_VOICE_, lang:ICAO_EXAMINER_LANG_,
      script:'To begin, please tell me about your current position. What aircraft do you fly, and where do you normally operate?',
      description:'The candidate\'s current role and the aircraft type or sector they work' },
    { itemId:'interview_2', itemType:'INTERVIEW', section:'1', orderIndex:2,
      voice:ICAO_EXAMINER_VOICE_, lang:ICAO_EXAMINER_LANG_,
      script:'How long have you been flying, and how did you train for this role?',
      description:'Years of experience and how they trained for the role' },
    { itemId:'interview_3', itemType:'INTERVIEW', section:'1', orderIndex:3,
      voice:ICAO_EXAMINER_VOICE_, lang:ICAO_EXAMINER_LANG_,
      script:'Tell me about one operational difficulty you face regularly in your work, and how you deal with it.',
      description:'One operational challenge they face in their daily work' },
    { itemId:'interview_4', itemType:'INTERVIEW', section:'1', orderIndex:4,
      voice:ICAO_EXAMINER_VOICE_, lang:ICAO_EXAMINER_LANG_,
      script:'In your opinion, what is the most serious safety issue facing aviation today? Please explain why.',
      description:'An opinion on an aviation safety issue' },
    { itemId:'interview_5', itemType:'INTERVIEW', section:'1', orderIndex:5,
      voice:ICAO_EXAMINER_VOICE_, lang:ICAO_EXAMINER_LANG_,
      script:'How has technology changed the way pilots and controllers communicate? What do you think about those changes?',
      description:'A general aviation topic - weather, technology, or industry change' },
    { itemId:'part_2a_1', itemType:'AUDIO', section:'2A', orderIndex:1,
      voice:'en-US-Chirp3-HD-Fenrir', lang:'en-US',
      script:'Mayday mayday mayday, Delta four seven heavy, we have an engine fire on number two, requesting immediate return to Atlanta, souls on board three hundred and twelve, fuel nine hours, mayday delta four seven heavy.',
      transcript:'Mayday mayday mayday, Delta four seven heavy, engine fire on number two, requesting immediate return to Atlanta, souls on board three hundred and twelve, fuel nine hours.' },
    { itemId:'part_2a_2', itemType:'AUDIO', section:'2A', orderIndex:2,
      voice:'en-GB-Chirp3-HD-Alnilam', lang:'en-GB',
      script:'Speedbird two one seven, go around, I say again go around, runway occupied, climb straight ahead to three thousand feet, contact approach on one two four decimal four.',
      transcript:'Speedbird two one seven, go around, runway occupied, climb straight ahead three thousand feet, contact approach one two four decimal four.' },
    { itemId:'part_2a_3', itemType:'AUDIO', section:'2A', orderIndex:3,
      voice:'en-AU-Chirp3-HD-Algenib', lang:'en-AU',
      script:'Pan pan pan pan pan pan, Qantas five eight nine, minimum fuel, we have approximately twenty minutes of fuel remaining, request direct to the field and expedite our approach.',
      transcript:'Pan pan pan, Qantas five eight nine, minimum fuel, twenty minutes remaining, request direct and expedite approach.' },
    { itemId:'part_2a_4', itemType:'AUDIO', section:'2A', orderIndex:4,
      voice:'en-IN-Chirp3-HD-Erinome', lang:'en-IN',
      script:'Mumbai control, IndiGo seven seven two, we have a passenger with a suspected cardiac emergency on board, request priority handling and have emergency services standing by on arrival.',
      transcript:'IndiGo seven seven two, passenger cardiac emergency, request priority handling, emergency services on arrival.' },
    { itemId:'part_2a_5', itemType:'AUDIO', section:'2A', orderIndex:5,
      voice:'en-US-Chirp3-HD-Charon', lang:'en-US',
      script:'Stop stop stop. United four four nine, stop immediately, traffic on the runway. I say again, stop immediately.',
      transcript:'Stop stop stop, United four four nine, stop immediately, traffic on the runway.' },
    { itemId:'part_2a_6', itemType:'AUDIO', section:'2A', orderIndex:6,
      voice:'en-GB-Chirp3-HD-Sulafat', lang:'en-GB',
      script:'Speedbird four five one, be advised we have reports of a flock of birds at approximately two thousand feet on your approach path. Suggest you expedite through that altitude and report any bird strike on vacating the runway.',
      transcript:'Speedbird four five one, birds reported two thousand feet on approach, expedite through that altitude, report bird strike vacating runway.' },
    { itemId:'part_2b_1', itemType:'AUDIO', section:'2B', orderIndex:7,
      voice:'en-GB-Chirp3-HD-Iapetus', lang:'en-GB',
      script:'London control, Ryanair four six zero, we have a hydraulic failure, system one is inoperative, we have limited braking capability and will require foam on the runway and emergency services standing by. We are maintaining normal flight at present but anticipate difficulties on landing. Request immediate diversion to the nearest suitable airport.',
      transcript:'Ryanair four six zero, hydraulic failure, system one inoperative, limited braking, require foam and emergency services, normal flight maintained but landing difficulties anticipated, request diversion nearest suitable airport.' },
    { itemId:'part_2b_2', itemType:'AUDIO', section:'2B', orderIndex:8,
      voice:'en-US-Chirp3-HD-Despina', lang:'en-US',
      script:'Approach, American eight eight one, we are encountering severe turbulence and have indications of embedded thunderstorms on our route. We are unable to continue on our current track and request a forty mile deviation to the north. We also have two passengers with minor injuries from the turbulence. We do not require emergency assistance at this time but wanted you to be aware of the situation.',
      transcript:'American eight eight one, severe turbulence, embedded thunderstorms on route, unable to continue current track, request forty mile deviation north, two passengers minor injuries, no emergency assistance required.' },
    { itemId:'part_2b_3', itemType:'AUDIO', section:'2B', orderIndex:9,
      voice:'en-AU-Chirp3-HD-Orus', lang:'en-AU',
      script:'Sydney departure, Jetstar two four one, we have had a bird strike on both engines immediately after takeoff. Engine one has significant vibration and we are shutting it down. Engine two appears normal. Declaring an emergency, full fuel, one hundred and eighty souls on board, need to return to Sydney, will require foam on the runway.',
      transcript:'Jetstar two four one, bird strike both engines, shutting down engine one, engine two appears normal, declaring emergency, full fuel, one hundred eighty souls, returning Sydney, require foam.' },
    { itemId:'part_2c_1', itemType:'AUDIO', section:'2C', orderIndex:10,
      voice:'en-US-Chirp3-HD-Puck', lang:'en-US',
      script:'Centre, we have smoke in the cockpit. Donning oxygen masks now. Visibility reducing. Declaring an emergency, requesting immediate descent and direct routing to nearest airport. Two hundred and forty souls on board, fuel three hours.',
      transcript:'Smoke in cockpit, donning oxygen masks, visibility reducing, declaring emergency, immediate descent required, direct nearest airport, two hundred forty souls, three hours fuel.' },
    { itemId:'part_2c_2', itemType:'AUDIO', section:'2C', orderIndex:11,
      voice:'en-GB-Chirp3-HD-Aoede', lang:'en-GB',
      script:'Mayday, we have an unruly passenger threatening crew members and attempting to access the flight deck. We have been unable to restrain this individual and are diverting immediately. Request police meet the aircraft on arrival. Approximately forty minutes from our alternate.',
      transcript:'Mayday, unruly passenger threatening crew, attempting flight deck access, unable to restrain, diverting, request police on arrival, forty minutes from alternate.' },
    { itemId:'part_2c_3', itemType:'AUDIO', section:'2C', orderIndex:12,
      voice:'en-AU-Chirp3-HD-Vindemiatrix', lang:'en-AU',
      script:'Tower, Qantas one seven three, windshear alert, going around. Encountered significant windshear on final at five hundred feet, airspeed excursion forty knots. Climbing out, need to hold thirty minutes, advise other traffic of windshear.',
      transcript:'Qantas one seven three, windshear alert going around, windshear at five hundred feet, forty knot airspeed excursion, holding thirty minutes, advise traffic.' },
    { itemId:'image_1', itemType:'IMAGE', section:'3', orderIndex:1,
      label:'IMAGE 1 — ATC Operations Room', imageUrl:'',
      description:'An air traffic control operations room. Controllers seated at radar screens displaying green returns on dark backgrounds. Headsets on, microphones active. Strip holders on desks. A large flight progress board on the far wall. Low lighting. The atmosphere is focused and quiet.' },
    { itemId:'image_2', itemType:'IMAGE', section:'3', orderIndex:2,
      label:'IMAGE 2 — Runway Environment', imageUrl:'',
      description:'An airport runway seen from the control tower. A commercial aircraft on short final approach, undercarriage extended, full flap, aligned with centreline. Ground vehicles on the apron to the left. Windsock visible indicating crosswind. Threshold markings and PAPI lights visible. Overcast sky.' }
];

function _icaoSeedRow_(it, headers, stamp) {
  var obj = {
    itemId:      it.itemId,
    bank:        ICAO_ITEMS_BANK_,
    itemType:    it.itemType,
    section:     it.section,
    orderIndex:  it.orderIndex,
    voice:       it.voice       || '',
    lang:        it.lang        || '',
    script:      it.script      || '',
    transcript:  it.transcript  || '',
    label:       it.label       || '',
    imageUrl:    it.imageUrl    || '',
    description: it.description || '',
    isActive:    true,
    createdAt:   stamp,
    updatedAt:   stamp
  };
  return headers.map(function(h) { return obj[h] !== undefined ? obj[h] : ''; });
}

/**
 * Adds any seed item the sheet does not already have, and touches nothing else.
 * This is the one to run after an update that introduces new item types — it will
 * not overwrite wording you have edited or rows you have added.
 *
 * The Apps Script Run button cannot pass arguments, so this exists as its own
 * no-arg function rather than a flag on setupIcaoTestItems.
 */
function addMissingIcaoTestItems() {
  var ss = dbGetSpreadsheet_();
  var headers = DB_SCHEMA[ICAO_ITEMS_SHEET_];
  var sheet = ss.getSheetByName(ICAO_ITEMS_SHEET_);
  if (!sheet) return setupIcaoTestItems();

  // Presence is keyed on itemId ALONE, deliberately ignoring which bank it sits
  // in. The seed is factory content; if part_2a_1 already exists anywhere it has
  // been placed, possibly under a renamed bank. Keying on bank+itemId meant that
  // renaming DEFAULT to VERSION_A and then running this would silently re-inject
  // all 19 factory rows as a second DEFAULT bank — which the random picker would
  // then start serving to candidates.
  var last = sheet.getLastRow();
  var have = {};
  if (last > 1) {
    var idCol = headers.indexOf('itemId') + 1;
    var ids   = sheet.getRange(2, idCol, last - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      var id = String(ids[i][0] || '').trim();
      if (id) have[id] = true;
    }
  }

  var stamp = now_();
  var rows = [];
  ICAO_TEST_SEED_.forEach(function(it) {
    if (have[it.itemId]) return;
    rows.push(_icaoSeedRow_(it, headers, stamp));
  });

  if (!rows.length) {
    Logger.log('Nothing to add — every seed item is already in ' + ICAO_ITEMS_SHEET_ + '.');
    return { ok: true, added: 0 };
  }

  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
  Logger.log('Added ' + rows.length + ' missing item(s): ' +
             rows.map(function(r) { return r[headers.indexOf('itemId')]; }).join(', '));
  return { ok: true, added: rows.length };
}

/**
 * DESTRUCTIVE. Clears every row of the DEFAULT bank and rewrites the seed, losing
 * any edits. Only for putting the sheet back to factory content.
 */
function reseedIcaoTestItemsDESTRUCTIVE() {
  return setupIcaoTestItems(true);
}

/**
 * Creates the sheet if absent, writes headers, and seeds it when empty.
 * Safe to re-run: it never overwrites rows unless force is true.
 * Run from the Apps Script editor.
 */
function setupIcaoTestItems(force) {
  var ss = dbGetSpreadsheet_();
  var headers = DB_SCHEMA[ICAO_ITEMS_SHEET_];
  var sheet = ss.getSheetByName(ICAO_ITEMS_SHEET_);

  if (!sheet) {
    sheet = ss.insertSheet(ICAO_ITEMS_SHEET_);
    Logger.log('Created sheet ' + ICAO_ITEMS_SHEET_);
  }

  sheet.getRange(1, 1, 1, headers.length).setValues([headers])
       .setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');
  sheet.setFrozenRows(1);

  var existing = sheet.getLastRow() - 1;
  if (existing > 0 && !force) {
    Logger.log(ICAO_ITEMS_SHEET_ + ' already has ' + existing +
               ' rows — left alone. Pass true to reseed.');
    return { ok: true, seeded: 0, existing: existing };
  }
  if (existing > 0) sheet.getRange(2, 1, existing, headers.length).clearContent();

  var stamp = now_();
  var rows = ICAO_TEST_SEED_.map(function(it) { return _icaoSeedRow_(it, headers, stamp); });

  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  Logger.log('Seeded ' + rows.length + ' rows into ' + ICAO_ITEMS_SHEET_);
  return { ok: true, seeded: rows.length };
}

/**
 * Validates the item sheet and logs every problem it finds.
 *
 * Nearly everything that can be got wrong here fails silently at exam time: a
 * recording with no transcript is graded against nothing, a bank holding nine of
 * twelve items is still served as a complete paper, a duplicated orderIndex
 * leaves the running order undefined. Run this after editing, and before setting
 * a new version live.
 */
function checkIcaoTestItems() {
  var problems = [], notes = [];
  var rows;
  try {
    rows = dbReadAll_(ICAO_ITEMS_SHEET_);
  } catch (e) {
    Logger.log('ERROR  sheet ' + ICAO_ITEMS_SHEET_ + ' not found. Run setupIcaoTestItems().');
    return { ok: false };
  }

  var seenId = {}, seenOrder = {}, byBank = {};

  rows.forEach(function(r, i) {
    var where = 'row ' + (i + 2) + ' (' + (r.itemId || 'no itemId') + ')';
    var id    = String(r.itemId || '').trim();
    var bank  = String(r.bank || ICAO_ITEMS_BANK_).trim().toUpperCase();
    var type  = String(r.itemType || '').trim().toUpperCase();
    var live  = String(r.isActive).toUpperCase() !== 'FALSE';

    if (!id)   { problems.push(where + ': itemId is empty'); return; }
    if (!bank) { problems.push(where + ': bank is empty'); }

    // LINE was added after this check was written — the examiner's own fixed
    // phrases are rows like any other, and are pre-rendered for the same reason
    // the recordings are. Omitting it here reported all 16 of them as broken data.
    if (['AUDIO', 'IMAGE', 'INTERVIEW', 'LINE'].indexOf(type) === -1) {
      problems.push(where + ': itemType "' + r.itemType + '" is not AUDIO, IMAGE, INTERVIEW or LINE');
      return;
    }

    if (seenId[bank + '|' + id]) problems.push(where + ': duplicate itemId in bank ' + bank);
    seenId[bank + '|' + id] = true;

    if (!live) { notes.push(where + ': isActive FALSE — excluded from the exam'); return; }

    var okey = bank + '|' + type + '|' + Number(r.orderIndex || 0);
    if (seenOrder[okey]) {
      problems.push(where + ': orderIndex ' + r.orderIndex + ' is already used by another ' +
                    type + ' item in bank ' + bank + ' — running order is undefined');
    }
    seenOrder[okey] = true;

    byBank[bank] = byBank[bank] || { AUDIO: 0, IMAGE: 0, INTERVIEW: 0, LINE: 0 };
    byBank[bank][type]++;

    if (type === 'AUDIO') {
      if (!String(r.script || '').trim())     problems.push(where + ': AUDIO has no script — it cannot be spoken and is dropped');
      if (!String(r.transcript || '').trim()) problems.push(where + ': AUDIO has no transcript — the examiner would grade against nothing');
      if (!String(r.voice || '').trim())      problems.push(where + ': AUDIO has no voice');
      if (!String(r.lang || '').trim())       problems.push(where + ': AUDIO has no lang');
      if (['2A','2B','2C'].indexOf(String(r.section || '').trim().toUpperCase()) === -1) {
        problems.push(where + ': AUDIO section "' + r.section + '" is not 2A, 2B or 2C — ' +
                      'section decides which questions the examiner asks');
      }
    }
    if (type === 'IMAGE') {
      var url = String(r.imageUrl || '').trim();
      if (!url) notes.push(where + ': IMAGE has no imageUrl — Part 3 shows the description only');
      else if (url.indexOf('http') !== 0) problems.push(where + ': imageUrl is not a URL');
      if (!String(r.description || '').trim()) problems.push(where + ': IMAGE has no description to fall back on');
    }
    if (type === 'INTERVIEW' && !String(r.description || '').trim()) {
      problems.push(where + ': INTERVIEW has no description — the topic is empty');
    }
    if (type === 'LINE' && !String(r.script || '').trim()) {
      problems.push(where + ': LINE has no script — there is nothing for the examiner to say');
    }
  });

  Object.keys(byBank).forEach(function(b) {
    var c = byBank[b];
    if (!c.AUDIO) problems.push('bank ' + b + ': no playable recordings — it will never be offered');
    else if (c.AUDIO < 12) notes.push('bank ' + b + ': only ' + c.AUDIO +
      ' recordings (DEFAULT has 12) — it is still served as a complete exam');
    if (!c.IMAGE)     notes.push('bank ' + b + ': no Part 3 pictures');
    if (!c.INTERVIEW) notes.push('bank ' + b + ': no interview topics — Part 1 falls back to the generic prompt topics');
    if (!c.LINE) notes.push('bank ' + b + ': no examiner lines of its own — a scripted sitting needs them, ' +
      'and without them the examiner\'s voice cannot follow this version\'s accent');
  });

  Logger.log('Banks: ' + JSON.stringify(byBank));
  problems.forEach(function(l) { Logger.log('PROBLEM  ' + l); });
  notes.forEach(function(l)    { Logger.log('note     ' + l); });
  if (!problems.length) Logger.log('No problems found across ' + rows.length + ' rows.');
  return { ok: !problems.length, problems: problems, notes: notes };
}

/**
 * Banks that are actually usable — active AND holding at least one playable
 * recording. A bank of pictures alone is not an exam, and offering it would hand
 * a candidate an empty listening section.
 */
var ICAO_AUDIO_FOLDER_ = 'AEROCOMMS ICAO Test Audio';

/**
 * Renders every recording to an MP3 in Drive, once, and writes the file id back
 * to the sheet.
 *
 * Clips were synthesised on demand, so the first candidate to reach an item paid
 * for the Text-to-Speech call and waited through it — and again after every cache
 * expiry or deploy. The text never changes between sittings, so neither should
 * the audio. Run this after editing any script, and after adding a version.
 *
 * Re-running only renders items whose audio is missing or whose script has
 * changed, so it is cheap to run often.
 */
function renderIcaoTestAudio(force) {
  var sheet   = dbGetSheet_(ICAO_ITEMS_SHEET_);
  var headers = DB_SCHEMA[ICAO_ITEMS_SHEET_];
  var rows    = dbReadAll_(ICAO_ITEMS_SHEET_);

  var it = DriveApp.getFoldersByName(ICAO_AUDIO_FOLDER_);
  var folder = it.hasNext() ? it.next() : DriveApp.createFolder(ICAO_AUDIO_FOLDER_);

  var fileCol = headers.indexOf('audioFileId') + 1;
  var done = 0, skipped = 0, failed = 0;

  rows.forEach(function(r) {
    // LINE items are the examiner's own repeated phrases. They are pre-rendered
    // for the same reason the recordings are: synthesised live they arrive late
    // and, on a cold start, as the browser's robot voice.
    // INTERVIEW was excluded because it used to hold a TOPIC, not speech — the
    // model was handed "years of experience" and phrased the question itself.
    // A scripted sitting has no one to phrase it, so those rows now carry the
    // question as written and have to be recorded like any other line. Left out,
    // every interview row would report as unrendered and refuse the sitting.
    var t = String(r.itemType || '').toUpperCase();
    if (t !== 'AUDIO' && t !== 'LINE' && t !== 'INTERVIEW') return;
    var script = String(r.script || '').trim();
    if (!script) return;

    var existing = String(r.audioFileId || '').trim();
    // The stored name carries a fingerprint of the script, so an edited script no
    // longer matches its old clip and is re-rendered instead of silently serving
    // the previous wording.
    var stamp = _icaoScriptStamp_(script, String(r.voice || ''));
    if (existing && !force) {
      try {
        if (DriveApp.getFileById(existing).getName().indexOf(stamp) !== -1) { skipped++; return; }
      } catch (e) { /* file gone — re-render */ }
    }

    try {
      var res = apiGenerateIcaoTestVoiceInternal_(script, String(r.voice || ''), String(r.lang || 'en-US'));
      if (!res || !res.audioBase64) throw new Error('no audio returned');
      var blob = Utilities.newBlob(Utilities.base64Decode(res.audioBase64), 'audio/mpeg',
                                   String(r.itemId) + '__' + stamp + '.mp3');
      var file = folder.createFile(blob);
      sheet.getRange(r.__rowNumber, fileCol).setValue(file.getId());
      if (existing) { try { DriveApp.getFileById(existing).setTrashed(true); } catch (e) {} }
      done++;
    } catch (e) {
      Logger.log('FAILED ' + r.itemId + ': ' + e.message);
      failed++;
    }
  });

  Logger.log('Rendered ' + done + ', already current ' + skipped + ', failed ' + failed);
  return { ok: failed === 0, rendered: done, skipped: skipped, failed: failed };
}

function _icaoScriptStamp_(script, voice) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, script + '|' + voice);
  return bytes.map(function(b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('').slice(0, 10);
}

function apiGenerateIcaoTestVoiceInternal_(text, voice, lang) {
  var country = (lang || '').indexOf('en-GB') === 0 ? 'UK'
              : (lang || '').indexOf('en-AU') === 0 ? 'AUSTRALIA'
              : (lang || '').indexOf('en-IN') === 0 ? 'INDIA' : 'USA';
  var profile = TTSService.getProfileByCountry_(country);
  var rate    = 0.93;
  var voices  = profile.voiceNames || [];
  var tryList = voice ? [voice].concat(voices.filter(function(v) { return v !== voice; })) : voices;
  var ssml    = TTSService.buildAtcSsml_(text, profile, rate, tryList[0]);
  return TTSService.callGoogleTtsWithFallbackVoices_(ssml, {
    languageCode: profile.languageCode, pitch: profile.pitch,
    effectsProfileId: profile.effectsProfileId, voiceNames: tryList
  }, rate);
}

/**
 * Returns a recording as base64. Serves the pre-rendered Drive clip when there is
 * one and only falls back to live synthesis when there is not, so a sheet that has
 * never been rendered still works — just slowly.
 *
 * It deliberately goes through Apps Script rather than handing the client a Drive
 * URL: the exam feeds this audio into a Web Audio analyser for the level meter,
 * and Drive serves no CORS headers, so a direct URL would fail to load.
 */
function apiGetIcaoTestAudio(sessionToken, itemId) {
  try {
    AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    var id = String(itemId || '').trim();
    if (!id) return { ok: false, error: 'No itemId' };

    var row = null;
    dbReadAll_(ICAO_ITEMS_SHEET_).forEach(function(r) {
      if (String(r.itemId || '').trim() === id) row = r;
    });
    if (!row) return { ok: false, error: 'Unknown item ' + id };

    var fileId = String(row.audioFileId || '').trim();
    if (fileId) {
      try {
        var blob = DriveApp.getFileById(fileId).getBlob();
        return { ok: true, audioBase64: Utilities.base64Encode(blob.getBytes()),
                 mimeType: 'audio/mp3', source: 'drive' };
      } catch (e) { /* fall through to live synthesis */ }
    }

    var res = apiGenerateIcaoTestVoiceInternal_(String(row.script || ''),
                                                String(row.voice || ''),
                                                String(row.lang  || 'en-US'));
    if (!res || !res.audioBase64) return { ok: false, error: 'Synthesis failed' };
    return { ok: true, audioBase64: res.audioBase64, mimeType: 'audio/mp3', source: 'tts' };
  } catch (err) {
    return { ok: false, error: (err && err.message) || 'Audio failed' };
  }
}

function _icaoUsableBanks_(rows) {
  var withAudio = {};
  rows.forEach(function(r) {
    if (String(r.isActive).toUpperCase() === 'FALSE') return;
    if (String(r.itemType || '').toUpperCase() !== 'AUDIO') return;
    if (!String(r.script || '').trim()) return;
    withAudio[String(r.bank || ICAO_ITEMS_BANK_).trim().toUpperCase()] = true;
  });
  return Object.keys(withAudio);
}

/**
 * Item bank for the client, shaped exactly like the constants it replaces so the
 * client can swap one for the other with no other changes.
 * Returns ok:false rather than throwing — the client falls back to its built-ins.
 */
function apiGetIcaoTestItems(sessionToken, bank) {
  try {
    AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);

    var rows;
    try {
      rows = dbReadAll_(ICAO_ITEMS_SHEET_);
    } catch (e) {
      return { ok: false, error: 'Item sheet not set up. Run setupIcaoTestItems().' };
    }

    // No bank named means "any version": pick one at random per sitting, so a
    // candidate cannot predict which paper they will get and a retake is unlikely
    // to repeat the one they just saw.
    var usable = _icaoUsableBanks_(rows);
    var wanted = String(bank || '').trim().toUpperCase();
    if (!wanted) {
      wanted = usable.length
        ? usable[Math.floor(Math.random() * usable.length)]
        : ICAO_ITEMS_BANK_;
    }

    var active = rows.filter(function(r) {
      if (String(r.isActive).toUpperCase() === 'FALSE') return false;
      var rb = String(r.bank || ICAO_ITEMS_BANK_).trim().toUpperCase();
      return rb === wanted;
    }).sort(function(a, b) {
      return (Number(a.orderIndex) || 0) - (Number(b.orderIndex) || 0);
    });

    var audio = {}, order = [], images = [], sections = [], interview = [], lines = {};
    active.forEach(function(r) {
      var id = String(r.itemId || '').trim();
      if (!id) return;
      var type = String(r.itemType || '').toUpperCase();
      if (type === 'LINE') {
        // Keyed on the normalised script so the client can look one up by what the
        // examiner actually said, without knowing item ids.
        var norm = _icaoNormLine_(r.script);
        if (norm) lines[norm] = id;
        return;
      }
      if (type === 'INTERVIEW') {
        var topic = String(r.description || r.label || '').trim();
        if (topic) interview.push(topic);
        return;
      }
      if (type === 'IMAGE') {
        images.push({
          id:    id,
          label: String(r.label || ''),
          src:   String(r.imageUrl || ''),
          desc:  String(r.description || '')
        });
      } else {
        // A recording with no script cannot be synthesised — skipping it here is
        // better than shipping a silent item into the exam.
        if (!String(r.script || '').trim()) return;
        audio[id] = {
          voice:      String(r.voice || ''),
          lang:       String(r.lang  || 'en-US'),
          script:     String(r.script || ''),
          transcript: String(r.transcript || r.script || '')
        };
        order.push(id);
        // The client derives every 2A/2B/2C boundary from this rather than
        // assuming a 6/3/3 split, so the bank can be resized freely.
        sections.push(String(r.section || '2A').trim().toUpperCase());
      }
    });

    if (!order.length) return { ok: false, error: 'No active audio items in bank ' + wanted };

    return { ok: true, bank: wanted, versions: usable.length,
             audio: audio, order: order, sections: sections,
             images: images, interview: interview, lines: lines };
  } catch (err) {
    return { ok: false, error: (err && err.message) || 'Failed to load item bank' };
  }
}


/**
 * Stores one end-of-section report. Sections are graded as the exam runs so a
 * candidate sees where they stand before the end, and so a partial sitting still
 * leaves a record — the final table only ever existed for a completed exam.
 * Creates its own sheet, because a report that fails to save is worse than useless.
 */
function apiSaveIcaoSectionReport(sessionToken, payload) {
  try {
    var user = AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);
    payload = payload || {};
    var bands = payload.bands || {};

    var name = 'IcaoTestSectionReports';
    var ss = dbGetSpreadsheet_();
    if (!ss.getSheetByName(name)) {
      var sh = ss.insertSheet(name);
      sh.getRange(1, 1, 1, DB_SCHEMA[name].length).setValues([DB_SCHEMA[name]])
        .setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');
      sh.setFrozenRows(1);
    }

    dbAppend_(name, {
      reportId:      'SEC-' + String(user.userId || '').slice(-6) + '-' + Date.now(),
      userId:        user.userId,
      bank:          String(payload.bank    || ''),
      scope:         String(payload.scope   || ''),
      section:       String(payload.section || ''),
      pronunciation: Number(bands.pronunciation) || 0,
      structure:     Number(bands.structure)     || 0,
      vocabulary:    Number(bands.vocabulary)    || 0,
      fluency:       Number(bands.fluency)       || 0,
      comprehension: Number(bands.comprehension) || 0,
      interactions:  Number(bands.interactions)  || 0,
      strength:      String(payload.strength || ''),
      improve:       String(payload.improve  || ''),
      note:          String(payload.note     || ''),
      createdAt:     now_()
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err && err.message) || 'Save failed' };
  }
}


/**
 * Normalises an examiner utterance so a pre-recorded clip can be matched to what
 * the model actually said. Punctuation, case and dash style drift between turns;
 * the words do not.
 */
function _icaoNormLine_(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/* ═══════════════════════════════════════════════════════════════════════════
 * SCRIPTED TEST — the ordered step list a sitting is played from.
 *
 * The exam used to be conducted by the language model: it decided what to say
 * next, in its own words, and the client tried to follow along. Nearly every
 * fault we chased came from that — wording drifting away from the phrases the
 * client watched for, turns advancing twice or not at all, and above all the
 * voice, because a line invented at the moment it is needed has to be
 * synthesised live and can arrive late or not at all.
 *
 * Here the sitting is data. Rows in orderIndex order, each one a step: something
 * the examiner says, a recording to play, an image to show, or a question that
 * opens the mic. The model still grades, once, at the end, on the full
 * transcript — which is the part it is actually good at.
 *
 * A version is a bank. Set every row's voice to a US voice and bank A is
 * American throughout, examiner included, because the examiner's own lines are
 * rows too. Adding version D is data entry plus renderIcaoTestAudio.
 * ═══════════════════════════════════════════════════════════════════════════ */

// Fallback answer windows, used only when a row leaves answerSeconds blank, so a
// half-filled bank still runs. A populated sheet overrides all of these.
var ICAO_DEFAULT_ANSWER_SECS_ = {
  INTERVIEW: 120,
  IMAGE:     120,
  '2A':       60,
  '2B':       90,
  '2C':       60
};

// An explicit value in the sheet, else the structural default the assembler
// passes, else the per-type fallback.
function _icaoRowSecs_(row, fallback) {
  var raw = String(row.answerSeconds == null ? '' : row.answerSeconds).trim();
  if (raw !== '') {
    var n = Number(raw);
    if (!isNaN(n) && n >= 0) return Math.min(600, Math.round(n));
  }
  if (fallback !== undefined) return Number(fallback) || 0;
  return _icaoAnswerSecs_(row);
}

function _icaoAnswerSecs_(row) {
  var raw = String(row.answerSeconds == null ? '' : row.answerSeconds).trim();
  if (raw !== '') {
    var n = Number(raw);
    // A row that explicitly says 0 means "play and move on" — honour it.
    if (!isNaN(n) && n >= 0) return Math.min(600, Math.round(n));
  }
  var type = String(row.itemType || '').toUpperCase();
  if (type === 'LINE')  return 0;   // transitions never open the mic
  if (type === 'AUDIO') return 0;   // the recording is listened to, not answered
  if (type === 'INTERVIEW') return ICAO_DEFAULT_ANSWER_SECS_.INTERVIEW;
  if (type === 'IMAGE')     return ICAO_DEFAULT_ANSWER_SECS_.IMAGE;
  return ICAO_DEFAULT_ANSWER_SECS_[String(row.section || '').toUpperCase()] || 0;
}

/**
 * The whole sitting, in order, for one bank.
 *
 * Returns ok:false rather than throwing; the client shows the failure instead of
 * starting an exam it cannot finish.
 */
function apiGetIcaoTestScript(sessionToken, bank) {
  try {
    AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);

    var rows;
    try {
      rows = dbReadAll_(ICAO_ITEMS_SHEET_);
    } catch (e) {
      return { ok: false, error: 'Item sheet not set up. Run setupIcaoTestItems().' };
    }

    var usable = _icaoUsableBanks_(rows);
    if (!usable.length) return { ok: false, error: 'No usable version in the item bank.' };

    // No bank named means "any version": one is drawn per sitting, so a candidate
    // cannot predict which paper they will get and a retake is unlikely to repeat.
    var wanted = String(bank || '').trim().toUpperCase();
    if (!wanted || usable.indexOf(wanted) === -1) {
      wanted = usable[Math.floor(Math.random() * usable.length)];
    }

    // Assembled from the exam's structure, NOT from a flat orderIndex sort.
    //
    // orderIndex is numbered per type — interview 1-5, audio 1-12, images 1-2, and
    // the lines have their own run — so sorting the whole bank by it interleaves
    // interview_1, part_2a_1, image_1 and line_2a_question at position 1 and the
    // running order is meaningless. The duplicate-orderIndex warnings from
    // checkIcaoTestItems are the same fact seen from the sheet's side.
    //
    // Building it here also means adding a thirteenth 2A recording drops into the
    // right place on its own, with nothing to renumber.
    var byType = { AUDIO: [], IMAGE: [], INTERVIEW: [], LINE: {} };
    rows.filter(function(r) {
      if (String(r.isActive).toUpperCase() === 'FALSE') return false;
      return String(r.bank || ICAO_ITEMS_BANK_).trim().toUpperCase() === wanted;
    }).sort(function(a, b) {
      return (Number(a.orderIndex) || 0) - (Number(b.orderIndex) || 0);
    }).forEach(function(r) {
      var t = String(r.itemType || '').toUpperCase();
      if (t === 'LINE') { byType.LINE[String(r.itemId || '').trim()] = r; return; }
      if (byType[t]) byType[t].push(r);
    });

    var steps = [];

    function stepOf(r, opts) {
      opts = opts || {};
      var t    = String(r.itemType || '').toUpperCase();
      var text = String(r.script || '').trim();
      return {
        id:       String(r.itemId || '').trim(),
        kind:     t,
        section:  opts.section || String(r.section || '').trim().toUpperCase(),
        text:     text,
        transcript: String(r.transcript || text || ''),
        label:    String(r.label || ''),
        imageUrl: opts.imageUrl !== undefined ? opts.imageUrl : String(r.imageUrl || '').trim(),
        // What the picture shows, in words. The grader never sees the image, so
        // without this it reads "Please describe this picture" followed by an
        // answer it has no way to judge — a candidate could describe something
        // else entirely and Part 3 would measure nothing. Sent the same way the
        // Part 2 recordings send their transcript.
        imageDesc: opts.imageDesc !== undefined ? opts.imageDesc : String(r.description || '').trim(),
        hasAudio: !!String(r.audioFileId || '').trim(),
        // The sheet wins wherever a row states a time; opts is only the structural
        // default for a line whose answerSeconds is blank. Without this every
        // question would inherit LINE's zero and the mic would never open.
        answerSeconds: _icaoRowSecs_(r, opts.answerSeconds),
        replayable: t === 'AUDIO'
      };
    }

    // A line the bank does not carry is simply not spoken; the sitting still runs.
    function say(lineId, opts) {
      var r = byType.LINE[lineId];
      if (r) steps.push(stepOf(r, opts || {}));
    }

    function audiosIn(section) {
      return byType.AUDIO.filter(function(r) {
        return String(r.section || '').trim().toUpperCase() === section;
      });
    }

    // ── Part 1 — interview ──────────────────────────────────────────────────
    say('line_open_full');
    byType.INTERVIEW.forEach(function(r) { steps.push(stepOf(r, { section: '1' })); });
    say('line_part1_close');

    // ── Part 2 — listening. Each recording plays, is questioned, then closed.
    // 2B is a full retell rather than a specific question, so it gets longer.
    [['2A', 'line_open_p2',  ['line_2a_question'],            60],
     ['2B', 'line_2b_intro', ['line_2b_question'],            90],
     ['2C', '',              ['line_2c_q1', 'line_2c_q2'],    60]].forEach(function(part) {
      var section = part[0], intro = part[1], questions = part[2], qSecs = part[3];
      var clips = audiosIn(section);
      if (!clips.length) return;
      if (intro) say(intro);
      clips.forEach(function(clip, i) {
        steps.push(stepOf(clip));
        questions.forEach(function(q) { say(q, { section: section, answerSeconds: qSecs }); });
        // "Next recording" between items, "that completes this section" after the
        // last one — the candidate is told where they are without being counted at.
        say(i === clips.length - 1 ? 'line_section_close' : 'line_ack_next', { section: section });
      });
    });

    // ── Part 3 — pictures. The image has to stay on screen while it is described,
    // so its URL rides on the question step rather than being a step of its own.
    var pics = byType.IMAGE;
    if (pics.length) {
      say('line_open_p3');
      pics.forEach(function(pic, i) {
        say('line_p3_describe', { section: '3', answerSeconds: 120,
                                  imageUrl:  String(pic.imageUrl || '').trim(),
                                  imageDesc: String(pic.description || '').trim() });
        if (i < pics.length - 1) say('line_ack_next_picture', { section: '3' });
      });
      // Comparison needs both pictures in view; the client shows the second and the
      // candidate has just seen the first.
      if (pics.length > 1) {
        var last = String(pics[pics.length - 1].imageUrl || '').trim();
        // Comparison is about both pictures, so the grader is given both.
        var both = pics.map(function(p, i) {
          return 'Image ' + (i + 1) + ': ' + String(p.description || '').trim();
        }).join('  ');
        say('line_p3_similar',   { section: '3', answerSeconds: 120, imageUrl: last, imageDesc: both });
        say('line_p3_different', { section: '3', answerSeconds: 120, imageUrl: last, imageDesc: both });
      }
    }
    say('line_exam_end');

    if (!steps.length) return { ok: false, error: 'Version ' + wanted + ' has no usable rows.' };

    var missing = steps.filter(function(s) { return s.text && !s.hasAudio; })
                       .map(function(s) { return s.id; });

    return {
      ok: true,
      bank: wanted,
      versions: usable.length,
      steps: steps,
      // Named so the client can say which rows still need renderIcaoTestAudio,
      // instead of discovering it mid-exam.
      unrendered: missing
    };
  } catch (err) {
    return apiError_('apiGetIcaoTestScript', err);
  }
}

/**
 * Reports what each version contains and whether it is ready to sit.
 * Run from the editor — IcaoTestItemService.gs.
 */
function checkIcaoTestVersions() {
  var rows = dbReadAll_(ICAO_ITEMS_SHEET_);
  var banks = {};
  rows.forEach(function(r) {
    if (String(r.isActive).toUpperCase() === 'FALSE') return;
    var b = String(r.bank || ICAO_ITEMS_BANK_).trim().toUpperCase();
    if (!banks[b]) banks[b] = { total: 0, audio: 0, image: 0, interview: 0, line: 0,
                                unrendered: [], voices: {} };
    var t = String(r.itemType || '').toUpperCase();
    var e = banks[b];
    e.total++;
    if (t === 'AUDIO')     e.audio++;
    if (t === 'IMAGE')     e.image++;
    if (t === 'INTERVIEW') e.interview++;
    if (t === 'LINE')      e.line++;
    if (String(r.script || '').trim() && !String(r.audioFileId || '').trim()) {
      e.unrendered.push(String(r.itemId || '?'));
    }
    var v = String(r.voice || '').trim();
    if (v) e.voices[v] = (e.voices[v] || 0) + 1;
  });

  var out = [];
  Object.keys(banks).sort().forEach(function(b) {
    var e = banks[b];
    out.push('VERSION ' + b + ' — ' + e.total + ' rows: ' +
             e.audio + ' audio, ' + e.image + ' image, ' +
             e.interview + ' interview, ' + e.line + ' lines');
    var vs = Object.keys(e.voices);
    out.push('   voices: ' + (vs.length ? vs.join(', ') : '(none set — falls back to the default)'));
    out.push(e.unrendered.length
      ? '   NOT RENDERED (' + e.unrendered.length + '): ' + e.unrendered.slice(0, 12).join(', ') +
        (e.unrendered.length > 12 ? ' …' : '') + '  → run renderIcaoTestAudio'
      : '   all audio rendered — ready to sit');
  });

  var msg = out.length ? out.join('\n') : 'No active rows in ' + ICAO_ITEMS_SHEET_ + '.';
  Logger.log(msg);
  return msg;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * VERSION BUILDER
 *
 * A version is a bank, and a bank has to be self-contained: its own recordings,
 * its own pictures, its own interview questions AND its own copies of the
 * examiner's lines. The lines matter more than they look — the examiner's voice
 * comes from those rows, so a bank without them cannot carry its own accent.
 *
 * Today VERSION_A holds the material and DEFAULT holds the lines, which means
 * neither is a complete sitting. icaoBuildVersionA fixes that, then
 * icaoBuildVersionB / C clone it into other accents to be edited.
 *
 * Every function here is safe to run twice: rows are matched by itemId within a
 * bank and updated rather than duplicated.
 * ═══════════════════════════════════════════════════════════════════════════ */

// Written as speech, not as topics. The old rows held a subject for the model to
// phrase; nothing phrases anything now, so these are the sentences the candidate
// actually hears. Open rather than yes/no, and operational rather than personal,
// so each one can carry the two minutes the answer window gives it.
var ICAO_INTERVIEW_QUESTIONS_ = {
  interview_1: 'To begin, please tell me about your current position. What aircraft do you fly, and where do you normally operate?',
  interview_2: 'How long have you been flying, and how did you train for this role?',
  interview_3: 'Tell me about one operational difficulty you face regularly in your work, and how you deal with it.',
  interview_4: 'In your opinion, what is the most serious safety issue facing aviation today? Please explain why.',
  interview_5: 'How has technology changed the way pilots and controllers communicate? What do you think about those changes?'
};

// Only voices confirmed present in CHIRP3_HD_VOICES. An invented name fails at
// synthesis time, which in a scripted exam means a row that can never be rendered.
var ICAO_VERSION_VOICES_ = {
  US:     { lang: 'en-US', examiner: 'en-US-Chirp3-HD-Charon',
            speakers: ['en-US-Chirp3-HD-Fenrir','en-US-Chirp3-HD-Puck','en-US-Chirp3-HD-Despina','en-US-Chirp3-HD-Kore'] },
  INDIAN: { lang: 'en-IN', examiner: 'en-IN-Chirp3-HD-Algieba',
            speakers: ['en-IN-Chirp3-HD-Enceladus','en-IN-Chirp3-HD-Sadachbia','en-IN-Chirp3-HD-Erinome','en-IN-Chirp3-HD-Laomedeia'] },
  BRITISH:{ lang: 'en-GB', examiner: 'en-GB-Chirp3-HD-Schedar',
            speakers: ['en-GB-Chirp3-HD-Iapetus','en-GB-Chirp3-HD-Alnilam','en-GB-Chirp3-HD-Sulafat','en-GB-Chirp3-HD-Aoede'] }
};

// The examiner speaks with one voice throughout; the recordings rotate through the
// speaker voices so two consecutive pilots are not the same person. Both stay
// inside the version's accent.
function _icaoVoiceFor_(row, spec, nth) {
  var type = String(row.itemType || '').toUpperCase();
  if (type === 'AUDIO') return spec.speakers[nth % spec.speakers.length];
  return spec.examiner;
}

function _icaoRowsOfBank_(rows, bank) {
  var want = String(bank).trim().toUpperCase();
  return rows.filter(function(r) {
    return String(r.bank || ICAO_ITEMS_BANK_).trim().toUpperCase() === want;
  });
}

/**
 * Applies one accent to a whole bank, and writes the interview questions.
 *
 * Changing a voice invalidates the recording made in the old one, so audioFileId
 * is cleared wherever the voice actually moved — renderIcaoTestAudio then records
 * that row again. Rows already on the right voice are left alone, so re-running
 * costs nothing.
 */
function _icaoApplyAccent_(bank, accent) {
  var spec = ICAO_VERSION_VOICES_[String(accent).toUpperCase()];
  if (!spec) throw new Error('Unknown accent: ' + accent + '. Use US, INDIAN or BRITISH.');

  var rows    = _icaoRowsOfBank_(dbReadAll_(ICAO_ITEMS_SHEET_), bank);
  var stamp   = new Date().toISOString();
  var changed = 0, questions = 0, nth = 0;

  rows.sort(function(a, b) { return (Number(a.orderIndex)||0) - (Number(b.orderIndex)||0); })
      .forEach(function(r) {
    var patch = {};
    var type  = String(r.itemType || '').toUpperCase();
    var voice = _icaoVoiceFor_(r, spec, nth);
    if (type === 'AUDIO') nth++;

    if (String(r.voice || '').trim() !== voice) { patch.voice = voice; patch.audioFileId = ''; }
    if (String(r.lang  || '').trim() !== spec.lang) patch.lang = spec.lang;

    // Interview rows used to hold a topic in description and nothing in script.
    var q = ICAO_INTERVIEW_QUESTIONS_[String(r.itemId || '').trim()];
    if (type === 'INTERVIEW' && q && String(r.script || '').trim() !== q) {
      patch.script = q;
      patch.audioFileId = '';
      questions++;
    }

    if (!Object.keys(patch).length) return;
    patch.updatedAt = stamp;
    dbUpdateByRow_(ICAO_ITEMS_SHEET_, r.__rowNumber, patch);
    changed++;
  });

  return { changed: changed, questions: questions, voice: spec.examiner, lang: spec.lang };
}

/**
 * Copies every row of one bank into another, skipping ids the target already has.
 * Audio is deliberately not carried over — the clone is about to be re-voiced, and
 * a recording in the wrong accent is worse than none.
 */
function _icaoCopyRows_(fromBank, toBank, onlyTypes) {
  var all   = dbReadAll_(ICAO_ITEMS_SHEET_);
  var src   = _icaoRowsOfBank_(all, fromBank);
  var have  = {};
  _icaoRowsOfBank_(all, toBank).forEach(function(r) { have[String(r.itemId||'').trim()] = true; });

  var stamp = new Date().toISOString();
  var added = 0;
  src.forEach(function(r) {
    var type = String(r.itemType || '').toUpperCase();
    if (onlyTypes && onlyTypes.indexOf(type) === -1) return;
    var id = String(r.itemId || '').trim();
    if (!id || have[id]) return;
    dbAppend_(ICAO_ITEMS_SHEET_, {
      itemId: id, bank: String(toBank).trim().toUpperCase(),
      itemType: r.itemType, section: r.section, orderIndex: r.orderIndex,
      voice: '', lang: '', script: r.script, transcript: r.transcript,
      label: r.label, imageUrl: r.imageUrl, description: r.description,
      isActive: 'TRUE', createdAt: stamp, updatedAt: stamp,
      audioFileId: '', answerSeconds: r.answerSeconds
    });
    added++;
  });
  return added;
}

/**
 * VERSION_A — American throughout.
 * Brings the examiner's lines in from DEFAULT, writes the five interview
 * questions, and puts every row on a US voice.
 * Run from the editor — IcaoTestItemService.gs. Then run renderIcaoTestAudio.
 */
function icaoBuildVersionA() {
  var lines = _icaoCopyRows_('DEFAULT', 'VERSION_A', ['LINE']);
  var res   = _icaoApplyAccent_('VERSION_A', 'US');
  var msg = 'VERSION_A (American)\n' +
            '  examiner lines copied from DEFAULT: ' + lines + '\n' +
            '  interview questions written: ' + res.questions + '\n' +
            '  rows re-voiced: ' + res.changed + ' → ' + res.lang + '\n' +
            '  NEXT: run renderIcaoTestAudio, then checkIcaoTestVersions';
  Logger.log(msg);
  return msg;
}

/** VERSION_B — the same paper in Indian English, to be edited into new content. */
function icaoBuildVersionB() {
  var n   = _icaoCopyRows_('VERSION_A', 'VERSION_B');
  var res = _icaoApplyAccent_('VERSION_B', 'INDIAN');
  var msg = 'VERSION_B (Indian)\n' +
            '  rows copied from VERSION_A: ' + n + '\n' +
            '  rows voiced: ' + res.changed + ' → ' + res.lang + '\n' +
            '  It is a COPY of A. Edit the 12 scripts, 5 questions and 2 images to\n' +
            '  new content, then run renderIcaoTestAudio.';
  Logger.log(msg);
  return msg;
}

/** VERSION_C — the same paper in British English, to be edited into new content. */
function icaoBuildVersionC() {
  var n   = _icaoCopyRows_('VERSION_A', 'VERSION_C');
  var res = _icaoApplyAccent_('VERSION_C', 'BRITISH');
  var msg = 'VERSION_C (British)\n' +
            '  rows copied from VERSION_A: ' + n + '\n' +
            '  rows voiced: ' + res.changed + ' → ' + res.lang + '\n' +
            '  It is a COPY of A. Edit the 12 scripts, 5 questions and 2 images to\n' +
            '  new content, then run renderIcaoTestAudio.';
  Logger.log(msg);
  return msg;
}

/** Prints every row of every version, so the content can be read without opening the sheet. */
function dumpIcaoVersions() {
  var rows = dbReadAll_(ICAO_ITEMS_SHEET_);
  var banks = {};
  rows.forEach(function(r) {
    var b = String(r.bank || ICAO_ITEMS_BANK_).trim().toUpperCase();
    (banks[b] = banks[b] || []).push(r);
  });
  var out = [];
  Object.keys(banks).sort().forEach(function(b) {
    out.push('══ ' + b + ' ══');
    banks[b].sort(function(x, y) {
      return String(x.itemType).localeCompare(String(y.itemType)) ||
             (Number(x.orderIndex)||0) - (Number(y.orderIndex)||0);
    }).forEach(function(r) {
      var body = String(r.script || r.description || r.label || '').replace(/\s+/g, ' ');
      out.push('  ' + String(r.itemType||'?').padEnd(9) +
               String(r.section||'').padEnd(4) +
               (String(r.audioFileId||'').trim() ? '♪ ' : '· ') +
               String(r.voice||'(no voice)').replace('Chirp3-HD-','').padEnd(16) +
               body.slice(0, 110));
    });
  });
  var msg = out.join('\n');
  Logger.log(msg);
  return msg;
}

// Which accent a version is in, worked out from the rows themselves rather than
// from the bank's name. A bank called VERSION_B tells you nothing; the lang its
// recordings carry tells you everything, and it cannot drift out of step with
// what the candidate will actually hear.
var ICAO_ACCENT_LABELS_ = {
  'en-US': { label: 'American',   flag: '🇺🇸' },
  'en-GB': { label: 'British',    flag: '🇬🇧' },
  'en-AU': { label: 'Australian', flag: '🇦🇺' },
  'en-IN': { label: 'Indian',     flag: '🇮🇳' },
  'en-CA': { label: 'Canadian',   flag: '🇨🇦' }
};

/**
 * The versions a candidate may choose between, each with the accent it is spoken
 * in and whether every line has been recorded.
 */
function apiGetIcaoTestVersions(sessionToken) {
  try {
    AuthService.requireRole(sessionToken, ['STUDENT', 'INSTRUCTOR', 'ADMIN']);

    var rows;
    try { rows = dbReadAll_(ICAO_ITEMS_SHEET_); }
    catch (e) { return { ok: false, error: 'Item sheet not set up.' }; }

    var usable = _icaoUsableBanks_(rows);
    if (!usable.length) return { ok: false, error: 'No usable version in the item bank.' };

    var byBank = {};
    rows.forEach(function(r) {
      if (String(r.isActive).toUpperCase() === 'FALSE') return;
      var b = String(r.bank || ICAO_ITEMS_BANK_).trim().toUpperCase();
      if (usable.indexOf(b) === -1) return;
      var e = byBank[b] || (byBank[b] = { langs: {}, recordings: 0, unrendered: 0 });
      var lang = String(r.lang || '').trim();
      if (lang) e.langs[lang] = (e.langs[lang] || 0) + 1;
      if (String(r.itemType || '').toUpperCase() === 'AUDIO') e.recordings++;
      if (String(r.script || '').trim() && !String(r.audioFileId || '').trim()) e.unrendered++;
    });

    var out = usable.sort().map(function(b) {
      var e = byBank[b] || { langs: {}, recordings: 0, unrendered: 0 };
      // The most common lang in the bank. A version whose rows disagree is still
      // described by its majority rather than refused — the candidate should get a
      // best guess, not an error.
      var lang = '', best = 0;
      Object.keys(e.langs).forEach(function(k) { if (e.langs[k] > best) { best = e.langs[k]; lang = k; } });
      var a = ICAO_ACCENT_LABELS_[lang] || { label: 'Mixed accents', flag: '🌐' };
      return {
        bank:       b,
        // VERSION_A reads as a database key. "Version A" is what a candidate sees.
        name:       b.replace(/^VERSION[_\s-]*/i, 'Version '),
        accent:     a.label,
        flag:       a.flag,
        recordings: e.recordings,
        ready:      e.unrendered === 0
      };
    });

    return { ok: true, versions: out };
  } catch (err) {
    return apiError_('apiGetIcaoTestVersions', err);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * TIDY-UP
 *
 * Three things in the sheet that are not wrong but mislead anyone reading it:
 *
 *   DEFAULT still holds 16 examiner lines. It can never be drawn — a bank needs
 *   recordings to be selectable — but it is sixteen rows of dead weight that make
 *   every audit noisier and every reader wonder which bank is real.
 *
 *   The LINE orderIndex values collide: line_open_full and line_p3_similar are
 *   both 10. Nothing sorts on that number any more, so this breaks nothing, but a
 *   number that means nothing is worse than no number at all — the next person to
 *   edit the sheet will assume it matters.
 *
 *   IMAGE rows carry a voice and a lang. They have no script, so they never speak
 *   and those fields do nothing.
 *
 * Run tidyIcaoTestItems first to see what would change; applyIcaoTestItemTidy to
 * do it. Neither touches a script, a transcript, an image URL or a recording.
 * ═══════════════════════════════════════════════════════════════════════════ */

function _icaoTidyPlan_() {
  var rows  = dbReadAll_(ICAO_ITEMS_SHEET_);
  var moves = [];

  // Retire DEFAULT — only if its lines are genuinely duplicated elsewhere, so a
  // bank that is somebody's only copy of something is never switched off.
  var liveBanks = {};
  rows.forEach(function(r) {
    var b = String(r.bank || ICAO_ITEMS_BANK_).trim().toUpperCase();
    if (b !== 'DEFAULT') liveBanks[b + '|' + String(r.itemId || '')] = true;
  });

  rows.forEach(function(r) {
    var bank = String(r.bank || ICAO_ITEMS_BANK_).trim().toUpperCase();
    var type = String(r.itemType || '').toUpperCase();
    var id   = String(r.itemId || '').trim();
    var patch = {};

    if (bank === 'DEFAULT' && String(r.isActive).toUpperCase() !== 'FALSE') {
      var copiedElsewhere = Object.keys(liveBanks).some(function(k) {
        return k.split('|')[1] === id;
      });
      if (copiedElsewhere) patch.isActive = 'FALSE';
    }

    // A voice on a row that never speaks.
    if (type === 'IMAGE') {
      if (String(r.voice || '').trim()) patch.voice = '';
      if (String(r.lang  || '').trim()) patch.lang  = '';
    }

    if (Object.keys(patch).length) {
      moves.push({ row: r.__rowNumber, bank: bank, id: id, type: type, patch: patch });
    }
  });

  // Renumber LINE rows per bank, in the order the exam actually says them, so the
  // column finally agrees with what happens.
  var SAY_ORDER = ['line_open_full','line_part1_close','line_open_p2','line_2a_question',
                   'line_ack_next','line_section_close','line_2b_intro','line_2b_question',
                   'line_2c_q1','line_2c_q2','line_open_p3','line_p3_describe',
                   'line_ack_next_picture','line_p3_similar','line_p3_different',
                   'line_exam_end'];
  rows.forEach(function(r) {
    if (String(r.itemType || '').toUpperCase() !== 'LINE') return;
    var id  = String(r.itemId || '').trim();
    var idx = SAY_ORDER.indexOf(id);
    if (idx === -1) return;                       // an id we do not know: leave it
    var want = idx + 1;
    if (Number(r.orderIndex) === want) return;
    moves.push({ row: r.__rowNumber, bank: String(r.bank || '').toUpperCase(), id: id,
                 type: 'LINE', patch: { orderIndex: want } });
  });

  return moves;
}

/** Dry run. Prints what would change and changes nothing. */
function tidyIcaoTestItems() {
  var moves = _icaoTidyPlan_();
  if (!moves.length) { Logger.log('Nothing to tidy.'); return 'Nothing to tidy.'; }
  var out = [moves.length + ' change(s) proposed — nothing written:'];
  moves.forEach(function(m) {
    out.push('  row ' + m.row + '  ' + m.bank + '/' + m.id +
             '  ' + JSON.stringify(m.patch));
  });
  out.push('Run applyIcaoTestItemTidy to apply.');
  var msg = out.join('\n');
  Logger.log(msg);
  return msg;
}

/** Applies the tidy-up. Safe to run twice — a row already correct is not matched. */
function applyIcaoTestItemTidy() {
  var moves = _icaoTidyPlan_();
  if (!moves.length) { Logger.log('Nothing to tidy.'); return 'Nothing to tidy.'; }
  var stamp = new Date().toISOString();
  moves.forEach(function(m) {
    m.patch.updatedAt = stamp;
    dbUpdateByRow_(ICAO_ITEMS_SHEET_, m.row, m.patch);
  });
  var msg = 'Applied ' + moves.length + ' change(s). Run checkIcaoTestVersions to confirm ' +
            'A, B and C are still complete.';
  Logger.log(msg);
  return msg;
}
