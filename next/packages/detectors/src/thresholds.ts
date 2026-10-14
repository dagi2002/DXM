/**
 * Every number that decides whether something becomes a Fix card lives here, named, so it can be
 * tuned in one place and tests pin the behaviour at each boundary.
 */

/** Detectors look at this rolling window of events on each run (ADR-007: every ~2 minutes). */
export const DETECTION_WINDOW_HOURS = 24;

/** Rage clicks: distinct visits needed before we call it a problem, and before it's critical. */
export const RAGE_CLICK_MIN_VISITS = 3;
export const RAGE_CLICK_CRITICAL_VISITS = 10;

/** Dead clicks are noisier (decorative elements, slow handlers), so they need more visits. */
export const DEAD_CLICK_MIN_VISITS = 5;
export const DEAD_CLICK_CRITICAL_VISITS = 25;

/**
 * On pages where money or a sign-up changes hands, friction is critical sooner. Never lower than
 * a detector's own minimum.
 */
export const MONEY_PATH_CRITICAL_VISITS = 5;
export const MONEY_PATH_RE =
  /(^|\/)(checkout|cart|basket|pay|payment|payments|order|orders|book|booking|signup|sign-up|register)(\/|$)/i;

/**
 * After someone marks an issue fixed, occurrences in this window are ignored: deploys roll out,
 * CDNs and service workers keep serving the old page for a while. Only what happens after the
 * cooldown can reopen the issue.
 */
export const REGRESSION_COOLDOWN_MINUTES = 30;

/** How many affected visit ids an issue keeps as evidence (replay links in slice 4). */
export const MAX_SAMPLE_VISITS = 5;

/** A browser/OS pair is called out ("Android · Chrome") only when it covers this share of visits. */
export const TOP_BROWSER_MIN_SHARE = 0.6;

/* ── Form abandonment ──────────────────────────────────────────────────────── */
/** Visits that started a form and left without submitting it, before it's a problem. */
export const FORM_ABANDON_MIN_VISITS = 5;
/** …and only when at least this share of the visits that started it gave up. */
export const FORM_ABANDON_MIN_RATE = 0.4;
export const FORM_ABANDON_CRITICAL_VISITS = 20;
/** A visit still on the site gets this long after its last form start before it counts as abandoned. */
export const FORM_ABANDON_GRACE_MINUTES = 30;

/* ── Slow pages (Web Vitals "poor" lines, web.dev) ─────────────────────────── */
export const SLOW_LCP_POOR_MS = 4000;
export const SLOW_INP_POOR_MS = 500;
/** Twice the poor line is critical: most visitors on that page are waiting. */
export const SLOW_LCP_CRITICAL_MS = 8000;
export const SLOW_INP_CRITICAL_MS = 1000;
/** Visits measured on a page template before we judge its p75 at all. */
export const SLOW_PAGE_MIN_VISITS = 10;
/** Visits measured on one network before its own p75 is shown or judged. */
export const SLOW_NETWORK_MIN_VISITS = 5;
/** The percentile Web Vitals are judged at. */
export const SLOW_PERCENTILE = 0.75;

/* ── JavaScript errors ─────────────────────────────────────────────────────── */
export const JS_ERROR_MIN_VISITS = 5;
export const JS_ERROR_CRITICAL_VISITS = 25;
/**
 * Messages that carry no information (cross-origin "Script error.") or are harmless browser
 * noise. Matched against the normalized message, case-insensitively.
 */
export const IGNORED_ERROR_MESSAGES = [/^script error\.?$/i, /^resizeobserver loop/i];

/* ── U-turns ───────────────────────────────────────────────────────────────── */
/** Going back to the previous page within this many seconds counts as a U-turn. */
export const U_TURN_MAX_SECONDS = 10;
export const U_TURN_MIN_VISITS = 5;
/** …and only when at least this share of the visits that opened the page turned back. */
export const U_TURN_MIN_RATE = 0.25;
export const U_TURN_CRITICAL_VISITS = 25;

/* ── Tracking broken (schedule-driven) ─────────────────────────────────────── */
/** Sites quieter than this (visits/day, over the week before) are too small to judge silence. */
export const TRACKING_MIN_DAILY_VISITS = 5;
/** Never call a site silent before this many hours without data… */
export const TRACKING_SILENT_MIN_HOURS = 6;
/** …or before this many of its usual gaps between visits have passed (quiet sites get longer). */
export const TRACKING_EXPECTED_GAPS = 8;
/** At this many visits/day a silent site is losing a lot of data: critical. */
export const TRACKING_CRITICAL_DAILY_VISITS = 50;
/** The week of traffic a site's usual volume is measured over. */
export const TRACKING_BASELINE_DAYS = 7;

/* ── Fix verification (`issue.verify`) ─────────────────────────────────────── */
/** "Before" = the 7 days before fixed_at. */
export const VERIFY_BEFORE_DAYS = 7;
/** "After" = days 3–7 after fixed_at (skips deploy lag and cached pages). */
export const VERIFY_AFTER_START_DAYS = 3;
export const VERIFY_AFTER_END_DAYS = 7;
/** The after window needs this many exposed visits (or measured visits for speed) to judge. */
export const VERIFY_MIN_EXPOSED = 20;
export const VERIFY_MIN_SPEED_SAMPLES = 10;
/** Verified when the after rate is at most this share of the before rate (i.e. halved). */
export const VERIFY_MAX_REMAINING = 0.5;
/** Stop waiting for enough traffic this many days after fixed_at; the fix stays "fixed". */
export const VERIFY_GIVE_UP_DAYS = 28;
/** Tracking fixes: data must keep flowing for this long after it resumed. */
export const VERIFY_TRACKING_HOURS = 24;
