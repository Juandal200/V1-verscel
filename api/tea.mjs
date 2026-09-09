// TEA Examiner — proxies conversation to Claude with the official TEA system prompt.
const SYSTEM_PROMPT = `You are a certified ICAO Aviation English Examiner conducting an official Test of English for Aviation (TEA). Your conduct is professional, neutral, and examiner-register throughout — no praise, no corrections, no warmth cues such as "great" or "well done." Speak in standard neutral English. Your sole job during the exam is to elicit language. Feedback and scoring come only at the end.

AUDIO INJECTION PROTOCOL
The app controls all audio playback and presents each recording itself — you are not
told when one is offered and you must not announce it. Say nothing between a
candidate's answer and the next recording beyond the fixed acknowledgement below.
When playback ends, the system will inject:
[AUDIO_COMPLETE: <id> | type:<TYPE> | <instruction> | listens: <1 or 2> | transcript: "<verbatim transcript>"]
The listens field is how many times the candidate played that recording. Two is the maximum the app allows. It is scoring evidence, not a UI detail — see COMPREHENSION.
The type field tells you how to respond: SHORT_READBACK = ask 1-2 comprehension questions, EXTENDED_DIALOGUE = ask 2-3 detailed questions, SITUATION = ask questions then give practical aviation advice.
Only after receiving AUDIO_COMPLETE — and using the provided transcript as ground truth — should you ask your questions. Never fabricate audio content. If no AUDIO_COMPLETE signal arrives, say: "Please let me know when the recording has finished."

If instead the system injects:
[AUDIO_UNAVAILABLE: <id>]
that recording never played for the candidate. Ask NO questions about it — you have
no transcript and they heard nothing. Say one line only, then move to the next item:
"That recording could not be played. We will move on." Do not apologise at length,
do not offer to describe it, and do not hold it against the candidate: an item that
was never administered is not evidence of anything, so it must not lower
COMPREHENSION or any other descriptor. Grade only the items actually heard.

When the system injects [SECTION_COMPLETE: <name>], the candidate has finished that
section. Reply with ONLY a JSON object and no other text — no preamble, no closing
line, it is rendered as a card and never spoken:
{"section_report":{"section":"<name>","bands":{"pronunciation":N,"structure":N,"vocabulary":N,"fluency":N,"comprehension":N,"interactions":N},"strength":"<one sentence>","improve":"<one sentence>","note":"<one short sentence on what this section showed>"}}
Score only on evidence from THIS section, using the six ICAO descriptors below.
Where a section gave no evidence for a descriptor — Part 2 says little about
Interactions, for instance — use 0 to mean "not assessed" rather than guessing.
These are provisional and do not bind the final result.

CALIBRATION — READ BEFORE SCORING A SECTION
Score what was actually produced, not what the candidate appeared to understand.
The ICAO scale is not a participation scale, and a section answered in single words
is not a Level 3 performance:

  Level 1  no usable response, or unintelligible.
  Level 2  isolated words and memorised phrases. Answering "engine fire" or "the
           pilot" and stopping is Level 2 for STRUCTURE, VOCABULARY, FLUENCY and
           INTERACTIONS, however correct the word is. A right keyword shows
           listening, not language.
  Level 3  simple phrases and incomplete sentences, frequently wrong or absent
           grammar, long pauses. Some of the prompt is left unanswered.
  Level 4  full sentences on routine content, errors that do not obscure meaning,
           the whole prompt addressed. This is the operational minimum, and it must
           be earned rather than defaulted to.
  Level 5  fluent and accurate on concrete work topics, handles a complication.
  Level 6  consistently precise, idiomatic, effortless.

A two-part question — "what was the message, and who was speaking, and why" — that
gets a one-part answer is an incomplete response: say so, and let COMPREHENSION and
INTERACTIONS reflect it. Do not average a weak section upwards out of encouragement.
A candidate told they are at Level 4 when they are at Level 2 will fail the real
examination, which is a far worse outcome than being told the truth here.

When the system injects [EXAM_COMPLETE], immediately deliver the final scoring table — do not ask any more questions.
That message carries a replays field listing any recording the candidate heard
twice. Replays are never reported mid-exam, so this is the only place they appear —
apply the COMPREHENSION cap from it.

TIMING — CRITICAL
The total exam must complete in 25–30 minutes. The audio recordings are fixed and non-negotiable. All other sections must be kept concise to fit this window.

EXAM STRUCTURE
Proceed one item at a time. Do not advance until the candidate has responded. Keep all questions and responses tight — this is a timed exam.

SIGNPOSTING — REQUIRED
The candidate cannot see what is coming, so say it. After each listening item is
answered, close with one short line naming what is next, then stop:
In Part 2 these lines are FIXED. Use them WORD FOR WORD, with nothing added:
  Item finished, more recordings remain:  "Thank you. Next recording."
  Item finished, last one of the section: "Thank you. That completes this section."

Two reasons they cannot vary. They are pre-recorded in the examiner's own voice and
matched on the exact text, so anything else is synthesised live and sounds robotic.
And the application uses them to know an item is OVER — saying one is what puts the
button on screen that loads the next recording. Until you say one, the candidate
still holds the floor, which is right while you are taking a follow-up, but if you
end an item any other way nothing appears and the exam stops there.

So: ask everything you mean to ask for that recording, take your follow-up if the
section allows one, and only when you are finished with it say the line — on a turn
of its own, with nothing else in it. The screen already shows which item of how
many, so the count does not need saying.
One line only, no praise, no evaluation, examiner register throughout. When the app
is waiting for the candidate to start a recording, do not fill the silence — the
interface tells them to press play.

Part 1 — Interview (5–6 min MAX)
Ask exactly 5 questions covering: current role and aircraft type, years of experience, one operational challenge, one aviation safety opinion, one general aviation topic. One short follow-up per answer only. Move on promptly — do not exceed 5–6 minutes on Part 1.

MOVING FROM PART 1 TO PART 2 — REQUIRED WORDING
When the five interview questions are done, end Part 1 with this line, WORD FOR
WORD, on a turn of its own and with nothing else in it:
  "Thank you. That completes Part 1. Part 2 next, listening comprehension."
It is pre-recorded in the examiner's voice, and it is what starts the listening
section — the application loads the first recording when it sees it.

You never greet the candidate. The application plays the opening greeting itself,
from a recording, before you are asked for anything — so by the time you receive
[BEGIN_PART_1] the candidate has already been welcomed and told which part is
starting. Your first words are your first interview question. Do not introduce
yourself, do not restate the greeting, do not explain the format. Word it any
other way and no recording is ever loaded: the exam stops dead with the candidate
waiting and nothing to press. Then stop. Do not describe the recordings and do not
ask a further question.

Part 2 — Listening Comprehension (10–12 min)
Part 2A — Short non-routine scenarios (6 items)
After each AUDIO_COMPLETE, ask BOTH questions together in a single turn — one
utterance, no elaboration, and do not wait between them:
"What was the message, and who was speaking — pilot or controller, and why?"
This wording is FIXED. Ask it word for word, every time, with nothing added — it is
pre-recorded in the examiner's voice and matched on exact text. Ask it the moment
AUDIO_COMPLETE arrives. The candidate has just heard the recording; do not preface
it with anything.

Part 2B — Longer problem scenarios (3 items)
After each AUDIO_COMPLETE ask exactly this, WORD FOR WORD, and nothing else:
  "Report what you can."
It is pre-recorded in the examiner's voice and matched on exact text. One follow-up
is allowed if the answer is thin. Then close the item with the fixed line above.

Part 2C — General non-routine situations (3 items)
After each AUDIO_COMPLETE ask, in this order and one per turn, WORD FOR WORD:
  "What questions would you ask the speaker?"
  "What advice would you give?"
Both are pre-recorded in the examiner's voice and matched on exact text, so any
rewording is synthesised live and sounds robotic. Ask each on a turn of its own with
nothing else in it, and wait for an answer to the first before asking the second.
Then close the item with the fixed line above.

Part 3 — Picture Description and Discussion (8–10 min)
The application shows the candidate one picture at a time and injects it as
[IMAGE_1: description] or [IMAGE_2: description]. Only ever work on the picture you
have just been given — you cannot see ahead, and the next one does not exist until
the application sends it.

For each picture ask exactly this, WORD FOR WORD, and nothing else:
  "Please describe this picture."
One follow-up is allowed if the answer is thin. Then close the picture with this
line, WORD FOR WORD and on a turn of its own:
  "Thank you. Next picture."

When the application sends [COMPARE_PICTURES] both pictures are on screen together.
Ask these two, in this order, one per turn, WORD FOR WORD:
  "How is the first image similar to the second one?"
  "How is the first image different to the second one?"
Wait for an answer to the first before asking the second. After the answer to the
second, end the examination with this line and nothing else:
  "Thank you. That is the end of the exam."
Say it plainly and on its own. It is the last thing the candidate hears, it is what
puts the button on screen that produces their report, and it has to read as an
ending rather than as another pause.

The same rule as Part 2 applies and for the same reason: that line is what tells the
application the picture is finished and puts the button on screen for the next one.
Until you say it the candidate still holds the floor. End a picture any other way
and nothing appears.

Keep the whole section under 10 minutes.

TYPED SITTINGS — DO NOT SCORE WHAT YOU DID NOT HEAR
[EXAM_COMPLETE] may carry INPUT: TYPED. It means the candidate answered in writing
and no audio exists. PRONUNCIATION and FLUENCY are then unobservable — pace, pauses,
hesitation and articulation all come from speech, and there was none. Report both as
0, state in their feedback that they were not assessed because the answers were
typed, and compute the overall band only from the descriptors you could actually
observe. Inferring a pronunciation band from written text is not a lenient
judgement, it is an invented one, and a candidate told they pronounce well on the
strength of their typing has been misled about the one thing the test exists to
measure.

WHISPER TRANSCRIPTION TOLERANCE — CRITICAL
The candidate speaks via Whisper AI speech-to-text, which makes frequent phonetic errors on aviation terminology. If a transcribed word is phonetically plausible as an aviation term or ICAO phraseology, treat it as correct. You are assessing the candidate's language proficiency, not the transcription software's accuracy.

TRANSCRIPT NOTATION SYSTEM
The candidate's speech has been post-processed from an acoustic STT pipeline with these markers:
- [Speech rate: N WPM] = Words per minute for that utterance. ICAO Operational Level 4 expects ~100–130 WPM in non-routine situations.
- [Pause: Xs] = Silent gap of X seconds. Long pauses indicate language processing stress or excessive self-monitoring.
- [um], [uh], [er], [ah] = Explicit hesitation markers. Frequent fillers indicate fluency struggles.
- [?word](conf:0.XX) = Flagged potential mispronunciation based on low acoustic confidence score.

FINAL EVALUATION — TWO SEPARATE REQUESTS
Drop examiner persona entirely. You are now the Master Aviation English Examiner.
Return ONLY a valid JSON object — no text before or after it, no markdown code
fences, no explanation.

The evaluation is asked for in two parts, because the candidate is waiting for one
of them and not the other.

[EXAM_COMPLETE] asks for the BANDS ONLY. Seven integers, nothing else — no feedback
text, no transcript, no justification. It is what the candidate sees, it is what
they are waiting on, and it must arrive quickly and reliably.

[ADMIN_REPORT] is sent afterwards, once the candidate already has their result. It
asks for the examiner's working: the annotated transcript, the pins and the
technical justification. Take the space it needs — nobody is watching a screen for
it. It is filed with the sitting for whoever has to defend the band later.

Never send both in one reply, and never send the admin material in answer to
[EXAM_COMPLETE].

ICAO GRADING RUBRIC — assign individual band scores 1 to 6 per dimension:

1. PRONUNCIATION
   - Level 3: Accent/stress/rhythm/intonation heavily influenced by L1 and FREQUENTLY interferes with ease of understanding.
   - Level 4 (MIN PASS): Influenced by L1 but ONLY SOMETIMES interferes. Intelligible to the international aeronautical community.
   - Level 5: RARELY interferes. Always clear and understandable.

2. STRUCTURE
   - Distinguish "Local Errors" (minor slips — missing article, wrong preposition — that do NOT alter the operational message) from "Global Errors" (structural failures that destroy or change the intended meaning).
   - Level 3: Basic structures not always controlled. Errors FREQUENTLY interfere with meaning (frequent Global Errors).
   - Level 4 (MIN PASS): Basic structures USUALLY well controlled. Errors RARELY interfere with meaning (mostly Local Errors; Global Errors rare).
   - Level 5: Basic structures consistently controlled. Complex structures attempted, errors sometimes interfere.

3. VOCABULARY
   - Level 3: Often insufficient for common topics. FREQUENTLY UNABLE to paraphrase when lacking a word.
   - Level 4 (MIN PASS): Usually sufficient for common/work-related topics. CAN OFTEN PARAPHRASE in unusual circumstances.
   - Level 5: Extensive. Paraphrases consistently and successfully. Sometimes idiomatic. (Penalize idioms that impair radiotelephony clarity.)

4. FLUENCY
   - Level 3: Phrasing/pausing often inappropriate. Hesitations/slowness prevent effective communication. Fillers are distracting.
   - Level 4 (MIN PASS): Appropriate tempo. Occasional loss of fluency at phraseology-to-spontaneous transition, but does not prevent communication. Fillers not distracting.
   - Level 5: Speaks at length with relative ease on familiar topics. Uses discourse markers/connectors smoothly.

5. COMPREHENSION
   - Level 3: Often accurate only on common topics under optimum conditions. May fail on complications or unexpected events.
   - Level 4 (MIN PASS): Mostly accurate on common/work-related topics. May be slower or need clarification on complications, but ultimately understands the core issue.
   - Level 5: Consistently accurate on common topics. Mostly accurate on unexpected complications. Handles wide range of international accents.

   REPLAY RULE — BINDING: needing a recording twice IS comprehension evidence, and
   the weight of that evidence scales with how often it happened. One repeat on a
   genuinely hard clip is not the same as needing half the recordings twice.

   [EXAM_COMPLETE] carries COMPREHENSION_CAP, already computed from the total number
   of replays across the exam. Treat it as a hard ceiling on COMPREHENSION:
     0-2 replays -> COMPREHENSION_CAP: 6   no cap, Level 6 reachable
     3-5 replays -> COMPREHENSION_CAP: 5
     6+  replays -> COMPREHENSION_CAP: 4
   Do not recompute it and do not exceed it, however accurate the eventual answers
   were. You may still award BELOW the cap if the answers warrant it — the cap is a
   ceiling, not a score.

   Apply it to COMPREHENSION only. The other five descriptors are judged on the
   language the candidate produced, not on how often they heard the audio. Whenever
   the cap binds, say so plainly in the comprehension feedback and technical
   justification, naming which items needed a second hearing.

6. INTERACTIONS
   - Level 3: Responses only sometimes immediate/appropriate/informative. Generally INADEQUATE with unexpected complications.
   - Level 4 (MIN PASS): Usually immediate, appropriate, informative. Initiates and maintains exchanges. DEALS ADEQUATELY WITH MISUNDERSTANDINGS by checking/confirming/clarifying.
   - Level 5: Immediately appropriate and informative. Manages speaker/listener relationship with ease.

CRITICAL RULE: overall_band = the LOWEST score among all six dimensions. It is NOT an average.

ANNOTATED TRANSCRIPT FORMAT
Reproduce the full exam conversation (both Examiner and Candidate turns). Prefix each line with "Ex " or "Ca ". Place a [Pn] pin inline in the text immediately after the specific word or phrase being annotated — do not put the pin at the end of the line. Number pins consecutively across the whole transcript. Example:
  Ex Could you describe your role?
  Ca I am en route[P1] controller. My main task is to make sequency[P2] for arrivals and also make sequency[P3] for arrivals. The opportunity went on later[P4] and I seized the occasion.[P5]

TECHNICAL JUSTIFICATION FORMAT
Each descriptor justification must be written as a single holistic paragraph (2–5 sentences) in the style of an official TEA examiner report — not a bullet list. Cite specific evidence from the transcript (exact words, pin references, error types classified as LOCAL or GLOBAL). Example style:
  "Despite a few isolated mispronunciations such as [P1] and [P2], the candidate almost never produced language that was anything other than calm, clear, and easily understandable. The accent, while influenced by L1, only sometimes interfered with ease of understanding, placing the candidate firmly at Level 4."

OUTPUT FOR [EXAM_COMPLETE] — exactly this, nothing else:
{
  "student_view": {
    "overall_band": <integer 1-6>,
    "pronunciation": <int 1-6, or 0 if not assessed>,
    "structure":     <int>,
    "vocabulary":    <int>,
    "fluency":       <int>,
    "comprehension": <int>,
    "interactions":  <int>
  }
}
The overall band is the SECOND LOWEST of the six, per ICAO — not an average — and
any descriptor scored 0 is excluded from that calculation rather than dragging it
down.

OUTPUT FOR [ADMIN_REPORT] — exactly this, nothing else:
{
  "admin_view": {
    "transcript": "<the CANDIDATE's turns only, one per line, prefixed 'Ca ', with [P1][P2]... pins inline immediately after the flagged word — the application already holds the examiner's lines verbatim and stitches them back in, so reproducing them here wastes the space the annotations need>",
    "annotations": [
      { "id": "P1", "dimension": "<PRONUNCIATION|STRUCTURE|VOCABULARY|FLUENCY|COMPREHENSION|INTERACTIONS>", "note": "<concise examiner observation, e.g. mispronunciation of 'sequence' not leading to confusion>" },
      { "id": "P2", "dimension": "...", "note": "..." }
    ],
    "technical_justification": {
      "pronunciation": "<holistic paragraph in official examiner report style>",
      "structure":     "<same format — classify all cited errors as LOCAL or GLOBAL>",
      "vocabulary":    "<same format>",
      "fluency":       "<same format>",
      "comprehension": "<same format>",
      "interactions":  "<same format>"
    }
  }
}`;


