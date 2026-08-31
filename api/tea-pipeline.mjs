// Post-exam orchestrator.
//
// Accepts a batch of stored audio segments + conversation history, then:
//   1. Transcribes each segment via Whisper (verbose_json — word timestamps + logprobs)
//   2. Builds an enriched "dirty text" string per segment via buildRichTranscript()
//   3. Grades the combined transcript against the Master ICAO Rubric via Gemini
//   4. Persists the result to Google Drive / Sheets via the GAS webhook
//
// Expected POST body:
//   {
//     segments:    [{ id, partLabel, audioBase64 }],  // raw base64, no data-URI prefix
//     history:     [{ role: 'user'|'assistant', content: string }],
//     candidateId: string,   // e.g. user email
//     examDate:    string    // ISO-8601
//   }
//
// The frontend must accumulate candidate audio blobs during the exam and
// send them here when [EXAM_COMPLETE] fires.

// ─── Grading-only system prompt ──────────────────────────────────────────────
// This is intentionally separate from tea.mjs (which also drives the live
// exam conversation). Here the model receives a fully assembled annotated
// transcript and must return evaluation JSON — nothing else.

const GRADING_SYSTEM_PROMPT = `You are the Master Aviation English Examiner for an automated Test of English for Aviation (TEA) simulator. You will receive a complete, post-processed exam transcript and must return a single JSON object containing your evaluation. Return ONLY valid JSON — no text before or after, no markdown code fences.

TRANSCRIPT NOTATION SYSTEM
The transcript has been post-processed from an acoustic STT pipeline. Read these markers to evaluate Fluency and Pronunciation:
- [Speech rate: N WPM] — words per minute for that turn. ICAO Operational Level 4 expects ~100–130 WPM in non-routine situations.
- [Pause: Xs] — a silent gap of X seconds between words. Long pauses indicate language-processing stress.
- [um] [uh] [er] [ah] — explicit hesitation markers. Frequent fillers that break sentence flow indicate fluency struggles.
- [?word](conf:0.XX) — flagged potential mispronunciation based on low acoustic confidence score (0.00–1.00).

ICAO LANGUAGE PROFICIENCY RATING SCALE (Doc 9835) — assign a band 1-6 per dimension.
This is the full scale, verbatim. Do not grade against a paraphrase of it.
Band names: 6 Expert · 5 Extended · 4 Operational · 3 Pre-Operational · 2 Elementary · 1 Pre-Elementary.
Level 4 is the minimum operational requirement.

PRONUNCIATION (assumes a dialect and/or accent intelligible to the aeronautical community)
 6 Pronunciation, stress, rhythm and intonation, though possibly influenced by the language or regional variation, almost never interfere with ease of understanding.
 5 ...though influenced by the first language or regional variation, rarely interfere with ease of understanding.
 4 ...are influenced by the first language or regional variation but only sometimes interfere with ease of understanding.
 3 ...are influenced by the first language or regional variation and frequently interfere with ease of understanding.
 2 ...are heavily influenced by the first language or regional variation and usually interfere with ease of understanding.
 1 Performs at a level below the Elementary level.

STRUCTURE (relevant structures are determined by language functions appropriate to the task)
 6 Both basic and complex grammatical structures and sentence patterns are consistently well controlled.
 5 Basic grammatical structures and sentence patterns are consistently well controlled. Complex structures are attempted but with errors which sometimes interfere with meaning.
 4 Basic grammatical structures and sentence patterns are used creatively and are usually well controlled. Errors may occur, particularly in unusual or unexpected circumstances, but rarely interfere with meaning.
 3 Basic grammatical structures and sentence patterns associated with predictable situations are not always well controlled. Errors frequently interfere with meaning.
 2 Shows only limited control of a few simple memorized grammatical structures and sentence patterns.
 1 Performs at a level below the Elementary level.

VOCABULARY
 6 Vocabulary range and accuracy are sufficient to communicate effectively on a wide variety of familiar and unfamiliar topics. Vocabulary is idiomatic, nuanced and sensitive to register.
 5 Vocabulary range and accuracy are sufficient to communicate effectively on common, concrete and work-related topics. Paraphrases consistently and successfully. Vocabulary is sometimes idiomatic.
 4 Vocabulary range and accuracy are usually sufficient to communicate effectively on common, concrete and work-related topics. Can often paraphrase successfully when lacking vocabulary in unusual or unexpected circumstances.
 3 Vocabulary range and accuracy are often sufficient to communicate on common, concrete or work-related topics, but range is limited and the word choice often inappropriate. Is often unable to paraphrase successfully when lacking vocabulary.
 2 Limited vocabulary range consisting only of isolated words and memorized phrases.
 1 Performs at a level below the Elementary level.

FLUENCY
 6 Able to speak at length with a natural, effortless flow. Varies speech flow for stylistic effect, e.g. to emphasize a point. Uses appropriate discourse markers and connectors spontaneously.
 5 Able to speak at length with relative ease on familiar topics, but may not vary speech flow as a stylistic device. Can make use of appropriate discourse markers or connectors.
 4 Produces stretches of language at an appropriate tempo. There may be occasional loss of fluency on transition from rehearsed or formulaic speech to spontaneous interaction, but this does not prevent effective communication. Can make limited use of discourse markers or connectors. Fillers are not distracting.
 3 Produces stretches of language, but phrasing and pausing are often inappropriate. Hesitations or slowness in language processing may prevent effective communication. Fillers are sometimes distracting.
 2 Can produce very short, isolated, memorized utterances with frequent pausing and a distracting use of fillers to search for expressions and to articulate less familiar words.
 1 Performs at a level below the Elementary level.

COMPREHENSION
 6 Comprehension is consistently accurate in nearly all contexts and includes comprehension of linguistic and cultural subtleties.
 5 Comprehension is accurate on common, concrete and work-related topics and mostly accurate when the speaker is confronted with a linguistic or situational complication or an unexpected turn of events. Is able to comprehend a range of speech varieties (dialect and/or accent) or registers.
 4 Comprehension is mostly accurate on common, concrete and work-related topics when the accent or variety used is sufficiently intelligible for an international community of users. When the speaker is confronted with a linguistic or situational complication or an unexpected turn of events, comprehension may be slower or require clarification strategies.
 3 Comprehension is often accurate on common, concrete and work-related topics when the accent or variety used is sufficiently intelligible for an international community of users. May fail to understand a linguistic or situational complication or an unexpected turn of events.
 2 Comprehension is limited to isolated, memorized phrases when they are carefully and slowly articulated.
 1 Performs at a level below the Elementary level.

INTERACTIONS
 6 Interacts with ease in nearly all situations. Is sensitive to verbal and non-verbal cues and responds to them appropriately.
 5 Responses are immediate, appropriate and informative. Manages the speaker/listener relationship effectively.
 4 Responses are usually immediate, appropriate and informative. Initiates and maintains exchanges even when dealing with an unexpected turn of events. Deals adequately with apparent misunderstandings by checking, confirming or clarifying.
 3 Responses are sometimes immediate, appropriate and informative. Can initiate and maintain exchanges with reasonable ease on familiar topics and in predictable situations. Generally inadequate when dealing with an unexpected turn of events.
 2 Response time is slow and often inappropriate. Interaction is limited to simple routine exchanges.
 1 Performs at a level below the Elementary level.

TWO NOTES ON APPLYING THIS SCALE HERE.
This is an audio-only test, so the non-verbal cues named at Interactions level 6
cannot be observed. Judge that descriptor on what is audible and do not withhold a
6 solely because non-verbal responsiveness could not be demonstrated.
When citing structural errors, classify each as LOCAL (a minor slip — missing
article, wrong preposition — that does not alter the operational message) or GLOBAL
(a failure that destroys or changes the intended meaning). That distinction is an
analysis aid for the written justification, not an ICAO criterion: the band still
comes from the descriptor wording above.

CRITICAL RULE: overall_band = the LOWEST score among all six dimensions. It is NOT an average.

ANNOTATED TRANSCRIPT FORMAT
Reproduce the full exam conversation (both Examiner and Candidate turns). Prefix each line with "Ex " or "Ca ". Place a [Pn] pin inline immediately after the specific word or phrase being annotated — not at the end of the line. Number pins consecutively. Example:
  Ex Could you describe your role?
  Ca I am en route[P1] controller. My main task is to make sequency[P2] for arrivals. The opportunity went on later[P3] and I seized the occasion.[P4]

TECHNICAL JUSTIFICATION FORMAT
Each descriptor must be a single holistic paragraph (2–5 sentences) in official TEA examiner report style — not a bullet list. Cite specific words, pin references, and WPM/pause data where relevant. Classify all structural errors as LOCAL or GLOBAL. Example style:
  "Despite a few isolated mispronunciations such as [P1] and [P2], the candidate almost never produced language that was anything other than calm, clear, and easily understandable."

OUTPUT — return exactly this JSON, nothing else:
{
  "student_view": {
    "overall_band": <integer 1-6>,
    "pronunciation": { "score": <int>, "feedback": "<professional, encouraging, actionable: what they did well and exactly what to practise to reach the next band>" },
    "structure":     { "score": <int>, "feedback": "<same format>" },
    "vocabulary":    { "score": <int>, "feedback": "<same format>" },
    "fluency":       { "score": <int>, "feedback": "<same format>" },
    "comprehension": { "score": <int>, "feedback": "<same format>" },
    "interactions":  { "score": <int>, "feedback": "<same format>" }
  },
  "admin_view": {
    "transcript": "<full Ex/Ca conversation with [P1][P2]... pins inline after flagged words — newline-separated turns>",
    "annotations": [
      { "id": "P1", "dimension": "<PRONUNCIATION|STRUCTURE|VOCABULARY|FLUENCY|COMPREHENSION|INTERACTIONS>", "note": "<concise examiner observation in TEA report style>" },
      { "id": "P2", "dimension": "...", "note": "..." }
    ],
    "technical_justification": {
      "pronunciation": "<holistic paragraph in official TEA examiner report style>",
      "structure":     "<same — classify all cited errors as LOCAL or GLOBAL>",
      "vocabulary":    "<same format>",
      "fluency":       "<same format — cite WPM values and pause durations where available>",
      "comprehension": "<same format>",
      "interactions":  "<same format>"
    }
  }
}`;

