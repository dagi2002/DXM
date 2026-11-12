// Applies saved theme + language before first paint (no flash, correct lang for screen readers).
// Kept as a static file so the CSP can stay at script-src 'self'.
try {
  var t = localStorage.getItem('pulse.theme');
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  var l = localStorage.getItem('pulse.lang');
  if (l === 'am' || l === 'en') document.documentElement.lang = l;
} catch (e) {}

// PWA (task 15): register the service worker (app shell cache + push) after load. It lives here,
// not in the app bundle, so it adds nothing to first-load JS. Built pages only: in the Vite dev
// server the entry is still /src/main.tsx.
window.addEventListener('load', function () {
  if (!('serviceWorker' in navigator)) return;
  if (document.querySelector('script[src="/src/main.tsx"]')) return;
  navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function () {});
});