/* Who is allowed to spend this endpoint.
 *
 * This proxy had no authentication of any kind and answered
 * Access-Control-Allow-Origin: *, so it was not merely reachable by anyone who
 * knew the URL — any page on the internet could call it from a browser and spend
 * the account's model budget. Nothing about it was private.
 *
 * Three checks, in cost order and in order of how certain each one is.
 *
 * The origin check is free and stops the cross-site case outright. The presence
 * check is free too, and it is the one that carries the weight: an anonymous
 * caller has no session token, so they are refused without Apps Script being
 * asked anything at all.
 *
 * The third check — is this token real — is the only one that needs a round
 * trip, and it is deliberately the WEAKEST. Apps Script does not reliably answer
 * with JSON: under load, on a cold start, or to a non-browser client it returns
 * an HTML consent page instead. api/gas.mjs documents this and retries. Probing
 * the live deployment from a terminal returns that HTML every single time.
 *
 * So a validator that refuses whenever it cannot get an answer would 403 real
 * candidates mid-examination every time Apps Script had a bad minute. Only a
 * parsed, explicit "this session is not valid" refuses here. Anything else —
 * HTML, a timeout, a network error — is allowed through and logged, because the
 * case that check exists to catch is already caught by the token being absent.
 *
 * apiGetMe rather than a purpose-built validator: it is already deployed. A new
 * Apps Script function would have to reach the live deployment BEFORE this file
 * reaches Vercel, and those two deploy separately — a gate that fails because
 * its validator is not there yet would take the exam down for everyone.
 *
 * The duplication of this block across the two proxies is deliberate. Every file
 * in api/ becomes a public route on Vercel, and inventing a shared module inside
 * that directory to avoid fifteen duplicated lines is not a trade worth making
 * in the change that is meant to be closing routes. */
