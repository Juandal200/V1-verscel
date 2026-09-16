// =============================================================================
//  ChallengeQuestionService.js  —  the question bank behind Squadron challenges
//
//  A challenge is five questions drawn at random, the SAME five for both pilots,
//  so the bank has to be a table somebody can edit without a deploy. That is the
//  whole reason this is a sheet and not an array in the source: the specialist
//  writes questions, not commits.
//
//  The seed below is PLACEHOLDER CONTENT, written to make the feature runnable
//  and to give the sheet its shape. It is not reviewed material. Every row is
//  editable, and `active` retires a question without deleting it, so replacing
//  the seed is adding rows and flipping flags rather than a migration.
// =============================================================================

var CHALLENGE_QUESTIONS_SHEET_ = 'ChallengeQuestions';
var CHALLENGES_SHEET_          = 'Challenges';

/* Five per challenge. Named here because two places need to agree on it — the
 * draw and the scoring — and a number that lives in two places drifts. */
var CHALLENGE_QUESTION_COUNT = 5;

/* Thirty seconds a question, so a five-question challenge cannot run past two
 * and a half minutes. The cap is per question and the comparison is on the
 * total, which is the combination asked for: a slow answer costs you the duel
 * without letting one stall end it. */
var CHALLENGE_SECONDS_PER_QUESTION = 30;

/* ── The bank ────────────────────────────────────────────────────────────────
 *
 * The specialist's forty-six, converted from their sheet. Their Correct column
 * is 1-based and this schema is 0-based, so every index is shifted by one — the
 * single most likely thing to have gone wrong in the conversion, and the reason
 * checkChallengeQuestions refuses an index outside the options.
 *
 * TWENTY-TWO OF THEM ARRIVE INACTIVE, and that is not a mistake.
 *
 * "What is this?" with four part names under it is not a question without the
 * picture it refers to — it is a guess between four nouns. The twelve
 * Reciprocating Engine Parts rows are literally identical in text, all "What is
 * it?" over the same options, so without images they are not even distinct from
 * each other. Loading them active would have put unanswerable questions in front
 * of students on the first draw.
 *
 * So they are here with active FALSE and an explanation saying what they need.
 * The specialist pastes a link into imageUrl, flips active to TRUE, and the
 * question joins the draw — no deploy, which is the whole reason the bank is a
 * sheet.
 *
 * `correct` is the index into `options`, zero-based. Two options is a
 * true/false; four is a multiple choice; anything else the validator rejects.
 */
