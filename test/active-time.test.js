/* Campus time: how much of it reaches the sheet, and how much the backend pays.
 *
 * Two faults, one commit. The sync ran every 30 seconds and every sync takes a
 * PROJECT-WIDE ScriptLock on the Apps Script side — getScriptLock, shared by 41
 * write paths — and this was the only one on a timer, for every student on every
 * screen. And the tail flush that was supposed to make a longer interval safe had
 * never worked: sendBeacon with a string sends text/plain, Vercel parses that into
 * a string, and api/gas.mjs reads req.body.action off it. undefined. The action
 * became 'unknown', failed the allowlist, and was refused before it reached Apps
 * Script.
 *
 * So the interval could not be raised until the flush was real. Both are asserted
 * here, by running the tracker rather than reading it. */
'use strict';
const fs = require('fs');
const S  = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');

/* Comments are stripped BEFORE the braces are counted.
 *
 * The block below documents the old broken beacon by quoting the garbage it
 * produced, and that quote contains an unbalanced brace inside a string. A
 * matcher that reads comments walks straight past the end of the function —
 * which is exactly what happened when this test was first written. A comment
 * must never be able to break a check about code. */
const SRC = S.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');

function grab(sig) {
  const i = SRC.indexOf(sig); if (i < 0) return null;
  let d = 0;
  for (let k = SRC.indexOf('{', i); k < SRC.length; k++) {
    if (SRC[k] === '{') d++; else if (SRC[k] === '}') { d--; if (!d) return SRC.slice(i, k + 1); }
  }
  return null;
}
let fails = 0; const ok = (n, c, d) => { if (!c) fails++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c || !d ? '' : ' — ' + d)); };

console.log('\ncampus time tracker, lifted from Scripts.html\n');
const body = grab('function _startActiveTimeTracker(');
ok('_startActiveTimeTracker found', !!body);
if (!body) process.exit(1);

// A world just real enough to run it in.
function harness(beaconAccepts) {
  if (beaconAccepts === undefined) beaconAccepts = true;
  const listeners = { window: {}, document: {} };
  const beacons = [];
  const rpc = [];
  const env = {
    beacons, rpc, listeners,
    tick: null,
    fire(target, evt) { (listeners[target][evt] || []).forEach(f => f()); },
  };
  const win = {
    addEventListener: (e, f) => { (listeners.window[e] = listeners.window[e] || []).push(f); },
    _activeTrackerRunning: false,
  };
  const doc = {
    addEventListener: (e, f) => { (listeners.document[e] = listeners.document[e] || []).push(f); },
    visibilityState: 'visible',
  };
  env.win = win; env.doc = doc;
  const stubs = {
    window: win, document: doc,
    AppState: { sessionToken: 'tok-1' },
    navigator: { sendBeacon: (url, payload) => { beacons.push({ url, payload }); return beaconAccepts; } },
    Blob: function (parts, opts) { this.parts = parts; this.type = (opts || {}).type; },
    setInterval: (fn) => { env.tick = fn; return 1; },
    google: { script: { run: {
      withSuccessHandler() { return this; },
      withFailureHandler() { return this; },
      apiTrackActiveTime(tok, secs) { rpc.push(secs); },
    }}},
  };
  new Function(...Object.keys(stubs), body + '\n_startActiveTimeTracker();')(...Object.values(stubs));
  return env;
}

console.log('the interval is three minutes, not thirty seconds:');
const SYNC = (body.match(/var SYNC_EVERY\s*=\s*([^;]+);/) || [])[1] || '';
ok('SYNC_EVERY is 3 * 60 * 1000', /3\s*\*\s*60\s*\*\s*1000/.test(SYNC), SYNC.trim());
const IDLE = (body.match(/var IDLE_LIMIT\s*=\s*([^;]+);/) || [])[1] || '';
ok('the 5-minute idle cutoff is untouched', /5\s*\*\s*60\s*\*\s*1000/.test(IDLE), IDLE.trim());

console.log('\nthe tail is flushed on every way a page goes away:');
let e = harness();
ok('beforeunload is bound',     !!e.listeners.window.beforeunload);
ok('pagehide is bound',         !!e.listeners.window.pagehide);
ok('visibilitychange is bound', !!e.listeners.document.visibilitychange);