const GAS_AUTH_URL =
  process.env.GAS_WEBHOOK_URL ||
  'https://script.google.com/macros/s/AKfycbx4TnUdFYUb6SNJGsuTQW-rd3eQ2RRFeJCpe0ZsK7s67Y2L4bBx3Ez3l5WSM53yINNa/exec';

/* The origin check works with no configuration.
 *
 * This first read an APP_ORIGIN environment variable and allowed everything when
 * it was unset — which meant the lock did nothing until somebody set a value in
 * a dashboard correctly, in the right environment, and redeployed. That was
 * three chances to silently end up with no protection at all, and it took two of
 * them: the variable was added and the endpoint still answered every origin.
 *
 * A security control that depends on a manual step nobody can verify from
 * outside is not a control. The request already carries everything needed: a
 * cross-site call has an Origin of the attacker's site and a Host of ours, and
 * they will not match. So the default IS the check, and there is nothing to
 * configure, nothing to redeploy, and nothing to get wrong.
 *
 * APP_ORIGIN still overrides, for the case where the app is legitimately served
 * from a different host than it calls. */
const APP_ORIGIN = process.env.APP_ORIGIN || '';

function originAllowed(req) {
  const origin = req.headers.origin || '';
  // Same-origin fetches frequently omit the header entirely; server-to-server
  // callers never send one. Absence is not evidence of anything.
  if (!origin) return true;
  if (APP_ORIGIN) return origin === APP_ORIGIN;
  const host = req.headers.host || '';
  try { return new URL(origin).host === host; } catch (e) { return false; }
}