var CHALLENGE_SEED_ = [
  // ── Placeholder set, CQ-001 to CQ-046 ─────────────────────────────────────
  // Written to make the feature runnable before there was a bank. Kept rather
  // than removed: they are live questions now, and deleting a question that has
  // already been played breaks the papers that were frozen with its id.
// ── Standard phraseology ───────────────────────────────────────────────────
  { q: 'ATC instructs "LINE UP AND WAIT". What are you cleared to do?',
    o: ['Enter the runway and hold position', 'Take off immediately', 'Hold short of the runway', 'Backtrack the runway'],
    c: 0, e: 'Line up and wait means enter the runway and hold. It is not a take-off clearance.' },

  { q: 'Which readback is correct for "CLIMB FLIGHT LEVEL TWO ZERO ZERO"?',
    o: ['Climbing two hundred', 'Climb flight level two zero zero', 'Up to FL200', 'Roger, climbing'],
    c: 1, e: 'Level instructions are read back in full, using the same words ATC used.' },

  { q: 'What does "SAY AGAIN" request?',
    o: ['Repeat the last transmission', 'Confirm you understood', 'Change frequency', 'Repeat your callsign only'],
    c: 0, e: 'Say again asks for a repetition. "Confirm" asks for verification.' },

  { q: 'You are told "STANDBY". What should you do?',
    o: ['Wait — ATC will call you', 'Repeat your request', 'Change to the next frequency', 'Continue as previously cleared and report'],
    c: 0, e: 'Standby means wait, I will call you. It is not an approval or a refusal.' },

  { q: 'What does "WILCO" mean?',
    o: ['I will comply with your instruction', 'I have received your message', 'I do not understand', 'Wait one moment'],
    c: 0, e: 'Wilco is will comply. Roger only acknowledges receipt.' },

  { q: 'Which word means "permission granted to proceed under the conditions specified"?',
    o: ['Approved', 'Cleared', 'Affirm', 'Acknowledge'],
    c: 1, e: 'Cleared is used for the conditions of flight. Approved is for a request.' },

  { q: 'ATC says "REPORT FIELD IN SIGHT". You should reply when you:',
    o: ['See the aerodrome visually', 'Are established on final', 'Are at the reporting point', 'Are cleared to land'],
    c: 0, e: 'The report is about visual acquisition of the aerodrome, nothing else.' },

  { q: 'What is the correct phrase to indicate a message has been received and understood?',
    o: ['Copy that', 'Roger', 'Ten-four', 'Understood'],
    c: 1, e: 'Roger is the ICAO standard. "Copy that" and "ten-four" are not.' },

  { q: 'Which is the correct pronunciation of the number 9 in radiotelephony?',
    o: ['Nine', 'Niner', 'Nina', 'Nine-er-o'],
    c: 1, e: 'Niner avoids confusion with the German "nein" and with "five".' },

  { q: 'How is the altitude 10,500 ft transmitted?',
    o: ['One zero thousand five hundred', 'Ten thousand five hundred', 'One zero five zero zero', 'Ten point five'],
    c: 0, e: 'Thousands are spoken digit by digit followed by "thousand".' },

  // ── Emergencies and urgency ────────────────────────────────────────────────
  { q: 'MAYDAY is used to declare:',
    o: ['An urgency condition', 'A distress condition', 'A radio failure', 'A fuel check'],
    c: 1, e: 'Mayday is distress — grave and imminent danger. Pan-pan is urgency.' },

  { q: 'PAN-PAN indicates:',
    o: ['Grave and imminent danger', 'An urgent situation without immediate danger', 'A medical emergency only', 'A request for priority landing'],
    c: 1, e: 'Pan-pan is urgency: the situation is serious but no one is in immediate danger.' },

  { q: 'How many times is MAYDAY spoken at the start of a distress call?',
    o: ['Once', 'Twice', 'Three times', 'Until acknowledged'],
    c: 2, e: 'Mayday is repeated three times to make the call unmistakable.' },

  { q: 'The transponder code for a general emergency is:',
    o: ['7500', '7600', '7700', '7000'],
    c: 2, e: '7700 general emergency, 7600 radio failure, 7500 unlawful interference.' },

  { q: 'Squawk 7600 tells ATC that you have:',
    o: ['Lost radio communication', 'An engine failure', 'A hijacking on board', 'A medical emergency'],
    c: 0, e: '7600 is communication failure.' },

  { q: '"MINIMUM FUEL" tells ATC that:',
    o: ['You are declaring an emergency', 'You can accept little or no delay', 'You need to divert now', 'You want priority landing'],
    c: 1, e: 'Minimum fuel is an advisory that little delay can be accepted. It is not a distress call.' },

  { q: 'After an engine failure after take-off, the first priority is to:',
    o: ['Declare an emergency on the radio', 'Fly the aircraft', 'Run the checklist', 'Notify the cabin'],
    c: 1, e: 'Aviate, navigate, communicate — in that order.' },

  { q: 'A rapid depressurisation at cruise requires the crew to first:',
    o: ['Don oxygen masks', 'Begin an emergency descent', 'Declare a Mayday', 'Notify the cabin crew'],
    c: 0, e: 'Oxygen first — the descent is useless if the crew is incapacitated.' },

  { q: '"REQUEST PRIORITY LANDING" is an appropriate call when:',
    o: ['You have a distress condition', 'You need to land ahead of other traffic for an urgent reason', 'You are low on fuel and declaring an emergency', 'You have lost radio contact'],
    c: 1, e: 'It is an urgency request; distress uses Mayday.' },

  { q: 'Who may cancel a distress condition on the frequency?',
    o: ['The controller', 'The aircraft that declared it', 'Any station on frequency', 'The airline operations centre'],
    c: 1, e: 'Only the station that declared the distress may cancel it.' },

  // ── Weather ────────────────────────────────────────────────────────────────
  { q: 'In a METAR, "BKN" means the cloud layer is:',
    o: ['Broken — 5 to 7 oktas', 'Blocked by terrain', 'Below minimums', 'Breaking up'],
    c: 0, e: 'FEW 1-2, SCT 3-4, BKN 5-7, OVC 8 oktas.' },

  { q: 'METAR "CAVOK" requires visibility of at least:',
    o: ['5 km', '8 km', '10 km', '15 km'],
    c: 2, e: 'CAVOK: visibility 10 km or more, no significant cloud below 5000 ft, no significant weather.' },

  { q: '"RVR" stands for:',
    o: ['Runway Visual Range', 'Relative Vertical Reference', 'Required Visibility Rating', 'Runway Vector Radial'],
    c: 0, e: 'RVR is the distance along the runway a pilot can see its markings or lights.' },

  { q: 'Wind shear is best described as:',
    o: ['A steady crosswind', 'A sudden change in wind speed or direction', 'Turbulence caused by terrain', 'A shift in barometric pressure'],
    c: 1, e: 'It is a change over a short distance, and it is dangerous close to the ground.' },

  { q: 'METAR reports "+TSRA". This means:',
    o: ['Light thunderstorm with rain', 'Heavy thunderstorm with rain', 'Thunderstorm in the vicinity', 'Rain showers ending'],
    c: 1, e: 'The plus sign is heavy; TS thunderstorm, RA rain.' },

  { q: 'A microburst is most dangerous because it produces:',
    o: ['Severe icing', 'A strong downdraught with rapidly changing headwind', 'Sustained crosswind', 'Loss of radio contact'],
    c: 1, e: 'The headwind-to-tailwind shift can exceed the aircraft performance on approach.' },

  { q: '"QNH" is the altimeter setting that makes the altimeter read:',
    o: ['Height above the aerodrome', 'Altitude above mean sea level', 'Flight level', 'Height above the highest obstacle'],
    c: 1, e: 'QNH gives altitude above MSL. QFE gives height above the aerodrome.' },

  { q: 'Freezing rain is reported in a METAR as:',
    o: ['FZRA', 'FZDZ', 'RAFZ', 'SNRA'],
    c: 0, e: 'FZ freezing, RA rain. FZDZ is freezing drizzle.' },

  { q: 'A TAF differs from a METAR because a TAF is:',
    o: ['An observation', 'A forecast', 'A pilot report', 'A runway condition report'],
    c: 1, e: 'METAR reports what is; TAF forecasts what is expected.' },

  { q: 'Severe turbulence is defined by:',
    o: ['Occupants feel a slight strain against seat belts', 'Large abrupt changes in altitude and attitude, aircraft may be momentarily out of control', 'Unsecured objects dislodge', 'Walking is difficult'],
    c: 1, e: 'Severe includes momentary loss of control; extreme is where the aircraft is violently tossed.' },

  // ── ATC and operations ─────────────────────────────────────────────────────
  { q: '"HOLD SHORT OF RUNWAY 27" means:',
    o: ['Stop before the runway holding position', 'Cross the runway quickly', 'Line up on runway 27', 'Hold on the runway'],
    c: 0, e: 'You must stop before the holding position marking and not enter the runway.' },

  { q: 'A "GO-AROUND" is:',
    o: ['A discontinued approach followed by a climb-out', 'A circuit of the aerodrome before landing', 'A taxi route around the apron', 'A turn to avoid weather'],
    c: 0, e: 'It is an aborted approach; the missed approach procedure follows.' },

  { q: '"EXPEDITE CLIMB" asks you to:',
    o: ['Climb at your best rate', 'Climb when able', 'Climb at a reduced rate', 'Level off immediately'],
    c: 0, e: 'Expedite asks for the maximum practicable rate.' },

  { q: 'If you cannot comply with an ATC instruction you should say:',
    o: ['Negative', 'Unable', 'Standby', 'Disregard'],
    c: 1, e: 'Unable states you cannot comply, and should be followed by the reason.' },

  { q: '"DISREGARD" means:',
    o: ['Ignore the last transmission', 'Repeat the instruction', 'Continue as cleared', 'Acknowledge and comply'],
    c: 0, e: 'The last message should be treated as not sent.' },

  { q: 'A "runway incursion" is:',
    o: ['An aircraft landing without clearance', 'Any incorrect presence of an aircraft, vehicle or person on a runway', 'A deviation from the taxi route', 'A go-around after touchdown'],
    c: 1, e: 'It covers vehicles and people, not only aircraft.' },

  { q: 'You are instructed to "TAXI VIA ALPHA, HOLD SHORT OF BRAVO". You may:',
    o: ['Cross Bravo without further clearance', 'Taxi on Alpha and stop before Bravo', 'Taxi on Bravo to the runway', 'Hold on Alpha immediately'],
    c: 1, e: 'You taxi the named route and stop at the named holding point.' },

  { q: '"CLEARED FOR THE OPTION" permits:',
    o: ['Only a full-stop landing', 'A touch-and-go, low approach, stop-and-go or full stop', 'A go-around only', 'A landing on any runway'],
    c: 1, e: 'It leaves the choice to the pilot, and is normally given for training.' },

  { q: 'What does "TRAFFIC IN SIGHT" tell the controller?',
    o: ['You are visual with the traffic and can maintain separation', 'You have the traffic on TCAS', 'You are looking for the traffic', 'You have lost sight of the traffic'],
    c: 0, e: 'It is a visual acquisition report, and separation may be passed to you.' },

  { q: 'Reporting "NEGATIVE CONTACT" means:',
    o: ['You do not see the traffic', 'Your radio has failed', 'You refuse the instruction', 'You lost contact with the controller'],
    c: 0, e: 'Negative contact reports failure to see the traffic called.' },

  // ── Human factors and comms ────────────────────────────────────────────────
  { q: 'The most common cause of a readback error going undetected is:',
    o: ['Poor radio quality', 'Expectation bias — hearing what you expected to hear', 'Speaking too slowly', 'Using standard phraseology'],
    c: 1, e: 'Expectation bias makes both the pilot and controller hear the expected value.' },

  { q: 'A "sterile flight deck" means:',
    o: ['No non-essential conversation below a defined altitude', 'The cockpit is cleaned before flight', 'Only the captain may speak', 'The radio is muted during climb'],
    c: 0, e: 'It restricts non-essential activity in the critical phases of flight.' },

  { q: 'Why is standard phraseology preferred over plain language?',
    o: ['It is faster to say', 'It reduces ambiguity between speakers of different first languages', 'It is required by the aircraft manufacturer', 'It shortens the frequency occupancy only'],
    c: 1, e: 'The purpose is unambiguous meaning across languages and accents.' },

  { q: 'When plain language is necessary, ICAO recommends you:',
    o: ['Speak faster to save frequency time', 'Use clear, simple and concise language', 'Use technical jargon for precision', 'Switch to your own language'],
    c: 1, e: 'Plain language should still be clear, concise and unambiguous.' },

  { q: 'ICAO Level 4 (Operational) is the minimum required for:',
    o: ['Private flying only', 'International operations', 'All flying everywhere', 'Instructors only'],
    c: 1, e: 'Level 4 is the minimum for international radiotelephony.' },

  { q: 'A controller says "CONFIRM FLIGHT LEVEL". This asks you to:',
    o: ['Climb to the assigned level', 'Verify and state your current level', 'Acknowledge the level change', 'Report reaching the level'],
    c: 1, e: 'Confirm asks for verification of a value you have already been given or reported.' },

  // ── The specialist's set, CQ-047 to CQ-092 ────────────────────────────────
  // From their sheet: 15 gas turbine, 19 electrical, 12 reciprocating parts.
  // Their Correct column is 1-based and this schema is 0-based, so every index
  // is shifted by one. Twenty-two arrive inactive because they refer to a
  // picture that is not here yet.
{ q: 'Gas turbine engines have 4 strokes like reciprocating engines',
    o: ['True', 'False'],
    c: 1, e: '' },

  { q: 'What is this?',
    o: ['Flanges', 'Bearings', 'Seals', 'Compressor blades'],
    c: 0, img: true, e: 'NEEDS AN IMAGE. Paste the picture link into imageUrl and set active to TRUE.' },

  { q: 'Which engine is mostly used in airliners?',
    o: ['Turbofan', 'Turbojet', 'Turboprop', 'Turboshaft'],
    c: 0, e: '' },

  { q: 'Can air flow at a very very high speed destroy the engine?',
    o: ['Yes, the inlet must slow the air down before it reaches the compressor', 'No, faster air always produces more thrust', 'No, the compressor can handle air at any speed', 'Only when the engine is shut down'],
    c: 0, e: '' },

  { q: 'Is this a fan blade?',
    o: ['True', 'False'],
    c: 1, img: true, e: 'NEEDS AN IMAGE. Paste the picture link into imageUrl and set active to TRUE.' },

  { q: 'What do vanes do?',
    o: ['Direct the airflow at the correct angle to the next row of blades', 'Rotate to compress the air', 'Mix the fuel with the air', 'Ignite the fuel-air mixture'],
    c: 0, e: '' },

  { q: 'Do airliners have low bypass or high bypass engines?',
    o: ['Low bypass', 'High bypass'],
    c: 1, e: '' },

  { q: 'What is this?',
    o: ['Fuel nozzle', 'Igniter plug', 'Temperature probe', 'Bleed air valve'],
    c: 0, img: true, e: 'NEEDS AN IMAGE. Paste the picture link into imageUrl and set active to TRUE.' },

  { q: 'The airflow first contacts the ______ of a fan blade.',
    o: ['Leading edge', 'Trailing edge', 'Root', 'Tip'],
    c: 0, e: '' },

  { q: 'What is this?',
    o: ['Spinner', 'Exhaust cone', 'Fuel nozzle', 'Igniter plug'],
    c: 0, img: true, e: 'NEEDS AN IMAGE. Paste the picture link into imageUrl and set active to TRUE.' },

  { q: 'Is bled-air used for cabin pressurization?',
    o: ['True', 'False'],
    c: 0, e: '' },

  { q: 'How is bled-air sent to the cabin?',
    o: ['Through ducts from the compressor', 'Through the fuel lines', 'Through the exhaust nozzle', 'Through the oil system'],
    c: 0, e: '' },

  { q: 'What is this?',
    o: ['Turbine section', 'Fan', 'Inlet', 'Accessory gearbox'],
    c: 0, img: true, e: 'NEEDS AN IMAGE. Paste the picture link into imageUrl and set active to TRUE.' },

  { q: 'The amount of air passing through the engine depends on:',
    o: ['Fan diameter', 'Fuel type', 'Oil pressure', 'Engine weight'],
    c: 0, e: '' },

  { q: 'How many main stages are there in a gas turbine engine from intake to exhaust?',
    o: ['3', '4', '5', '6'],
    c: 2, e: '' },

  { q: 'What is it?',
    o: ['Alternator', 'Starter motor', 'Magneto', 'Voltage regulator'],
    c: 0, img: true, e: 'NEEDS AN IMAGE. Paste the picture link into imageUrl and set active to TRUE.' },

  { q: 'What unit is used to measure electrical pressure?',
    o: ['Volts', 'Amperes', 'Ohms', 'Watts'],
    c: 0, e: '' },

  { q: 'What is it?',
    o: ['Ammeter', 'Voltmeter', 'Tachometer', 'Oil pressure gauge'],
    c: 0, img: true, e: 'NEEDS AN IMAGE. Paste the picture link into imageUrl and set active to TRUE.' },

  { q: 'Most small aircraft use DC electrical power for their systems.',
    o: ['True', 'False'],
    c: 0, e: '' },

  { q: 'What is it?',
    o: ['Master switch', 'Avionics master switch', 'Circuit breaker', 'Fuel selector'],
    c: 0, img: true, e: 'NEEDS AN IMAGE. Paste the picture link into imageUrl and set active to TRUE.' },

  { q: 'What produces electrical power during normal flight in most light aircraft?',
    o: ['Alternator', 'Battery', 'Voltage regulator', 'Starter motor'],
    c: 0, e: '' },

  { q: 'What does a negative ammeter reading usually mean?',
    o: ['The battery is discharging', 'The battery is being charged', 'The alternator output is higher than the load', 'The system is fully charged and normal'],
    c: 0, e: '' },

  { q: 'Why does a circuit breaker pop?',
    o: ['Too much current flows through the circuit', 'The voltage is too low', 'The battery is fully charged', 'The circuit is not being used'],
    c: 0, e: '' },

  { q: 'What is it?',
    o: ['Loadmeter', 'Voltmeter', 'Tachometer', 'Fuel quantity gauge'],
    c: 0, img: true, e: 'NEEDS AN IMAGE. Paste the picture link into imageUrl and set active to TRUE.' },

  { q: 'Is amps the contraction of amperes?',
    o: ['True', 'False'],
    c: 0, e: '' },

  { q: 'A positive ammeter reading means the battery is being drained.',
    o: ['True', 'False'],
    c: 1, e: '' },

  { q: 'The bus bar in an aircraft distributes electrical power to different equipment.',
    o: ['True', 'False'],
    c: 0, e: '' },

  { q: 'A short circuit is best described as:',
    o: ['An unintended low-resistance path that allows excessive current flow', 'A break in the circuit that stops current flow', 'A circuit with very high resistance', 'A circuit protected by a fuse'],
    c: 0, e: '' },

  { q: 'If all electrical power is lost, the engine is lost',
    o: ['True', 'False'],
    c: 1, e: '' },

  { q: 'What is a bus bar used for in an aircraft?',
    o: ['Distributing power to the electrical circuits', 'Storing electrical energy', 'Generating electrical power', 'Converting AC to DC'],
    c: 0, e: '' },

  { q: 'If the alternator fails in flight, what powers the electrical system?',
    o: ['Battery', 'Magnetos', 'Starter motor', 'Voltage regulator'],
    c: 0, e: '' },

  { q: 'Is this a circuit breaker?',
    o: ['True', 'False'],
    c: 1, img: true, e: 'NEEDS AN IMAGE. Paste the picture link into imageUrl and set active to TRUE.' },

  { q: 'What is the main purpose of the aircraft battery?',
    o: ['To start the engine and provide backup power', 'To power the magnetos', 'To generate power during flight', 'To regulate system voltage'],
    c: 0, e: '' },

  { q: 'Are the magnetos part of the electric system?',
    o: ['True', 'False'],
    c: 1, e: '' },

  { q: 'What is it?',
    o: ['Valve', 'Pushrod', 'Rocker arm', 'Connecting rod'],
    c: 0, img: true, e: 'NEEDS AN IMAGE. Paste the picture link into imageUrl and set active to TRUE.' },

  { q: 'What is it?',
    o: ['Piston', 'Cylinder', 'Valve lifter', 'Bearing'],
    c: 0, img: true, e: 'NEEDS AN IMAGE. Paste the picture link into imageUrl and set active to TRUE.' },

  { q: 'What is it?',
    o: ['Connecting rod', 'Crankshaft', 'Camshaft', 'Pushrod'],
    c: 0, img: true, e: 'NEEDS AN IMAGE. Paste the picture link into imageUrl and set active to TRUE.' },

  { q: 'What is it?',
    o: ['Spark plug', 'Fuel injector', 'Magneto', 'Primer nozzle'],
    c: 0, img: true, e: 'NEEDS AN IMAGE. Paste the picture link into imageUrl and set active to TRUE.' },

  { q: 'What is it?',
    o: ['Camshaft', 'Crankshaft', 'Propeller shaft', 'Connecting rod'],
    c: 0, img: true, e: 'NEEDS AN IMAGE. Paste the picture link into imageUrl and set active to TRUE.' },

  { q: 'What is it?',
    o: ['Engine block', 'Carburetor', 'Magneto', 'Oil filter'],
    c: 0, img: true, e: 'NEEDS AN IMAGE. Paste the picture link into imageUrl and set active to TRUE.' },

  { q: 'What is it?',
    o: ['Crankshaft', 'Camshaft', 'Connecting rod', 'Propeller shaft'],
    c: 0, img: true, e: 'NEEDS AN IMAGE. Paste the picture link into imageUrl and set active to TRUE.' },

  { q: 'What is it?',
    o: ['Timing belt', 'Drive chain', 'Fuel hose', 'Gasket'],
    c: 0, img: true, e: 'NEEDS AN IMAGE. Paste the picture link into imageUrl and set active to TRUE.' },

  { q: 'What is it?',
    o: ['Intake stroke', 'Compression stroke', 'Power stroke', 'Exhaust stroke'],
    c: 0, img: true, e: 'NEEDS AN IMAGE. Paste the picture link into imageUrl and set active to TRUE.' },

  { q: 'What is it?',
    o: ['Intake stroke', 'Compression stroke', 'Power stroke', 'Exhaust stroke'],
    c: 3, img: true, e: 'NEEDS AN IMAGE. Paste the picture link into imageUrl and set active to TRUE.' },

  { q: 'What is it?',
    o: ['Intake stroke', 'Compression stroke', 'Power stroke', 'Exhaust stroke'],
    c: 2, img: true, e: 'NEEDS AN IMAGE. Paste the picture link into imageUrl and set active to TRUE.' },

  { q: 'What is it?',
    o: ['Intake stroke', 'Compression stroke', 'Power stroke', 'Exhaust stroke'],
    c: 1, img: true, e: 'NEEDS AN IMAGE. Paste the picture link into imageUrl and set active to TRUE.' }
];

