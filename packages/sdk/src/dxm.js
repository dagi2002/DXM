/**
 * DXM Pulse — Base Tracking SDK
 * Target bundle: <2kb minified
 * No external dependencies. Pure vanilla JS (ES5-compatible syntax for older Android browsers).
 *
 * Captures: pageviews, clicks, scroll depth, navigation (SPA), Core Web Vitals
 * Queues events in localStorage for offline resilience (critical for Ethiopian mobile networks)
 * Flushes max once per 10 seconds via sendBeacon, with XHR fallback
 *
 * Install:
 *   <script src="https://cdn.dxmpulse.com/dxm.js" data-site-id="YOUR_SITE_KEY" async></script>
 */
(function () {
  'use strict';

  // ── Config ─────────────────────────────────────────────────────────────────
  var script = document.currentScript || document.querySelector('script[data-site-id]');
  if (!script) return;
  var SITE_ID = script.getAttribute('data-site-id');
  var API_URL = (script.getAttribute('data-api-url') || 'https://api.dxmpulse.com').replace(/\/$/, '');
  if (!SITE_ID) return;

  // ── Session Identity ────────────────────────────────────────────────────────
  var SESSION_KEY = 'dxm_sid_' + SITE_ID;
  var QUEUE_KEY = 'dxm_q_' + SITE_ID;
  var MAX_QUEUE = 200;

  function genId() {
    try {
      return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, function (c) {
        return (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16);
      });
    } catch (e) {
      // Fallback for browsers without crypto.getRandomValues
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
    }
  }

  var sessionId;
  try {
    sessionId = sessionStorage.getItem(SESSION_KEY);
    if (!sessionId) {
      sessionId = genId();
      sessionStorage.setItem(SESSION_KEY, sessionId);
    }
  } catch (e) {
    sessionId = genId(); // sessionStorage blocked (private mode etc.)
  }

  // ── Event Queue (localStorage) ──────────────────────────────────────────────
  function loadQueue() {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); }
    catch (e) { return []; }
  }
  function saveQueue(q) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch (e) {}
  }

  function push(evt) {
    var q = loadQueue();
    q.push(Object.assign({ ts: Date.now() }, evt));
    if (q.length > MAX_QUEUE) q.splice(0, q.length - MAX_QUEUE);
    saveQueue(q);
    // If queue grows large quickly (error storm), flush immediately
    if (q.length > 50) flush(false);
  }

  // ── Flush ───────────────────────────────────────────────────────────────────
  var lastFlush = 0;
  var flushTimer = null;

  function flush(force) {
    var now = Date.now();
    if (!force && (now - lastFlush) < 10000) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    var q = loadQueue();
    if (!q.length) return;

    var payload = JSON.stringify({
      sessionId: sessionId,
      siteId: SITE_ID,
      events: q,
      metadata: {
        url: location.href,
        userAgent: navigator.userAgent,
        language: navigator.language || navigator.userLanguage,
        screen: { width: screen.width, height: screen.height },
        viewport: { width: window.innerWidth, height: window.innerHeight }
      }
    });

    var endpoint = API_URL + '/collect';
    var sent = false;

    // sendBeacon: fire-and-forget, works on page unload
    if (navigator.sendBeacon) {
      try {
        sent = navigator.sendBeacon(endpoint, new Blob([payload], { type: 'application/json' }));
      } catch (e) { sent = false; }
    }

    if (sent) {
      saveQueue([]);
      lastFlush = now;
      return;
    }

    // XHR fallback (older Android browsers, Telebirr embedded WebView)
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', endpoint, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 400) {
          saveQueue([]);
          lastFlush = Date.now();
        }
      };
      xhr.send(payload);
    } catch (e) {}
  }

  // ── Event Capture ───────────────────────────────────────────────────────────

  // Pageview
  push({ type: 'pageview', url: location.href });

  // Click tracking (passive: doesn't block touch scroll)
  document.addEventListener('click', function (e) {
    var t = e.target;
    var target = t ? (t.tagName || '') + (t.id ? '#' + t.id : '') +
      (t.className && typeof t.className === 'string'
        ? '.' + t.className.trim().split(/\s+/).slice(0, 2).join('.')
        : '') : '';
    push({ type: 'click', x: Math.round(e.clientX), y: Math.round(e.clientY), target: target.slice(0, 80) });
  }, { passive: true });

  // Scroll depth (only record new maximums — no noise)
  var maxScroll = 0;
  document.addEventListener('scroll', function () {
    var depth = Math.round(window.scrollY + window.innerHeight);
    if (depth > maxScroll) {
      maxScroll = depth;
      push({ type: 'scroll', depth: depth, pct: Math.min(100, Math.round((window.scrollY / (document.body.scrollHeight - window.innerHeight || 1)) * 100)) });
    }
  }, { passive: true });

  // SPA navigation (pushState / popstate)
  function onNavigation() {
    push({ type: 'navigation', url: location.href });
  }
  var origPush = history.pushState;
  var origReplace = history.replaceState;
  history.pushState = function () { origPush.apply(history, arguments); onNavigation(); };
  history.replaceState = function () { origReplace.apply(history, arguments); onNavigation(); };
  window.addEventListener('popstate', onNavigation);

  // ── Core Web Vitals (native PerformanceObserver — zero extra bytes) ──────────
  if ('PerformanceObserver' in window) {
    // LCP
    try {
      new PerformanceObserver(function (list) {
        var entries = list.getEntries();
        if (entries.length) {
          var lcp = entries[entries.length - 1];
          push({ type: 'vital', name: 'LCP', value: Math.round(lcp.startTime) });
        }
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch (e) {}

    // CLS
    try {
      new PerformanceObserver(function (list) {
        list.getEntries().forEach(function (entry) {
          if (!entry.hadRecentInput) {
            push({ type: 'vital', name: 'CLS', value: Math.round(entry.value * 1000) / 1000 });
          }
        });
      }).observe({ type: 'layout-shift', buffered: true });
    } catch (e) {}

    // FCP
    try {
      new PerformanceObserver(function (list) {
        list.getEntries().forEach(function (entry) {
          if (entry.name === 'first-contentful-paint') {
            push({ type: 'vital', name: 'FCP', value: Math.round(entry.startTime) });
          }
        });
      }).observe({ type: 'paint', buffered: true });
    } catch (e) {}

    // INP (Interaction to Next Paint)
    try {
      new PerformanceObserver(function (list) {
        list.getEntries().forEach(function (entry) {
          push({ type: 'vital', name: 'INP', value: Math.round(entry.processingEnd - entry.startTime) });
        });
      }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
    } catch (e) {}
  }

  // TTFB from Navigation Timing API (available after load)
  window.addEventListener('load', function () {
    try {
      var nav = performance.getEntriesByType('navigation')[0];
      if (nav) push({ type: 'vital', name: 'TTFB', value: Math.round(nav.responseStart) });
    } catch (e) {}
  });

  // ── Offline / Online ────────────────────────────────────────────────────────
  window.addEventListener('online', function () { flush(true); });
  window.addEventListener('offline', function () {
    if (flushTimer) clearInterval(flushTimer);
    flushTimer = null;
  });

  // ── Periodic + Unload Flush ─────────────────────────────────────────────────
  flushTimer = setInterval(function () { flush(false); }, 10000);

  window.addEventListener('pagehide', function () { flush(true); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flush(true);
  });

  // Expose minimal public API (optional: manual event tracking)
  window.dxm = {
    track: function (eventName, properties) {
      push(Object.assign({ type: 'custom', event: eventName }, properties || {}));
    },
    identify: function (userId) {
      push({ type: 'identify', userId: String(userId).slice(0, 64) });
    }
  };

})();
