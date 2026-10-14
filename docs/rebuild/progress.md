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

**The sample layer: `apps/web/src/lib/sample.ts`**
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

## 2026-10-12 — Phase 2, slice 3, part 1 (fix detection v1: click friction) 🟡

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

## Customer evidence
_(Add a line per pilot conversation: who, segment, pain, willingness to pay, quote.)_