// ─── Response schema ─────────────────────────────────────────────────────────
//
// Handed to the API as responseSchema so the shape is guaranteed rather than
// requested. The prompt already asked for JSON and Gemini already agreed to it,
// and the result still needed a repair pass below that strips markdown fences,
// walks brace depth to find the object, and patches unescaped quotes and raw
// newlines inside string values. None of that is needed once the API enforces the
// shape itself.
//
// It mirrors the existing student_view / admin_view contract exactly. That shape
// is read in seventeen places in the client and two in TEAService, and every exam
// already saved uses it — changing it would break the report and orphan the
// history.
const DESCRIPTORS = ['pronunciation', 'structure', 'vocabulary', 'fluency',
                     'comprehension', 'interactions'];

const scoredDescriptor = {
  type: 'object',
  properties: {
    score:    { type: 'integer' },
    feedback: { type: 'string' },
  },
  required: ['score', 'feedback'],
};

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    student_view: {
      type: 'object',
      properties: Object.assign(
        { overall_band: { type: 'integer' } },
        ...DESCRIPTORS.map((d) => ({ [d]: scoredDescriptor }))
      ),
      required: ['overall_band', ...DESCRIPTORS],
    },
    admin_view: {
      type: 'object',
      properties: {
        transcript: { type: 'string' },
        annotations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id:        { type: 'string' },
              dimension: { type: 'string' },
              note:      { type: 'string' },
            },
            required: ['id', 'dimension', 'note'],
          },
        },
        technical_justification: {
          type: 'object',
          properties: Object.assign({}, ...DESCRIPTORS.map((d) => ({ [d]: { type: 'string' } }))),
          required: DESCRIPTORS,
        },
      },
      required: ['transcript', 'annotations', 'technical_justification'],
    },
  },
  required: ['student_view', 'admin_view'],
};

