# Rebuild Progress Log

## 2026-10-04 — Phase 0 (audit) and Phase 1 (spec & architecture) complete

**Status:** Phase 1 approved on 2026-10-04. Phase 2 started.

**Done**
- Four parallel audits (frontend, backend/data, SDK/privacy, tests/ops/docs), plus a live walkthrough and a live cross-origin SDK test.
- API suite: 37 files, 138 tests passing in 37s.
- Deliverables 00–05, the design system HTML, and ADR-001 to ADR-012.
- Added `.claude/launch.json` (api :4000, web :5173; port 5000 is taken by macOS AirPlay).

**Founder decisions (2026-10-04)**
1. Pilots: **rebuild only.** No hotfix or deploy of the legacy app. (Recommendation was hotfix + pilots in parallel. The founder chose otherwise.)
2. Mobile: **PWA + Telegram bot in v1**, Expo companion app in slice 8. ADR-006 accepted.
3. ICP: **transactional businesses first, agencies as a channel.**
4. Brand: **Abay blue.** Design system accepted.
5. Hosting: not asked. Using the ADR-008 default (international VM + Ethiopian-VM option).
6. Pricing: stays a hypothesis (01 §7). Only the plan catalog structure is built. Prices get validated with pilots.

## 2026-10-05 — Phase 2, slice 1 (foundations) ✅

**Shipped in `next/`:**
- Monorepo (pnpm + Turborepo, TS 6 strict) with ESLint guard rails: no hand-written percentages or hex colors in UI code.
- **Auth and organizations** (Better Auth):
  - email + password (min 10), magic link, Google (when configured), email verification, password reset that revokes sessions;
  - 30-day sliding DB sessions in `pulse.*` cookies;
  - users in many orgs with owner / admin / member / client_viewer roles, read live from the membership table on every request;
  - invitations by email.
- **API** (Hono): `/livez`, `/readyz`, `/api/v1/public-config`, `/api/v1/me` (+ preferences), `/api/v1/sites` CRUD. Also:
  - plan site limits;
  - soft delete with typed confirmation;
  - audit log;
  - a single error format and request ids;
  - a CSRF Origin guard on all state-changing `/api/*` calls (it caught Better Auth accepting a cross-site sign-out);
  - client IPs that can't be spoofed behind proxies;
  - security headers.
- **Data:** Postgres with RLS forced on `sites`, `audit_log` and `org_plans`. The app connects as `pulse_app` (NOSUPERUSER, NOBYPASSRLS). Migrations are versioned and fail loudly.
- **Web app:** sign-in/up, forgot/reset, accept invitation, onboarding, Today (honest empty states), Sites (list/create/edit/delete), Settings (profile language/calendar/theme, organization, team). Also:
  - EN/አማ everywhere, `<html lang>` synced, Ethiopic font loaded only when needed;
  - Ethiopian calendar dates;
  - labelled mobile tab bar, offline banner, PWA manifest.
- **Design system:** `@pulse/tokens` (Abay blue; WCAG contrast tests over every text/background pair), `@pulse/ui` on React Aria, `@pulse/metrics`.
- **Tests:**
  - 143 unit, component and API integration tests (incl. tenant-isolation and RLS tests in the database itself);
  - 8 Playwright E2E runs (4 flows × desktop and 360px mobile) with axe WCAG 2.2 AA at 0 violations.
- **CI:** `.github/workflows/next-ci.yml` (typecheck, lint, tests on Postgres 16, build + bundle budget, `pnpm audit`, E2E).

**Decisions made during the slice:**
- Better Auth's password hashing is scrypt, not argon2id (ADR-004 said argon2id). Scrypt is memory-hard too, and needs no native module.
- Client viewers see no sites until site sharing ships in slice 6.
- Free plan = 1 site, enforced. Prices are still hypotheses.
- **Bundle budget corrected to 220 KB.** The measured first-load JS is 214 KB gz: React 19 + React Aria alone are about 123 KB. The 120 KB figure was a guess, and the reduction plan is in 03 §8.
- Faint text darkened to `#6F6C65` after axe flagged 4.43:1 on the page background.
- React Aria's off-screen live announcer is excluded from axe scans. Its stale "pending" nodes reference removed buttons, which is a library artifact.

**Not done yet (slice 1 scope):**
- Deploy to a staging VM. Docker, Caddy and compose files are written but not exercised. That needs a VM, a domain and secrets from you.
- Sentry is wired but has no DSN.
- Amharic copy still needs a native-speaker review (glossary in 02 §3).

**Next: slice 2 — install & verify:** SDK v3, collector, live verification, legacy `/dxm.js` shims.

## 2026-10-06 — Phase 2, slice 2 (install & verify) ✅

**Shipped:**
- **SDK v3 (`packages/sdk`):**
  - `p.js` is 4.1 KB gz. Web Vitals load later as `v.js` (3.6 KB gz), once the page is idle.
  - Delivery: `text/plain` with `credentials: 'omit'` (never preflighted), keepalive fetch plus a `sendBeacon` fallback, backoff, and one request in flight at a time. **Each batch keeps its sequence number across retries and beacon handoff**, so duplicates are dropped server-side.
  - Visits are per tab and roll over after 30 minutes idle.
  - Events: SPA pageviews, click points, rage clicks, dead clicks (deduplicated per target), scroll depth, form start/submit/error (names only), JS errors, custom events.
  - Privacy: query strings allow-listed to UTM tags, fragments dropped, emails, phones and tokens masked in paths. Consent modes and GPC respected, and nothing touches storage before consent.
  - Telegram Mini App detection. Legacy `data-site-id` / `data-api-url` / `window.dxm.*` still work.
- **Collector (`apps/collector`):**
  - Validates against `@pulse/contracts/ingest` and checks `Origin` against the site's allow-list.
  - Rate limits per visit, IP and site. Drops bots and headless browsers. 64 KB cap.
  - Enqueues to pg-boss and serves the SDK with immutable versioned URLs.
  - **Legacy `/collect` is mapped to v3, and its preflight allows `x-dxm-sdk`, which rescues old installs** (audit finding 1).
- **Worker (`apps/worker`):**
  - Applies batches inside the org's RLS scope: dedupe, visit upsert, events into **daily partitions**.
  - Flips the site live and emails owners and admins in their own language.
  - Cron jobs: close idle visits and compute bounce, keep partitions ahead, purge dedupe markers.
- **Data:**
  - `visits` primary key is (site_id, id), which rules out cross-tenant visit injection by construction.
  - `events` is range-partitioned with RLS on every partition.
  - Narrow `SECURITY DEFINER` functions handle cross-org lookups and maintenance, so no role gets BYPASSRLS.
  - A single `migrateAll` applies schema, queues and grants.
