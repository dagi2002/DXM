/* DXM Pulse service worker (task 15).
 *
 * Caches the app shell only: the HTML entry, the hashed /assets/* files, the boot script, icons and
 * the manifest. It never caches or answers API calls, the collector, replays, other origins or
 * anything but GET — those always go to the network, so data is never stale and a signed-out user
 * never sees someone else's cached data. Also shows web push notifications.
 *
 * A static file in public/: not part of the app's JavaScript bundle or first load.
 */
'use strict';

var VERSION = 'v1';
var CACHE = 'pulse-shell-' + VERSION;
var SHELL = ['/', '/boot.js', '/icon.svg', '/manifest.webmanifest'];

/** Paths that are never cached, whatever their type. */
var NEVER = /^\/(api|i|collect|sdk|r|livez|readyz)(\/|$)/;

/** Shell = same-origin GET for the entry, built assets or static shell files. */
function isShell(url, request) {
  if (request.method !== 'GET') return false;
  if (url.origin !== self.location.origin) return false;
  if (NEVER.test(url.pathname)) return false;
  if (request.mode === 'navigate') return true;
  if (url.pathname.indexOf('/assets/') === 0) return true;
  return SHELL.indexOf(url.pathname) !== -1 || /^\/icon-[a-z0-9-]+\.png$/.test(url.pathname);
}
self.__pulseIsShell = isShell;

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(function (cache) {
        return cache.addAll(SHELL);
      })
      .then(function () {
        return self.skipWaiting();
      }),
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (keys) {
        return Promise.all(
          keys
            .filter(function (k) {
              return k.indexOf('pulse-shell-') === 0 && k !== CACHE;
            })
            .map(function (k) {
              return caches.delete(k);
            }),
        );
      })
      .then(function () {
        return self.clients.claim();
      }),
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  var url = new URL(request.url);
  if (!isShell(url, request)) return; // network, untouched

  if (request.mode === 'navigate') {
    // Network first so a deploy shows up at once; the cached entry only when offline.
    event.respondWith(
      fetch(request)
        .then(function (res) {
          if (res.ok && res.type === 'basic') {
            var copy = res.clone();
            caches.open(CACHE).then(function (c) {
              c.put('/', copy);
            });
          }
          return res;
        })
        .catch(function () {
          return caches.match('/');
        }),
    );
    return;
  }

  // Hashed assets never change: cache first, filled on first use.
  event.respondWith(
    caches.match(request).then(function (hit) {
      if (hit) return hit;
      return fetch(request).then(function (res) {
        if (res.ok && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) {
            c.put(request, copy);
          });
        }
        return res;
      });
    }),
  );
});

self.addEventListener('push', function (event) {
  var data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }
  var url = typeof data.url === 'string' ? data.url : '/today';
  event.waitUntil(
    self.registration.showNotification(data.title || 'DXM Pulse', {
      body: data.body || '',
      tag: data.tag,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: url },
    }),
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var target = new URL(
    (event.notification.data && event.notification.data.url) || '/today',
    self.location.origin,
  );
  // Only ever open our own pages.
  if (target.origin !== self.location.origin) target = new URL('/today', self.location.origin);
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (new URL(c.url).origin === self.location.origin && 'focus' in c) {
          return c.focus().then(function (w) {
            return w && 'navigate' in w ? w.navigate(target.href) : w;
          });
        }
      }
      return self.clients.openWindow(target.href);
    }),
  );
});