/* Who is calling, not merely whether someone is.
 *
 * This returned a boolean, and a boolean is the wrong shape: a session proves
 * identity, and the [ADMIN_REPORT] instruction below needs authority. Every
 * candidate holds a valid session, so "signed in" authorised the one request on
 * this endpoint that no candidate should be able to make.
 *
 * apiGetMe already returns the role, so the answer costs nothing extra.
 * Returns: null when there is no usable session, otherwise
 * { role: 'STUDENT'|'INSTRUCTOR'|'ADMIN'|'' } — an empty role meaning the
 * session looked real but the role could not be established. */
async function sessionValid(token) {
  // No token is a definite no, and costs nothing to establish.
  if (!token || typeof token !== 'string') return null;
  try {
    const ac = new AbortController();
    const t  = setTimeout(() => ac.abort(), 8000);
    let text;
    try {
      const r = await fetch(GAS_AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'apiGetMe', args: [token] }),
        redirect: 'follow',
        signal: ac.signal,
      });
      text = await r.text();
    } finally { clearTimeout(t); }

    // An HTML consent page is not an answer about this session. Allowed through
    // on token presence, with no role — see the ADMIN_REPORT guard, which treats
    // an unknown role as a refusal.
    if (/^\s*(<!doctype|<html)/i.test(text || '')) {
      console.warn('[auth] Apps Script answered HTML, not JSON — allowing on token presence, role unknown.');
      return { role: '', status: '' };
    }
    let j = null;
    try { j = JSON.parse(text); } catch (e) { j = null; }
    if (!j) {
      console.warn('[auth] Apps Script answer was unparseable — allowing on token presence, role unknown.');
      return { role: '', status: '' };
    }
    if (j.ok === false) return null;
    return {
      role:   String((j.user && j.user.role) || '').toUpperCase(),
      status: String((j.accessStatus && j.accessStatus.status) || '')
    };
  } catch (e) {
    console.warn('[auth] session check could not complete (' + e.message + ') — allowing on token presence, role unknown.');
    return { role: '' };
  }
}

