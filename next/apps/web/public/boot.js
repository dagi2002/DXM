// Applies saved theme + language before first paint (no flash, correct lang for screen readers).
// Kept as a static file so the CSP can stay at script-src 'self'.
try {
  var t = localStorage.getItem('pulse.theme');
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  var l = localStorage.getItem('pulse.lang');
  if (l === 'am' || l === 'en') document.documentElement.lang = l;
} catch (e) {}