/* ── Sheet setup ─────────────────────────────────────────────────────────────
 *
 * Same shape as setupIcaoTestItems: create if missing, write the header, and
 * refuse to overwrite rows that are already there unless told to. The refusal
 * matters more here than usual — the whole point of the sheet is that somebody
 * else's writing lives in it, and a helper that silently replaces it once would
 * be enough to stop anyone trusting it.
 */
/* One row, built the same way whoever is writing it. Extracted because two
 * functions need it and a second copy of the mapping is how an added row ends up
 * shaped differently from a seeded one. */
function _challengeSeedRow_(it, i, headers, stamp) {
  var row = {
    questionId:   'CQ-' + ('000' + (i + 1)).slice(-3),
    question:     it.q,
    optionsJson:  JSON.stringify(it.o),
    correctIndex: it.c,
    imageUrl:     '',
    explanation:  it.e || '',
    /* A row that needs a picture arrives switched off. It is in the sheet, with
     * its options and its answer, waiting for one cell — a better place for it
     * than a list somebody has to remember to type in later. */
    active:       !it.img,
    createdAt:    stamp
  };
  return headers.map(function (h) { return row[h] !== undefined ? row[h] : ''; });
}

/* ── Adding without replacing ────────────────────────────────────────────────
 *
 * The one to run. setupChallengeQuestions(true) wipes the sheet and reseeds, and
 * the sheet is where somebody else's writing lives — a specialist's questions,
 * the image links they pasted, the rows they switched off. This appends the ids
 * that are not there and touches nothing else.
 *
 * Presence is keyed on questionId alone, the same way addMissingIcaoTestItems
 * does it: a row that exists has been placed, possibly edited, possibly
 * retired, and none of that is this function's business.
 */
