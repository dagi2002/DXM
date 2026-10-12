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