// ─── Whisper verbose transcription ───────────────────────────────────────────

/**
 * Calls OpenAI Whisper with verbose_json + word-level timestamps.
 *
 * @param {string} audioBase64   Raw base64 audio (no data-URI prefix)
 * @param {string} apiKey
 * @returns {Promise<WhisperVerboseResult>}
 *
 * @typedef {{ task:string, language:string, duration:number, text:string,
 *             segments: WhisperSegment[], words: WhisperWord[] }} WhisperVerboseResult
 * @typedef {{ id:number, start:number, end:number, text:string,
 *             avg_logprob:number, no_speech_prob:number }} WhisperSegment
 * @typedef {{ word:string, start:number, end:number }} WhisperWord
 */
async function transcribeSegment(audioBase64, apiKey) {
  const buffer = Buffer.from(audioBase64, 'base64');

  const formData = new FormData();
  formData.append('file', new Blob([buffer], { type: 'audio/webm' }), 'segment.webm');
  formData.append('model', 'whisper-1');
  formData.append('language', 'en');
  formData.append('response_format', 'verbose_json');
  // Request both segment-level logprobs (for confidence) and word-level timestamps
  formData.append('timestamp_granularities[]', 'segment');
  formData.append('timestamp_granularities[]', 'word');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + apiKey },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error('Whisper API error: ' + ((err.error && err.error.message) || res.status));
  }

  return res.json();
}