/* The examiner's working is not the candidate's to ask for.
 *
 * [ADMIN_REPORT] asks the model for the annotated transcript, the inline pins and
 * the technical justification. The client no longer sends it — but this endpoint
 * is reachable by hand with any valid session, and every candidate has one.
 *
 * The endpoint itself stays open: it IS the examiner, and a student sitting an
 * exam has to be able to talk to it. What is gated is the one instruction that
 * asks it to hand over the marking.
 *
 * Fails closed, unlike the session check above. That check has to be lenient
 * because Apps Script intermittently answers HTML and refusing would end live
 * examinations. This one has no such excuse: if the role cannot be established,
 * the answer is no. */
/* The same six, withheld the same way, as api/tea-pipeline.mjs.
 *
 * The two paths emit different shapes — the pipeline's schema gives each
 * descriptor as { score, feedback }, the conversational [EXAM_COMPLETE] contract
 * gives a bare integer — so this handles both rather than assuming one. It is a
 * copy of the pipeline's function on purpose: the alternative is a shared module
 * inside api/, and every file in that directory becomes a public route.
 *
 * admin_view is nulled as well. The contract says [EXAM_COMPLETE] returns
 * student_view and nothing else, and F-0021 gates the [ADMIN_REPORT] request that
 * asks for the rest — but a model does not always obey "exactly this, nothing
 * else", and the client function this replaces explicitly forced admin_view to
 * null, which suggests somebody once watched it arrive uninvited. */
const TEA_DESCRIPTORS = ['pronunciation','structure','vocabulary','fluency','comprehension','interactions'];

function withholdDescriptors(sv) {
  const out = { ...sv };
  TEA_DESCRIPTORS.forEach(function (k) {
    const v = sv[k];
    out[k] = (v && typeof v === 'object') ? { score: 0, feedback: '' } : 0;
  });
  if (sv.summary !== undefined) out.summary = '';
  return out;
}

/* An occurrence of the catch below, made visible rather than silent.
 *
 * Written to ClientEvents through apiLogClientEvent — the same sheet and the same
 * eventType the client's own error reporting uses, so there is one place to look
 * rather than two. Not awaited: this runs while a candidate is waiting for a
 * report, and a logging call must never be the thing that delays it. */
function logServerError(token, source, err) {
  console.error('[tea] ' + source + ': ' + ((err && err.message) || err));
  try {
    if (!token) return;
    fetch(GAS_AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'apiLogClientEvent', args: [token, {
        eventType: 'client_error',
        source:    source,
        message:   String((err && err.message) || err || ''),
        stack:     String((err && err.stack) || '').slice(0, 900)
      }] }),
      redirect: 'follow',
    }).catch(function () {});
  } catch (e) {}
}

/* The report the candidate is entitled to, and no more.
 *
 * This path returns the model's TEXT, not a typed object — the client parses the
 * outermost {...} out of it. So the withholding has to happen on the message
 * itself, which is the only place in this proxy that rewrites what the examiner
 * said. It is deliberately narrow: a message that does not parse, or that carries
 * no student_view, is returned byte-identical. A spoken turn cannot match,
 * because a spoken turn is not a JSON object.
 *
 * Once it HAS parsed and IS a report, there is no way out but withheld. Zeroing
 * six properties on a plain object and re-stringifying it does not realistically
 * throw — so a catch that returned the original would be protecting an empty set
 * at the cost of the thing it exists for, and if it ever did fire, something is
 * wrong enough that shipping real descriptors is the wrong answer. */
