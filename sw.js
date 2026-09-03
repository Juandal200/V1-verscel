var CACHE = 'aerocomms-v6'; // bump version

// install: pre-cache the shell
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(c) { return c.addAll(['/']); })
  );
  self.skipWaiting();
});

// activate: delete old caches
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; }).map(function(k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

// fetch: NETWORK-FIRST for navigation (the 1.9MB HTML shell).
//
// This was stale-while-revalidate, which served the cached shell instantly and
// refreshed it in the background — so the first load after every deploy ran the
// PREVIOUS build. That is not just a staleness annoyance here: the client and the
// server both grade read-backs, and a student running yesterday's client against
// today's server gets told "passed" on screen while the attempt is recorded as
// incorrect, so a completed route silently fails to save.
//
// Correctness of grading outweighs a few hundred ms of startup, so always try the
// network first and fall back to cache only when genuinely offline or slow.
// Six seconds was too short on mobile data, and the consequence is worse than a
// slow load: every reopen on a poor connection served the PREVIOUS build, so fixes
// that were deployed hours earlier never reached the device. Several times today a
// change appeared not to work when it had simply not arrived.
//
// The fetch continues after the timeout and still updates the cache, so a second
// reopen would eventually get the new version — but "eventually, if you open it
// twice" is not an update mechanism.
//
// Twelve seconds. Long enough for a cold Apps Script behind a mobile connection,
// short enough that a genuinely offline device is not left staring at nothing.
var NAV_TIMEOUT_MS = 12000;

self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;
  if (e.request.mode === 'navigate') {
    e.respondWith(
      caches.open(CACHE).then(function(cache) {
        return new Promise(function(resolve) {
          var settled = false;
          var done = function(res) { if (!settled) { settled = true; resolve(res); } };

          // Don't strand the user on a dead connection — fall back after a beat.
          var timer = setTimeout(function() {
            cache.match(e.request).then(function(cached) { if (cached) done(cached); });
          }, NAV_TIMEOUT_MS);

          fetch(e.request).then(function(res) {
            clearTimeout(timer);
            if (res && res.status === 200) {
              // Keep the offline copy current for the next genuine outage.
              try { cache.put(e.request, res.clone()); } catch (_) {}
            }
            done(res);
          }).catch(function() {
            clearTimeout(timer);
            cache.match(e.request).then(function(cached) {
              done(cached || Response.error());
            });
          });
        });
      })
    );
  }
});

self.addEventListener('push', function(e) {
  var data = {};
  try { data = e.data ? e.data.json() : {}; } catch(_) {}
  var title = data.title || 'aerocomms';
  var opts  = {
    body:  data.body  || 'Keep your streak alive!',
    icon:  data.icon  || '/icon-192.png',
    badge: data.badge || '/icon-192.png',
    tag:   'aero-streak',
    renotify: false,
    data:  { url: data.url || '/' }
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  var target = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url.indexOf(target) !== -1 && 'focus' in list[i]) {
          return list[i].focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});