function addMissingChallengeQuestions() {
  var ss      = dbGetSpreadsheet_();
  var headers = DB_SCHEMA[CHALLENGE_QUESTIONS_SHEET_];
  var sheet   = ss.getSheetByName(CHALLENGE_QUESTIONS_SHEET_);
  if (!sheet) return setupChallengeQuestions();

  var last = sheet.getLastRow();
  var have = {};
  if (last > 1) {
    var idCol = headers.indexOf('questionId') + 1;
    var ids   = sheet.getRange(2, idCol, last - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      var id = String(ids[i][0] || '').trim();
      if (id) have[id] = true;
    }
  }

  var stamp = (typeof now_ === 'function') ? now_() : new Date().toISOString();
  var rows  = [];
  CHALLENGE_SEED_.forEach(function (it, i) {
    var id = 'CQ-' + ('000' + (i + 1)).slice(-3);
    if (!have[id]) rows.push(_challengeSeedRow_(it, i, headers, stamp));
  });

  if (!rows.length) {
    Logger.log('Nothing to add — every seeded question is already in ' +
               CHALLENGE_QUESTIONS_SHEET_ + '.');
    return { ok: true, added: 0, existing: Math.max(0, last - 1) };
  }

  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
  Logger.log('Added ' + rows.length + ' question(s) to ' + CHALLENGE_QUESTIONS_SHEET_ +
             '. ' + Math.max(0, last - 1) + ' were already there and were left alone.');
  return { ok: true, added: rows.length, existing: Math.max(0, last - 1) };
}

