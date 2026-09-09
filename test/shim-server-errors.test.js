/* doPost always answers HTTP 200. A refusal is {ok:false} in the body, and
 * api/gas.mjs reports a 45-second timeout the same way — so every server error
 * arrived at the SUCCESS handler and callers that never looked at .ok swallowed
 * it. apiTrackActiveTime restored its accumulated seconds from a failure handler
 * that could not run; a student could submit an exam into silence.
 *
 * Flipping this for every action was measured and rejected: 175 of the 248
 * google.script.run chains inspect res.ok inside their success handler and act on
 * it there, so a blanket change would stop 175 error paths in one untested edit.
 *
 * So it is opt-in per action, and the opt-in is a migration — an action joins the
 * list only once its callers handle the failure where it will now arrive. This
 * runs the real shim. */
'use strict';
const fs = require('fs');
const SH = fs.readFileSync(__dirname + '/../shim.js', 'utf8');
const S  = fs.readFileSync(__dirname + '/../Scripts.html', 'utf8');
let fails = 0; const ok = (n, c, d) => { if (!c) fails++; console.log((c ? '  PASS  ' : '  FAIL  ') + n + (c || !d ? '' : ' — ' + d)); };

function grab(src, sig) {
  const i = src.indexOf(sig); if (i < 0) return null;
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); }
  }
  return null;
}

console.log('\nthe shim routes server errors to the failure handler\n');

const listSrc = SH.match(/var SERVER_ERROR_ACTIONS = \{[\s\S]*?\};/);
const callSrc = grab(SH, 'function _call(');
ok('SERVER_ERROR_ACTIONS is declared', !!listSrc);
ok('_call is declared', !!callSrc);
if (!listSrc || !callSrc) { console.log('\ncannot continue'); process.exit(1); }

let body = null;
const api = new Function('API', 'fetch', 'console',
  listSrc[0] + '\n' + callSrc +
  '\nreturn { _call: _call, SERVER_ERROR_ACTIONS: SERVER_ERROR_ACTIONS };'
)('/api/gas',
  () => Promise.resolve({ status: 200, text: () => Promise.resolve(JSON.stringify(body)) }),
  { log() {}, warn() {}, error() {} });

function call(action, payload) {
  body = payload;
  return new Promise(resolve => {
    api._call(action, [], d => resolve({ where: 'success', d }), e => resolve({ where: 'failure', e }));
  });
}

(async function () {
  console.log('an allowlisted action fails to the failure handler:');
  let r = await call('apiTrackActiveTime', { ok: false, message: 'The training server took too long to answer.' });
  ok('routed to onFailure', r.where === 'failure', r.where);
  ok('carrying the server\'s own words',
     r.e && r.e.message === 'The training server took too long to answer.', r.e && r.e.message);
  ok('and the original body, for callers that need the code',
     r.e && r.e.serverResponse && r.e.serverResponse.ok === false);

  console.log('\nan action NOT on the list is untouched:');
  r = await call('apiGetVRConfig', { ok: false, error: 'nope' });
  ok('still routed to onSuccess', r.where === 'success', r.where);
  ok('with the body intact', r.d && r.d.ok === false);

  console.log('\nsuccess is still success, on and off the list:');
  r = await call('apiTrackActiveTime', { ok: true });
  ok('allowlisted ok:true goes to onSuccess', r.where === 'success');
  r = await call('apiGetVRConfig', { ok: true });
  ok('unlisted ok:true too', r.where === 'success');

  console.log('\na body with no ok field is not an error:');
  r = await call('apiTrackActiveTime', { data: 1 });
  ok('routed to onSuccess', r.where === 'success', r.where);

  console.log('\nthe list holds the eight that were migrated:');
  const L = api.SERVER_ERROR_ACTIONS;
  ['apiSaveIcaoTranscript','apiSaveIcaoTestResult','apiCompleteRoute','apiFinalizeRoute',
   'apiSaveCertificate','apiTrackActiveTime','getMyCompletedLevels','apiGetAppBootstrap']
    .forEach(a => ok(a + ' is on it', !!L[a]));
  ok('and nothing else is, yet', Object.keys(L).length === 8, String(Object.keys(L).length));

  /* Each one only belongs on the list once its callers handle a failure where it
   * will now arrive. Checked against the source, because adding an action without
   * migrating it is exactly how this becomes a regression. */
  console.log('\nevery listed action has a caller that reacts:');
  const SRC = S.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/[^\n]*/g, '$1');
  [['apiSaveIcaoTranscript', /_reportClientError\('saveIcaoTranscript'/],
   ['apiSaveIcaoTestResult', /_reportClientError\('saveIcaoTestResult'/],
   ['apiCompleteRoute',      /_completionUnconfirmed\(/],
   ['apiFinalizeRoute',      /_finalizeUnsynced\(/],
   ['apiSaveCertificate',    /_reportClientError\('saveCertificateAuto'/],
   ['apiTrackActiveTime',    /_accumulated \+= secs/],
   ['getMyCompletedLevels',  /_reportClientError\('refreshTopbarRank'/],
   ['apiGetAppBootstrap',    /withFailureHandler\(_bootstrapFailed\)/],
  ].forEach(([a, re]) => ok(a + ' has a failure path', re.test(SRC)));

  console.log(fails ? ('\n' + fails + ' FAILING') : '\nall green');
  process.exit(fails ? 1 : 0);
})();