// ─── Rich transcript builder ──────────────────────────────────────────────────

const HESITATION_RE = /^(um|uh|er|ah|hmm|mm)$/i;
const PAUSE_THRESHOLD_S = 0.8;  // gaps ≥ this get a [Pause: Xs] marker
const LOW_CONF_THRESHOLD = 0.45; // word confidence below this triggers [?word](conf:X)
const MIN_FLAG_LENGTH = 4;       // skip flagging short function words

/**
 * Builds a per-segment confidence lookup: word index → 0–1 score.
 *
 * Whisper's public API does not expose per-word log-probabilities; we use the
 * containing segment's avg_logprob as a proxy. avg_logprob is in [-∞, 0] but
 * practically in [-1.0, 0.0] for well-formed audio; we map it linearly onto
 * [0.0, 1.0] (logprob 0 = conf 1.0, logprob -1 = conf 0.0).
 *
 * @param {WhisperWord[]}    words
 * @param {WhisperSegment[]} segments
 * @returns {Record<number, number>}
 */
function buildWordConfidenceMap(words, segments) {
  const map = {};
  let segIdx = 0;

  for (let i = 0; i < words.length; i++) {
    // Advance to the segment whose time range contains this word's start
    while (segIdx < segments.length - 1 && segments[segIdx].end < words[i].start) {
      segIdx++;
    }
    const seg = segments[segIdx];
    const logprob = (seg && typeof seg.avg_logprob === 'number') ? seg.avg_logprob : -0.2;
    map[i] = Math.min(1.0, Math.max(0.0, 1.0 + logprob));
  }

  return map;
}

/**
 * Converts a Whisper verbose_json result for one candidate turn into the
 * enriched "dirty text" format expected by the ICAO grading prompt.
 *
 * Output example:
 *   "[Speech rate: 118 WPM] The aircraft [Pause: 1.3s] was [?sequins](conf:0.28)
 *    experiencing [um] hydraulic failure."
 *
 * @param {WhisperVerboseResult} result
 * @param {string}               partLabel  e.g. "Part 1 – Interview"
 * @returns {string}
 */
function buildRichTranscript(result, partLabel) {
  const { words = [], segments = [], duration = 0, text = '' } = result;

  // Degenerate: no word-level data (Whisper returned segment-only, which
  // can happen for very short utterances). Fall back to plain text.
  if (!words.length) {
    const wpmFallback = duration > 0
      ? Math.round((text.trim().split(/\s+/).length / duration) * 60)
      : 0;
    return `[Speech rate: ${wpmFallback} WPM] ${text.trim()}`;
  }

  const wpm = duration > 0 ? Math.round((words.length / duration) * 60) : 0;
  const confMap = buildWordConfidenceMap(words, segments);
  const tokens = [];

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const wordText = w.word.trim();
    if (!wordText) continue;

    // Pause annotation (not before the very first word)
    if (i > 0) {
      const gapSecs = w.start - words[i - 1].end;
      if (gapSecs >= PAUSE_THRESHOLD_S) {
        tokens.push(`[Pause: ${gapSecs.toFixed(1)}s]`);
      }
    }

    // Hesitation marker — replaces the word itself
    if (HESITATION_RE.test(wordText)) {
      tokens.push(`[${wordText.toLowerCase()}]`);
      continue;
    }

    // Low-confidence flag (skip short function words to reduce noise)
    const conf = confMap[i] ?? 1.0;
    if (conf < LOW_CONF_THRESHOLD && wordText.length >= MIN_FLAG_LENGTH) {
      tokens.push(`[?${wordText}](conf:${conf.toFixed(2)})`);
    } else {
      tokens.push(wordText);
    }
  }

  return `[Speech rate: ${wpm} WPM] ${tokens.join(' ')}`;
}

