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

    // Which call this is. Every log line below used to say only that something
    // timed out, so a 45-second failure told us nothing about what was slow and
    // the same message could come from any of a hundred endpoints. The name costs
    // nothing and is the difference between a report and a mystery.
    const action  = (req.body && req.body.action) || 'unknown';
    const started = Date.now();

    // Apps Script does not always answer with JSON. Under load, on a cold start, or
    // when a call runs long it can return an HTML error or a Google sign-in page
    // instead. This proxy used to forward that HTML verbatim with a 200, so the
    // browser tried to JSON.parse a login page and the student saw a raw
    // "<!DOCTYPE html>...ppConfig..." dump. Detect it, retry once, and otherwise
    // fail as structured JSON the UI can actually render.
    const looksLikeHtml = (t) => /^\s*(<!doctype|<html)/i.test(t || '');

    // Every server call in the app comes through here, and this function had no
    // maxDuration in vercel.json — so it ran on Vercel's 10-second default while
    // Apps Script routinely takes longer, especially cold after a deploy. The
    // function was killed mid-flight and the browser got nothing back, which is
    // why login, starting an exam and fetching a clearance all failed together and
    // looked like three separate faults. vercel.json now allows 60s.
    //
    // The abort below is deliberately shorter than that: a clean, explainable
    // failure beats being killed by the platform with no response at all.
    async function callGas() {
      const ac = new AbortController();
      const t  = setTimeout(() => ac.abort(), 45000);
      try {
        const r = await fetch(GAS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: body,
          redirect: 'follow',
          signal: ac.signal
        });
        return { status: r.status, text: await r.text() };
      } finally {
        clearTimeout(t);
      }
    }

    let out;
    try {
      out = await callGas();
    } catch (e) {
      // Aborted or the network failed. Say so plainly rather than letting the
      // browser sit on a request that will never answer.
      const timedOut = e && e.name === 'AbortError';
      console.warn('[GAS PROXY] ' + action + ' ' +
        (timedOut ? 'timed out after 45s' : 'fetch failed: ' + e.message));
      res.status(200).json({
        ok: false,
        error: timedOut
          ? 'The training server took too long to answer. Please try again.'
          : 'Could not reach the training server. Please try again.',
        message: timedOut
          ? 'The training server took too long to answer. Please try again.'
          : 'Could not reach the training server. Please try again.'
      });
      return;
    }
    if (looksLikeHtml(out.text)) {
      // Almost always transient — a second attempt usually succeeds.
      console.warn('[GAS PROXY] ' + action + ' returned HTML, retrying once. status=' + out.status);
      await new Promise((r) => setTimeout(r, 700));
      out = await callGas();
    }

    // The elapsed time turns 'Apps Script is slow' from an impression into a
    // number, and names the endpoints worth optimising first.
    console.log('[GAS PROXY] ' + action + ' ' + (Date.now() - started) + 'ms status=' +
      out.status + ' body=' + out.text.substring(0, 300));

    try {
      res.status(200).json(JSON.parse(out.text));
    } catch (e) {
      // A Google login page here means the Apps Script DEPLOYMENT has lost its
      // authorisation. Nothing the person on screen can do touches that — only the
      // account that owns the script can re-approve it. The old wording told them
      // to sign in again, which cannot work and costs them their session for
      // nothing. Closing the tab and opening a fresh one is what actually clears
      // it in practice, so that is what it says.
      const isLogin = /accounts\.google\.com|ppConfig|signin/i.test(out.text);
      const msg = isLogin
        ? 'Connection to the training server was lost. Close this tab and open the app again — your progress is saved.'
        : 'The training server is busy. Please try again in a moment.';
      res.status(200).json({
        ok: false,
        // Callers read one or the other — send both so whichever a screen checks,
        // the student gets the real explanation rather than a generic fallback.
        error: msg,
        message: msg,
        // Keep the real cause for the console without putting markup on screen.
        detail: out.text.substring(0, 200),
        // Distinguishable in the console so an admin knows it needs re-authorising
        // rather than waiting for a busy server to settle.
        cause: isLogin ? 'GAS_DEPLOYMENT_NEEDS_REAUTH' : 'GAS_NON_JSON',
        gasStatus: out.status
      });
    }
  } catch (err) {
    console.error('[GAS PROXY ERROR]', err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
}
