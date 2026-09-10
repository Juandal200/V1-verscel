// ES Module — receives raw audio binary, forwards to OpenAI Whisper, returns transcript.
export const config = {
  api: {
    bodyParser: false,   // must be off to receive raw binary
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Signal noKey so the client can fall back silently to browser SR
    res.status(200).json({ ok: false, noKey: true, error: 'OPENAI_API_KEY not configured' });
    return;
  }

  try {
    // Collect raw body chunks
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    if (buffer.length < 100) {
      res.status(200).json({ ok: false, error: 'Audio too short' });
      return;
    }

    // Wrap in FormData — Whisper identifies format by filename extension
    const formData = new FormData();
    const audioBlob = new Blob([buffer], { type: 'audio/webm' });
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'whisper-1');
    formData.append('language', 'en');

    /* Verbose mode: the same transcription, with the acoustic detail kept.
     *
     * The ICAO grader reads speech rate, pause length and per-word confidence to
     * judge fluency and pronunciation. Those live in Whisper's verbose_json, and
     * api/tea-pipeline.mjs used to obtain them by transcribing every recording a
     * SECOND time — which meant shipping two dozen base64 recordings in one
     * request body. Vercel rejected that body with a 413 before the function ran,
     * so the pipeline never executed and every long sitting fell to the text-only
     * grader. The more a candidate said, the worse the grader they got.
     *
     * The exam already transcribes each answer here, one at a time, and those
     * calls succeed. Asking for the detail on that call removes the second
     * transcription entirely: no bulk upload, no 413, and one OpenAI charge per
     * answer instead of two.
     *
     * Off by default. The simulator's read-back wants a string and nothing else,
     * and its response shape does not change. */
    const wantsVerbose = /(^|[?&])verbose=1(&|$)/.test(String(req.url || ''));
    if (wantsVerbose) {
      formData.append('response_format', 'verbose_json');
      formData.append('timestamp_granularities[]', 'segment');
      formData.append('timestamp_granularities[]', 'word');
    }

    /* Tell it what it is listening to.
     *
     * Whisper was transcribing general English, so a student who said "turn right
     * heading zero five zero, climb four thousand feet" was marked twenty out of a
     * hundred for "Tongue Right" and "zero-zero-FIT". The read-back was correct; the
     * transcription was not, and the score was the transcription's.
     *
     * The prompt biases it toward a vocabulary. It is not a filter and it does not
     * force the words — a candidate who says something else still gets what they
     * said. It only makes the aviation reading of an ambiguous sound the likelier
     * one, which is exactly right when the ambiguity is between "turn right" and
     * "tongue right".
     *
     * What it must NOT contain is the answer.
     *
     * The scenario's expected read-back used to be appended here, on the reasoning
     * that the tail of a prompt carries the most weight and the sharpest possible
     * hint for a read-back is the clearance being read back. It is the sharpest
     * possible hint. It is also the answer, and at temperature 0 with silence to
     * transcribe, the prompt is what Whisper returns — so a student who tapped the
     * microphone, said nothing, and tapped it again got the correct read-back typed
     * into the box for them and scored on it. The vocabulary below still separates
     * "turn right" from "tongue right"; both headings are in it. Nothing here is
     * specific to the question being asked any more.
     *
     * _BASE_FIXES in the client — forty entries repairing "queue and h" to QNH and
     * "squork" to SQUAWK — is the same job done afterwards, by hand, and only for
     * mistakes somebody already noticed. This is the same job done before. */
    const PHRASEOLOGY =
      'Air traffic control radiotelephony. ICAO standard phraseology. ' +
      'Cleared for takeoff, cleared to land, line up and wait, hold short, ' +
      'taxi via, contact tower, contact ground, report passing, climb and maintain, ' +
      'descend and maintain, turn left heading, turn right heading, squawk, ' +
      'QNH, altimeter, wilco, roger, affirm, negative, standby, say again, ' +
      'runway, flight level, feet, knots, ILS, ATIS, wind check, go around, ' +
      'pushback approved, request descent, traffic in sight, ' +
      'zero one two three four five six seven eight niner, ' +
      'alpha bravo charlie delta echo foxtrot golf hotel india juliett kilo lima ' +
      'mike november oscar papa quebec romeo sierra tango uniform victor whiskey ' +
      'x-ray yankee zulu.';

    // The same prompt for every request. Nothing about the scenario, and in
    // particular nothing about its answer, reaches this call.
    formData.append('prompt', PHRASEOLOGY);
    // Deterministic. Left to its own devices Whisper invents when it is unsure, and
    // an invented word is scored as a wrong one.
    formData.append('temperature', '0');

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey },
      body: formData,
    });

    const data = await whisperRes.json();

    if (!whisperRes.ok) {
      console.error('[WHISPER] API error:', JSON.stringify(data));
      res.status(200).json({ ok: false, error: (data.error && data.error.message) || 'Whisper API error' });
      return;
    }

    // transcript is unchanged for every existing caller. verbose is additive.
    const out = { ok: true, transcript: data.text || '' };
    if (wantsVerbose) {
      out.verbose = {
        text:     data.text || '',
        words:    Array.isArray(data.words)    ? data.words    : [],
        segments: Array.isArray(data.segments) ? data.segments : [],
        duration: Number(data.duration || 0)
      };
    }
    res.status(200).json(out);

  } catch (err) {
    console.error('[WHISPER]', err.message);
    res.status(200).json({ ok: false, error: err.message });
  }
}
