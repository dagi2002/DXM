/**
 * DXM Pulse — Session Replay Extension
 * Requires dxm.js to be loaded first (provides window.dxm and the event queue/flush)
 *
 * Uses rrweb to capture full DOM snapshots + mutation events.
 * Events are chunked (max 50 per batch) and sent separately to POST /collect-replay
 * to keep the base /collect endpoint lean.
 *
 * Target bundle: ~30kb gzipped (rrweb-record is ~25kb gzipped)
 *
 * Install (add AFTER dxm.js):
 *   <script src="https://cdn.dxmpulse.com/dxm-replay.js" data-site-id="YOUR_SITE_KEY" async></script>
 */
import { record } from 'rrweb';

(function () {
  'use strict';

  var script = document.currentScript || document.querySelector('script[data-site-id][src*="dxm-replay"]');
  if (!script) return;

  var SITE_ID = script.getAttribute('data-site-id');
  var API_URL = (script.getAttribute('data-api-url') || 'https://api.dxmpulse.com').replace(/\/$/, '');
  if (!SITE_ID) return;

  // Reuse session ID created by dxm.js
  var SESSION_KEY = 'dxm_sid_' + SITE_ID;
  var REPLAY_KEY = 'dxm_replay_' + SITE_ID;
  var CHUNK_SIZE = 50;
  var MAX_REPLAY_EVENTS = 5000; // ~5MB cap

  var sessionId;
  try { sessionId = sessionStorage.getItem(SESSION_KEY); } catch (e) {}
  if (!sessionId) return; // dxm.js must be loaded first

  var replayBuffer = [];
  var totalEventCount = 0;

  function flushReplayChunk(events) {
    if (!events || !events.length) return;
    var payload = JSON.stringify({
      sessionId: sessionId,
      siteId: SITE_ID,
      replayEvents: events,
      chunkIndex: Math.floor(totalEventCount / CHUNK_SIZE)
    });

    var endpoint = API_URL + '/collect-replay';

    if (navigator.sendBeacon) {
      try {
        navigator.sendBeacon(endpoint, new Blob([payload], { type: 'application/json' }));
        return;
      } catch (e) {}
    }

    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', endpoint, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(payload);
    } catch (e) {}
  }

  // Start rrweb recording
  try {
    record({
      emit: function (event) {
        if (totalEventCount >= MAX_REPLAY_EVENTS) return; // cap to avoid massive payloads

        replayBuffer.push(event);
        totalEventCount++;

        if (replayBuffer.length >= CHUNK_SIZE) {
          var chunk = replayBuffer.splice(0, CHUNK_SIZE);
          flushReplayChunk(chunk);
        }
      },
      // Sampling to reduce payload on slow connections
      sampling: {
        mousemove: 50,    // sample every 50ms instead of every event
        scroll: 150,      // sample every 150ms
        input: 'last',    // only capture final input value
        media: 800
      },
      // Block sensitive fields (passwords, card numbers)
      blockClass: 'dxm-block',
      maskAllInputs: true,
      maskInputOptions: {
        password: true,
        email: false,
        tel: false,
        text: false
      },
      // Ignore input-level events for search fields (too noisy)
      ignoreClass: 'dxm-ignore'
    });
  } catch (e) {
    console.warn('[DXM Replay] Failed to start recording:', e.message);
  }

  // Flush remaining buffer on page unload
  window.addEventListener('pagehide', function () {
    if (replayBuffer.length) {
      flushReplayChunk(replayBuffer.splice(0));
    }
  });

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden' && replayBuffer.length) {
      flushReplayChunk(replayBuffer.splice(0));
    }
  });

})();
