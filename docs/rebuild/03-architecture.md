# 03 — Target Architecture

Status: proposal for approval (Phase 1). Each major decision has a record in [`adr/`](./adr). Constraint that shapes everything: **one founder must be able to run it.** That means a single VM, boring technology, no Kubernetes, no Redis, and no microservices beyond what the ingest path physically requires.

## 1. System overview

```
                         ┌──────────────── customer website / Telegram Mini App ────────────────┐
                         │  <script async src="https://cdn.dxmpulse.et/p.js" data-site="…">     │
                         │  SDK v3 core ≤5 KB → text/plain POST (keepalive, credentials:omit)   │
                         └───────────────────────────────┬──────────────────────────────────────┘
                                                         │  /i  (ingest)
┌────────────┐   ┌─────────────┐   HTTPS   ┌─────────────▼─────────────┐
│ Marketing  │   │  Web app    │ ────────▶ │          Caddy            │  TLS, static, security headers, CSP
│ (Astro,    │   │ (React SPA, │           └──┬──────────┬──────────┬──┘
│  am/en)    │   │  PWA)       │              │          │          │
└────────────┘   └─────────────┘              │/api      │/i        │/sdk  (immutable, versioned)
┌────────────┐                         ┌──────▼─────┐ ┌──▼────────┐ │
│ Expo app   │ ─────── /api ─────────▶ │  api       │ │ collector │ │
│ (slice 8)  │                         │ Hono+Zod   │ │ Hono, tiny│ │
└────────────┘                         │ OpenAPI    │ │ validate→ │ │
┌────────────┐  webhook                └──┬───┬─────┘ │ enqueue   │ │
│ Telegram   │ ──────────────────────────▶│   │       └──┬────────┘ │
│ (grammY)   │ ◀──────────── worker ──────┼───┼──────────┤          │
└────────────┘                            │   │          │          │
                                   ┌──────▼───▼──────────▼───┐   ┌──▼──────────────┐
                                   │  PostgreSQL 16          │   │ Object storage  │
                                   │  app tables (RLS)       │   │ (S3-compatible) │
                                   │  events_* (daily parts) │   │ replay chunks   │
                                   │  rollups_*              │   │ page snapshots  │
                                   │  pg-boss job queue      │   │ report PDFs     │
                                   └──────────▲──────────────┘   └─────────────────┘
                                              │
                                   ┌──────────┴──────────────┐      external: Anthropic (AI), Chapa (pay),
                                   │  worker (pg-boss)       │      Resend/Postmark (email), Expo push,
                                   │  ingest-apply, detectors│      Sentry, uptime checks
                                   │  rollups, AI, digests,  │
                                   │  reports, retention,    │
                                   │  billing renewals       │
                                   └─────────────────────────┘
```

Processes: `api`, `collector`, `worker` (Node 22 LTS), `postgres`, and optionally `minio` for in-country object storage. All of it runs from one Docker Compose file behind Caddy.

## 2. Repository layout (`next/`, pnpm + Turborepo)

```
next/
  apps/
    web/          React 19 + Vite + TanStack Router/Query + React Aria + Tailwind v4 (PWA)
    site/         Astro: marketing, docs, public Site Health Check, legal pages (am/en)
    api/          Hono: REST + OpenAPI, auth, billing webhooks, Telegram webhook
    collector/    Hono: ingest only. Validate → enqueue. No DB reads on the hot path except a cached site lookup.
    worker/       pg-boss consumers: ingest-apply, detectors, rollups, AI, digests, reports, retention, renewals
    mobile/       Expo (slice 8): Today feed, fix detail, push, report share
  packages/
    contracts/    Zod schemas for every API request/response and ingest payload. One source of truth; generates OpenAPI + TS types.
    metrics/      Metric registry: id, unit (ratio | percent | ms | count | score), "isUpGood", formatter(locale), thresholds. All UI, reports, AI and Telegram format through this.
    db/           Drizzle schema + SQL migrations + RLS policies + seed (realistic Ethiopian demo org)
    detectors/    Pure functions: (window of events) → Fix candidates. Unit-tested with fixtures. Ported thresholds from 05-behavior-contracts §32.
    ai/           Prompt templates, output Zod schemas, model routing, budget accounting, eval fixtures
    i18n/         ICU messages (en, am), Ethiopian calendar + clock utils, glossary
    tokens/       Design tokens → CSS vars, Tailwind theme, React Native constants
    ui/           Web component library (React Aria + tokens); Ladle stories
    sdk/          SDK v3 (core, replay, vitals, consent, mini-app adapter) + legacy v1/v2 shims
    api-client/   Typed client (generated from contracts) shared by web + mobile + bot
    config/       Env schema (Zod); fails fast at boot with a readable error
    testing/      Factories, test DB harness, Playwright fixtures, axe helpers
```

## 3. Data model (core)

Every tenant-owned row carries `org_id`. Postgres RLS policies enforce `org_id = current_setting('app.org_id')`, and a request-scoped transaction sets that setting. The repository layer adds explicit filters as defense in depth.

