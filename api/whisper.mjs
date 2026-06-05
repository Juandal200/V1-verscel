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

    res.status(200).json({ ok: true, transcript: data.text || '' });

  } catch (err) {
    console.error('[WHISPER]', err.message);
    res.status(200).json({ ok: false, error: err.message });
  }
}