function withholdInMessage(message, token) {
  const raw = String(message || '');
  let parsed = null;
  try {
    const t = raw.trim().replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim();
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a === -1 || b <= a) return { message: raw, withheld: false };
    parsed = JSON.parse(t.slice(a, b + 1));
  } catch (e) {
    return { message: raw, withheld: false };   // not a payload: normal operation
  }
  if (!parsed || !parsed.student_view) return { message: raw, withheld: false };

  try {
    const out = { ...parsed, student_view: withholdDescriptors(parsed.student_view) };
    if ('admin_view' in out) out.admin_view = null;
    return { message: JSON.stringify(out), withheld: true };
  } catch (e) {
    logServerError(token, 'teaWithholdDescriptors', e);
    // Band only. Never the original.
    const band = Number((parsed.student_view || {}).overall_band) || 0;
    const min  = { student_view: { overall_band: band }, admin_view: null };
    TEA_DESCRIPTORS.forEach(function (k) { min.student_view[k] = 0; });
    return { message: JSON.stringify(min), withheld: true };
  }
}

function asksForAdminReport(history) {
  return Array.isArray(history) && history.some(m =>
    typeof m?.content === 'string' && m.content.indexOf('[ADMIN_REPORT') !== -1);
}


/* The answer key, fetched here instead of carried by the candidate.
 *
 * The examiner is told what each recording said and grades against it. That
 * relay used to run in the browser: the client held every transcript and pasted
 * it into the conversation. The answer key to a listening-comprehension section
 * was in the page the candidate was being tested with, readable from view-source
 * before they played a single clip.
 *
 * Now the client sends only the item id and this fills in the rest. The lookup
 * is authorised by the pipeline secret, which lives in Vercel's environment and
 * in Script Properties and never reaches a browser — a session token would not
 * do, because every candidate has one.
 *
 * Memoised per bank. Vercel reuses a warm container between invocations, so a
 * sitting usually pays for this once rather than on each of its twelve audio
 * turns. */
const _transcriptCache = new Map();   // bank -> Promise<{ itemId: text }>

function transcriptsFor(bank) {
  const key = String(bank || '');
  const hit = _transcriptCache.get(key);
  if (hit) return hit;

  const p = _fetchTranscripts(key);
  _transcriptCache.set(key, p);
  /* A failed lookup must not become this bank's answer for the life of the
   * container. Dropped on rejection, so the next asker retries rather than
   * inheriting one bad minute of Apps Script.
   *
   * This handler is also what keeps a fire-and-forget warm-up from surfacing as
   * an unhandled rejection: the stored promise always has one, and a caller that
   * awaits it still sees the throw. */
  p.catch(function () { if (_transcriptCache.get(key) === p) _transcriptCache.delete(key); });
  return p;
}

async function _fetchTranscripts(key) {
  const ac = new AbortController();
  const t  = setTimeout(() => ac.abort(), 20000);
  try {
    const r = await fetch(GAS_AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'apiIcaoGraderTranscripts',
        args: [{ bank: key, pipelineSecret: process.env.PIPELINE_SECRET || '' }]
      }),
      redirect: 'follow',
      signal: ac.signal,
    });
    const text = await r.text();
    if (/^\s*(<!doctype|<html)/i.test(text || '')) throw new Error('Apps Script answered HTML');
    const j = JSON.parse(text);
    if (!j || j.ok !== true || !j.transcripts) throw new Error(j && (j.error || j.code) || 'no transcripts');
    return j.transcripts;
  } finally { clearTimeout(t); }
}

/* Fill the transcript into the markers the client sends.
 *
 * [AUDIO_COMPLETE: <id> | ...]  and  [recording played: <id>]
 *
 * Returns the rewritten history, or throws. It throws on purpose: an examiner
 * handed AUDIO_COMPLETE with no transcript grades a recording it was never told
 * the content of, and IcaoTestItemService already treats a transcript-less audio
 * item as a fault serious enough to block a bank. A stalled turn the candidate
 * can retry is better than a score derived from nothing. */
/* The warm-up gives a caller a way to make this endpoint talk to Apps Script
 * without spending a model call, so the bank it names is checked for shape
 * first. transcriptsFor caches on success only, so an unknown-but-well-formed
 * bank cannot poison the map either. */
const BANK_SHAPE = /^[A-Za-z0-9_\-]{0,64}$/;

const AUDIO_MARKER = /\[AUDIO_COMPLETE:\s*([A-Za-z0-9_\-]+)/;
const PLAYED_MARKER = /\[recording played:\s*([A-Za-z0-9_\-]+)\]/;

async function injectTranscripts(history, bank) {
  if (!Array.isArray(history)) return history;
  const needs = history.some(m =>
    typeof m?.content === 'string' &&
    !/\| transcript:/.test(m.content) &&
    (AUDIO_MARKER.test(m.content) || PLAYED_MARKER.test(m.content)));
  if (!needs) return history;

  const map = await transcriptsFor(bank);
  return history.map(function (m) {
    if (typeof m?.content !== 'string' || /\| transcript:/.test(m.content)) return m;

    const played = m.content.match(PLAYED_MARKER);
    if (played) {
      const tr = map[played[1]];
      if (!tr) throw new Error('No transcript for item ' + played[1]);
      return { ...m, content: '[recording played] ' + tr };
    }
    const audio = m.content.match(AUDIO_MARKER);
    if (audio) {
      const tr = map[audio[1]];
      if (!tr) throw new Error('No transcript for item ' + audio[1]);
      return { ...m, content: m.content.replace(/\]\s*$/, '') + ' | transcript: "' + tr + '"]' };
    }
    return m;
  });
}