| Table | Notes |
|---|---|
| `users`, `accounts`, `sessions`, `verifications` | Better Auth (ADR-004). Email is unique per user, and a user can have many memberships. |
| `orgs`, `memberships(org_id,user_id,role)` | Roles: `owner`, `admin`, `member`, `client_viewer` (scoped to `site_ids[]`). |
| `sites` | `org_id`, `domain`, `public_key`, `allowed_origins[]`, `platform`, `status`, `deleted_at` (soft delete → purge job). |
| `visits` (was sessions) | `site_id`, `org_id`, client id + server receive time, device/network/country, entry/exit, counters, `ended_at` (closed by worker after 30 min idle). |
| `events_YYYYMMDD` | Partitioned by day. Columns: `org_id`, `site_id`, `visit_id`, `ts_client`, `ts_server`, `type`, `url_path`, `props jsonb`. BRIN on time, btree on `(site_id, type, ts_server)`. Dropped by retention. |
| `vitals` | One row per pageview per metric (final value), so percentiles are correct. |
| `replay_chunks` | Metadata only: `visit_id`, `seq`, `bytes`, `object_key`. The blob lives in object storage, gzip-compressed. |
| `rollup_site_hour`, `rollup_page_day`, `rollup_funnel_day` | Computed by the worker. All dashboards read rollups, never raw events. |
| `issues` (Fix cards) | `site_id`, `kind`, `fingerprint`, `severity`, `status` (open/fixing/fixed/verified/dismissed), `evidence jsonb`, `impact jsonb`, `first_seen`, `last_seen`, `fixed_at`, `verified_at`. |
| `issue_events` | Status history (who changed what, when) for the audit trail and reports. |
| `funnels`, `funnel_steps` | Steps match on path glob, event name, or element selector. No user regex. |
| `reports`, `report_schedules`, `report_shares` | White-label config, cadence, recipients, tokenized links (sha256 at rest). |
| `notification_channels` | Telegram chat links, email, push tokens. Secrets encrypted with a KMS-style app key. |
| `plans` (code), `subscriptions`, `invoices`, `payments` | Ledger. Each Chapa attempt is a row with a unique `tx_ref`, a verify result, amount, and currency. |
| `ai_artifacts` | Cache keyed by a hash of **stable** inputs, plus token usage and cost. Feeds per-org budgets. |
| `audit_log` | Security-relevant actions (role change, key creation, export, delete, plan change). |
| `api_keys` | Peppered sha256, prefix, scopes, expiry. |

**Units rule.** Ratios are stored as 0–1 `double precision`. Durations are stored as integer ms. Money is stored as integer santim with an ISO currency. Only `packages/metrics` formats them. A lint rule bans `* 100` in UI code.

## 4. Key flows

**Ingest (hot path, target p99 < 50 ms)**
1. The SDK POSTs `text/plain` JSON to `/i`. No preflight, no credentials.
2. The collector looks up the site by public key (LRU cache) and checks `Origin` against the site's `allowed_origins` (with a "verify domain" step during install). It applies per-visit and per-site token buckets and a size cap (64 KB events, 512 KB replay chunks), validates against the Zod contract, and returns `204`.
3. The collector enqueues `ingest.apply` (pg-boss) with the validated batch. Replay chunks are written straight to object storage (`orgs/{org}/sites/{site}/visits/{visit}/{seq}.json.gz`), and only metadata is enqueued.
4. The worker applies batches in transactions. It upserts the visit (binding visit → site; a mismatch rejects the batch), inserts events, and updates counters. **Detectors never run here.**

