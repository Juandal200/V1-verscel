// ES Module — .mjs extension means clasp never pushes this to GAS
const GAS_URL = 'https://script.google.com/a/macros/icaoaerocomms.com/s/AKfycbx4TnUdFYUb6SNJGsuTQW-rd3eQ2RRFeJCpe0ZsK7s67Y2L4bBx3Ez3l5WSM53yINNa/exec';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'Method not allowed' }); return; }

  try {
    const body = JSON.stringify(req.body);

    const gasRes = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: body,
      redirect: 'follow'
    });

    const text = await gasRes.text();
    console.log('[GAS PROXY] status=' + gasRes.status + ' body=' + text.substring(0, 300));

    try {
      res.status(200).json(JSON.parse(text));
    } catch (e) {
      res.status(200).send(text);
    }
  } catch (err) {
    console.error('[GAS PROXY ERROR]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
}