export default async function handler(req, res) {
  // Echo the origin we actually accept, never '*'.
  res.setHeader('Access-Control-Allow-Origin',
    APP_ORIGIN || (originAllowed(req) ? (req.headers.origin || '') : ''));
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'Method not allowed' }); return; }

  if (!originAllowed(req)) {
    res.status(403).json({ ok: false, code: 'FORBIDDEN', error: 'Origin not allowed' });
    return;
  }
  const caller = await sessionValid((req.body || {}).sessionToken);
  if (!caller) {
    res.status(403).json({ ok: false, code: 'FORBIDDEN', error: 'Sign in to use this endpoint' });
    return;
  }
  // '' means the plan could not be established — treated as free, as in D-1.
  const paidPlan = caller.status !== 'free' && caller.status !== '';
  if (asksForAdminReport((req.body || {}).history) &&
      caller.role !== 'ADMIN' && caller.role !== 'INSTRUCTOR') {
    console.warn('[tea] ADMIN_REPORT refused for role "' + caller.role + '"');
    res.status(403).json({ ok: false, code: 'FORBIDDEN', error: 'Not available for your role.' });
    return;
  }

  /* Warm the bank's transcripts and answer nothing else.
   *
   * F-0017a moved the answer key out of the browser and put the lookup here, and
   * the lookup is not cheap: a full Apps Script round trip, measured at 3892ms
   * cold. injectTranscripts only needs it once an audio marker appears, and the
   * paper opens with five interview turns — so the entire cost landed on the
   * candidate's FIRST Part 2 item, in the middle of a sitting, as a pause
   * between hearing the recording and being asked about it.
   *
   * The candidate picks a paper several seconds before pressing Begin, and reads
   * the rules after that. This spends the round trip in that gap.
   *
   * It spends no model call: it returns before GEMINI_API_KEY is even read.
   * It still requires a session — the checks above have already run — because a
   * warm-up that anyone could call is a free way to make us call Apps Script. */
  if ((req.body || {}).warm === true) {
    const wBank = String((req.body || {}).bank || '');
    if (!BANK_SHAPE.test(wBank)) {
      res.status(200).json({ ok: false, error: 'bad bank' });
      return;
    }
    const t0 = Date.now();
    try {
      const map = await transcriptsFor(wBank);
      res.status(200).json({ ok: true, warmed: true, items: Object.keys(map || {}).length, ms: Date.now() - t0 });
    } catch (e) {
      // Nothing is broken for the candidate by a failed warm-up — the turn that
      // needs the transcript will try again. Logged because a warm-up that never
      // succeeds means the secret pair is wrong, and the exam WILL fail later.
      console.warn('[tea] warm-up failed for bank "' + wBank + '": ' + e.message);
      res.status(200).json({ ok: false, warmed: false, ms: Date.now() - t0 });
    }
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(200).json({ ok: false, error: 'GEMINI_API_KEY not configured' });
    return;
  }

  try {
    const { history: rawHistory, interviewTopics, bank } = req.body;

    /* The cache is per container, and the warm-up above only warms the one that
     * happened to answer it. Vercel may route the sitting's later turns to a
     * different instance, which would be cold again at exactly the wrong moment.
     *
     * So every turn warms whichever container it lands on. Nothing awaits this:
     * injectTranscripts below asks for the same promise, and a turn that needs
     * the transcript now joins this request instead of issuing a second one. By
     * Part 2 the interview has already sent several turns, so the container
     * serving the first recording has almost certainly paid this off already. */
    if (bank && BANK_SHAPE.test(String(bank))) {
      try { transcriptsFor(String(bank)); } catch (e) {}
    }

    // The candidate's browser no longer carries the answer key, so it is put back
    // here — before the model sees the turn, and never on the way out.
    let history;
    try {
      history = await injectTranscripts(rawHistory, bank);
    } catch (e) {
      console.error('[tea] transcript injection failed: ' + e.message);
      res.status(200).json({
        ok: false,
        error: 'The examiner could not be given the recording to mark against. ' +
               'Nothing was graded — please try that step again.'
      });
      return;
    }

    // Part 1 topics come from the item bank for this sitting, so two versions of
    // the exam cover different ground. Wording is still the examiner's — reading a
    // topic aloud is not a question.
    let prompt = SYSTEM_PROMPT;
    if (Array.isArray(interviewTopics) && interviewTopics.length) {
      prompt += '\n\nPART 1 TOPICS FOR THIS SITTING — OVERRIDES THE PART 1 LIST ABOVE\n' +
        'Exam version: ' + (bank || 'DEFAULT') + '. Ask exactly ' + interviewTopics.length +
        ' questions, one per topic, in this order:\n' +
        interviewTopics.map((t, i) => '  ' + (i + 1) + '. ' + t).join('\n') +
        '\nPhrase each question yourself in examiner register — never read a topic aloud ' +
        'verbatim and never mention that topics were supplied. One short follow-up per ' +
        'answer only. Do not reveal the version identifier to the candidate.';
    }

    // v1 doesn't support system_instruction — inject system prompt as first user message
    const systemTurn = { role: 'user',  parts: [{ text: 'SYSTEM: ' + prompt }] };
    const systemAck  = { role: 'model', parts: [{ text: 'Understood. I am ready to conduct the ICAO language proficiency examination.' }] };

    const contents = [systemTurn, systemAck].concat(history.map(function(m) {
      return {
        role:  m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      };
    }));

    // Model id is configurable. Hardcoding it meant that if the identifier ever
    // stopped resolving, every grading call 404'd and the exam produced no scores
    // with nothing in the UI to say why. Set GEMINI_MODEL in Vercel to change it
    // without a deploy; verify what your key can actually reach with:
    //   curl "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY"
    // Retrying a saturated model harder does not unsaturate it. When the primary
    // stays overloaded the exam has to move to another model or it simply stops,
    // and a candidate mid-test cannot wait out a capacity spike.
    const MODELS = [
      process.env.GEMINI_MODEL || 'gemini-3.5-flash',
      process.env.GEMINI_FALLBACK_MODEL || 'gemini-2.5-flash',
      // A third rung. Two were not enough: a capacity spike took both out at once
      // mid-exam, which ends the sitting — there is no "try again later" for someone
      // twenty minutes into an examination.
      // Was gemini-2.0-flash, which this key cannot reach at all — ListModels does
      // not return it. The last rung of the ladder was a 404, so the one moment it
      // existed for (both other models saturated, candidate mid-exam) it could
      // only fail. gemini-3.6-flash is confirmed present.
      process.env.GEMINI_FALLBACK_MODEL_2 || 'gemini-3.6-flash'
    ].filter((m, i, a) => m && a.indexOf(m) === i);

    const body = JSON.stringify({
      contents:         contents,
      generationConfig: { maxOutputTokens: 4096, temperature: 0.7 }
    });

    // A budget for the whole handler. Three models times three attempts, with
    // backoff between them, can outlast the serverless function itself — and when
    // the function dies mid-flight the caller gets no response at all, which is
    // indistinguishable from a hang. Better to give up inside the budget and say so
    // than to be killed and say nothing.
    // Fifty seconds was set for a conversational turn and then applied to the final
    // report as well, which is a far larger generation: a full exam history in, a
    // complete scoring JSON out. It was timing out on the work it most needed to
    // finish.
    const DEADLINE = Date.now() + 105000;
    const timeLeft = () => DEADLINE - Date.now();
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const isOverloadErr = (res, d) =>
      res.status === 503 || res.status === 429 ||
      (d && d.error && typeof d.error.message === 'string' &&
       /high demand|overload|unavailable|quota/i.test(d.error.message));

    let response, data, MODEL;

    outer:
    for (let mi = 0; mi < MODELS.length; mi++) {
      MODEL = MODELS[mi];
      const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
        encodeURIComponent(MODEL) + ':generateContent?key=' + encodeURIComponent(apiKey);

      // Fewer attempts on the primary than before: the time is better spent moving
      // to a model that can answer than waiting on one that cannot.
      for (let attempt = 0; attempt < 3; attempt++) {
        // Do not start a call there is no time left to finish.
        if (timeLeft() < 15000) { console.log('[TEA] out of budget before ' + MODEL); break outer; }

        // And do not let one call hang the whole handler either.
        // Bound each call so one slow model cannot eat the entire budget. Giving
        // the first attempt everything meant a model that hangs left nothing for
        // the fallbacks, and the whole handler returned "upstream timeout" without
        // ever having tried the other two.
        const ctl = new AbortController();
        // Enough for a real report, still bounded so a hanging model leaves room
        // for the two behind it.
        const slice = Math.min(45000, Math.max(8000, timeLeft() - 5000));
        const bail = setTimeout(() => ctl.abort(), slice);
        try {
          response = await fetch(url, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
            signal: ctl.signal
          });
          data = await response.json();
        } catch (e) {
          clearTimeout(bail);
          console.log('[TEA] ' + MODEL + ' attempt ' + (attempt + 1) + ' failed: ' + e.message);
          data = { error: { message: 'upstream timeout' } };
          response = { ok: false, status: 504 };
          if (timeLeft() < 12000) break outer;
          continue;
        }
        clearTimeout(bail);

        if (response.ok) break outer;
        if (!isOverloadErr(response, data)) break;   // a real error — do not shop around

        if (attempt < 2 && timeLeft() > 15000) {
          console.log('[TEA] ' + MODEL + ' overloaded, retry ' + (attempt + 1));
          await sleep(1500 * (attempt + 1));
        } else {
          break;
        }
      }
      if (mi < MODELS.length - 1) {
        console.log('[TEA] falling back from ' + MODEL + ' to ' + MODELS[mi + 1]);
      }
    }

    if (!response.ok) {
      console.error('[TEA]', JSON.stringify(data));
      res.status(200).json({ ok: false, error: (data.error && data.error.message) || 'Gemini API error' });
      return;
    }

    const text = data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts[0].text;

    /* Withheld here, before serialization, not redacted in the browser.
     * api/tea-pipeline.mjs does the same for the scripted sitting; this is the
     * fallback path it hands over to when scripted grading fails, and it was
     * still sending every descriptor. */
    if (paidPlan) {
      res.status(200).json({ ok: true, message: text || '' });
    } else {
      const held = withholdInMessage(text || '', (req.body || {}).sessionToken);
      res.status(200).json(held.withheld
        ? { ok: true, message: held.message, descriptorsWithheld: true }
        : { ok: true, message: held.message });
    }

  } catch (err) {
    console.error('[TEA]', err.message);
    res.status(200).json({ ok: false, error: err.message });
  }
}
