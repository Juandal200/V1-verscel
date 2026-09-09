/* ─────────────────────────────────────────────────────────────────────────────
   google.script.run  COMPATIBILITY SHIM
   Intercepts every google.script.run.functionName(args) call and routes it
   to the GAS doPost endpoint via fetch. Zero changes required in Scripts.html.
───────────────────────────────────────────────────────────────────────────── */
(function () {
  // Calls go to /api/gas (Vercel serverless proxy) — never directly to GAS.
  var API = '/api/gas';

  /* Actions whose ok:false is a FAILURE, not a result.
   *
   * doPost always answers HTTP 200 — a refusal is {ok:false} in the body — and
   * api/gas.mjs reports a 45-second timeout the same way. So every server error
   * arrived here as a success and was handed to onSuccess. Callers that never
   * looked at .ok therefore swallowed it: apiTrackActiveTime restored its
   * accumulated seconds from a failure handler that could not run, and a student
   * could submit into silence.
   *
   * Flipping this for EVERY action was measured and rejected: 175 of the 248
   * google.script.run chains inspect res.ok inside their success handler and act
   * on it there, so a blanket change would stop 175 error paths running, in one
   * untested edit, in a 31,000-line file.
   *
   * So it is opt-in per action, and the opt-in is a migration: an action goes on
   * this list only once its callers handle the failure where it will now arrive.
   * The mechanism is central, the list grows deliberately, and when it covers
   * everything the default can be inverted safely.
   *
   * Ordered by what a failure costs a student. */
  var SERVER_ERROR_ACTIONS = {
    // Losing these loses work.
    apiSaveIcaoTranscript: true,
    apiSaveIcaoTestResult: true,
    apiCompleteRoute:      true,
    apiFinalizeRoute:      true,
    apiSaveCertificate:    true,
    // Losing these loses accuracy — a wrong number shown as a right one.
    apiTrackActiveTime:    true,
    getMyCompletedLevels:  true,
    apiGetAppBootstrap:    true
  };

  function _call(action, args, onSuccess, onFailure) {
    fetch(API, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: action, args: args })
    })
    .then(function (r) {
      return r.text().then(function (text) {
        console.log('[SHIM] ' + action + ' — status ' + r.status + ' — raw: ' + text.substring(0, 300));
        try { return JSON.parse(text); }
        catch (e) { throw new Error('Non-JSON response: ' + text.substring(0, 200)); }
      });
    })
    .then(function (data) {
      if (data && data.ok === false && SERVER_ERROR_ACTIONS[action]) {
        // Carry the server's own words: callers render err.message, and
        // api/gas.mjs already puts a readable sentence in both fields.
        var err = new Error(String(data.message || data.error || 'The server could not complete that.'));
        err.serverResponse = data;      // code, cause, gasStatus for anyone who wants them
        if (onFailure) onFailure(err);
        return;
      }
      if (onSuccess) onSuccess(data);
    })
    .catch(function (err) { if (onFailure) onFailure(err); });
  }

  // Returns a chainable runner object for a single RPC call.
  function _runner() {
    var ctx = { _success: null, _failure: null };

    var handler = {
      get: function (target, prop) {
        if (prop === 'withSuccessHandler') {
          return function (fn) { ctx._success = fn; return new Proxy(ctx, handler); };
        }
        if (prop === 'withFailureHandler') {
          return function (fn) { ctx._failure = fn; return new Proxy(ctx, handler); };
        }
        // Anything else is the actual RPC function name
        return function () {
          _call(prop, Array.prototype.slice.call(arguments), ctx._success, ctx._failure);
        };
      }
    };

    return new Proxy(ctx, handler);
  }

  // google.script.run proxies to a fresh runner on every property access
  var runProxy = new Proxy({}, {
    get: function (_, prop) {
      return _runner()[prop];
    }
  });

  window.google = window.google || {};
  window.google.script = window.google.script || {};
  window.google.script.run = runProxy;

  // ── Fetch APP_CONFIG from GAS before the app boots ────────────────────────
  // Replaces <?!= getClientConfigJson(); ?> which only runs server-side in GAS.
  window._shimConfigReady = new Promise(function (resolve) {
    _call('getClientConfigJson', [], function (data) {
      try {
        window.APP_CONFIG = typeof data === 'string' ? JSON.parse(data) : data;
      } catch (e) {
        window.APP_CONFIG = {};
      }
      resolve();
    }, function () {
      window.APP_CONFIG = {};
      resolve();
    });
  });
}());
