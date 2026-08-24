// ES Module — .mjs extension means clasp never pushes this to GAS
const GAS_URL = 'https://script.google.com/macros/s/AKfycbx4TnUdFYUb6SNJGsuTQW-rd3eQ2RRFeJCpe0ZsK7s67Y2L4bBx3Ez3l5WSM53yINNa/exec';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'Method not allowed' }); return; }

  try {
    const body = JSON.stringify(req.body);

    // Apps Script does not always answer with JSON. Under load, on a cold start, or
    // when a call runs long it can return an HTML error or a Google sign-in page
    // instead. This proxy used to forward that HTML verbatim with a 200, so the
    // browser tried to JSON.parse a login page and the student saw a raw
    // "<!DOCTYPE html>...ppConfig..." dump. Detect it, retry once, and otherwise
    // fail as structured JSON the UI can actually render.
    const looksLikeHtml = (t) => /^\s*(<!doctype|<html)/i.test(t || '');

    async function callGas() {
      const r = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: body,
        redirect: 'follow'
      });
      return { status: r.status, text: await r.text() };
    }

    let out = await callGas();
    if (looksLikeHtml(out.text)) {
      // Almost always transient — a second attempt usually succeeds.
      console.warn('[GAS PROXY] HTML response, retrying once. status=' + out.status);
      await new Promise((r) => setTimeout(r, 700));
      out = await callGas();
    }

    console.log('[GAS PROXY] status=' + out.status + ' body=' + out.text.substring(0, 300));

    try {
      res.status(200).json(JSON.parse(out.text));
    } catch (e) {
      const isLogin = /accounts\.google\.com|ppConfig|signin/i.test(out.text);
      const msg = isLogin
        ? 'The training server needs to be re-authorised. Please sign in again.'
        : 'The training server is busy. Please try again in a moment.';
      res.status(200).json({
        ok: false,
        // Callers read one or the other — send both so whichever a screen checks,
        // the student gets the real explanation rather than a generic fallback.
        error: msg,
        message: msg,
        // Keep the real cause for the console without putting markup on screen.
        detail: out.text.substring(0, 200),
        gasStatus: out.status
      });
    }
  } catch (err) {
    console.error('[GAS PROXY ERROR]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
}
