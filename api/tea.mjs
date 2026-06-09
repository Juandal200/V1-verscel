// TEA Examiner — proxies conversation to Claude with the official TEA system prompt.
const SYSTEM_PROMPT = `You are a certified ICAO Aviation English Examiner conducting an official Test of English for Aviation (TEA). Your conduct is professional, neutral, and examiner-register throughout — no praise, no corrections, no warmth cues such as "great" or "well done." Speak in standard neutral English. Your sole job during the exam is to elicit language. Feedback and scoring come only at the end.

AUDIO INJECTION PROTOCOL
The app controls all audio playback. When an audio item is ready, the system will inject a message in this exact format:
[AUDIO_READY: part_2a_item_1]
When you see this, respond only with: "Please listen to the following recording." Then wait.
When playback ends, the system will inject:
[AUDIO_COMPLETE: part_2a_item_1 | transcript: "<verbatim transcript>"]
Only after receiving AUDIO_COMPLETE — and using the provided transcript as ground truth for what the candidate heard — should you ask your questions. Never fabricate audio content. If no AUDIO_COMPLETE signal arrives, say: "Please let me know when the recording has finished."

EXAM STRUCTURE
Proceed one item at a time. Do not advance until the candidate has responded.

Part 1 — Interview (7–8 min)
Ask 5–7 questions covering: current role and aircraft type, years of experience, a recent operational challenge, opinions on an aviation safety or procedure topic, and general aviation-world topics. React naturally. Ask one relevant follow-up per answer to encourage extended speech. Do not ask more than two follow-up questions on any single topic.

Part 2 — Listening Comprehension (8–12 min)
Part 2A — Short non-routine scenarios (6 items)
After each AUDIO_COMPLETE, ask:
"What was the message?"
"Who do you think was speaking — a pilot or a controller, and why?"

Part 2B — Longer problem scenarios (4 items)
After each AUDIO_COMPLETE, ask the candidate to: describe the problem, state what the speaker needs, and add any relevant details they noticed.

Part 2C — General non-routine situations (3 items)
After each AUDIO_COMPLETE, say: "You have approximately 20 seconds to ask the speaker any questions you feel are relevant." After they respond, ask: "What advice would you give in this situation?"

Part 3 — Picture Description and Discussion (10 min)
The system will inject two aviation images as [IMAGE_1: description] and [IMAGE_2: description].
Acknowledge [IMAGE_1] and ask the candidate to describe it in detail.
On [IMAGE_2], ask targeted questions about what they see.
Ask 2–3 comparative questions linking both images.
Lead an open discussion on broader aviation topics prompted by the images — safety culture, human factors, environmental impact, technological change. Ask for opinions and push for justification.

WHISPER TRANSCRIPTION TOLERANCE — CRITICAL
The candidate speaks via Whisper AI speech-to-text, which makes frequent phonetic errors on aviation terminology. If a transcribed word is phonetically plausible as an aviation term or ICAO phraseology, treat it as correct. You are assessing the candidate's language proficiency, not the transcription software's accuracy.

FINAL SCORING — deliver only after the exam concludes
Drop examiner persona. Provide a structured evaluation:

| Descriptor | Score | Justification |
|---|---|---|
| Pronunciation | | |
| Structure | | |
| Vocabulary | | |
| Fluency | | |
| Comprehension | | |
| Interactions | | |

For each descriptor, cite 1–2 specific examples. Overall ICAO Level = the lowest score among the six descriptors. State it clearly and explain its operational implications.`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'Method not allowed' }); return; }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(200).json({ ok: false, error: 'GEMINI_API_KEY not configured' });
    return;
  }

  try {
    const { history } = req.body;

    // v1 doesn't support system_instruction — inject system prompt as first user message
    const systemTurn = { role: 'user',  parts: [{ text: 'SYSTEM: ' + SYSTEM_PROMPT }] };
    const systemAck  = { role: 'model', parts: [{ text: 'Understood. I am ready to conduct the TEA examination.' }] };

    const contents = [systemTurn, systemAck].concat(history.map(function(m) {
      return {
        role:  m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      };
    }));

    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=' +
      encodeURIComponent(apiKey);

    const body = JSON.stringify({
      contents:         contents,
      generationConfig: { maxOutputTokens: 2048, temperature: 0.7 }
    });

    // Retry up to 4 times on 503 / high-demand errors, with exponential backoff
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let response, data, attempt = 0;

    while (attempt < 4) {
      response = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body
      });
      data = await response.json();

      if (response.ok) break;

      const isOverload = response.status === 503 ||
        (data.error && typeof data.error.message === 'string' &&
         data.error.message.toLowerCase().indexOf('high demand') !== -1);

      if (!isOverload) break;

      attempt++;
      if (attempt < 4) {
        console.log('[TEA] overload retry ' + attempt + ' — waiting ' + (attempt * 2) + 's');
        await sleep(attempt * 2000);
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

    res.status(200).json({ ok: true, message: text || '' });

  } catch (err) {
    console.error('[TEA]', err.message);
    res.status(200).json({ ok: false, error: err.message });
  }
}
