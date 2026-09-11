#!/usr/bin/env node
/* The simulator, rendered on a phone and measured.
 *
 * CLAUDE.md lists rendered geometry as something the repo cannot confirm, and for
 * the phone that has meant every layout fix reached a student's screen as a
 * guess — checked by the user sending screenshots back. This renders the real
 * build (dist/index.html: the real stylesheet, the real markup, the real
 * scripts) in headless Chrome at iPhone size, enters the simulator the way a
 * student does, and measures what a finger would actually hit.
 *
 * What it does not do, stated so nobody mistakes it for more:
 *   - It is Blink. The students' phones are WebKit. Pair its numbers with a
 *     screenshot from a real phone before calling anything final.
 *   - env(safe-area-inset-*) is 0 in desktop Chrome, so the copy it loads has
 *     those replaced with an iPhone 14/15/16's insets (59px top, 34px bottom).
 *   - The session, the scenario and the verdict are fixtures. The layout code
 *     that draws them is not.
 *
 *   node tools/sim-phone-geometry.mjs            checks, exit 1 if any fail
 *   node tools/sim-phone-geometry.mjs --json     every measurement as well
 *   node tools/sim-phone-geometry.mjs --shots D  PNG of each state into D
 */
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT   = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PHONE  = { width: 393, height: 852, safeTop: 59, safeBottom: 34 };
const args   = process.argv.slice(2);
const JSON_OUT = args.includes('--json');
const SHOTS  = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 ' +
                  '(KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

if (!fs.existsSync(CHROME)) { console.error('No Chrome at ' + CHROME + ' (set CHROME=)'); process.exit(2); }

/* Built fresh, every run. A measurement of yesterday's bundle is how a fix gets
 * reported as landed when it has not. */
execFileSync(process.execPath, [path.join(ROOT, 'build.js')], { stdio: 'ignore' });
const built = fs.readFileSync(path.join(ROOT, 'dist', 'index.html'), 'utf8');
const insets = { top: PHONE.safeTop, bottom: PHONE.safeBottom, left: 0, right: 0 };
const page = path.join(ROOT, 'dist', '__phone-geometry.html');
function writePage(withInsets) {
  fs.writeFileSync(page, built.replace(
    /env\(\s*safe-area-inset-(top|bottom|left|right)\s*(?:,[^)]*)?\)/g,
    (_, side) => (withInsets ? insets[side] : 0) + 'px'));
}

/* ── A small DevTools client. Node has WebSocket built in; no dependency. ── */
function devtools(url) {
  const ws = new WebSocket(url);
  let seq = 0;
  const pending = new Map(), listeners = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
    } else listeners.forEach((fn) => fn(msg));
  };
  return {
    opened: new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }),
    send: (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const id = ++seq; pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params, sessionId }));
    }),
    on: (fn) => listeners.push(fn),
    close: () => ws.close(),
  };
}

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'aerocomms-geometry-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--use-mock-keychain', '--password-store=basic', '--no-first-run',
  '--no-default-browser-check', '--disable-extensions', '--disable-sync', '--mute-audio',
  '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
/* Without --use-mock-keychain a fresh profile waits on a Keychain prompt that
 * nobody is there to answer. This is the backstop if something else does. */
const killer = setTimeout(() => { console.error('timed out'); cleanup(); process.exit(2); }, 90000);
function cleanup() {
  try { chrome.kill('SIGKILL'); } catch (e) {}
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
  try { fs.rmSync(page, { force: true }); } catch (e) {}
}

const wsUrl = await new Promise((resolve, reject) => {
  let buf = '';
  chrome.stderr.on('data', (d) => {
    buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
    if (m) resolve(m[1]);
  });
  chrome.on('exit', () => reject(new Error('chrome exited: ' + buf.slice(-400))));
});
const cdp = devtools(wsUrl);
await cdp.opened;

