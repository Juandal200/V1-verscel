// ES Module — .mjs extension means clasp never pushes this to GAS
// Vercel cron job: sends streak-risk push notifications daily.
// Called by Vercel cron with Authorization: Bearer <CRON_SECRET>

import webpush from 'web-push';

const GAS_URL         = 'https://script.google.com/macros/s/AKfycbx4TnUdFYUb6SNJGsuTQW-rd3eQ2RRFeJCpe0ZsK7s67Y2L4bBx3Ez3l5WSM53yINNa/exec';
const VAPID_PUBLIC    = process.env.VAPID_PUBLIC_KEY  || '';
const VAPID_PRIVATE   = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_MAILTO    = 'mailto:support@icaoaerocomms.com';
const CRON_SECRET     = process.env.CRON_SECRET       || '';
const GAS_CRON_SECRET = process.env.GAS_CRON_SECRET   || CRON_SECRET;

export default async function handler(req, res) {
  // Vercel cron authentication
  const auth = req.headers['authorization'] || '';
  if (!CRON_SECRET || auth !== 'Bearer ' + CRON_SECRET) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return res.status(500).json({ ok: false, error: 'VAPID keys not configured' });
  }

  webpush.setVapidDetails(VAPID_MAILTO, VAPID_PUBLIC, VAPID_PRIVATE);

  // Fetch at-risk users from GAS
  let data;
  try {
    const gasRes = await fetch(GAS_URL, {
      method:   'POST',
      headers:  { 'Content-Type': 'text/plain;charset=utf-8' },
      body:     JSON.stringify({ action: 'apiGetAtRiskPushUsers', args: [{ cronSecret: GAS_CRON_SECRET }] }),
      redirect: 'follow'
    });
    data = await gasRes.json();
  } catch(err) {
    return res.status(502).json({ ok: false, error: 'GAS unreachable', detail: String(err.message) });
  }

  if (!data.ok || !Array.isArray(data.users)) {
    return res.status(500).json({ ok: false, error: 'GAS error', detail: data.error });
  }

  if (!data.users.length) {
    return res.json({ ok: true, sent: 0, failed: 0, total: 0 });
  }

  const payload = JSON.stringify({
    title: '🔥 Protect your streak!',
    body:  "You haven't practiced today. Keep your streak alive!",
    icon:  '/icon-192.png',
    badge: '/icon-192.png',
    url:   '/'
  });

  let sent = 0, failed = 0;
  for (const u of data.users) {
    if (!u.endpoint || !u.p256dh || !u.auth) { failed++; continue; }
    try {
      await webpush.sendNotification(
        { endpoint: u.endpoint, keys: { p256dh: u.p256dh, auth: u.auth } },
        payload
      );
      sent++;
    } catch(err) {
      console.warn('[push] failed for user', u.userId, err.statusCode || err.message);
      failed++;
    }
  }

  return res.json({ ok: true, sent, failed, total: data.users.length });
}