function setupChallengeQuestions(force) {
  var ss      = dbGetSpreadsheet_();
  var headers = DB_SCHEMA[CHALLENGE_QUESTIONS_SHEET_];
  var sheet   = ss.getSheetByName(CHALLENGE_QUESTIONS_SHEET_);

  if (!sheet) {
    sheet = ss.insertSheet(CHALLENGE_QUESTIONS_SHEET_);
    Logger.log('Created sheet ' + CHALLENGE_QUESTIONS_SHEET_);
  }

  sheet.getRange(1, 1, 1, headers.length).setValues([headers])
       .setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');
  sheet.setFrozenRows(1);

  var existing = sheet.getLastRow() - 1;
  if (existing > 0 && !force) {
    Logger.log(CHALLENGE_QUESTIONS_SHEET_ + ' already has ' + existing +
               ' rows — left alone. Pass true to reseed.');
    return { ok: true, seeded: 0, existing: existing };
  }
  if (existing > 0) sheet.getRange(2, 1, existing, headers.length).clearContent();

  var stamp = (typeof now_ === 'function') ? now_() : new Date().toISOString();
  var rows = CHALLENGE_SEED_.map(function (it, i) {
    return _challengeSeedRow_(it, i, headers, stamp);
  });

  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  Logger.log('Seeded ' + rows.length + ' rows into ' + CHALLENGE_QUESTIONS_SHEET_);
  return { ok: true, seeded: rows.length };
}