// ─── ICAO grading via Gemini ──────────────────────────────────────────────────

/**
 * Sends the assembled enriched transcript + conversation history to Gemini
 * with the grading-only system prompt. Returns the parsed evaluation JSON.
 *
 * @param {string}   enrichedTranscript
 * @param {Array}    history              Raw conversation history from the exam
 * @param {string}   apiKey
 * @returns {Promise<{ student_view: object, admin_view: object }>}
 */
async function gradeWithICAO(enrichedTranscript, history, apiKey) {
  const historyContents = history.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const gradingTurn = {
    role: 'user',
    parts: [{
      text: 'ENRICHED TRANSCRIPT FOR GRADING:\n\n' + enrichedTranscript +
            '\n\nReturn the evaluation JSON now. No preamble, no explanation — JSON only.',
    }],
  };

  const contents = [...historyContents, gradingTurn];

  // Grading had no fallback: it retried ONE model four times and then gave up.
  // Retrying a saturated model harder does not unsaturate it, and unlike the
  // conversational examiner there is no candidate waiting — but there IS a sitting
  // already finished and paid for, so failing to grade loses the whole exam.
  // Same ladder tea.mjs uses, and every rung confirmed present on this key.
  // gemini-pro-latest, not a flash. Grading is the one call in this app with no
  // latency constraint — the candidate has already finished — and it is the most
  // reasoning-heavy: read 5,000 words and separate bands whose wording differs by
  // "only sometimes interfere with ease of understanding" from "frequently
  // interfere". Flash is distilled for throughput, which buys nothing here.
  //
  // The alias rather than a pinned pro because this key's stable pro line stops at
  // gemini-2.5-pro, two generations behind the flash it replaces. The cost is that
  // Google can repoint the alias and grading shifts with no deploy on our side —
  // worth watching if bands drift for no other reason.
  //
  // Fallbacks stay on flash: they exist for the case where pro is unreachable, and
  // a graded exam from a smaller model beats no grade at all.
  const MODELS = [
    process.env.GEMINI_MODEL || 'gemini-pro-latest',
    process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash',
    process.env.GEMINI_FALLBACK_MODEL_2 || 'gemini-2.5-flash'
  ].filter((m, i, a) => m && a.indexOf(m) === i);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let response, data, attempt = 0, modelIdx = 0;

  while (attempt < 4) {
    const MODEL = MODELS[Math.min(modelIdx, MODELS.length - 1)];
    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
      encodeURIComponent(MODEL) + ':generateContent?key=' +
      encodeURIComponent(apiKey);
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: GRADING_SYSTEM_PROMPT }] },
        contents,
        generationConfig: {
          // 8192 truncated. The response carries the annotated transcript verbatim
          // — 5,000 words is roughly 7,000 tokens on its own — before six
          // justifications and six feedback paragraphs. A cut-off response is
          // malformed JSON, which is most of what the repair layer was rescuing.
          maxOutputTokens: 16384,
          // An exam has to mark alike performances alike. Two candidates comparing
          // their reports should not find the difference came from sampling.
          temperature: 0.0,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    });
    data = await response.json();

    if (response.ok) break;

    const isOverload = response.status === 503 ||
      (data.error && typeof data.error.message === 'string' &&
       data.error.message.toLowerCase().includes('high demand'));
    // A model this key cannot reach is not a transient failure — waiting will
    // never fix it. Move down the ladder immediately instead of burning the
    // remaining attempts on a name that does not exist.
    const isMissing = response.status === 404 || response.status === 400;

    if (!isOverload && !isMissing) break;

    if (modelIdx < MODELS.length - 1) {
      modelIdx++;
      console.log('[PIPELINE] Gemini', MODEL, isMissing ? 'unavailable' : 'overloaded',
                  '— falling back to', MODELS[modelIdx]);
      // No sleep on a model change: the next model is not the one that is busy.
      attempt++;
      continue;
    }

    attempt++;
    if (attempt < 4) {
      console.log('[PIPELINE] Gemini overload on last model — retry', attempt,
                  'in', attempt * 2, 's');
      await sleep(attempt * 2000);
    }
  }

  if (!response.ok) {
    throw new Error('Gemini API error: ' + ((data.error && data.error.message) || response.status));
  }

  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  // ── JSON extraction + repair ──────────────────────────────────────────────
  //
  // Kept as a safety net, not the primary mechanism. responseSchema now makes the
  // API guarantee the shape, so on the normal path there is nothing here to fix.
  // It stays because the fallback models are reached under exactly the conditions
  // where things are already going wrong, and a grade recovered by patching a
  // stray quote beats losing a finished exam. Every step below is a no-op on
  // well-formed input.
  //
  // What it used to rescue: Gemini prepending reasoning before the object,
  // unescaped double quotes inside string values, and raw newlines inside them.

  // Step 1: strip markdown fences
  const stripped = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

  // Step 2: find the first complete top-level JSON object by brace depth
  function extractFirstObject(str) {
    let depth = 0, start = -1;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ch === '{') { if (depth === 0) start = i; depth++; }
      else if (ch === '}') { depth--; if (depth === 0 && start !== -1) return str.slice(start, i + 1); }
    }
    return str;
  }

  // Step 3: fix unescaped quotes and bare newlines inside JSON string values.
  // Heuristic: a " inside a string is the closing quote only when followed
  // (after optional whitespace) by : , } ] or end-of-string.
  function repairJSONStrings(str) {
    let out = '', i = 0;
    while (i < str.length) {
      const ch = str[i];
      if (ch !== '"') { out += ch; i++; continue; }
      out += '"'; i++;                          // opening quote
      while (i < str.length) {
        const c = str[i];
        if (c === '\\') { out += str[i] + (str[i + 1] || ''); i += 2; continue; }
        if (c === '\n') { out += '\\n'; i++; continue; }
        if (c === '\r') { out += '\\r'; i++; continue; }
        if (c === '\t') { out += '\\t'; i++; continue; }
        if (c === '"') {
          // peek past whitespace to decide if this is a terminator
          let j = i + 1;
          while (j < str.length && ' \t\n\r'.includes(str[j])) j++;
          const nx = str[j];
          if (!nx || nx === ':' || nx === ',' || nx === '}' || nx === ']') {
            out += '"'; i++; break;            // valid closing quote
          }
          out += '\\"'; i++; continue;         // bare quote inside string — escape it
        }
        out += c; i++;
      }
    }
    return out;
  }

  const extracted = extractFirstObject(stripped);
  const cleaned   = repairJSONStrings(extracted);

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('Gemini returned non-JSON grading output:\n' + raw.substring(0, 300));
  }

  if (!parsed.student_view || !parsed.admin_view) {
    throw new Error('Gemini JSON missing required keys (student_view / admin_view)');
  }

  // overall_band is the LOWEST of the six, not an average. A schema can enforce
  // that the field exists and is an integer; it cannot enforce arithmetic, and the
  // rule is the single most consequential line in the whole rubric — it decides
  // whether someone passes. Computing it here means it never depends on the model
  // doing the comparison correctly.
  //
  // A 0 means "not assessed" (pronunciation and fluency on a typed sitting) and is
  // skipped rather than treated as the lowest score.
  const sv = parsed.student_view;
  const observed = DESCRIPTORS
    .map((d) => sv[d] && Number(sv[d].score))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (observed.length) {
    const lowest = Math.min(...observed);
    if (Number(sv.overall_band) !== lowest) {
      console.log('[PIPELINE] overall_band corrected:', sv.overall_band, '->', lowest);
      sv.overall_band = lowest;
    }
  }

  return parsed;
}

