/* ─────────────────────────────────────────────────────────────────────────────
   google.script.run  COMPATIBILITY SHIM
   Intercepts every google.script.run.functionName(args) call and routes it
   to the GAS doPost endpoint via fetch. Zero changes required in Scripts.html.
───────────────────────────────────────────────────────────────────────────── */
(function () {
  var GAS_URL = 'https://script.google.com/a/macros/icaoaerocomms.com/s/AKfycbx4TnUdFYUb6SNJGsuTQW-rd3eQ2RRFeJCpe0ZsK7s67Y2L4bBx3Ez3l5WSM53yINNa/exec';

  function _call(action, args, onSuccess, onFailure) {
    fetch(GAS_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body:    JSON.stringify({ action: action, args: args })
    })
    .then(function (r) { return r.json(); })
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
