# 00 — Full Audit of DXM Pulse (as of 2026-10-04, commit 93ce7d9)

**Method:**
- Four parallel code audits: frontend, backend/data, SDK/privacy, tests/ops/docs.
- A live walkthrough of the running app (landing, audit tool, login, Overview, Dashboard, Sessions, Analytics, Reports) at 1440px and 375px, in English and Amharic.
- A live cross-origin browser test of the SDK against the production CORS config.
- A full run of the API test suite.

Every finding has file:line evidence. Paths are relative to the repo root unless noted.

---

## Executive summary

The codebase is **ambitious and broad**, and most of the underlying ideas are right: agency portfolio, Telegram, Amharic, ETB billing, AI briefs, shareable reports, a small SDK. But **the core data pipeline doesn't work in a real browser, and several screens show numbers that are wrong or invented.** The product has never been deployed and has never had a user. That is why none of this surfaced earlier.

**The five most important findings:**

1. **The SDK silently loses almost all data in production.**
   - It sends `sendBeacon` with an `application/json` Blob. That triggers a CORS preflight, and beacons always use `credentials: include`.
   - The ingest CORS answers `Access-Control-Allow-Origin: *` (`apps/api/src/app.ts:38-44`). Browsers reject a wildcard origin when credentials are included, so the POST is never sent. `sendBeacon` still returns `true`, and the SDK clears its queue (`packages/sdk/src/v2/transport.ts:74-85`).
   - The v2 XHR fallback adds an `x-dxm-sdk` header that the CORS config doesn't allow (`transport.ts:93`).
   - This was confirmed in Chromium. It went unnoticed because the only e2e test sets `navigator.sendBeacon = undefined` (`tests/e2e/dxm-local-smoke.spec.ts:108-123`).
2. **Client-facing numbers are wrong.**
   - **Bounce rate shows 1820.0%.** The API returns 0–100 (`apps/api/src/services/siteAnalytics.ts:341`) and the report multiplies by 100 again (`apps/web/src/lib/reportBuilder.ts:86`). I saw this live on `/reports`.
   - Report trends, top pages, and confidence come from **the 8 most recent sessions** (`siteAnalytics.ts:703` `LIMIT 8`) but are labelled "Last 7 days".
   - Web Vitals percentiles are computed over every raw LCP candidate and every individual layout shift, not one value per pageview.
   - Three different health and at-risk formulas give three answers on three pages. Live, the same workspace showed "54/100 · 4 open alerts" on Overview and "100/100 · no problems" on Dashboard.
3. **There are security holes that block launch.**
   - Unauthenticated SSRF in `GET /audit` (`apps/api/src/routes/audit.ts:43-75`).
   - Cross-tenant session and replay injection through a global `sessionId` (`apps/api/src/services/sessionTracking.ts:150-166, 327-394`).
   - There's no `trust proxy` setting behind Caddy, so every rate limit is global. Ten logins a minute would lock out the entire platform.
   - A ReDoS through funnel regexes (`apps/api/src/routes/funnels.ts:89`).
   - A Chapa `tx_ref` overwrite means a customer can pay and never get upgraded (`apps/api/src/routes/billing.ts:120-129` combined with `lib/workspaceSignals.ts:314-336`).
4. **Privacy posture fails Ethiopia's 2024 data protection law.**
   - Replay records all on-screen text in plaintext.
   - Raw URLs, including emails and tokens in query strings, are sent (`transport.ts:61`).
   - There is no consent mode, no visitor-data deletion, no retention limits, no privacy policy (the footer links point to `/` or `#`), and no DPA.
5. **Trust problems in the UI.**
   - Invented stats and testimonials appear on the login page (`apps/web/src/pages/LoginPage.tsx:7-50, 145-154`).
   - The landing page claims "30+ client sites on Starter" when the actual limit is 5, and "AI reports in Amharic" when reports are English-only.
   - The heatmap draws over a generic wireframe instead of the real page.
   - The "Hover map" actually renders scroll data.
   - The scroll depth bands are hard-coded.
   - "Live" indicators are always on.