// ─── GAS webhook persistence ──────────────────────────────────────────────────

const GAS_WEBHOOK_URL =
  process.env.GAS_WEBHOOK_URL ||
  'https://script.google.com/macros/s/AKfycbx4TnUdFYUb6SNJGsuTQW-rd3eQ2RRFeJCpe0ZsK7s67Y2L4bBx3Ez3l5WSM53yINNa/exec';

/**
 * Posts the final result payload to the Google Apps Script webhook.
 * GAS requires Content-Type: text/plain (it parses the body as JSON itself).
 *
 * @param {object} payload
 * @returns {Promise<void>}
 */
async function saveToGAS(payload) {
  const res = await fetch(GAS_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
    redirect: 'follow',
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error('GAS webhook error: ' + res.status + ' — ' + body.substring(0, 200));
  }

  const text = await res.text();
  console.log('[PIPELINE] GAS save confirmed:', text.substring(0, 120));
}

// ─── Main orchestrator ────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!geminiKey) {
    res.status(200).json({ ok: false, error: 'GEMINI_API_KEY not configured' });
    return;
  }

  try {
    const { segments = [], history = [], candidateId = 'unknown', examDate, mockTranscript, bank = '', scope = 'FULL' } = req.body;

    // ── Mock mode: skip Whisper entirely, grade a pre-built transcript ──
    // Triggered by passing mockTranscript in the request body (test/debug only).
    // Does not require OPENAI_API_KEY and incurs no Whisper cost.
    let enrichedTranscript;

    if (mockTranscript) {
      console.log('[PIPELINE] mock mode — skipping Whisper');
      enrichedTranscript = mockTranscript;
    } else {
      if (!openaiKey) {
        res.status(200).json({ ok: false, error: 'OPENAI_API_KEY not configured' });
        return;
      }

      if (!segments.length) {
        res.status(200).json({ ok: false, error: 'No audio segments provided' });
        return;
      }

      // ── Step 1 & 2: Transcribe each segment and build its rich transcript ──

      const richParts = [];

      for (const seg of segments) {
        const { id, partLabel = 'Unknown Part', audioBase64 } = seg;

        if (!audioBase64) {
          console.warn('[PIPELINE] Segment', id, 'has no audio — skipping');
          continue;
        }

        let verboseResult;
        try {
          verboseResult = await transcribeSegment(audioBase64, openaiKey);
        } catch (whisperErr) {
          console.error('[PIPELINE] Whisper failed for segment', id, ':', whisperErr.message);
          continue;
        }

        const richText = buildRichTranscript(verboseResult, partLabel);
        richParts.push(`--- ${partLabel} (${id}) ---\n${richText}`);
      }

      if (!richParts.length) {
        res.status(200).json({ ok: false, error: 'All segments failed transcription' });
        return;
      }

      enrichedTranscript = richParts.join('\n\n');
    }

    // ── Step 4: Grade with the Master ICAO Rubric ──

    const evaluation = await gradeWithICAO(enrichedTranscript, history, geminiKey);
    const { student_view, admin_view } = evaluation;
    const sv = student_view;

    // ── Step 5: Build and send the GAS persistence payload ──
    //
    // This is the exact object structure right before it hits the webhook.
    // The GAS script is expected to:
    //   - Save a JSON blob to Google Drive (full payload)
    //   - Append a summary row to the linked Google Sheet

    // GAS doPost routes by body.action and spreads body.args as function params.
    // The data object is the single argument received by apiSaveTEAResult(data).
    const gasData = {
      // Identity
      candidateId,
      examDate:   examDate || new Date().toISOString(),
      savedAt:    new Date().toISOString(),
      bank:       bank || '',
      scope:      scope || 'FULL',
      source:     'pipeline',

      // Top-line result
      overallBand: sv.overall_band,

      // Individual scores (flat — easier to map to Sheet columns)
      scores: {
        pronunciation: sv.pronunciation.score,
        structure:     sv.structure.score,
        vocabulary:    sv.vocabulary.score,
        fluency:       sv.fluency.score,
        comprehension: sv.comprehension.score,
        interactions:  sv.interactions.score,
      },

      // Per-dimension student feedback strings
      studentFeedback: {
        pronunciation: sv.pronunciation.feedback,
        structure:     sv.structure.feedback,
        vocabulary:    sv.vocabulary.feedback,
        fluency:       sv.fluency.feedback,
        comprehension: sv.comprehension.feedback,
        interactions:  sv.interactions.feedback,
      },

      // Full admin report
      adminReport: {
        annotatedTranscript:    admin_view.transcript,
        technicalJustification: admin_view.technical_justification,
      },

      // The enriched transcript that was fed to the grader
      enrichedTranscript,
    };

    await saveToGAS({ action: 'apiSaveTEAResult', args: [gasData] });

    // ── Return student + admin views to the client ──

    res.status(200).json({ ok: true, student_view, admin_view });

  } catch (err) {
    console.error('[PIPELINE]', err.message);
    res.status(200).json({ ok: false, error: err.message });
  }
}