- **API:** `GET /sites/:id/install` (snippet + live status), extra origins (staging/localhost), `POST /sites/:id/install/email` (localized, rate-limited, audited), `GET /today`.
- **Web:**
  - The install panel has the snippet with a copy button, step-by-step guides for 7 platforms, live verification (3 s polling until live), troubleshooting tips after 90 s, "email my developer", and extra origins.
  - Today shows 24-hour visits and pageviews per site.
  - Route loading indicator. The language toggle responds instantly.
  - **Only the active language downloads, and email strings never ship to browsers.**
- **Ops:**
  - API, collector, worker and migrator build into single self-contained bundles, verified to run from an empty folder.
  - Dockerfile targets per service. Caddy routes tracking traffic to the collector.
- **Tests:**
  - 188 unit, component and integration tests (SDK, collector, worker against Postgres, API).
  - 12 Playwright runs. These include a **real cross-origin install with sendBeacon enabled**: sign up, add site, visit the demo shop on another origin, the site goes live, Today shows numbers. All run on desktop and 360px, with axe at 0 violations.

**Found and fixed while verifying:**
- Collector and worker bundles crashed on start: CommonJS `pg` inside an ESM bundle. Fixed with self-contained bundles plus a `createRequire` shim.
- ICU parsing broke on the literal `</head>` in install emails, and the API mislabelled the crash as "malformed JSON". Both fixed.
- The site status badge didn't update when verification succeeded.
- Retries used new sequence numbers, which would have caused duplicates.
- Dead clicks were reported once per click instead of once per burst.
- Lazy language loading made the toggle unresponsive until the download finished.

**Decisions:**
- Web Vitals moved to a deferred `v.js`. web-vitals 6 alone is 3.7 KB gz and wouldn't fit the 5 KB core budget.
- The first-load JS budget was ratcheted from 220 KB down to 216 KB (measured: 213.4 KB + a ~4 KB locale file).
- Session-quota enforcement per plan is deferred to billing (slice 7). There is **no ingest quota yet**.
- Legacy replay uploads are accepted and dropped until replay ships (slice 4).

