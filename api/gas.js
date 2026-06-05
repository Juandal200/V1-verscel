// Vercel serverless proxy — forwards requests to GAS server-to-server.
// Avoids browser CORS and GAS redirect issues entirely.
const GAS_URL = 'https://script.google.com/a/macros/icaoaerocomms.com/s/AKfycbx4TnUdFYUb6SNJGsuTQW-rd3eQ2RRFeJCpe0ZsK7s67Y2L4bBx3Ez3l5WSM53yINNa/exec';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST')    { res.status(405).json({ ok: false, error: 'Method not allowed' }); return; }

  try {
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

    const gasRes = await fetch(GAS_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body:    body,
      redirect: 'follow'
    });

    const text = await gasRes.text();

    // Try to parse as JSON; forward raw text if it fails
    try {
      const json = JSON.parse(text);
      res.status(200).json(json);
    } catch {
      res.status(200).send(text);
    }
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}