**Detection (every 2 minutes per active site, staggered)**
- The worker loads the window since the last checkpoint from `events` for **that site only**, runs the pure detectors, and upserts `issues` by fingerprint.
- New or escalated issues trigger notifications (Telegram, push, email) according to preferences and quiet hours.
- A separate "tracking broken" check fires when a verified site gets no events for N hours (impossible in today's design).

**Fix verification**
- When an issue is marked `fixed`, the worker compares the same detector metric over 3–7 days after the fix against the 7 days before.
- With enough signal, the issue moves to `verified` with a before/after figure that reports can cite.

**AI**
- Recommendations are generated per issue (cached by fingerprint + evidence hash). Weekly and monthly narratives are generated per report run.
- All calls go through `packages/ai`, which handles model routing, timeouts (20s), retries (1), output validation (Zod), per-org monthly budget checks, and a deterministic fallback. Untrusted visitor text is passed only inside clearly delimited data blocks.

**Reports**
- A schedule enqueues `report.build`. The build pulls rollups and issues and renders HTML (shared ReportView components) to PDF (Playwright in the worker), stores the PDF in object storage, and sends it by email or Telegram, or exposes it via a share link.

## 5. Frontend architecture (web)

- **Routing.** TanStack Router with typed search params. Deep links work everywhere: `/sites/$siteId/replays?visit=…`.
- **Data.** TanStack Query is the only data layer. Polling only where it matters, paused when the tab is hidden, plus SSE for the live "first session arrived" moment during install. A global 401 handler does silent refresh, then redirects to login.
- **Layout.** Site scope is part of the URL. The global surfaces are **Today**, **Sites**, **Replays** (filterable by site), **Reports**, and **Settings**. Insights live under a site.
- **Components.** `packages/ui` primitives only. ESLint bans raw colors or arbitrary values outside `packages/ui`.
- **i18n.** i18next with ICU, a namespace per route, lazy-loaded per language. `<html lang>` and fonts switch with the language. A CI check fails on hard-coded JSX strings.
- **Performance budgets** are enforced by `size-limit` plus Lighthouse CI (see §8).
- **PWA.** Installable, offline shell, and web push for Fix alerts.

## 6. SDK v3

- **Core (≤5 KB gz):** pageviews (with SPA routing, debounced `replaceState`), clicks (sampled heatmap points), throttled scroll depth (rAF + max per page), rage and dead clicks (with false-positive guards), form start/submit/error (names only), JS errors, `web-vitals` (final values), and a custom `track`.
- **Transport:** in-memory queue mirrored to `sessionStorage` per tab, flushed every 5s or on `pagehide`. Sent with `fetch keepalive` and a `sendBeacon(text/plain)` fallback. Exponential backoff with jitter, stops on 4xx, at most one request in flight.
- **Privacy:** consent modes (`granted` | `denied` | `pending` with buffering), honors GPC by default, URL scrubbing (query allowlist rather than denylist, fragments stripped), a pre-init stub `dxm=window.dxm||[]` so config applies before the first pageview, and `identify` hashed client-side.
- **Replay (lazy, separate file):** loaded only if the site plan includes replay and the visit is sampled in. `maskAllText` and `maskAllInputs` on by default, with an allowlist via `data-dxm-unmask`. `checkoutEveryNms` set, `CompressionStream` gzip, monotonic `seq`.
- **Mini App adapter:** captures `Telegram.WebApp` platform, version, and `start_param`, and never captures `initData`.
- **Versioned immutable URLs:** `/sdk/3.0.0/p.js` with SRI. `/p.js` is a short-cache alias. Legacy `/dxm.js` and `/dxm.v2.js` are served as shims that forward to the v3 transport (see `04-migration-plan.md`).
- **Tests:** unit (Vitest + happy-dom) and real-browser cross-origin delivery (Playwright on two origins, **with `sendBeacon` enabled**).

## 7. Security baseline

- Better Auth sessions in `__Host-` cookies (`Secure`, `HttpOnly`, `SameSite=Lax`) plus CSRF tokens on mutating requests. argon2id. Rate limits keyed on the real client IP (`trust proxy` set to Caddy only) and on account id.
- RLS plus repository scoping, with a cross-tenant test matrix generated over every route (user from org A × every resource of org B → 404).
- Outbound fetch (Health Check, page snapshots) goes through a hardened fetcher. It resolves DNS, blocks private, loopback, link-local and metadata ranges, re-checks on redirect, caps body size and time, and runs in the worker only.
- Secrets come from env with schema validation and minimum-entropy checks in production. Telegram and integration secrets are encrypted at rest.
- Headers: strict CSP (nonce-based for the web app), HSTS, `frame-ancestors 'none'` except for the share-report embed option.
- Dependency audit and secret scanning in CI. Renovate keeps dependencies current.

## 8. Quality gates (CI on every PR)

| Gate | Tool | Threshold |
|---|---|---|
| Types | `tsc -b` across workspaces | 0 errors |
| Lint | ESLint (with custom rules: no raw colors, no `*100` in UI, no hard-coded JSX text) | 0 errors |
| Unit | Vitest | detectors, metrics, sdk, ai at ≥90% line coverage |
| API integration | Vitest + Testcontainers Postgres | all contracts in `05-behavior-contracts.md` + the tenant matrix |
| Components | Vitest + Testing Library | every interactive component |
| E2E | Playwright: core loop × {en, am} × {360px, 1440px} | green |
| Accessibility | axe-core in E2E + component tests | 0 violations |
| Visual | Playwright screenshots of key screens | reviewed diffs |
| Performance | size-limit + Lighthouse CI (Moto G Power, Slow 4G) | app JS ≤120 KB gz, site JS ≤100 KB, LCP <2.5 s, INP <200 ms, SDK core ≤5 KB |
| Security | `pnpm audit --prod`, gitleaks | no high/critical |

## 9. Environments & ops

- **local:** `pnpm dev` starts everything, with Postgres and MinIO via Docker Compose and the seeded demo org.
- **staging and production:** one VM each (Docker Compose), deployed from GitHub Actions over SSH using tagged images. Migrations run as a one-shot container before rollout. Health-checked restart; rollback means redeploying the previous tag.
- **Backups:** WAL-G continuous archiving to object storage plus nightly base backups. A **monthly automated restore test** into a scratch container.
- **Observability:** Sentry (web, api, worker, collector), OpenTelemetry traces to Grafana Cloud (free tier) or self-hosted, structured logs with `org_id` and request id (tokens redacted), an uptime monitor, and a dashboard covering ingest rate, queue lag, detector lag, AI spend, and error rate.
- **Data residency:** the same Compose stack runs on an Ethiopian provider's VM for residency-sensitive customers (ADR-008).