**Not done yet:**
- Deploy (needs a VM, a domain and secrets).
- Docker images not built locally (Docker isn't running on this machine).
- Retention purge of old partitions (needs the plan/retention model).

**Next: slice 3 — the "what to fix" feed.** Detectors run in the worker (rage/dead clicks, U-turns, form abandonment, JS errors, slow pages, tracking-broken), producing Fix cards, AI explanations and Telegram alerts.

## 2026-10-12 — Phase 2, slice 2.5 (platform screens) ✅

Every screen in the platform design is now built in `apps/web` (commit `4569324`), ahead of the backends that will feed them. Where a backend hasn't shipped, the screen runs on a flagged **sample layer** and says so on screen.

**Shipped:**
- **Today:** a fix feed. The headline names how many things are costing the lead site orders. The lead fix gets a full card (evidence, estimated impact, AI suggestion, replays, "Mark as fixing", "Dismiss"). Status tabs (Open / Fixing / Fixed / Verified / Dismissed) show counts. Verified fixes appear as "add to client report" rows. The side panel has sites with real 24 h visits, a sample "this week" panel and a Telegram teaser. When a site is live, a banner says visits are real and the fixes are sample data (`today.collecting`).
- **Fix detail** (`/fixes/$fixId`): status stepper, replay clip with "Play from the moment" and "Next clip", affected visits table, impact maths, AI suggestion with code, and a "Next step" panel that moves the fix through the workflow.
- **Site page** (`/sites/$siteId`): Overview / Replays / Install tabs. Overview has the health score, key numbers, the telebirr checkout funnel, speed by network and "pages that need you". It mixes real 24 h visits/pageviews with sample insights and labels which is which. A live site opens on Overview, a site still installing opens on Install.
- **Replays** (`/replays`, `/replays/$replayId`): list and player with timeline, friction marks, AI recap, "back to the fix · clip n of m", previous/next visit.
- **Reports** (`/reports`) and the **public share view** (`/r/$token`). No sign-in needed. It's read-only, has a language switch and "Download PDF" (print), and shows an "expired" state for unknown tokens.
- **Landing page** at `/` when signed out (signed in goes to Today or onboarding), and always at `/welcome`. The sign-in/up screens got a brand panel on desktop.
- **Shell:** 5 tabs (Today, Sites, Replays, Reports, Settings). It's a bottom bar on phones.
- EN + AM strings for all of it (Amharic still needs a native review).

**The sample layer: `apps/web/src/lib/sample.ts`** _(removed 2026-10-14 after plan 2: fixes, replays, insights and reports all run on real APIs, and `sample.ts`, `SamplePill` and the `sample.*` strings are gone. Kept below for history.)_
- It holds typed sample data for fixes (slice 3), replays (slice 4), site insights (slice 5) and client reports (slice 6), plus Today's "this week" panel. Every screen showing it carries the **Sample data** pill (`SamplePill`).
- It's exposed only as TanStack Query options: `sampleFixesQuery`, `sampleReplaysQuery`, `sampleInsightsQuery`, `sampleReportsQuery`, `sampleWeekQuery`, each with `staleTime: Infinity` and a `queryFn` that returns a deep copy.
- Fix status changes (`useSetFixStatus` in `routes/today.tsx`) only rewrite the query cache. They live in memory and reset on reload.
- The interfaces (`Fix`, `Replay`, `SiteInsights`, `Report`) are meant to become the real contracts.

**How to swap a sample for a real API (per slice):**
1. Add the contract to `packages/contracts` (start from the interface in `sample.ts`) and the endpoint to `apps/api`, e.g. `GET /api/v1/fixes`.
2. Add a real query next to the others in `lib/queries.ts`, using `api()` and an org-scoped key, e.g. `['fixes', orgId]`. Then point the screens at it instead of the `sample*Query`. Screens read through `useQuery`, so nothing else in the component changes.
3. Fixes: turn `useSetFixStatus` into a `useMutation` (`PATCH /api/v1/fixes/:id`) that updates the cache optimistically and invalidates on settle, so the status tabs keep moving instantly.
4. Public report: `/r/$token` needs an **unauthenticated, token-scoped** endpoint that returns only that report (no org data beyond it) and honours expiry.
5. Remove the `SamplePill` from screens that no longer show sample data, and delete the data and query from `sample.ts`. Once it's empty, delete the file and the `sample.label` string.
6. Update the e2e in `apps/web/e2e/platform.spec.ts`. It pins sample content (e.g. `fix_128`, `rep_1406`, `demo-september`), so seed equivalent rows in `e2e/prepare-db.ts` or assert on structure instead.

**Tests (task 6):**
- Got e2e on `rebuild` green again. The sign-in brand panel wordmark failed axe contrast: clsx doesn't merge classes, so the Logo's `text-text` won over `text-on-primary`. The install test also raced the site page switching itself to Overview when the site went live.
- New `e2e/platform.spec.ts` covers: the landing page at `/` signed out and at `/welcome` (signed in too); `/r/demo-september` without signing in, plus an unknown token; Today → fix detail → replay → back to the fix; "Mark as fixing" moving a fix from Open to Fixing.
- New unit test `src/lib/i18n-keys.test.ts`: every `t('…')` key in `apps/web/src` exists in `en.json`, and template keys like `` t(`fix.status.${s}`) `` must match at least one message. (en/am parity is already tested in `packages/i18n`.)
- Playwright: 22 runs (desktop + 360px), all passing.

**Not done yet:** every sample-backed screen still needs its slice (3 fixes, 4 replay, 5 insights, 6 reports). The landing page's "check your site" form only sends people to sign-up for now; it doesn't run a check.

## 2026-10-12 — Phase 2, slice 3, part 1 (fix detection v1: click friction) ✅ (rest: 2026-10-14)

**Shipped:**
- **Data:** `issues` (one row per site + fingerprint, per-org running number, evidence/impact jsonb, first/last seen, fixed/verified times) and append-only `issue_events` (status history; actor null = the system). Both under forced RLS. Status/severity check constraints. A composite FK makes an issue's site belong to the issue's org. Migrations `0009_issues`, `0010_issues_rls` (renumbered after task 2's `0008_two_factor` at merge).
- **`packages/detectors` (pure, ADR-007):** rage-click and dead-click detectors over a rolling 24 h window, grouped by page template (ids collapsed to `*`) and element. Thresholds are named constants in `thresholds.ts`: rage ≥ 3 visits (critical at 10), dead ≥ 5 (critical at 25), money pages (checkout/cart/pay/book/sign-up) critical at 5. `planUpsert` decides create / refresh / reopen / skip; a fixed issue ignores occurrences for a 30-minute cooldown, then reopens on regression. Dismissed issues stay dismissed.
- **Worker:** `detect.sweep` every 2 minutes finds sites with recent activity (narrow SECURITY DEFINER function) and queues one staggered `detect.site` per site (`stately` + singletonKey, so at most one queued and one running per site). `detect.site` runs inside the org's RLS scope, is idempotent, and returns created / reopened / escalated ids for notifications to hook into.
- **API:** `GET /api/v1/fixes` (filters: status, siteId, limit), `GET /api/v1/fixes/:id` (with history), `PATCH /api/v1/fixes/:id` (status, transition rules in `FIX_TRANSITIONS`, conditional update against concurrent changes). Owners, admins and members; client viewers get 403. Zod contracts in `@pulse/contracts` (`fixes.ts`).
- **Web:** Today and the fix page read the real feed. While an org has no real fixes, the sample feed and its "Sample data" pill stay. Status buttons PATCH real fixes (optimistic, rolled back on error) and stay local for samples. Titles, summaries and chips are built from evidence in English and Amharic.
- **Tests:** 29 detector unit tests, 9 worker tests against Postgres (idempotency, escalation, per-org numbering, tenant scope, cooldown/regression, dismissed, window, sweep), 13 API integration tests (contract shape, ordering, filters, transitions, CSRF, tenant isolation, roles), 2 web tests for the sample fallback.

**Found while verifying:** the i18n "untranslated Amharic" test was red on `rebuild` ("Pulse Care" is a product name); fixed on `rebuild` in bfa7d2a.

**Not done yet (rest of slice 3):**
- Form-abandonment detector (`fs` without `fx`, `fe` per field).
- Slow-pages detector (p75 LCP/INP per page template and network, from `vt` events).
- JS-errors detector (`er` grouped by message + source).
- U-turns and tracking-broken (schedule-driven) detectors.
- Fix verification job (`issue.verify`: 7 days before vs 3–7 days after `fixed_at`, automatic `verified`).
- AI explanations and suggested fixes (`ai.recommend`, `ai_artifacts` cache, per-org budget).
- Telegram alerts (and push/email) for created / escalated / reopened issues, with quiet hours.
- Revenue-at-risk impact (needs order values) and replay links from `sampleVisitIds` (slice 4).

## 2026-10-14 — Phase 2, slice 3, part 2 (rest of fix detection) ✅

Task 10 of the parallel plan. Details: [detection.md](detection.md).

**Shipped:**
- **Detectors** (`packages/detectors`, pure, named thresholds): form abandonment, slow pages (p75 LCP/INP by template, split by network), JS errors, U-turns, and tracking-broken (hourly, schedule-driven). Evidence is now a tagged union in `@pulse/contracts` (`FixEvidence`); old click rows read as `type: 'click'` (migration backfills it).
- **Verification:** `issue.verify-sweep` (hourly) → `issue.verify` per issue. Compares the 7 days before `fixed_at` with days 3–7 after, using the detector's own grouping. Outcomes: verified, reopened, or waiting for traffic (gives up after 28 days). The result is stored in `issues.verification` and shown on the fix and in Today.
- **Telegram alerts:** one message per site per detection run with news (created / escalated / reopened, plus reopened-by-verification). Settings → Notifications links a chat with a single-use `/start` code through a secret-checked webhook. Quiet hours re-queue alerts until they end. Messages in English or Amharic. Blocked bots are unlinked.
- **AI suggested fix:** `ai.recommend`, off unless `AI_ENABLED=1` and `ANTHROPIC_API_KEY` are set. Per-org monthly budget, cached in `ai_artifacts` by evidence hash, untrusted evidence fenced in `<data>`. With AI off the API returns no suggestions and the UI shows no AI box. `/public-config` exposes `aiEnabled` (for task 7's replay recap) and `telegramEnabled`.
- **Migration `0014_detection_2`:** `telegram_links`, `telegram_link_codes`, `ai_artifacts` (forced RLS + policies), `issues.verification`, `issues_kind_ck`, and the helpers `pulse_live_sites`, `pulse_issues_due_for_verification`, `pulse_claim_telegram_link` (SECURITY DEFINER, ids only).
- **Web:** the sample fixes and their fallback are gone. A new org gets an honest empty state ("No problems found yet"). Copy for every detector in en + am. Impact shows visitors/day and who left (revenue needs order values). The sample replays no longer link to `fix_128`.
- **API:** `GET /fixes` skips (and logs) a malformed row instead of failing the whole feed.

**Tests:**
- 31 new detector unit tests at every threshold boundary, plus verification windows and judging.
- 17 worker integration tests against Postgres: real ingest → each new detector, tracking open/refresh/resume, verify verified/reopened/waiting/not-due, Telegram formatting en/am, quiet hours, unlink on 403, AI off/cache/budget/unparseable, tenant isolation throughout.
- 13 API tests: Telegram link/webhook/settings/roles/isolation, evidence shapes, verification, AI on/off, malformed rows.
- The RLS invariant test now names the new tables and checks the helpers' grants.
- Web unit tests for the view model in en + am.
- e2e seeds real issues (`e2e/seed.ts`) instead of pinning `fix_128`.

**Not done yet:**
- Revenue-at-risk impact (needs order values).
- Replay links from `sampleVisitIds` (task 7).
- AI suggestions in Amharic, and the `packages/ai` task wrapper from ADR-009 (retry, evals).
- ~~Monday digest and push/email alerts.~~ Done in task 15 (2026-11-12).
- ~~Telegram webhook registration is a manual `setWebhook` call.~~ Automatic since task 15.
- Verification loads raw `pv` events over two weeks for click/JS/U-turn rates; fine at pilot volume, but should move to task 8's rollups.

## 2026-10-14 — Phase 2, slice 5 (site insights) ✅

Task 8 of parallel plan 2 (`task/8-insights`). The site Overview and Today's "this week" panel now run on real data; the sample insights and sample week are gone from `sample.ts`. Definitions are in [insights.md](./insights.md).

**Shipped:**
- **Health score:** one definition, documented in `insights.md` and implemented once (`healthScore()` in `packages/insights`): speed (p75 LCP/INP/CLS against Google thresholds) 40%, friction (visits with rage/dead clicks) 35%, errors (visits with JS errors) 25%; parts without data are left out and the rest renormalised; no score under 30 visits.
- **`packages/insights` (pure, unit-tested):** percentile per contract 21 (`floor((n-1)×p)`), p75 vitals by device and network, "pages that need you" ranking, funnels (ordered step matching with a linear-time `*` glob — no user regex), the Ethiopian funnel templates (telebirr/Chapa checkout, lead form, Telegram hand-off), week-over-week deltas, day aggregation for the rollup job, and `computeSiteInsights` / `computeWeekSummary`.
- **Data (`0012_insights`):** `rollup_site_day`, `rollup_page_day`, `rollup_vitals_day` (raw final values per day, since percentiles don't add across days), `rollup_funnel_day` (counts tagged with the funnel's step hash) and `site_funnels`. All forced RLS, composite `(site_id, org_id)` FKs to `sites`, and a narrow SECURITY DEFINER `pulse_sites_for_insights()` for the sweep.
- **Worker:** `insights.sweep` every 10 minutes queues one `insights.site` per site with recent visits or a funnel that hasn't been rolled up (stately, singleton per site, staggered). `insights.site` recomputes today and yesterday (UTC) from raw rows inside the org's RLS scope (idempotent), and re-rolls up to 30 recent days when the funnel's steps change.
- **API:** `GET /api/v1/sites/:id/insights?range=7d|30d`, `GET/PUT/DELETE /api/v1/sites/:id/funnel` (owners/admins change it; audit-logged), `GET /api/v1/insights/week`. Contracts in `@pulse/contracts` (`insights.ts`). Members read; client viewers get 404 (they don't see sites yet); other orgs' sites are 404.
- **Web:** the Overview has a 7/30-day switch, a headline from the data, health with its delta, visits with a sparkline, funnel completion (or bounce when there's no funnel), phone LCP, the funnel (set up from a template in the owner's language, switch or remove it; "counting" while the rollup catches up), speed by network and device with INP/CLS ratings in words, and pages that need you with trouble and open-fix counts. Every number has an honest empty state ("Not enough visits yet", "Not enough data yet"). Today's week panel shows real visits, funnel completion when any site has a funnel, and fixes verified this month vs last. EN + AM strings.
- **For reports (task 9):** `@pulse/insights/db` exports `loadSiteInsights()` and `rollupReportSource` (same shape as task 9's `ReportMetricsSource`).
- **Tests:** 26 unit tests (`packages/insights`), 7 worker tests against Postgres (rollup contents, idempotency, funnel backfill and re-hash, tenant scope, deleted sites, insights and report numbers read from rollups with raw events deleted, sweep), 10 API tests (contract shape, deltas, ranges, open fixes per page, tenant isolation on every route, deleted sites, funnel CRUD/validation/audit, roles, CSRF), RLS invariants extended to the new tables, 4 component tests, and a new `e2e/insights.spec.ts` (empty state; seeded rollups → Overview, 30-day switch, Today week panel, funnel set-up, axe) on desktop and 360px.

**Decisions:**
- Days are UTC. Ethiopia is UTC+3, so a "day" ends at 03:00 local time; switching to Africa/Addis_Ababa days later means recomputing rollups, not changing the API.
- The 7-day range includes today so far (fresher numbers, slightly unequal comparison with a full previous week).
- One funnel per site (the architecture doc's `funnels` + `funnel_steps` became `site_funnels` with a validated jsonb step list).
- Vitals rollups keep raw values instead of per-day percentiles so p75 over 7 or 30 days stays exact.

**Not done yet:**
- A step-by-step funnel editor (the API takes custom steps; the UI only offers templates).
- Retention for rollup tables (they're small; they should follow the plan's retention with events).
- Wiring `rollupReportSource` into task 9's report job (do it when both are merged).
- Amharic review of the new strings.
- The first-load JS budget is at 215.9 KB of 216 KB (baseline `rebuild`: 215.7 KB).

## 2026-10-14 — Phase 2, slice 4 (session replay) ✅ (task 7)

**Shipped:**
- **SDK:** `r.js`, a separate lazy file (rrweb record 2.1.7, pinned). `p.js` asks the collector `GET /i/replay/cfg` once consent is granted and loads `r.js` only for sampled visits. **Core p.js: 4,087 → 4,243 B gzip (budget 5,120). r.js: 24.8 KB gzip** (budget 40 KB, never loaded for unsampled or unconsented visits).
  - Masked by default: all text and all inputs; `data-dxm-unmask` allowlist (never passwords), `data-dxm-block`; Meta URLs scrubbed like events.
  - `checkoutEveryNms` 5 min, gzip via `CompressionStream` (plain JSON fallback, gzipped by the collector), chunks ≤ 500 KB (split when bigger), monotonic `seq` per visit across page loads. The first snapshot ships after 1.5 s and page-hide chunks go out immediately as plain JSON, so short visits stay playable.
  - Stops on consent withdrawal and on 400/403/404/503 from the collector; `data-replay="off"` opts a site out.
- **Collector:** `POST /i/replay?k&vid&seq` with the same key, Origin and token-bucket checks as events (own buckets: 30/min per visit, 120/min per IP, 3,000/min per site), the streaming body limit (512 KB) plus an 8 MB inflate cap (gzip bombs), and an rrweb shape check. Blob first, then metadata is queued (`replay.chunk`); the blob is removed if queuing fails. Serves `/sdk/r.js`. Routes live under `/i/` so `/r/$token` stays the public report URL.
- **Storage (`@pulse/storage`):** `BlobStore` interface; `LocalDiskBlobStore` (atomic writes, id-only keys, no traversal) is what runs today. `S3BlobStore` (SigV4 via aws4fetch, path-style, presigned GETs) sits behind `BLOB_STORE=s3` + `S3_*`, so moving to R2/S3 is config only. `REPLAY_DIR` is required in production; the compose file mounts a shared `replays` volume.
- **Data (migration `0011_replays`):** `replay_chunks` (metadata only, PK site+visit+seq, forced RLS + policy, site/org composite FK, size and seq checks), `sites.replay_sample_rate` (0–1, default 1), `pulse_site_by_public_key` returns the rate, `pulse_purge_replay_chunks` (SECURITY DEFINER) for retention.
- **Worker:** `replay.chunk` records metadata idempotently (drops the blob if the site vanished); `maintenance.replay-retention` daily at 03:37 deletes rows then blobs past `REPLAY_RETENTION_DAYS` (default 30).
- **API:** `GET /api/v1/replays` (siteId, friction, fixId, page), `GET /api/v1/replays/:visitId` (summary, timeline marks from events, chunk URLs: signed when the store can, else the streaming route), `GET /api/v1/replays/:visitId/chunks/:seq`, `DELETE /api/v1/replays/:visitId` (owners/admins, audited, deletes blobs). Team-only (client viewers 403). Fixes now return `replayIds`: the evidence `sampleVisitIds` that have a playable replay.
- **Web:** Replays list and the site Replays tab are real (with an "only visits with friction" filter); the sample replays are gone. The player route has its own chunk with rrweb (62 KB gzip, not in first load; first load 215.8 KB, budget 216): sandboxed playback scaled to fit, timeline with page and friction marks, seek slider, speed, skip idle, "Play from the moment", clickable "What happened" list, prev/next, and "Back to the fix · clip n of m" when opened from a fix. The AI recap is hidden until task 10's AI flag.
- **Docs:** [06-replay-privacy.md](./06-replay-privacy.md) (consent, masking, storage, retention, visitor deletion). Caddy routes `/i/replay*` and `/r.js` to the collector, and the CSP allows `https:` images and fonts so replays show the customer's own assets.
- **Tests:** storage 18 (local + S3 against a fake), collector 12 new (limits, gzip bomb, tenant paths, sampling, rate limit, cleanup), worker 6 new (idempotency, cross-org FK, RLS, retention), API 6 new (filters, marks, streaming, tenant isolation incl. chunk route, roles, delete), SDK 7 new (masking options, seq across pages/visits, consent, splitting, early/at-hide flush). E2E `replays.spec.ts`: a real visit on the demo site is recorded in Chromium, the **stored chunks** are checked for leaks (typed phone number, masked personal details, key in URL), and it plays back in Pulse (desktop + 360px, axe clean). Playwright: 34 runs, all passing.

**Decisions:**
- Replay id = visit id (`?site=` disambiguates in the theoretical case of the same random id on two sites).
- Default sample rate 1 (every consented visit): pilot traffic is small and every recording is useful. Lower it per site as volume grows.
- No plan gating for replay yet (billing is slice 7); the sample rate is the control.
- Server-side events, not the recording, drive the timeline marks, so the list can filter on friction without opening blobs.

**Not done yet:**
- `S3BlobStore` is unit-tested against a fake but has not run against a real bucket.
- Delete-recording button in the player (the API exists), and a sample-rate control in site settings (API only).
- Fix detail still shows the sample "clip" story for sample fixes; real fixes link their replays.
- Amharic strings for the new replay screens need a native review.

## 2026-10-14 — Phase 2, slice 6 (client reports) ✅

Task 9 of parallel plan 2 (`task/9-reports`). Task 8 (site insights) hadn't started a branch yet, so this builds on `rebuild`; the report's site numbers sit behind a small interface that task 8's insight functions can plug into.

**Shipped:**
- **Data (`0013_reports`):**
  - `reports`: org, site, period (`YYYY-MM`, UTC calendar month), `source` (`auto` | `manual`), a frozen `snapshot` jsonb, `created_by`. The monthly job makes at most one `auto` report per site and month (partial unique index); people can make more.
  - `report_shares`: `token_hash` (SHA-256 hex, check-constrained to 64 hex chars, unique), `expires_at`, `revoked_at`, `created_by`. Links are revoked, never deleted (no DELETE policy).
  - Forced RLS + policies on both. Composite FKs: a report's site belongs to the report's org, a share's report to the share's org.
  - Two narrow `SECURITY DEFINER` helpers: `pulse_shared_report(token_hash)` (returns that one snapshot only while the link is unexpired, unrevoked and its site not deleted) and `pulse_report_candidates(from, to)` (sites visited in the month, for the job).
- **`packages/reports`:** period math, the pure snapshot assembler (unit-tested) and the DB builder. A snapshot holds: key numbers this month vs last (visits, page views, bounce rate, p75 LCP on phones), visits per 7-day bucket with fixes shipped per bucket, fixes shipped that month with **before/after** (friction events per day on that element: the 7 days before `fixed_at` vs up to 7 days after; "too early to tell" under a day), and the 3 most pressing open fixes for "next month". Under 30 visits (`REPORT_MIN_VISITS`) the report says "Not enough visits yet" instead of showing numbers. Numbers come from `ReportMetricsSource`; the default (`rawEventsSource`) reads `visits`/`events` directly. **Task 8: implement that interface over your rollups and pass it to `buildReportSnapshot` / `generateMonthlyReport`.**
- **Worker:** `reports.monthly` (04:23 UTC on the 1st) queues one `reports.site` per site visited last month (staggered over an hour, `singletonKey` site:period). `reports.site` builds and freezes the `auto` report inside the org's RLS scope; idempotent.
- **API:**
  - Authenticated (owners, admins, members; client viewers 403): `GET /api/v1/reports?siteId=`, `POST /api/v1/reports` (`{siteId, period}`; the current month makes a partial report; future months 400), `GET /api/v1/reports/:id` (snapshot + links), `POST /api/v1/reports/:id/shares` (`{expiresInDays}` 1–90, default 30; **the token is in this response only**), `DELETE /api/v1/reports/:id/shares/:shareId` (revoke; idempotent). Creating, sharing and revoking are audit-logged. Another org's ids are 404.
  - Public: `GET /api/v1/public/reports/:token`. No session. Returns `{ period, expiresAt, snapshot }` only. Unknown, malformed, expired, revoked and deleted-site tokens all get the same 404. Rate-limited per client IP (token bucket: burst 30, then 1 every 2 s; 429 + `Retry-After`), `Cache-Control: no-store`, `X-Robots-Tag: noindex`. Request logs write the path as `/api/v1/public/reports/:token`.
- **Web:** `/reports` lists real reports and has "Create report" (site + month). `/reports/$reportId` shows the report with a share panel: make a link (7/30/90 days, shown once with a copy button), see links with Active / Expired / Turned off, turn one off. `/r/$token` reads the public endpoint; unknown/expired/revoked links show the existing "expired" state. Snapshots are structured data, so the headline and every sentence are written in the reader's language (EN/AM). The weekly chart plots visits **per day**, so the month's short last week doesn't look like a collapse. Sample reports and `sampleReportsQuery` are gone from `sample.ts`.
- **Tests:** 12 unit tests (`packages/reports`), 4 web tests (report sentences in EN/AM, expired-link handling), 18 API integration tests (unknown/expired/revoked tokens rejected, only the token's own report, rate limit, tokens stored hashed, tenant isolation, roles, CSRF, frozen snapshots, log redaction), 5 worker tests, RLS invariants extended to the new tables. E2E: `prepare-db.ts` seeds a September report with `demo-september` / `demo-expired` / `demo-revoked` links (`platform.spec.ts` pins the seeded report), plus a create → share → open → turn off flow and axe scans of the report page (EN + AM).

**Not done yet:**
- Client-viewer access to reports inside the app (needs per-site sharing for viewers); they get share links for now.
- Agency logo/branding on reports, and a real PDF (Download PDF is still the browser's print).
- Before/after is only measured for click-friction fixes (rage/dead clicks); task 10's new kinds show "Too early to tell" until they get a measure.
- Amharic copy needs a native-speaker review.

## 2026-11-12 — Bundle reduction + CI upkeep ✅ (task 12)

Task 12 of parallel plan 3 (`task/12-bundle-ci`). No migration and no new strings.

**Shipped:**
- **First-load JS: 216.0 → 154.0 KB gz.** The plan asked for ≤190, and the long-term target in 03 §8 is 160. The CI budget goes from **216 to 156 KB** (measured + 2).
  - `@pulse/i18n/format`: a small ICU formatter for the subset our messages use. It replaces `i18next-icu` + `intl-messageformat` in the browser. A parity test compares it with `intl-messageformat` on every UI message in both locales. ICU outside the subset throws, so that test fails when a new message needs more. The server is unchanged.
  - The Better Auth client is out of the shell. It loads with the auth pages, and on demand to activate or switch organization and to sign out. These first two changes together: 216.0 → 191.8.
  - `@pulse/ui`: `Select`, `Modal` and `TextField` are separate modules, and the package is marked side-effect free. The organization switcher is a lazy chunk, shown only to people in more than one organization. Their current organization's name shows while it loads (→ 154.0).
  - Each route's full download (shell + route chunk + locale, gz) is smaller too: landing 231 → 170, sign-in 237 → 192, Today 240 → 193, site 279 → 260, settings 248 → 242, reports 246 → 226.
  - No package is bundled twice (checked from the source maps).
- **CI:** `actions/checkout` v4 → v7, `actions/setup-node` v4 → v7, `actions/upload-artifact` v4 → v7, `pnpm/action-setup` v4 → v6. All four run on Node 24; the versions come from each action's releases page, read on 2026-11-12. Both workflows now pin the runner to `ubuntu-24.04`.
- **Advisories:** `@sentry/node` 11.6 → 11.12 brings `glob` 14 and `minimatch` 11 on the production path, so `pnpm audit --prod` is clean. `happy-dom` 21.0.1 → 21.0.4 (dev only, used by the SDK tests) clears a high advisory.
- **Tests:** 34 new unit tests for the formatter (`packages/i18n`). One new e2e test: with one organization, its name shows and there's no switcher. With two, the switcher appears, passes axe when open, switches, and the choice survives a reload. Playwright: 46 runs pass against both the dev server and the production build (`vite preview`).

**Decisions:**
- A runtime formatter instead of compiling messages at build time. It saves the same bytes without a build step or a second message format, and the parity test keeps it honest.
- The budget counts what `index.html` loads (the shared shell), as before. Route chunks are reported in the PR, not budgeted.

**Not done yet:**
- One moderate `minimatch` advisory remains, on dev tooling only: ESLint's packages pin minimatch 10, and the fix is 11, a major version. It will go away when ESLint moves to 11.
- The legacy workflow (`ci.yml`) got the same action versions. It only runs for `main`, so it hasn't run from this branch.
- Further shell cuts would mean replacing the router (24 KB) or i18next (15 KB). Both are rewrites, not splits.
- The cloud sandbox couldn't download Playwright's pinned Chromium, so local e2e ran on the sandbox's pre-installed Chromium. CI runs the pinned build.

## 2026-11-12 — Data plumbing (task 14 of parallel plan 3) ✅

Branch `task/14-rollups`, migration `0016_data_plumbing`. Closes the rollup follow-ups that slices 3 part 2, 5 and 6 left open. Details in [insights.md](./insights.md) and [detection.md](./detection.md).

**Shipped:**
- **Rollups v2 (`0016`):** `rollup_site_day.pv_visits` (visits with a page view: JS-error exposure), `rollup_page_day.uturn_reached` / `uturn_turned` (counted by the detector's own `uTurnStats`), and `rollup_site_day.version`. A rollup is *complete* when it's the current version and was computed ≥ 3 h after its day ended (`ROLLUP_SETTLE_HOURS`); readers that need whole days only trust complete ones.
- **Backfill:** `insights.backfill` rebuilds every settled day that still has raw events and a missing, stale or old-version rollup, with the sweep's own `rollupDay`, per org under RLS. Candidates come from `pulse_rollup_backfill_candidates` (SECURITY DEFINER, ids and days only, deleted sites skipped). Idempotent: a second run finds nothing and changes nothing. Runs on every worker start (each deploy), daily at 03:47 UTC, and on demand (`pnpm --filter @pulse/worker backfill`, or `node dist/backfill.js` in a deploy).
- **Reports on rollups:** `rollupReportSource` (in `@pulse/insights/db`) reads complete rollups and falls back to raw events for partial days and days without one. The monthly job and "Create report" use it. `rawEventsSource`'s p75 now follows contract 21 (`floor((n-1)×p)`) instead of interpolating, so the two agree exactly (one API test's expected p75 moved from 2675 to 2600 for this reason).
- **Before/after for task 10's kinds:** reports measure form abandonment (visits that gave up on the form), slow pages (visits whose load was at or over the poor line), JS errors (visits that hit that error) and U-turns (visits that turned straight back), per day, the week before vs since the fix. `ReportMetricsSource.fixAffected` provides it (raw and rollup versions). EN + AM labels. Only tracking fixes stay "checked by the fix's own verification".
- **Verification on rollups:** `issue.verify` now measures whole UTC days (the 7 days before the fix day vs days 3–6 after; tracking keeps its exact 24 h) through `measureFixWindow`: page-view exposure from complete rollups, the problem's own rare events (taps, errors, form events, vitals) and any day without a complete rollup from raw events. No raw `pv` scan when rollups exist.
- **Retention:** `maintenance.retention` (daily 02:13 UTC). One exported `retentionDaysFor(org)` (`@pulse/insights`) returns the per-org default (`DATA_RETENTION_DAYS`, default 90, min 7) until billing sets it by plan. Per org, under that org's RLS: raw events and visits before the cutoff day are deleted; rollups are kept `max(retention, 400)` days (counts only, no visitor ids; reports compare months). Then `pulse_drop_empty_event_partitions` drops daily partitions past the shortest retention **only if empty**. `pulse_orgs_for_retention()` lists orgs and plans (ids only).
- **Insights:** `slow-2g` is its own network bucket ("Slow 2G" / "ቀርፋፋ 2ጂ") instead of folding into 2G.

**Tests:**
- Worker (Postgres, real ingest), `plumbing.test.ts`, 13 tests: backfill builds every settled day and a second run leaves every rollup row (including `computed_at`) identical; only missing/stale/old-version days are rebuilt and deleted sites skipped; the raw and rollup report sources give the **same snapshot** with none, all and half the days rolled up; the rollup source keeps its numbers with raw page views and visits deleted; verification measures the same from rollups as from raw (7 + 4 rollup days) and verifies with no raw page views left; fallback for an old-version day; another org's id measures nothing; boundary tests per new measure with both sources (window start/end instants, submitted vs abandoned, LCP at vs 1 ms under the poor line, LCP vs INP and other pages, error message/source, U-turn at 10 s vs 11 s, partial edge days) and "too early" just under one day after the fix vs measured at exactly one day; retention deletes whole days past org A's retention while org B's counts stay identical (also when A's purge removes everything), and an old partition holding org B's row is never dropped while an empty one is.
- Insights unit tests: U-turns per page at the time limit, settle/completeness boundaries, whole days, verification day windows, retention defaults/floor/cutoffs.
- Web: report measure labels for the new kinds in EN and AM. Config: `DATA_RETENTION_DAYS` default and floor. RLS invariants: the three new helpers are callable by the app role and not by PUBLIC.

**Decisions:**
- Verification windows moved to whole UTC days so rollups can answer them; the fix day itself is left out of both windows. The check is still due at `fixed_at + 7 days` (never before the after window ends).
- On rollup days a visit that crosses midnight counts once per day (exposure and U-turns). Equality tests use visits that don't.
- Raw retention defaults to 90 days for everyone until billing; the brief's 7/30/90 by plan is task 11's to switch on through `retentionDaysFor`.

**Not done yet:**
- Billing overriding `retentionDaysFor` by plan (task 11), and showing retention in Settings.
- Replays keep their own `REPLAY_RETENTION_DAYS` (30); if a plan's raw retention is shorter, replays should follow it too.
- The backfill candidate query scans `events` for distinct site-days; fine at pilot volume, but at scale it should look at partitions newer than the oldest settled rollup only.
- Merge note: `0016` is journal entry idx 15 with `when` 1791979544332. Task 11's `0015` must get a `when` greater than that, or drizzle will skip it on databases that already ran `0016`.
- Amharic review of the new strings ("Slow 2G" and the four report measure labels).

## 2026-11-12 — Notifications: Monday email, web push + installable PWA, Telegram webhook setup ✅ (task 15)

Task 15 of parallel plan 3 (`task/15-notify`, migration `0018`). Details: [notifications.md](notifications.md).

**Shipped:**
- **One quiet-hours rule** for Telegram and web push: `notification_settings` per org (migration `0018` moved the old per-chat hours there and dropped them from `telegram_links`), `quietUntil()` in `@pulse/mail/quiet-hours`, set by owners/admins in Settings (`PUT /api/v1/notifications/quiet-hours`, audit-logged). Boundary tests at start, end (exclusive), midnight wrap, one-hour windows and time zones.
- **Web push:** VAPID + aes128gcm on Node crypto (`@pulse/mail/push`, no new dependency), keys from env (`VAPID_*`; `pnpm --filter @pulse/api vapid:keys`). Endpoints limited to real browser push services. `push_subscriptions` per user and org under forced RLS, FK to the membership. API: `GET /api/v1/notifications`, `POST`/`DELETE /notifications/push`, `POST /notifications/push/test`. Worker `alert.push` sends created/escalated/reopened fixes in each person's language after quiet hours; gone subscriptions are deleted. Settings asks for browser permission only from the "Turn on for this device" button; with no keys it says "not configured".
- **Monday email:** `digest.sweep` (Mondays 04:13 UTC) → `digest.org` per org: fixes opened/fixed/verified last week, the top open fix, health per site with its change. No activity → no email. en + am. Per-member switch (`notification_prefs.weekly_digest`, `PUT /notifications/digest`) and a one-click unsubscribe (`/unsubscribe.html#token` page + `List-Unsubscribe-Post` to `POST /api/v1/public/digest/unsubscribe/:token`; GET does nothing). Retried jobs don't send twice (`last_digest_week`).
- **PWA:** manifest with PNG + maskable icons; `sw.js` caches the app shell only (never `/api`, the collector, other origins or non-GET) and shows push notifications (opens only our own pages). Registered from `boot.js` on built pages, so it isn't first-load JS. The unsubscribe page is its own Vite entry. Vite's modulepreload polyfill is off (all es2022 browsers support modulepreload), which kept the two entries from sharing a chunk. **First-load JS: 215.8 KB** (was 216.0).
- **Telegram webhook:** registered on API start (idempotent via `getWebhookInfo`; re-registers on a changed URL or 401s from a rotated secret; skipped without token, secret or an https `API_URL`; token and secret redacted from every result) and `pnpm --filter @pulse/api telegram:webhook [--force]`. The manual `setWebhook` step is gone from detection.md.
- Caddy serves `sw.js`, the manifest and `index.html` with `no-cache`.

**Tests:** mail 31 (push encryption round-trip through an independent decryption, VAPID signature, endpoint allowlist, quiet-hours boundaries); config 3; API 17 new (push configured/not, per-member and per-org isolation incl. RLS at the database, gone subscriptions, client viewers, quiet hours roles/validation/audit and the Telegram mirror, digest switch, one-click unsubscribe incl. GET no-op and log redaction) + 5 webhook registration tests + RLS invariants for the new tables and helpers; worker 12 (no-activity org gets no email, en/am content, top fix, health lines, retries, unsubscribe, sweep, push per member/language/quiet hours/gone/tenant scope); web 5 (service-worker routing, notification click stays on our origin, unsubscribe page); e2e `notifications.spec.ts` (manifest and icons, no API response in the SW cache, no permission prompt, digest and quiet hours save, unsubscribe flow, axe).

**Not done yet:**
- Push hasn't run against a real browser push service (no VAPID keys in e2e; the HTTP path is tested against a fake push service).
- Email is plain text (as before); an HTML template could come later.
- Amharic strings for the new screens and the digest need a native review.

## 2026-11-12 — Task 13: product gaps in the UI ✅

Parallel plan 3, task 13 (`task/13-ui-gaps`, migration `0017_ui_gaps`). Closes the "not done yet" UI items from slices 4, 5 and 6.

**Shipped:**
- **Delete recording:** owners and admins get "Delete recording" on the replay page, behind a confirm dialog (lazy). It calls the existing `DELETE /replays/:visitId` (audited, blobs removed) and now also deletes the recording's AI recap. Members and client viewers don't see the button (the API returns 403 anyway).
- **Replay sample rate:** a "Recording" panel in the site's Replays tab (lazy) with 100 / 50 / 25 / 10 % / off. Owners and admins change it through `PATCH /sites/:id`; everyone else reads it. Percentages go through `@pulse/metrics` (new `replay_sample_rate` ratio metric).
- **Funnel editor:** "Edit steps" / "Build your own" on the Overview's funnel panel opens a lazy dialog: name, add (up to 8), remove (down to 2), move up/down, and a page address or an event name per step. Template rules that aren't a page or an event (clicks, forms, extra pages) stay attached to their step as removable chips. A template is a starting point that replaces the draft. Saved through the existing `PUT /sites/:id/funnel` as `template: 'custom'`. Keyboard: every control is a native button or field, the moved step keeps focus (the other move button takes it at the top or bottom), and a polite live region says where the step went.
- **AI recap on the replay page:** shown only when `/public-config` says `aiEnabled`. `GET /replays/:visitId/recap` reads the cache; `POST` writes a recap on request ("Write a recap"), in the reader's language. Input = the server-side timeline (page views, clicks, form steps, errors) plus device facts; never the recording, never the visit id; visitor text is fenced in `<data>`. Cached per input hash in `ai_artifacts` (`kind = 'replay_recap'`), counted against the same per-org monthly budget as fix suggestions (`AI_MONTHLY_BUDGET`). States: disabled (no box at all), none, ready, over budget, unavailable (nothing stored when the model fails or answers off-shape).
- **Report branding:** Settings → Organization → "Report branding" (lazy): agency name and logo. The logo is uploaded as the raw body to `PUT /api/v1/branding/logo`: capped at 256 KB while streaming (413), type read from the bytes (PNG, JPEG, WebP; SVG and anything else 415), stored in the `BlobStore` under `orgs/{org}/branding/`, a fresh key per upload, old blob removed. Served from our origin with the stored type and `nosniff`. Reports (in the app and on `/r/$token`) show the logo and name (falling back to the snapshot's org name). The public page gets the logo from `/api/v1/public/reports/:token/logo`, which serves only that link's org logo (SECURITY DEFINER `pulse_shared_report_brand`, same expiry/revocation rules as the report). Another org's logo is never readable: the app route reads the active org's row under RLS.
- **Print:** "Download PDF" stays the browser's print. A print stylesheet sets A4 with 14/12 mm margins, drops the page chrome, keeps sections whole across pages, and the share page switches to the light theme while printing (and back after).
- **Fix detail:** no sample "clip" story was left (checked; nothing to remove).
- **`packages/ai`:** the Anthropic client moved here from the worker (the worker re-exports it), plus the recap's input shaping, prompt and parser.
- **Data (`0017_ui_gaps`):** `ai_artifacts` gains `site_id` / `visit_id` (issue id now nullable) with a subject check per kind, a `(site_id, org_id)` composite FK and a partial unique index for recaps; `org_branding` (forced RLS + policy, name and logo checks); `pulse_shared_report_brand(token_hash)` and `pulse_purge_orphan_replay_recaps()` (replay retention also drops recaps whose recording is gone). New error codes `payload_too_large` and `unsupported_media_type`.
- EN + AM strings for everything new (Amharic needs a native review).

**Tests:**
- API (`test/ui-gaps.test.ts`, 9): branding save/serve/replace/remove and audit; 413 at 256 KB + 1 byte, exactly 256 KB accepted, SVG/HTML/empty refused; another org never gets the logo; roles (members read, can't edit; client viewers out); CSRF on uploads; brand on report detail and public report; the share-link logo route serves only its org's logo and dies with the link; recap disabled with AI off (no model call), cache per language, fenced prompt with no visit id, budget shared with fix suggestions, nothing stored on bad output or provider failure, tenant isolation, client viewers 403, recap deleted with the recording; sample-rate PATCH bounds/roles/isolation. RLS invariants include `org_branding` and the two new helpers.
- Worker: replay retention removes orphaned recaps and keeps the rest. `packages/ai`: input shaping, fencing, parsing. Contracts: logo sniffing and the branding schema.
- Web: funnel editor model (every template round-trips), keyboard reorder keeps focus and announces, save payload, validation; sample-rate options; logo pre-checks.
- E2E `e2e/ui-gaps.spec.ts` (desktop + 360px, axe light and dark): delete recording (cancel keeps it, confirm deletes rows and logs it; no AI box with AI off), sample rate chosen by keyboard and persisted, the funnel editor driven by keyboard alone (reorder, remove, add, page/event switch, validation, save), report branding (size and type limits, the logo on the report and on the share link without a session, the org route closed to guests, A4 print in the light theme).

**Bundle:** every new dialog and editor is a lazy chunk. After merging `rebuild` (tasks 12, 14 and 15), first-load JS is 155.2 KB of the 156 KB budget in CI. On the pre-task-12 baseline the lazy chunks cost about 2 KB (218.0 KB of 216), because a dynamic import inside a route chunk makes the bundler split shared code out of the entry. The budget was left alone. Only 0.8 KB of headroom is left.

**Not done yet:**
- A real PDF renderer (print is still the browser's).
- AI recaps in Amharic depend on the model's Amharic; they need the same native review as AI suggestions.
- `S3BlobStore` still hasn't run against a real bucket (logos use the same store as replays).
- Amharic review of the new strings.

## Customer evidence
_(Add a line per pilot conversation: who, segment, pain, willingness to pay, quote.)_