/* ── What runs inside the page ─────────────────────────────────────────── */
const IN_PAGE = String.raw`
window.__geo = (function () {
  function r(el) {
    if (!el) return null;
    var b = el.getBoundingClientRect();
    return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left),
             right: Math.round(b.right), height: Math.round(b.height), width: Math.round(b.width) };
  }
  function shown(el) {
    if (!el || !el.isConnected) return false;
    var cs = getComputedStyle(el), b = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && b.width > 0 && b.height > 0;
  }
  // Where a finger lands: on screen, and the thing on top at a quarter, half and
  // three quarters of its height is this element. Anything covered, clipped by a
  // scroll box or pushed off the screen fails.
  function reachable(el) {
    if (!shown(el)) return false;
    var b = el.getBoundingClientRect();
    if (b.top < 0 || b.bottom > innerHeight + 0.5 || b.left < 0 || b.right > innerWidth + 0.5) return false;
    var x = b.left + b.width / 2;
    return [0.25, 0.5, 0.75].every(function (f) {
      var hit = document.elementFromPoint(x, b.top + b.height * f);
      return !!hit && (hit === el || el.contains(hit));
    });
  }
  function q(s) { return document.querySelector(s); }
  function measure(state) {
    var bar = q('.sim-readback-priority-card');
    var backs = [q('#globalSmartBackButton'), q('.sim-header-back')].filter(shown);
    var fb = q('#simFeedbackBox');
    return {
      state: state, viewport: { w: innerWidth, h: innerHeight },
      bar: r(bar), barScrollable: !!bar && bar.scrollHeight > bar.clientHeight + 1,
      cockpit: (function (c) { return c && Object.assign(r(c), { clientHeight: c.clientHeight, scrollHeight: c.scrollHeight }); })(q('.sim-cockpit')),
      header: r(q('.sim-cockpit-header')),
      globalBack: shown(q('#globalSmartBackButton')) ? r(q('#globalSmartBackButton')) : null,
      headerBack: shown(q('.sim-header-back')) ? r(q('.sim-header-back')) : null,
      backsShown: backs.length,
      backReachable: backs.length === 1 && reachable(backs[0]),
      replay: r(q('#atcReplayBtn')), replayReachable: reachable(q('#atcReplayBtn')),
      altitude: r(q('#altInstrument')),
      altValueReachable: reachable(q('#altValue')),
      climb: r(q('#altInstrument .sim-instr-btn')),
      climbReachable: reachable(document.querySelectorAll('#altInstrument .sim-instr-btn')[0]),
      descendReachable: reachable(document.querySelectorAll('#altInstrument .sim-instr-btn')[1]),
      speakShown: shown(q('#simMicBtn')),
      input: r(q('#pilotReadback')),
      feedbackShown: shown(fb),
      verdict: fb && fb.querySelector('h3') ? r(fb.querySelector('h3')) : null,
      verdictReachable: !!fb && reachable(fb.querySelector('h3')),
      scoreReachable: !!fb && reachable(fb.querySelector('h3 + p')),
      next: r(q('#simActionRow .btn.primary')),
      nextReachable: reachable(q('#simActionRow .btn.primary')),
      retryReachable: reachable(q('#simActionRow .btn.secondary')),
      paused: shown(q('.sim-paused-banner')) ? r(q('.sim-paused-banner')) : null,
    };
  }
  function fixtureScenarios() {
    var phases = [['TAXI_OUT', 'Taxi Out'], ['TAKEOFF', 'Takeoff'], ['CLIMB', 'Climb'], ['CRUISE', 'Cruise'],
                  ['DESCENT', 'Descent'], ['APPROACH', 'Approach'], ['LANDING', 'Landing'], ['TAXI_IN', 'Taxi In']];
    return phases.map(function (p, i) {
      return { scenarioId: 'GEO-' + i, level: 1, country: 'INDIA', phaseCode: p[0], phaseName: p[1],
               scenarioType: 'NORMAL', flightScenarioName: 'Geometry fixture',
               atcText: 'IndiGo 245, climb and maintain flight level 120, contact Mumbai Control 132 decimal 7',
               expectedReadback: 'Climb and maintain flight level 120, 132 decimal 7, IndiGo 245',
               keywordsText: 'flight level 120, 132 decimal 7', targetAltitude: 12000 };
    });
  }
  // Enter the simulator the way a student does: through _navTo, so the page
  // transition runs exactly as it does in the app.
  function enter() {
    var login = document.getElementById('loginScreen'), app = document.getElementById('appScreen');
    if (login) login.classList.remove('active');
    if (app) app.classList.add('active');
    window._navLabel = 'Training';
    var t = AppState.training = AppState.training || {};
    t.route = { routeId: 'GEO', routeName: 'Geometry fixture', currentLevel: 1, currentCountry: 'INDIA' };
    t.scenarios = fixtureScenarios();
    t.currentIndex = 2;
    t.scenarioStartMs = Date.now();
    t.completedScenarioIds = { i0: true, i1: true };
    t.serverConfirmedIds = { i0: true, i1: true };
    t.lifetimeCompleted = 4;
    window._navTo(window.renderScenarioStageImmersive);
    return new Promise(function (res) { setTimeout(res, 1200); }).then(settle);
  }
  // Audio cannot load from file://, and the simulator says so in the verdict
  // panel. That message is this harness's, not the student's — put the panel
  // back the way the card draws it.
  function settle() {
    var fb = q('#simFeedbackBox');
    if (fb && !q('.sim-readback-priority-card.has-verdict') && !(fb.querySelector('h3'))) {
      fb.className = 'sim-feedback-box is-empty';
      fb.textContent = 'Feedback appears after evaluation';
    }
    return new Promise(function (res) { setTimeout(res, 250); });
  }
  function verdict(ok) {
    var t = AppState.training, i = Number(t.currentIndex || 0);
    if (ok) { t.completedScenarioIds['i' + i] = true; t.serverConfirmedIds['i' + i] = true; }
    window.renderAttemptFeedback({
      evaluation: ok ? { correct: true, score: 100, keywordsMissing: [] }
                     : { correct: false, score: 45, keywordsMissing: ['flight level 120', '132 decimal 7'] },
      expectedAnswer: 'Climb and maintain flight level 120, 132 decimal 7, IndiGo 245',
      progress: null, _fromServer: true,
    });
    var input = q('#pilotReadback');
    if (input) { input.value = ok ? 'Climb and maintain flight level 120, 132 decimal 7, IndiGo 245'
                                  : 'Climb flight level 120 IndiGo 245'; }
    return new Promise(function (res) { setTimeout(res, 400); });
  }
  function retry() {
    window.retryCurrentScenario();
    return new Promise(function (res) { setTimeout(res, 700); }).then(settle);
  }
  return { measure: measure, enter: enter, verdict: verdict, retry: retry, shown: shown };
})();
true;`;

