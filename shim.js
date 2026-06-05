/* ─────────────────────────────────────────────────────────────────────────────
   google.script.run  COMPATIBILITY SHIM
   Intercepts every google.script.run.functionName(args) call and routes it
   to the GAS doPost endpoint via fetch. Zero changes required in Scripts.html.
───────────────────────────────────────────────────────────────────────────── */
(function () {
  // Calls go to /api/gas (Vercel serverless proxy) — never directly to GAS.
  var API = '/api/gas';

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
    .then(function (data) { if (onSuccess) onSuccess(data); })
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
