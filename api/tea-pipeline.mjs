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

ICAO GRADING RUBRIC — assign individual band scores 1–6 per dimension:

1. PRONUNCIATION
   - Level 3: Accent/stress/rhythm heavily influenced by L1 and FREQUENTLY interferes with ease of understanding.
   - Level 4 (MIN PASS): Influenced by L1 but ONLY SOMETIMES interferes. Intelligible to the international aeronautical community.
   - Level 5: RARELY interferes. Always clear and understandable.

2. STRUCTURE
   - Classify every cited error as LOCAL (minor slip — missing article, wrong preposition — that does NOT alter the operational message) or GLOBAL (structural failure that destroys or changes the intended meaning).
   - Level 3: Basic structures not always controlled. Errors FREQUENTLY interfere with meaning (frequent Global Errors).
   - Level 4 (MIN PASS): Basic structures USUALLY well controlled. Errors RARELY interfere with meaning (mostly Local Errors; Global Errors rare).
   - Level 5: Basic structures consistently controlled. Complex structures attempted; errors sometimes interfere.

3. VOCABULARY
   - Level 3: Often insufficient. FREQUENTLY UNABLE to paraphrase when lacking a word.
   - Level 4 (MIN PASS): Usually sufficient for common/work-related topics. CAN OFTEN PARAPHRASE in unusual circumstances.
   - Level 5: Extensive. Paraphrases consistently and successfully. Sometimes idiomatic. (Penalize idioms that impair radiotelephony clarity.)

4. FLUENCY
   - Level 3: Phrasing/pausing often inappropriate. Hesitations/slowness prevent effective communication. Fillers are distracting.
   - Level 4 (MIN PASS): Appropriate tempo. Occasional loss of fluency at phraseology-to-spontaneous transition, but does not prevent communication. Fillers not distracting.
   - Level 5: Speaks at length with relative ease. Uses discourse markers/connectors smoothly.

5. COMPREHENSION
   - Level 3: Often accurate only under optimum conditions. May fail on complications or unexpected events.
   - Level 4 (MIN PASS): Mostly accurate on common/work-related topics. May need clarification on complications but ultimately understands the core issue.
   - Level 5: Consistently accurate. Mostly accurate on unexpected complications. Handles wide range of international accents.

6. INTERACTIONS
   - Level 3: Responses only sometimes immediate/appropriate/informative. Generally INADEQUATE with unexpected complications.
   - Level 4 (MIN PASS): Usually immediate, appropriate, informative. DEALS ADEQUATELY WITH MISUNDERSTANDINGS by checking/confirming/clarifying.
   - Level 5: Immediately appropriate and informative. Manages speaker/listener relationship with ease.

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

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=' +
    encodeURIComponent(apiKey);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let response, data, attempt = 0;

  while (attempt < 4) {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: GRADING_SYSTEM_PROMPT }] },
        contents,
        generationConfig: { maxOutputTokens: 4096, temperature: 0.3 },
      }),
    });
    data = await response.json();

    if (response.ok) break;

    const isOverload = response.status === 503 ||
      (data.error && typeof data.error.message === 'string' &&
       data.error.message.toLowerCase().includes('high demand'));

    if (!isOverload) break;
    attempt++;
    if (attempt < 4) {
      console.log('[PIPELINE] Gemini overload — retry', attempt, 'in', attempt * 2, 's');
      await sleep(attempt * 2000);
    }
  }

  if (!response.ok) {
    throw new Error('Gemini API error: ' + ((data.error && data.error.message) || response.status));
  }

  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  // Walk the string counting braces to find the first complete top-level JSON object.
  // More robust than indexOf/lastIndexOf when Gemini prepends reasoning text that
  // itself contains { } characters.
  function extractFirstObject(str) {
    let depth = 0, start = -1;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ch === '{') { if (depth === 0) start = i; depth++; }
      else if (ch === '}') { depth--; if (depth === 0 && start !== -1) return str.slice(start, i + 1); }
    }
    return str;
  }

  const stripped = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const cleaned  = extractFirstObject(stripped);

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('Gemini returned non-JSON grading output:\n' + raw.substring(0, 300));
  }

  if (!parsed.student_view || !parsed.admin_view) {
    throw new Error('Gemini JSON missing required keys (student_view / admin_view)');
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
    const { segments = [], history = [], candidateId = 'unknown', examDate, mockTranscript } = req.body;

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
