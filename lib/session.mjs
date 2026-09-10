/* Who is calling, asked once and remembered briefly.
 *
 * Outside api/ deliberately. Every file in that directory becomes a public route
 * on Vercel, which is why two copies of this function already exist — and they
 * have drifted: api/tea.mjs returns { role, status } and api/tea-pipeline.mjs
 * returns something else. Two divergent copies of the function that decides who
 * may spend money is exactly the shape this project keeps being bitten by, so the
 * third and fourth consumers import this instead of copying it again.
 *
 * The cache is the reason /api/whisper can afford to ask at all. That endpoint
 * fires on every spoken answer; a round trip to Apps Script per answer would
 * double both the latency of the core loop and the load on a 30-execution budget.
 * A warm Vercel instance answers from memory. A cold one pays once. It degrades
 * to correct, never to broken.
 *
 * Five minutes means a token revoked by signing out still spends for up to five
 * minutes on one warm instance. For "may you use the transcription budget" that
 * is the right trade; for anything that moves data it would not be.
 */

const GAS_URL =
  process.env.GAS_WEBHOOK_URL ||
  'https://script.google.com/macros/s/AKfycbx4TnUdFYUb6SNJGsuTQW-rd3eQ2RRFeJCpe0ZsK7s67Y2L4bBx3Ez3l5WSM53yINNa/exec';

/* Distinguished from null on purpose. null is "not authorised" — a parsed denial.
 * This is "could not establish", which callers on a paid path must still refuse,
 * but which must never be reported to a student as "sign in again": that would
 * cost them a perfectly good session over a backend fault. */
export const SESSION_UNAVAILABLE = { unavailable: true };

const TTL_MS = 5 * 60 * 1000;
const cache  = new Map();

function cacheGet(token) {
  const hit = cache.get(token);
  if (!hit) return undefined;
  if (Date.now() > hit.expiresAt) { cache.delete(token); return undefined; }
  return hit.value;
}

function cacheSet(token, value) {
  /* Bounded, because a Map that only grows is a leak on a long-lived instance and
   * an attacker choosing random tokens would be the one filling it. */
  if (cache.size > 500) cache.clear();
  cache.set(token, { value, expiresAt: Date.now() + TTL_MS });
}

async function askWhoIsCalling(token) {
  const ac = new AbortController();
  const t  = setTimeout(() => ac.abort(), 8000);
  try {
    const r = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'apiGetMe', args: [token] }),
      redirect: 'follow',
      signal: ac.signal,
    });
    const text = await r.text();
    // An HTML consent page is not an answer about this session.
    if (/^\s*(<!doctype|<html)/i.test(text || '')) return null;
    try { return JSON.parse(text); } catch (e) { return null; }
  } catch (e) {
    return null;                        // aborted, or the network failed
  } finally {
    clearTimeout(t);
  }
}

/* null                → not authorised
 * SESSION_UNAVAILABLE → could not establish; refuse, but do not blame the student
 * { role, status }    → authorised
 */
export async function sessionValid(token) {
  if (!token || typeof token !== 'string') return null;

  const hit = cacheGet(token);
  if (hit !== undefined) return hit;

  let j = await askWhoIsCalling(token);
  if (!j) {
    // One retry. The consent page is usually transient; twice in a row is not.
    await new Promise((r) => setTimeout(r, 400));
    j = await askWhoIsCalling(token);
  }
  if (!j) {
    console.warn('[auth] Apps Script gave no usable answer twice — refusing, identity unknown.');
    return SESSION_UNAVAILABLE;        // deliberately NOT cached: it is not an answer
  }

  if (j.ok === false) { cacheSet(token, null); return null; }

  const caller = {
    role:   String((j.user && j.user.role) || '').toUpperCase(),
    status: String((j.accessStatus && j.accessStatus.status) || ''),
  };
  cacheSet(token, caller);
  return caller;
}

/* The token, wherever the caller could put it.
 *
 * /api/whisper posts raw audio, so its body cannot carry one — it goes in a
 * header. /api/tea-audio posts JSON and carries it there. Reading both here means
 * neither endpoint invents its own convention. */
export function tokenFrom(req) {
  const h = req.headers || {};
  const fromHeader = h['x-session-token'] || h['X-Session-Token'];
  if (fromHeader) return String(fromHeader);
  const b = req.body;
  if (b && typeof b === 'object' && b.sessionToken) return String(b.sessionToken);
  return '';
}