/* ── Validation ──────────────────────────────────────────────────────────────
 *
 * Everything this catches fails silently at play time otherwise: a question with
 * three options renders a gap, a correctIndex past the end of the list makes the
 * question unwinnable, and a bank of four active rows serves the same challenge
 * to everyone. Run it after the specialist edits the sheet.
 */
function checkChallengeQuestions() {
  var rows = dbReadAll_(CHALLENGE_QUESTIONS_SHEET_);
  var problems = [];
  var ids = {};
  var active = 0;

  rows.forEach(function (r, i) {
    var where = 'row ' + (i + 2) + ' (' + (r.questionId || 'no id') + ')';
    if (!r.questionId) problems.push(where + ': no questionId');
    else if (ids[r.questionId]) problems.push(where + ': duplicate questionId');
    else ids[r.questionId] = true;

    if (!String(r.question || '').trim()) problems.push(where + ': empty question');

    var opts = [];
    try { opts = JSON.parse(r.optionsJson || '[]'); } catch (e) {
      problems.push(where + ': optionsJson does not parse');
    }
    /* Two or four. A true/false question is not a four-option question with two
     * blanks in it — padding it would draw two empty buttons and give the answer
     * away by elimination. Anything else is a typo: three options means one was
     * lost, five means one too many. */
    if (opts.length !== 4 && opts.length !== 2) {
      problems.push(where + ': ' + opts.length + ' options, expected 2 (true/false) or 4');
    }
    if (opts.some(function (o) { return !String(o || '').trim(); })) {
      problems.push(where + ': an option is blank');
    }

    var ci = Number(r.correctIndex);
    if (!(ci >= 0 && ci < opts.length)) {
      problems.push(where + ': correctIndex ' + r.correctIndex + ' is outside the options');
    }

    var url = String(r.imageUrl || '').trim();
    if (url && !/^https?:\/\//i.test(url)) problems.push(where + ': imageUrl is not an http(s) link');

    if (String(r.active).toUpperCase() !== 'FALSE' && r.active !== false) active++;
  });

  /* Below this, "random" stops being random: with 10 active questions two
   * consecutive challenges share half their paper. It is a warning and not an
   * error because a small bank still works — it just repeats. */
  if (active < CHALLENGE_QUESTION_COUNT) {
    problems.push('only ' + active + ' active questions — a challenge needs ' + CHALLENGE_QUESTION_COUNT);
  } else if (active < CHALLENGE_QUESTION_COUNT * 4) {
    Logger.log('WARNING: ' + active + ' active questions. Challenges will repeat noticeably below ' +
               (CHALLENGE_QUESTION_COUNT * 4) + '.');
  }

  if (problems.length) {
    Logger.log(problems.length + ' PROBLEM(S):\n- ' + problems.join('\n- '));
  } else {
    Logger.log('ChallengeQuestions is clean: ' + rows.length + ' rows, ' + active + ' active.');
  }
  return { ok: problems.length === 0, problems: problems, total: rows.length, active: active };
}

/* ── Resetting the old challenges ────────────────────────────────────────────
 *
 * The old Challenges sheet stored Scenario_Name and a hand-typed Challenger_Score
 * against eight scenarios that exist nowhere in the product, and nothing ever
 * closed a row. None of it converts: the new duel needs the frozen question ids
 * and two measured times, and the old rows have neither.
 *
 * This EMPTIES the sheet and leaves the header as Gamification.js currently
 * defines it. It does not reshape the columns, deliberately — `sendChallenge`
 * still writes the old shape until the engine is replaced, and a sheet whose
 * header disagrees with its only writer is worse than an old row.
 *
 * The headers come from GAM_CHALLENGE_HEADERS rather than DB_SCHEMA because that
 * is where they live: Gamification.js owns its own sheet definitions and leans on
 * the shared resolver only for the spreadsheet itself. Copying them here would be
 * a second definition of the same thing.
 *
 * Destructive, and it says so in its name — nothing here guesses that you meant it.
 */
function resetChallengesSheetDESTRUCTIVE() {
  var ss      = dbGetSpreadsheet_();
  var headers = GAM_CHALLENGE_HEADERS;
  var sheet   = ss.getSheetByName(CHALLENGES_SHEET_);

  var removed = 0;
  if (sheet) {
    removed = Math.max(0, sheet.getLastRow() - 1);
    sheet.clear();
  } else {
    sheet = ss.insertSheet(CHALLENGES_SHEET_);
  }

  sheet.getRange(1, 1, 1, headers.length).setValues([headers])
       .setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff');
  sheet.setFrozenRows(1);

  Logger.log('Challenges reset — ' + removed + ' old row(s) discarded, header rewritten.');
  return { ok: true, discarded: removed };
}

/* Convenience: the two setup steps in the order they have to happen, so the
 * whole thing is one run from the editor rather than three things to remember. */
/* The destructive path, kept for a first run on an empty spreadsheet. If there
 * is already a bank in the sheet, addMissingChallengeQuestions() is the one you
 * want — this one throws away whatever the specialist has written. */
function setupChallengesFromScratch() {
  var a = setupChallengeQuestions(true);
  var b = resetChallengesSheetDESTRUCTIVE();
  var c = checkChallengeQuestions();
  Logger.log('Seeded ' + a.seeded + ' questions, discarded ' + b.discarded +
             ' old challenges, validation ' + (c.ok ? 'clean' : 'FOUND PROBLEMS'));
  return { questions: a, challenges: b, check: c };
}

/* ── Why did that challenge not arrive? ──────────────────────────────────────
 *
 * Written because the question kept being answered with guesses. Everything it
 * prints comes off the live sheet: what the header actually says, what each row
 * actually holds, and — for one email — exactly which of the three conditions in
 * getIncomingChallenges rejects it.
 *
 * Read-only. Run it from the editor and read the log.
 */
function diagnoseChallenges(emailToCheck) {
  var ss    = dbGetSpreadsheet_();
  var sheet = ss.getSheetByName(CHALLENGES_SHEET_);
  if (!sheet) { Logger.log('There is no "' + CHALLENGES_SHEET_ + '" sheet at all.'); return; }

  var data = sheet.getDataRange().getValues();
  Logger.log('Sheet "' + CHALLENGES_SHEET_ + '": ' + (data.length - 1) + ' row(s), ' +
             sheet.getLastColumn() + ' column(s)');

  var header = data.length ? data[0].map(function (h) { return String(h).trim(); }) : [];
  Logger.log('HEADER FOUND   : ' + header.join(' | '));
  Logger.log('HEADER EXPECTED: ' + GAM_CHALLENGE_HEADERS.join(' | '));
  var headerOk = header.slice(0, GAM_CHALLENGE_HEADERS.length).join('|') ===
                 GAM_CHALLENGE_HEADERS.join('|');
  Logger.log(headerOk ? '-> header matches.'
                      : '-> HEADER DOES NOT MATCH. Run resetChallengesSheetDESTRUCTIVE().');

  if (data.length < 2) { Logger.log('No rows to inspect.'); return; }

  var rows = _gamReadAll_(CHALLENGES_SHEET_);
  rows.forEach(function (r, i) {
    Logger.log('--- row ' + (i + 2) + ' ---');
    Logger.log('  Challenge_ID    : "' + r.Challenge_ID + '"  (' + typeof r.Challenge_ID + ')');
    Logger.log('  Challenger_Email: "' + r.Challenger_Email + '"');
    Logger.log('  Target_Email    : "' + r.Target_Email + '"');
    Logger.log('  Status          : "' + r.Status + '"   (expected for a sent one: ' +
               GAM_STATUS.AWAITING_TARGET + ')');
    Logger.log('  Challenger_Correct: "' + r.Challenger_Correct + '"   Target_Correct: "' +
               r.Target_Correct + '"');
    Logger.log('  Created_At      : "' + r.Created_At + '"   expired: ' + _gamChallengeExpired_(r));
    Logger.log('  PaperJson length: ' + String(r.PaperJson || '').length);
  });

  if (!emailToCheck) {
    Logger.log('\nPass an email to see which rows it would receive, e.g. ' +
               'diagnoseChallenges("someone@icaoaerocomms.com")');
    return;
  }

  /* The three conditions, reported separately. A single true/false would say
   * "no challenges" again, which is the answer we already had. */
  var me = String(emailToCheck).toLowerCase();
  Logger.log('\nFor ' + me + ':');
  rows.forEach(function (r, i) {
    var isTarget = String(r.Target_Email || '').toLowerCase() === me;
    var isAwait  = String(r.Status || '') === GAM_STATUS.AWAITING_TARGET;
    var fresh    = !_gamChallengeExpired_(r);
    Logger.log('  row ' + (i + 2) + ': target=' + isTarget + '  awaiting_target=' + isAwait +
               '  not_expired=' + fresh + '  => ' +
               ((isTarget && isAwait && fresh) ? 'WOULD BE DELIVERED' : 'filtered out'));
  });
}

/* ── Why did the duel not start? ─────────────────────────────────────────────
 *
 * The screen said "Could not start the challenge" three times, which is the
 * fallback sentence and not a reason. This runs the same steps the server runs
 * and reports where they stop, with the real exception rather than a caught and
 * flattened one.
 *
 * Read-only: it draws a paper and throws it away. Nothing is written.
 */
function diagnoseDuelDraw() {
  Logger.log('1. Can the bank be read?');
  var bank;
  try {
    bank = dbReadAll_(CHALLENGE_QUESTIONS_SHEET_);
    Logger.log('   dbReadAll_ returned ' + bank.length + ' row(s).');
  } catch (e) {
    Logger.log('   THREW: ' + e.message);
    Logger.log('   -> ' + CHALLENGE_QUESTIONS_SHEET_ + ' is probably not in DB_SCHEMA in the ' +
               'DEPLOYED version, or the sheet does not exist.');
    return;
  }
  if (!bank.length) { Logger.log('   The sheet is empty. Run setupChallengeQuestions(true).'); return; }

  Logger.log('2. First row, as read:');
  var f = bank[0];
  Object.keys(f).forEach(function (k) {
    Logger.log('   ' + k + ' = "' + f[k] + '"  (' + typeof f[k] + ')');
  });

  Logger.log('3. How many count as active?');
  var active = bank.filter(function (r) {
    var flag = String(r.active).toUpperCase();
    return r.questionId && flag !== 'FALSE' && flag !== 'NO' && flag !== '0';
  });
  Logger.log('   ' + active.length + ' of ' + bank.length + ' active; ' +
             CHALLENGE_QUESTION_COUNT + ' are needed.');
  if (active.length < CHALLENGE_QUESTION_COUNT) {
    Logger.log('   -> this is why the draw returns nothing. Check the active column.');
    return;
  }

  Logger.log('4. Does the draw produce a paper?');
  var paper;
  try {
    paper = _gamDrawPaper_();
    Logger.log('   ' + paper.length + ' question(s) drawn: ' +
               paper.map(function (p) { return p.id; }).join(', '));
  } catch (e) { Logger.log('   THREW: ' + e.message); return; }
  if (!paper.length) { Logger.log('   -> empty paper.'); return; }

  Logger.log('5. Can it be served without the answers?');
  try {
    var served = _gamPaperForPlay_(paper);
    Logger.log('   ' + served.length + ' served. First: "' +
               String(served[0].question).slice(0, 60) + '" with ' +
               served[0].options.length + ' options.');
    Logger.log('   carries correctIndex? ' + ('correctIndex' in served[0]));
  } catch (e) { Logger.log('   THREW: ' + e.message); return; }

  Logger.log('6. Is the Challenges sheet writable with the current header?');
  try {
    _gamEnsureSheet_(CHALLENGES_SHEET_, GAM_CHALLENGE_HEADERS);
    Logger.log('   header matches — an append would work.');
  } catch (e) {
    Logger.log('   REFUSED: ' + e.message);
    return;
  }

  Logger.log('\nEverything the draw needs is in place. If the screen still fails, the ' +
             'message it shows now carries the server code — read that.');
}

/* ── Proving the 24-hour expiry without waiting a day ────────────────────────
 *
 * The expiry is computed from Created_At, so the only way to see it work is to
 * have a row older than the window. Waiting is not a test anybody runs twice.
 *
 * This backdates ONE named challenge and reports what the rule then says about
 * it. It writes, and only to the row you name — there is no "expire everything"
 * here on purpose.
 */
function expireChallengeForTesting(challengeId, hoursAgo) {
  if (!challengeId) { Logger.log('Pass a Challenge_ID. Get one from diagnoseChallenges().'); return; }
  var hours = Number(hoursAgo) || (CHALLENGE_EXPIRY_HOURS + 1);

  var row = _gamFindChallenge_(challengeId);
  if (!row) { Logger.log('No challenge with id ' + challengeId); return; }

  Logger.log('Before: Created_At = "' + row.Created_At + '"  expired = ' + _gamChallengeExpired_(row));

  var backdated = new Date(Date.now() - hours * 3600 * 1000).toISOString();
  var ok = _gamUpdateRow_(GAM_SHEETS.CHALLENGES, 'Challenge_ID', String(challengeId),
                          { Created_At: backdated });
  if (!ok) { Logger.log('The row was not updated — Challenge_ID did not match.'); return; }

  var after = _gamFindChallenge_(challengeId);
  Logger.log('After : Created_At = "' + after.Created_At + '"  expired = ' +
             _gamChallengeExpired_(after));
  Logger.log('Window is ' + CHALLENGE_EXPIRY_HOURS + ' h; this row is now ' + hours + ' h old.');
  Logger.log('Now check the app: it should be gone from Incoming Challenges, and opening it ' +
             'from the email link should refuse with EXPIRED.');
}
