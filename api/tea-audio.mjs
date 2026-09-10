// TEA Exam audio — generates Chirp3-HD TTS for pre-scripted exam recordings.
// Calls Google Cloud TTS directly (no GAS required).
// Requires GOOGLE_TTS_API_KEY in Vercel environment variables.
import { sessionValid, tokenFrom, SESSION_UNAVAILABLE } from '../lib/session.mjs';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'Method not allowed' }); return; }

  /* Who is asking, before anything is spent.
   *
   * This endpoint took a POST from anyone on the internet, read {text, voice,
   * lang} and billed Google Cloud TTS per character. No function names to guess,
   * no knowledge of the codebase — just a POST. It was the most exposed of the
   * three paid paths and the last to be noticed. */
  const caller = await sessionValid(tokenFrom(req));
  if (!caller || caller === SESSION_UNAVAILABLE) {
    res.status(200).json({
      ok: false,
      code: caller === SESSION_UNAVAILABLE ? 'SESSION_UNCONFIRMED' : 'FORBIDDEN',
      error: 'Not authorised to synthesise audio.',
    });
    return;
  }

  const apiKey = process.env.GOOGLE_TTS_API_KEY;
  if (!apiKey) {
    res.status(200).json({ ok: false, error: 'GOOGLE_TTS_API_KEY not configured' });
    return;
  }

  try {
    const { text, voice, lang, rate } = req.body;

    if (!text || !voice || !lang) {
      res.status(200).json({ ok: false, error: 'Missing text, voice, or lang' });
      return;
    }

    const speakingRate = Number(rate || 0.95);

    // Chirp3-HD requires plain text (no SSML) and no effectsProfileId or pitch
    const payload = {
      input:       { text: text },
      voice:       { languageCode: lang, name: voice },
      audioConfig: { audioEncoding: 'MP3', speakingRate: speakingRate }
    };

    // Try v1 first, v1beta1 as fallback
    const apiVersions = ['v1', 'v1beta1'];
    let lastError = '';

    for (const version of apiVersions) {
      const url = `https://texttospeech.googleapis.com/${version}/text:synthesize?key=${encodeURIComponent(apiKey)}`;

      const ttsRes = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload)
      });

      const data = await ttsRes.json();

      if (ttsRes.ok && data.audioContent) {
        res.status(200).json({ ok: true, audioBase64: data.audioContent });
        return;
      }

      lastError = (data.error && data.error.message) || `HTTP ${ttsRes.status}`;
      console.error(`[TEA-AUDIO] ${version} failed: ${lastError}`);
    }

    res.status(200).json({ ok: false, error: 'TTS failed: ' + lastError });

  } catch (err) {
    console.error('[TEA-AUDIO]', err.message);
    res.status(200).json({ ok: false, error: err.message });
  }
}