**Verdict.** A rebuild is justified for the data layer, SDK, information architecture and design system. The domain logic is worth porting: the detectors, token discipline, the report field whitelist, the AI fallback pattern, and the install UX (see each section's **Keep** list). Separately, a short **hotfix list** (below) would make the current app safe enough to run real pilots now.

---

## Scorecard

| Area | Grade | One-line reason |
|---|---|---|
| Product & UX | **D+** | Five overlapping "home" pages, nothing scoped to a site, onboarding dead ends, and internal strategy notes shipped as UI copy |
| Visual design | **C−** | Pleasant at a glance, but three neutral scales, a broken primary color ramp, 61 one-off arbitrary values, no type system, no Ethiopic font, no dark mode |
| Frontend architecture | **D+** | No data layer (no cache, no abort, no 401 handling), 7 pollers that never pause, god-components (Settings 891 LOC), and `tsc` silently checks 0 files while 10 real errors hide |
| Backend architecture | **C** | No controller/repository layers, SQL inside routes, logic triplicated (vitals, bounce, rage clicks), hanging async handlers |
| Data layer | **D+** | No tenant columns on `events`, no retention, replay JSON in the main SQLite file, migrations split on `;`, two migration paths that disagree, FKs without cascade |
| Ingestion & SDK | **F** (delivery) / **C+** (design) | Data is silently lost (finding 1). Synchronous detectors run on every request. Ingest is abusable. Cross-tab queue corruption. |
| Auth & security | **D** | No refresh endpoint (forced logout every 15 minutes), one workspace per email, uneven role gates, SSRF, cross-tenant injection, global rate limits |
| Billing | **D** | A single payment grants a plan forever. No verify call, no amount check, no payments ledger. `tx_ref` overwrite bug. |
| AI | **C** | Good fallback pattern, but the cache key includes volatile fields (an LLM call on almost every view), no timeouts or budgets, unvalidated JSON, and briefs are English-only |
| Privacy & compliance | **F** | See finding 4 |
| Performance | **B−** (web) / **D** (SDK on host sites) | Route splitting and lazy rrweb are good. The SDK does synchronous localStorage writes on every scroll pixel, leaks listeners, and its first replay chunk is 290 KB uncompressed. |
| Accessibility | **D** | 2 of 35 labels are associated with inputs, the login submit button has no accessible name, modals have no focus management, hover-only actions, color-only status |
| i18n / Amharic | **D** | 43 of 61 TSX files are untranslated, `<html lang>` is always `en`, there's no Ethiopic font, glitched strings (`onboarding.step2.copy` = "ክፍፍፍፍ ቅዳ"), and in Amharic mode the Reports page is entirely English |
| Tests | **B−** | 138 green API integration tests that encode real contracts. 0 web tests, 0 SDK tests, e2e not in CI, one test that proves nothing (`reports.share`). |
| CI / Ops | **C / D** | CI has no lint, typecheck or e2e. Never deployed. Backups unscheduled and never restore-tested. No uptime monitoring. 1 critical and 12 high `npm audit` findings. |
| Docs | **C+** | Plenty of docs, but they contradict the code and each other (pricing 499 vs 1,490, "no LLM" vs Claude, test counts). UAT was never run. |

---

## 1. Product & UX — D+

**Information architecture**
- Overview, Dashboard, Clients, Reports and the "AI Portfolio Brief" link all overlap. The sidebar's "AI Portfolio Brief · NEW" just links to `/overview` again (`apps/web/src/components/Navigation.tsx:128-143`).
- Each page has its own health logic: Overview `HealthBar` uses 70/50, Dashboard `SiteHealthScore` uses 70/40, and Clients uses `healthScore<55 || openAlerts>0` (`ClientsPage.tsx:80`).
- The home route is inconsistent: login goes to `/overview`, the 404 page goes to `/dashboard`, and a logged-in user at `/` sees the marketing page.

**Nothing is scoped to a site (the core flaw for an agency product)**
- Sessions, heatmaps, user flow, dashboard and funnels all mix every client's data together.
- The funnel builder POSTs without a `siteId` (`FunnelBuilder.tsx:94-98`).

**Dead ends**
- "Watch" goes to `/sessions/:id`, but the replay view only reads `?sessionId=`.
- Analytics tabs and Settings sections can't be deep-linked.
- A Free user with one site who hasn't installed yet gets sent to onboarding, then hits the site-limit wall.
- Signup promises "See live replay" as step 3, but replay is paywalled on Free.

**The Free-plan Dashboard is broken.** `Promise.all` includes `/alerts`, which returns 403 on Free (`DashboardPage.tsx:54-59`). The initial load fails and the error banner never clears.

**Copy**
- Internal notes are shipped as UI text:
  - "dashboard starts earning trust" (`RecommendedActions.tsx:70`)
  - "Billing stays honest in this milestone" (`SettingsPage.tsx:769`)
- Jargon: "operational command center", "proof-of-value conversations".

**Live contradictions (walkthrough)**
- Overview says "monitoring 0 client sites live", "Nothing risky right now", "At risk: 1", "4 open alerts", and a "high" top risk, all on one screen.
- Sessions from March 2026 still show "Recording" seven months later, because sessions are never closed server-side.
- The seeded demo data has aged out (0 sessions in 7 days), so a sales demo looks dead.

**Mobile**
- The first phone screen is a decorative hero.
- The bottom bar is icon-only and omits Alerts and Reports.
- There's no logout or language toggle on mobile.
- Ask Pulse sits underneath the nav bar.
- Several headers don't wrap at 360px.

**Keep**
- Install UX: platform tabs, auto-verify polling with timeout, "Waiting for first session / Tracking live" banners.
- Share-link flow: copy-once, expiry, revocable list.
- The ReportView narrative structure: Key Takeaways → Priority Action → KPIs with trend badges and Confidence.
- Optimistic alert resolve with rollback.
- Delete-site blockers explanation.
- UpgradeGate plus upgrade-source instrumentation.
- Funnel templates.
- JourneyMap.
- The public site audit as a lead magnet.

## 2. Visual design — C−

**Tokens and scales**
- The primary ramp jumps from `#22c55e` (500) to `#166534` (600) (`apps/web/tailwind.config.js:13-14`).
- Three neutral scales are in use: `surface` ×1128, `gray` ×276, `slate` ×107.
- There are 20 hard-coded hex values and 61 distinct arbitrary values, such as `rounded-[28px]` ×73 and `text-[10px]` ×47.
- Some classes generate no CSS at all (`h-4.5`, `safe-area-inset-bottom`).

**Typography and theming**
- No webfont is loaded, and no Ethiopic font.
- Labels are 10–11px uppercase with letter-spacing, which is unreadable for Ge'ez script.
- No dark mode.

**Components**
- No shared primitives: spinner markup is copy-pasted in 8 files, and severity maps and `evidenceToneClasses` are each duplicated 3–4 times.

**Brand color**
- Green is used as both the brand color and the "healthy" color, so status signals blur.
- **Proposal:** see `02-design-system.md` and `design-system.html`.

## 3. Frontend architecture — D+

**Type checking**
- `tsc --noEmit -p .` checks **zero files**, because `tsconfig.json` has `"files": []` with project references.
- `tsc -p tsconfig.app.json` reports 10 errors. Two of them are runtime bugs:
  - The replay scrubber never advances, and Pause→Play restarts from 0 (`ReplayPlayer.tsx:259-299`).
  - The Hover map renders scroll data (`HeatmapCanvas.tsx:17,31,92`).

**Data fetching**
- A thin `fetchJson` wrapper with no cache, dedupe or abort, plus 11 raw `fetch` calls that bypass it.
- No 401 handling.
- Errors are read inconsistently: `payload.error` vs `err.message`.

**Polling**
- Sessions every 5s with no pagination.
- Heatmap full dump every 15s.
- Billing every 5s with no limit.
- None of them pause when the tab is hidden.

**Stale closure.** The 5s poll re-selects the deep-linked session, overriding whatever the user clicked (`SessionReplaysView.tsx:112-123`).

**Size and dead code**
- God-components: SettingsPage (891 LOC, 20 `useState`), BillingPage (773), ClientDetailPage (696, 15 `useState`).
- About 770 LOC of dead code (AlertPanel, PerformanceCard/Gauge, FunnelChart/Stats, `data/demoData.ts`).
- `public/test.html` ships to production.

**Keep**
- Route-level lazy loading with in-shell Suspense.
- Dynamic import of rrweb.
- The AuthContext version-ref race guard.
- Ask Pulse panel accessibility (dialog role, Escape, focus on open).

## 4. Backend architecture — C

**Layering**
- `controllers/` is empty. SQL lives directly in routes: the funnel algorithm (`routes/funnels.ts:49-134`), analytics, and the Chapa client.
- `services/siteAnalytics.ts` is 1,022 LOC, including about 250 lines of hard-coded report copy.

**Duplicated logic**
- Vitals percentiles: 3 implementations with different index math.
- Bounce: 3 implementations with different windows.
- Rage/U-turn detectors: 2 copies.
- MCP tools vs Ask Pulse tools: near-copies.
- Four copy-pasted brief getters, two Anthropic clients, two Telegram senders.

**Errors and config**
- Error shapes are inconsistent (`{message}` vs `{error}`, `detail` vs `details`). Casing is mixed (`billing_status`).
- Express 4 async handlers have no error wrapper, so a throw hangs the request (e.g. `POST /alerts` without `type`).
- `process.env` is read ad hoc in 15+ places, and the `WEB_ORIGIN` default is repeated in 5 files.
- `packages/contracts` is hand-written `.js` + `.d.ts`, imported via `../../../../packages/contracts/index.js`.

**Keep**
- Friction detector thresholds (listed in `05-behavior-contracts.md` §32).
- Session-context compression for LLM prompts (`ai/sessionSummaryContext.ts:231-259`).
- Vitals classification.
- Journey normalizer.
- Insights lifecycle: dedup, auto-resolve, 6h cooldown.
- Deterministic AI fallback.
- Hand-rolled MCP handler.
- Zod-to-contract compile-time assertions.

## 5. Data layer — D+

**Schema and indexes**
- 18 tables (`apps/api/src/db/schema.sql`).
- `events` has **no `workspace_id`/`site_id`**, so per-site detectors scan every tenant's recent events (`alertEngine.ts:88-98`).
- 6 indexes sit on the hottest write table, and several are redundant.
- `events.value_text` packs typed data into strings (`"LCP:2300"`, `"formId|field|msg"`).

**Retention.** None. Nothing is ever deleted. Replay is stored as JSON TEXT in the main DB, at about 100 KB per session.
- At 50 sites × 10k sessions/day, that's roughly 50 GB/day of replay plus 12–15 GB/day of events.
- Even at real plan caps (Pro = 50k sessions/month), growth is unbounded.

**Replay chunk overwrite.** The SDK uses `chunkIndex = floor(total/50)`, which resets on reload. The server does `ON CONFLICT DO UPDATE`. Together, partial flushes overwrite earlier chunks, including the full snapshot, so the replay becomes unplayable (`packages/sdk/src/replay/index.ts:55`, `sessionTracking.ts:386-393`).

**Migrations**
- `schema.sql` is split on `;`.
- `index.ts` and `migrate.ts` apply different ALTER sets, and `migrate.ts` is never run by the deploy.
- Errors are swallowed, and the server boots on a stale schema.
- `schema.sql` is incomplete (`chapa_tx_ref` only exists via the boot path).

**Foreign keys.** No `ON DELETE` on `sessions.site_id`/`workspace_id`, so sites and workspaces can't be deleted once they have data. There's no account deletion endpoint either.

**Timestamps.** Mixed: `CURRENT_TIMESTAMP`, ISO strings, and client epoch ms (client clocks drive `started_at`).

**Units.** Not typed. Rates are 0–1 in some places, 0–100 in others, and `toFixed` strings in others. That's the root cause of the 1820% bug.

## 6. Ingestion & SDK — F (delivery) / C+ (design)

**Delivery** (see finding 1)
- Verified live: v1 and v2 beacons never POST cross-origin, the v2 XHR is blocked, and replay chunks over 64 KB are dropped.
- The offline handler stops the flush interval and never restarts it (`transport.ts:106-114`).
- The queue is shared across tabs but the session id is per-tab, so sessions get mixed.
- An in-flight XHR clears events that were pushed after it started.
- No backoff on 403 or 429.

**Host-site cost**
- Synchronous localStorage read-modify-write on every scroll pixel.
- A per-click `beforeunload`/`hashchange` listener leak.
- A whole-body MutationObserver on every click.
- rrweb is bundled eagerly in the replay script (24 KB gz).
- The first replay chunk was 290 KB uncompressed.

**Accuracy**
- Dead-click false positives (checkboxes, `target=_blank`, `<select>`).
- `navigation` fires on every `replaceState`.
- Custom event props are dropped server-side.
- v1 uses `Object.assign` with an ES5 target, so it crashes on the old WebViews it was meant to support.

**Abuse**
- The site key is public and Origin is never checked.
- The quota can be exhausted in about a minute.
- The per-site limiter (200 per 10s, all visitors combined) starves sites with ~200+ concurrent visitors.
- Replay ingest is ungated and bypasses the quota.
- The 5 MB body limit combined with `z.any()` is a disk-fill vector.
- Detectors run **synchronously** in the request (about 15 aggregate queries per `/collect`, and the "async" comment at `collect.ts:73-75` is false).

**Build**
- Each SDK bundle includes the entire `packages/contracts` module, about 0.7 KB gz of pricing catalog shipped to every visitor.
- The v1 "byte-frozen" promise isn't enforced, since `dist` is gitignored and rebuilt.
- The v2 snippet in Settings drops `data-api-url`.

**Keep**
- Tiny dependency-free core with a gzip budget gate.
- Offline-first queue concept with flush on `pagehide`/`visibilitychange`.
- Passive listeners.
- No cookies, no persistent visitor id, no IP storage.
- Form events record names, never values.
- `maskAllInputs` on replay.
- Zod ingest schema.
- Separate ingest CORS.
- Chunked replay table concept.

## 7. Auth & security — D

**Auth**
- There is no `/auth/refresh`. The 15-minute access token hard-logs users out, and the refresh cookie is never used.
- Logout and reset don't revoke issued tokens.
- `users.email` is globally UNIQUE, so one person can only belong to one workspace. This blocks agencies outright.
- Signup doesn't lowercase emails. Login timing reveals which emails exist.
- bcryptjs is at cost 10 and silently truncates passwords at 72 bytes.

**Roles.** Viewers can create manual alerts (which fire Telegram and email), resolve alerts, and start payments.

**Logging.** Raw tokens leak into request logs via `originalUrl`. `mailer.sentMails` grows in memory forever, holding reset links.

**Vulnerabilities by severity**

| Sev | Issue | Evidence |
|---|---|---|
| High | SSRF: unauthenticated server-side fetch of any URL, including `169.254.169.254` and localhost. Follows redirects, unbounded body. | `routes/audit.ts:43-75` |
| High | Cross-tenant session/replay injection via global `sessionId` (session ids are exposed in public reports) | `sessionTracking.ts:150-166,327-394`, `publicReports.ts:93` |
| High | No `trust proxy`, so all IP rate limits are global (login lockout DoS) | `app.ts` (0 occurrences) + `ops/caddy` |
| High | ReDoS: a user-supplied `new RegExp` runs against attacker-controlled URLs on the only thread | `routes/funnels.ts:89` |
| High | Paid-but-not-activated (`tx_ref` overwrite), no verify call or amount check | `routes/billing.ts:120-129` |
| Med | Quota exhaustion and disk-fill via the public site key | `collect.ts:56`, `app.ts:91` |
| Med | Unvalidated `siteId` on alerts/funnels leaks foreign site names | `alerts.ts:121-141` |
| Med | Telegram bot tokens stored in plaintext. Prompt injection from tracked-site text into AI briefs. | `settings.ts:223`, `alertEngine.ts:121` |
| Low | `/ask` leaks `err.message`. Admin route has no rate limit. Seed demo credentials have no production guard. Unvalidated `x-request-id`. | |

**Dependencies.** `npm audit --omit=dev` reports 26 issues (1 critical, 12 high). The `apps/api` dependencies wrongly include `npm`, `run` and `migrate`, and `morgan` is unused.

**Keep**
- 32-byte tokens, sha256 at rest, single-use, expiring, revocable (reset, invite, share).
- Peppered API-key hashes with a display prefix.
- Uniform 404 for foreign resources.
- Public report field whitelist.
- Fail-closed dashboard CORS.

## 8. Billing — D

- A single payment grants a plan forever: there are no periods, renewal, expiry, `past_due` handling, or receipts.
- There's no payments ledger, and Chapa's `ref_id` isn't stored.
- `callback_url` points at the POST webhook, but Chapa's callback is a GET.
- The dual-header signature rule needs checking against Chapa's docs.
- Plan gates are missing on report shares, journeys, AI, API keys and seats.
- Pricing is inconsistent: the SDLC docs say 499/1,499 ETB, while the code and landing page say 1,490/3,490.

## 9. AI — C

- Single-shot JSON prompts are parsed with a regex plus `JSON.parse`, with no schema validation, so malformed output gets cached for 24h.
- **The cache is defeated:** the context hash includes `lastActivityAt` and `latestSession`. Any active site triggers an LLM call on nearly every view, and the call blocks the HTTP response.
- No per-call timeout (the SDK default is ~10 minutes with 2 retries), no stampede guard, no per-workspace budget, and no plan gate.
- Visitor-controlled strings flow into prompts without any "untrusted data" framing.
- Only Ask Pulse and the digest produce Amharic. Briefs, recaps, alerts and reports are English-only.
- **Keep:** deterministic fallback everywhere, the stable input hashing pattern, and the bounded tool loop with citations.

## 10. Privacy & compliance — F

- Replay records all visible text, so emails and phone numbers appear in plaintext. This was confirmed in a captured chunk.
- `metadata.url` is sent unscrubbed. The scrubber matches keys against the regex *source text*, so it over-redacts short keys and misses `access_token`, `otp`, `code`, phone numbers and fragments.
- No consent mode and no DNT or GPC support.
- No visitor or session deletion, and no retention purge.
- Raw `identify` ids are stored.
- No privacy policy, DPA, or sub-processor list. Data goes cross-border to Anthropic and Sentry with no disclosure.
- No DPIA has been done for session replay.

## 11. Accessibility — D

- 49 form controls but only 2 `htmlFor` labels. The login submit button has no accessible name (seen live). The audit URL input has no label.
- Only 11 `aria-label`s and 3 `role`s in the whole app. Modals have no dialog role, Escape handling or focus trap.
- The "Watch" action only appears on hover (`opacity-0 group-hover`).
- Status is shown by color alone. The heatmap canvas has no text alternative.
- Heading order is broken (Dashboard has no h1, Overview has two).

## 12. i18n / Amharic — D

- The locale files have 328 keys at parity, but only 156 are used. 43 of 61 TSX files have no i18n, totaling roughly 600+ hard-coded strings.
- Navigation is hard-coded English. The public report sent to clients is English-only.
- `<html lang>` never changes. There's no Ethiopic font. Dates use the browser locale.
- The quality issues need a native reviewer:
  - glitched string `onboarding.step2.copy` = "ክፍፍፍፍ ቅዳ"
  - literal "bounce rate" = "የማስወጣት መጠን"
  - "session" = "ክፍለ ጊዜ"

## 13. Tests, CI, ops, docs

**Tests and CI**
- 37 files and 138 tests pass in 37s. The behavior they encode is captured in `05-behavior-contracts.md`.
- The `reports.share` cross-site test is vacuous: it ends up hitting `/sites/undefined/...`.
- CI runs install, build and API tests only. It has no lint, `tsc`, e2e, `npm audit` or deploy.

**Ops**
- Never deployed, and `main` is 1 commit ahead of origin.
- Backups are unscheduled, not off-host, and restore has never been tested.
- No uptime monitoring.
- `systemd` units have no hardening, and Caddy sends no CSP or security headers.
- The API reads `src/db/schema.sql` at runtime, so production needs the full repo checkout.

**Repo hygiene**
- `claude-skills/` is a broken gitlink (no `.gitmodules`).
- A tracked empty `dxm.db`.
- Dead code in `apps/api/archived/legacy-file-api`.
- `.replit` contains weak dev secrets, and its setup conflicts with the VM plan.

**Docs.** The SDLC docs are stale (pricing, "no LLM", test counts). The UAT has 52 scenarios that were never executed. The `docs/qms` documents are generic boilerplate.

---

## Hotfix list: make the *current* app pilot-safe (about 2–4 days)

The product brief recommends starting pilots before the rebuild lands. If you approve that, these are the minimum fixes, in order.

1. **SDK delivery:**
   - Send `text/plain` via `fetch(..., {keepalive:true, credentials:'omit'})`, falling back to `sendBeacon` with a `text/plain` Blob.
   - Parse `text/plain` on `/collect`.
   - Allow `x-dxm-sdk` in ingest CORS.
   - Only clear the queue on confirmed delivery.
   - Restart the interval when the browser comes back online.
2. **Number correctness:** fix `formatPercent` double-scaling, compute report stats from full 7-day aggregates instead of the last 8 sessions, and use one health score.
3. **Security:**
   - Add `app.set('trust proxy', 1)`.
   - Make `/audit` reject private, link-local and loopback IPs after DNS resolution, disallow redirects to them, and cap body size.
   - Bind sessions to `site_id` at ingest.
   - Replace funnel regex with glob or prefix matching.
   - Generate a fresh upgrade request per `tx_ref`.
   - Call Chapa verify and check amount and currency.
4. **Auth:** add `/auth/refresh` (rotate the refresh token, check its hash) and silent refresh in the web client.
5. **Privacy minimum:**
   - Turn on `maskAllText` in replay by default.
   - Scrub `metadata.url`.
   - Write a real privacy policy and pilot DPA.
   - Add a 30-day retention purge job.
6. **Trust:** remove the fabricated login stats and testimonials, fix the landing claims (site limits, Amharic AI), remove "Ethiopia's first…", and point footer links at real pages or remove them.
7. **Free Dashboard:** don't fetch `/alerts` on Free (or use `allSettled`).
8. **Ops:** push to origin, deploy to a VM per `docs/production-deployment.md`, schedule off-host backups, set up an uptime check, configure Sentry.
