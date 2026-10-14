# Site insights (slice 5)

How Pulse turns raw visits and events into the numbers on a site's Overview, Today's "this week" panel and (from task 9) monthly reports. Code: `next/packages/insights` (pure functions + `@pulse/insights/db`), worker jobs `insights.sweep` / `insights.site`, API routes in `apps/api/src/routes/insights.ts`.

## The health score — the one definition

A site's health score is a whole number from 0 to 100 for a range (last 7 or 30 days):

```
health = round(100 × weighted mean of the parts that have data)

part      weight  value (0–1)
speed     0.40    mean of the LCP, INP and CLS sub-scores at p75 (all devices)
friction  0.35    1 − frictionRate / 0.20   (floored at 0)
errors    0.25    1 − errorRate / 0.10      (floored at 0)
```

- **frictionRate** = visits with at least one rage click or dead click ÷ visits.
- **errorRate** = visits with at least one JavaScript error ÷ visits.
- **Vital sub-score** (LCP, INP, CLS at p75, against Google's thresholds in `@pulse/metrics`): 1 at or under "good"; falls linearly to 0.5 at "poor"; then linearly to 0 at twice the poor threshold. Thresholds: LCP 2.5 s / 4 s, INP 200 ms / 500 ms, CLS 0.1 / 0.25.
- A vital with fewer than **5 samples** (`VITALS_MIN_SAMPLES`) is left out of the speed mean. With no vitals at all, speed is left out and the remaining weights are renormalised (friction 0.35/0.60, errors 0.25/0.60).
- Under **30 visits** in the range (`INSIGHTS_MIN_VISITS`) there is **no score**: the UI says "Not enough visits yet" instead.
- Bands (`health_score` in `@pulse/metrics`): 75+ healthy, 50–74 watch, under 50 needs attention.
- The previous score uses the same formula over the same number of days just before the range (week over week for 7 days).

The implementation is `healthScore()` in `packages/insights/src/health.ts`, with unit tests in `insights.test.ts`. Change the formula only together with this section.

## Other definitions

- **Percentiles** follow behaviour contract 21: sort the values and take index `floor((n − 1) × p)` — always an observed value. Each value is one final Web Vital per page view (from the SDK's deferred `v.js`). p75 is shown only with at least 5 samples.
- **Days are UTC calendar days.** A 7-day range is today (so far) plus the 6 days before; the comparison period is the 7 days before that. 30 days works the same way.
- **Visits** count visits that *started* that day; **pageviews** sum those visits' page views. **Bounce** = bounced ÷ ended visits (a visit's bounce is known once it ends, 30 min idle).
- **Vitals by device and network:** device comes from the visit (phone, computer, tablet); network is `NetworkInformation.effectiveType` (`slow-2g` folds into 2G; browsers that don't report it are "unknown" — Safari and Firefox never do).
- **Pages that need you:** page templates (ids collapsed to `*`, as in detectors) ranked by open critical fixes, then by `need` = visits with friction on the page + visits with errors on the page + a share of the page's visits when its p75 LCP is slow (0.5 when poor, 0.25 when needs-work). Only pages with 5+ visits and some need, or an open fix, are listed; at most 5.
- **Funnels:** one per site. Each step matches any of up to 5 matchers — a page path glob, a custom event name, a click selector glob, or a form start/submit (optionally narrowed by form name). Globs use `*` only and are matched in linear time; there is no user regex. A visit reaches step *n* only after reaching step *n − 1*, and one event satisfies at most one step. Counts are per visit that started that day. Conversion = last step ÷ first step.
- **Ethiopian templates** (`FUNNEL_TEMPLATE_DEFS` in `@pulse/contracts`): telebirr checkout, Chapa checkout, lead form, Telegram hand-off. They match common paths (`/product*`, `/cart*`, `/checkout*`, `*thank*`, `*/success*`) and the custom events `add_to_cart`, `telebirr_selected`, `chapa_selected`, `purchase` and `telegram_click` (send them with `dxm.track(name)` where paths don't tell). Step labels are filled in the owner's language when they pick a template.

## Rollups (migration `0012_insights`)

Dashboards never scan raw events per request. The worker fills daily tables, all under forced RLS with `(site_id, org_id)` tied to `sites`:

| Table | Key | Holds |
|---|---|---|
| `rollup_site_day` | site, day | visits, page views, ended/bounced visits, friction visits, error visits, rage/dead clicks, errors |
| `rollup_page_day` | site, day, page template | visits, page views, entries, bounces, friction visits, error visits |
| `rollup_vitals_day` | site, day, metric, device, network, template | the raw final values (`real[]`) — percentiles don't add up across days, so p75 over a range is taken over all its values |
| `rollup_funnel_day` | site, day | step counts for the funnel version in `hash` |
| `site_funnels` | site | name, template, steps (jsonb, validated by `FunnelConfig`), `hash` of the matchers |

**Jobs.** `insights.sweep` runs every 10 minutes and asks the SECURITY DEFINER function `pulse_sites_for_insights(30)` for sites with visitor activity in the last 30 minutes, or whose funnel hasn't been rolled up for a recent day with visits (a new or edited funnel). It queues one `insights.site` per site (`stately`, singleton per site, staggered over 4 minutes). `insights.site` runs inside the org's RLS scope, recomputes **today and yesterday** from raw rows (delete-and-insert, so it's idempotent), then recomputes the funnel for any of the last 30 days whose rollup was made with another step list. Editing a funnel therefore shows "Counting visits for the new steps" until the next sweep (≤ ~15 minutes).

## API

- `GET /api/v1/sites/:id/insights?range=7d|30d` → `SiteInsights` (owners, admins, members; client viewers and other orgs get 404).
- `GET /api/v1/sites/:id/funnel` → `{ funnel, updatedAt }`; `PUT` (owners, admins; validated `FunnelConfig`; audit-logged `funnel.updated`); `DELETE` (audit-logged `funnel.deleted`).
- `GET /api/v1/insights/week` → `WeekSummary` for Today: visits this week vs last across sites, funnel completion across sites with a funnel, fixes verified this month vs last.

## Reuse (reports, task 9)

`@pulse/insights/db` exports:

- `loadSiteInsights(tx, siteId, range, now)` — the full `SiteInsights` for a range ending `now`, from rollups only. Call it inside an org-scoped transaction to freeze a snapshot.
- `rollupReportSource` — `totals()` and `bucketVisits()` over the rollups; structurally the same as task 9's `ReportMetricsSource`, so it can be passed to `buildReportSnapshot` / `generateMonthlyReport` in place of `rawEventsSource`.
- The pure layer (`computeSiteInsights`, `healthScore`, `percentile`, funnel helpers) is in `@pulse/insights`.