async function openTab({ width, height, mobile }) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => cdp.send(m, p, sessionId);
  await s('Page.enable'); await s('Runtime.enable');
  await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 3 : 1, mobile });
  if (mobile) {
    await s('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await s('Emulation.setUserAgentOverride', { userAgent: IPHONE_UA });
  }
  const loaded = new Promise((res) => cdp.on((m) => { if (m.method === 'Page.loadEventFired' && m.sessionId === sessionId) res(); }));
  await s('Page.navigate', { url: 'file://' + page });
  await loaded;
  await new Promise((res) => setTimeout(res, 1500));   // boot, and whatever it does without a server
  const ev = async (expr) => {
    const out = await s('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (out.exceptionDetails) throw new Error(expr.slice(0, 60) + ': ' + JSON.stringify(out.exceptionDetails).slice(0, 600));
    return out.result.value;
  };
  const shot = async (name) => {
    if (!SHOTS) return;
    fs.mkdirSync(SHOTS, { recursive: true });
    const { data } = await s('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(data, 'base64'));
  };
  await ev(IN_PAGE);
  return { ev, shot, close: () => cdp.send('Target.closeTarget', { targetId }) };
}

const results = {};
try {
  writePage(true);
  const tab = await openTab({ width: PHONE.width, height: PHONE.height, mobile: true });
  await tab.ev('__geo.enter()');
  results.before = await tab.ev('__geo.measure("before answering")');   await tab.shot('1-before');
  await tab.ev('__geo.verdict(true)');
  results.accepted = await tab.ev('__geo.measure("accepted")');        await tab.shot('2-accepted');
  await tab.ev('__geo.retry()');
  results.retried = await tab.ev('__geo.measure("after practice again")'); await tab.shot('3-retried');
  await tab.ev('__geo.verdict(false)');
  results.rejected = await tab.ev('__geo.measure("rejected")');        await tab.shot('4-rejected');
  await tab.ev('__geo.retry()');
  await tab.ev('window.simMediaTogglePause(); new Promise(r => setTimeout(r, 300))');
  results.paused = await tab.ev('__geo.measure("paused")');            await tab.shot('5-paused');
  await tab.ev('window.simMediaTogglePause(); window.toggleSimulatorFocusMode(); new Promise(r => setTimeout(r, 300))');
  results.menu = await tab.ev('__geo.measure("menu shown")');          await tab.shot('6-menu');
  await tab.close();

  writePage(false);
  const desk = await openTab({ width: 1280, height: 800, mobile: false });
  await desk.ev('__geo.enter()');
  results.desktop = await desk.ev('__geo.measure("desktop")');         await desk.shot('7-desktop');
  await desk.close();
} finally {
  clearTimeout(killer);
  cdp.close();
  cleanup();
}

/* ── The criterion, as checks ─────────────────────────────────────────── */
let fails = 0;
const ok = (name, cond, detail) => {
  if (!cond) fails++;
  console.log((cond ? '  PASS  ' : '  FAIL  ') + name + (cond || detail === undefined ? '' : '   ' + detail));
};
const B = results.before, A = results.accepted, R = results.rejected, T = results.retried;
const gap = (m) => m.bar ? m.viewport.h - m.bar.bottom : null;

console.log('--- the answer bar is pinned to the screen ---');
ok('it reaches the left edge',  B.bar && B.bar.left === 0, B.bar && B.bar.left);
ok('and the right edge',        B.bar && B.bar.right === B.viewport.w, B.bar && B.bar.right + ' of ' + B.viewport.w);
ok('and sits on the home-indicator line', gap(B) === PHONE.safeBottom, gap(B) + 'px under it');
ok('the PAUSED banner is edge to edge',
   !!results.paused.paused && results.paused.paused.left === 0 && results.paused.paused.right === B.viewport.w,
   JSON.stringify(results.paused.paused));

console.log('--- before answering, the altitude can be flown ---');
ok('exactly one Back, and it can be pressed', B.backsShown === 1 && B.backReachable,
   B.backsShown + ' shown');
ok('the altitude readout is visible',      B.altValueReachable, JSON.stringify(B.altitude) + ' bar ' + JSON.stringify(B.bar));
ok('Climb can be pressed',                 B.climbReachable);
ok('Descend can be pressed',               B.descendReachable);
ok('Climb and Descend keep a thumb-sized target', B.climb && B.climb.height >= 44, B.climb && B.climb.height);
ok('Replay ATC can be pressed',            B.replayReachable);

console.log('--- after an accepted answer ---');
ok('Replay ATC can still be pressed',      A.replayReachable, JSON.stringify(A.replay) + ' bar ' + JSON.stringify(A.bar));
ok('the verdict is readable',              A.verdictReachable, JSON.stringify(A.verdict));
ok('the score is readable',                A.scoreReachable);
ok('Next exercise can be pressed',         A.nextReachable, JSON.stringify(A.next));
ok('Practice again can be pressed',        A.retryReachable);
ok('the bar is still pinned to the screen', A.bar && A.bar.left === 0 && gap(A) === PHONE.safeBottom);

console.log('--- after a rejected answer ---');
ok('Replay ATC can still be pressed',      R.replayReachable, JSON.stringify(R.replay) + ' bar ' + JSON.stringify(R.bar));
ok('the verdict is readable',              R.verdictReachable);
ok('the score is readable',                R.scoreReachable);
ok('Practice again can be pressed',        R.retryReachable);

console.log('--- Practice again hands the turn back ---');
ok('Speak is back',                        T.speakShown);
ok('the verdict is cleared',               !T.feedbackShown);
ok('the altitude can be flown again',      T.climbReachable && T.descendReachable);

console.log('--- the menu, and the desktop ---');
ok('with the menu shown there is still exactly one Back', results.menu.backsShown === 1,
   results.menu.backsShown + ' shown');
ok('the desktop simulator has one Back',   results.desktop.backsShown === 1, results.desktop.backsShown);

if (JSON_OUT) console.log('\n' + JSON.stringify(results, null, 1));
console.log(fails ? '\n' + fails + ' FAILING' : '\nAll phone geometry checks passed.');
process.exit(fails ? 1 : 0);