console.log('\nand the beacon is now something the proxy will accept:');
e = harness();
for (let i = 0; i < 5; i++) e.tick();          // five seconds of activity
e.fire('window', 'pagehide');
ok('one beacon was sent', e.beacons.length === 1, 'sent ' + e.beacons.length);
const b = e.beacons[0];
ok('to /api/gas', b && b.url === '/api/gas');
/* The whole point. A string here becomes text/plain, Vercel parses it to a
 * string, req.body.action is undefined, action resolves to 'unknown' and the
 * allowlist refuses it. */
ok('as a Blob, not a bare string', b && typeof b.payload === 'object');
ok('carrying application/json',    b && b.payload.type === 'application/json',
   b && String(b.payload.type));
const parsed = b && JSON.parse(b.payload.parts[0]);
ok('naming the real action',       parsed && parsed.action === 'apiTrackActiveTime');
ok('and the action passes the proxy allowlist', /^api[A-Z]/.test(parsed.action));
ok('carrying the accumulated seconds', parsed && parsed.args[1] === 5, parsed && String(parsed.args[1]));

console.log('\nthe flush is idempotent — whichever event fires first wins:');
e = harness();
for (let i = 0; i < 3; i++) e.tick();
e.fire('window', 'pagehide');
e.fire('window', 'beforeunload');
e.doc.visibilityState = 'hidden';
e.fire('document', 'visibilitychange');
ok('three events, one beacon', e.beacons.length === 1, 'sent ' + e.beacons.length);

console.log('\na visible tab is not flushed by visibilitychange:');
e = harness();
for (let i = 0; i < 3; i++) e.tick();
e.doc.visibilityState = 'visible';
e.fire('document', 'visibilitychange');
ok('nothing sent while still visible', e.beacons.length === 0);

console.log('\nnothing accumulated means nothing sent:');
e = harness();
e.fire('window', 'pagehide');
ok('no empty beacon', e.beacons.length === 0);

/* A browser that refuses the beacon returns false. The seconds must go back on
 * the counter — a hidden tab that comes back then sends them on the next sync,
 * instead of the count silently resetting to zero. */
console.log('\nand a refused beacon keeps the seconds rather than dropping them:');
e = harness(false);
for (let i = 0; i < 4; i++) e.tick();
e.fire('window', 'pagehide');
ok('the beacon was attempted', e.beacons.length === 1);
// Proof the seconds survived: the tab comes back and a later flush still has them.
e.fire('window', 'pagehide');
ok('and a second attempt still carries them, so they were not dropped',
   e.beacons.length === 2 &&
   JSON.parse(e.beacons[1].payload.parts[0]).args[1] === 4,
   e.beacons.length === 2 ? String(JSON.parse(e.beacons[1].payload.parts[0]).args[1]) : 'no second attempt');

/* And the server half: the only lock site on a timer is no longer one.
 *
 * Read from stripped source — the replacement comment names dbWithScriptLock_
 * to explain why it is gone, and a raw count would find it there. */
console.log('\nthe project-wide lock is off the timer path:');
const L = fs.readFileSync(__dirname + '/../LMSModuleService.js', 'utf8');
const Lc = L.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
function grabIn(src, sig) {
  const i = src.indexOf(sig); if (i < 0) return null;
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  return null;
}
const track = grabIn(Lc, 'function apiTrackActiveTime(');
ok('apiTrackActiveTime found', !!track);
ok('it no longer takes the script lock', track && track.indexOf('dbWithScriptLock_') === -1);
// It must still do the work, or the metric stops moving.
ok('and still reads, updates and appends',
   track && /dbFindOne_\('UserActivity'/.test(track) &&
            /dbUpdateByRow_\('UserActivity'/.test(track) &&
            /dbAppend_\('UserActivity'/.test(track));
// Every other write path keeps it — this is one considered exception, not a sweep.
const others = (Lc.match(/dbWithScriptLock_\(function/g) || []).length;
ok('the other write paths in this file keep it (' + others + ')', others >= 15);
// Per-user locking is not an option, and the reason is in appsscript.json.
const APP = JSON.parse(fs.readFileSync(__dirname + '/../appsscript.json', 'utf8'));
ok('the web app still executes as the deploying user, so getUserLock is no alternative',
   APP.webapp && APP.webapp.executeAs === 'USER_DEPLOYING', APP.webapp && APP.webapp.executeAs);

console.log(fails ? ('\n' + fails + ' FAILING') : '\nall green');
process.exit(fails ? 1 : 0);
