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

var ICAO_TEST_SEED_ = [
    { itemId:'interview_1', itemType:'INTERVIEW', section:'1', orderIndex:1,
      description:'The candidate\'s current role and the aircraft type or sector they work' },
    { itemId:'interview_2', itemType:'INTERVIEW', section:'1', orderIndex:2,
      description:'Years of experience and how they trained for the role' },
    { itemId:'interview_3', itemType:'INTERVIEW', section:'1', orderIndex:3,
      description:'One operational challenge they face in their daily work' },
    { itemId:'interview_4', itemType:'INTERVIEW', section:'1', orderIndex:4,
      description:'An opinion on an aviation safety issue' },
    { itemId:'interview_5', itemType:'INTERVIEW', section:'1', orderIndex:5,
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

  var last = sheet.getLastRow();
  var have = {};
  if (last > 1) {
    var idCol   = headers.indexOf('itemId') + 1;
    var bankCol = headers.indexOf('bank') + 1;
    var ids   = sheet.getRange(2, idCol,   last - 1, 1).getValues();
    var banks = sheet.getRange(2, bankCol, last - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      var b = String(banks[i][0] || ICAO_ITEMS_BANK_).trim().toUpperCase();
      have[b + '|' + String(ids[i][0] || '').trim()] = true;
    }
  }

  var stamp = now_();
  var rows = [];
  ICAO_TEST_SEED_.forEach(function(it) {
    if (have[ICAO_ITEMS_BANK_ + '|' + it.itemId]) return;
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

    if (['AUDIO', 'IMAGE', 'INTERVIEW'].indexOf(type) === -1) {
      problems.push(where + ': itemType "' + r.itemType + '" is not AUDIO, IMAGE or INTERVIEW');
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

    byBank[bank] = byBank[bank] || { AUDIO: 0, IMAGE: 0, INTERVIEW: 0 };
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
  });

  Object.keys(byBank).forEach(function(b) {
    var c = byBank[b];
    if (!c.AUDIO) problems.push('bank ' + b + ': no playable recordings — it will never be offered');
    else if (c.AUDIO < 12) notes.push('bank ' + b + ': only ' + c.AUDIO +
      ' recordings (DEFAULT has 12) — it is still served as a complete exam');
    if (!c.IMAGE)     notes.push('bank ' + b + ': no Part 3 pictures');
    if (!c.INTERVIEW) notes.push('bank ' + b + ': no interview topics — Part 1 falls back to the generic prompt topics');
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

    var audio = {}, order = [], images = [], sections = [], interview = [];
    active.forEach(function(r) {
      var id = String(r.itemId || '').trim();
      if (!id) return;
      var type = String(r.itemType || '').toUpperCase();
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
             images: images, interview: interview };
  } catch (err) {
    return { ok: false, error: (err && err.message) || 'Failed to load item bank' };
  }
}
