# Current Status

This document is the truthful snapshot of DXM Pulse on the stabilized agency-first monorepo line.

Last updated: 2026-04-20 (Session 3 — 2026-frontier features: SDK v2, Ask Pulse, Session AI, CWV, MCP)

## What Is Shipping Now

### Recently shipped (Session 3)

- **SDK v2 rewrite** — modular TypeScript implementation served at `/dxm.v2.js`, 3.6 KB gzipped. Adds dead-click, form-start, form-submit, form-error events plus a privacy API (`window.dxm.privacy.maskUrls / scrubFields / disableInputCapture`). v1 stays byte-frozen at `/dxm.js` so live installations never break; Settings → Connections shows an Upgrade card with one-click v2 snippet per site.
- **Ask Pulse** (natural-language analytics chat) — floating bubble on Dashboard + Overview, slide-out panel, Claude Haiku 4.5 tool-use loop (5 tool calls max, 60 s wall-clock cap), 4 tools (`list_sites`, `get_site_metrics`, `recent_alerts`, `search_sessions`), citation chips linking back into the product. Respects `dxm_lang` so answers come back in Amharic when the UI is in Amharic.
- **Per-session AI summary** — `/sessions/:id/summary` returns a headline, narrative, friction moments, and opportunities. Rendered as a collapsible "AI Recap" panel at the top of the Session Replays sidebar. Artifact-cache hits ~50 ms; deterministic fallback when the API key is absent.
- **Core Web Vitals surface** — `/sites/vitals` and `/sites/:id/vitals` expose p50/p75/p95 for LCP, INP, CLS, FCP, TTFB with Google-threshold colouring. New `WebVitalsCard` + `VitalGauge` components mounted on Dashboard and ClientDetail with range (24h/7d/30d) and device (all/desktop/mobile/tablet) toggles.
- **Expanded friction detection** — `alertEngine` adds three detectors: dead clicks (3+ on same target in 10 min), U-turns (pageview A→B→A→exit inside 30 s + 60 s exit), and form abandon (≥20 starts / >50 % drop-off per URL per hour). All reuse the existing `frustration` / `conversion` alert types; dedup key extended to `(workspace_id, site_id, type, title)` so the three frustration variants don't collide.
- **Auto journey map** — `/sites/:id/journey` returns top 10 path sequences; self-rolled SVG Sankey (~230 LoC, skips the `@nivo/sankey` ~120 KB dep). Mounted on ClientDetail below Funnels.
- **MCP endpoint** — `/mcp` speaks JSON-RPC 2.0 (hand-rolled, no SDK dep) for Claude Desktop / Cursor. 4 read-only workspace-scoped tools. Bearer-token auth via new `workspace_api_keys` table; Settings → Connections exposes a full generate / list / revoke UI with a one-time key reveal and a copy-ready Claude Desktop config snippet.

### Product-facing

- Public landing page with competitive comparison table (vs Google Analytics / Hotjar), bandwidth badge (~12KB · async · 3G-ready), ETB/Chapa payment callout, and icon-enhanced "How It Works" workflow steps
- Public site audit that measures response time, page size, and mobile-readiness
- Login page with "Enter your workspace" heading, rotating daily stats panel (7 day-specific stat sets), and 256-bit SSL trust badge
- Signup page with 3-step milestone progress bar, ETB/Chapa trust signal in benefits list, and improved specific testimonial
- Workspace onboarding with 3-step flow, verification polling, and timeout state
- Operational dashboard with Session Activity (last 24h) and Weekly Completion Trend (7d) charts, live sessions, insights panel, Friction Index metric (computed from alert pressure + bounce pressure), and 15/30s polling
- Agency overview (AI Portfolio Brief) with AI/AUTO mode badge distinguishing LLM-generated from deterministic briefs, Regenerate button with cache-busting, and responsive evidence grid
- Client-sites surface with detail views, install snippets, verification, edit flow, conservative delete flow, vitals, funnels, and recent sessions
- Reports surface with AI brief in Executive Summary (with AI badge when LLM-generated), Friction Signals section (active alerts with affected session counts), heuristic "no issues" insight when sessions exist but no alerts are active, and share-ready summaries
- Demo page with Telegram notification simulation panel, Agency ROI widget (hours saved, billable fixes, replay count), "Generate Client Email" modal with pre-written draft, and evidence chips on alert cards
- Settings hub with sidebar navigation (Identity, Team, Sites, Connections, Billing, Signals sections), sticky "Unsaved Changes" save bar (isDirty pattern — appears on first change, disappears after save or discard), and language preference
- Heatmap analytics with redesigned mode-aware stats panel (Click/Scroll/Hover show different content), prettified CSS selector labels, intensity legend with color swatches, and pill-style segmented mode selector with icons
- Navigation with EN / አማ language toggle pill (highlights active language)
- Amharic localization complete — all 80+ translation keys present in both en.json and am.json
- Improved empty states on sessions, heatmap, and dashboard pages
- Client detail page with tracking verification banner and polling
- Password reset flow fully wired in the frontend (forgot + reset pages)

### Technical foundation

- SQLite-backed multi-tenant data model
- JWT auth with httpOnly cookies
- Password reset with secure token flow (crypto.randomBytes, SHA-256 hashing, 1-hour expiry, single-use)
- Email notification baseline (welcome email, site-verified email, critical alert email) with opt-out support
- Workspace-scoped routes for overview, sites, sessions, alerts, analytics, funnels, settings, and users
- Tracking SDK in `packages/sdk`
- Shared public contracts in `packages/contracts`
- Replay ingestion via rrweb extension
- Alert engine with Telegram delivery and critical alert email notifications
- Insights engine: 5 rule-based detectors (bounce rate, low duration, no activity, traffic drop, traffic growth) computed at ingestion time with deduplication, auto-resolution, and 6-hour cooldown
- Weekly digest compilation and sending pipeline
- Billing backbone with Chapa payment integration (initiate, webhook with HMAC verification)
- Admin plan activation endpoint for operator-driven manual upgrades
- Comprehensive integration test suite: 28 files, 98 tests

## What Is Real vs Partial

### Real

- `GET /overview` is live and powers the agency overview screen
- `GET /sites`, `GET /sites/:id`, `GET /sites/:id/verify`, and `GET /sites/:id/overview` are live
- `POST /sites`, `PATCH /sites/:id`, and `DELETE /sites/:id` are available as the primary client-site contract
- `/onboarding/sites`, `/onboarding/sites/:id/verify`, and `GET /onboarding/sites` remain as thin compatibility aliases over the primary `/sites` handlers
- `GET /users` is live and workspace-scoped, but no longer a primary product surface
- Sessions, alerts, funnels, vitals, and user flow are backed by the database
- Session summary/detail/replay responses now use a shared DTO contract instead of ad hoc route shapes
- Heatmaps now read from a dedicated `/analytics/heatmap` model instead of overloading `/sessions`
- Landing page, demo page, and site audit are not just mock screens
- Settings can now manage live client-site setup, weekly digest behavior, and email notification opt-out (toggle wired to `PATCH /settings { emailNotificationsEnabled }`)
- Dashboard page (`/dashboard`) is live with data from `GET /analytics/metrics`, `GET /sessions`, `GET /alerts`, polling sessions every 15s and metrics every 30s
- Password reset is fully implemented with secure token generation, SHA-256 hashing, single-use enforcement, 1-hour expiry, and session invalidation
- Email notifications are live: welcome email on signup, site-verified email on first session, critical alert email on critical-severity alerts — all respecting the workspace `email_notifications_enabled` flag
- Billing backbone is real: Chapa payment initiation (`POST /billing/chapa/initiate`), HMAC-verified webhook (`POST /billing/chapa/webhook`), upgrade requests (`POST /billing/upgrade-requests`), and admin plan activation (`PATCH /admin/workspaces/:id/plan`)
- Integration test suite covers 98 tests across 28 files (auth, sessions, alerts, sites, funnels, analytics, billing, password reset, email notifications, admin)
- Build, lint, and root `check` are passing targets for this branch
- The phase-1 AI foundation is live with deterministic overview, site, alert, and funnel briefs layered onto the primary detail routes

### Partial or intentionally deferred

- Billing UI is still honest/read-only — Chapa initiation and webhook are real server-side, but the frontend billing flow is not yet wired end-to-end
- Email delivery uses a dev-mode console logger; production SMTP/transactional email provider integration is deferred
- DXM Pulse AI is only partially implemented here: overview, site, alert, and funnel AI are live, but report, digest, and provider-backed AI layers are still deferred
- Some higher-order business features are still roadmap items rather than shipped workflows
- Site deletion is intentionally conservative: clean sites can be deleted, but there is still no cascade delete or archive flow
- The onboarding compatibility alias should remain thin and can be removed later once no callers depend on `/onboarding/sites*`

## Claude Branch Review

The older Claude branch had a few worthwhile product ideas, but it diverged from the current monorepo and leaned heavily on mock UI. We did not merge that branch directly.

What we selectively kept or reconstructed on the stable architecture:

- Stronger business-facing setup surface in Settings
- More product-truthful public positioning
- Better operational copy around alerts, snippets, and weekly digest
- Documentation that reflects the real system instead of the older prototype structure

What we intentionally did not pull over:

- Older single-app structure
- Mock-heavy reports and insights pages that were not backed by current APIs
- UI affordances that implied functionality the product does not actually ship yet

## DXM Pulse AI

DXM Pulse AI now operates in two modes depending on the environment:

**LLM mode** (when `ANTHROPIC_API_KEY` is set):
- Brief generation calls `api.anthropic.com/v1/messages` using Claude
- Produces richer, context-aware narratives in English or Amharic
- Results are cached in `ai_artifacts` for 24 hours to control cost
- The AI Portfolio Brief shows an `AI` blue badge in the UI

**Deterministic mode** (fallback when `ANTHROPIC_API_KEY` is absent):
- Pre-written template strings derived from portfolio data
- No external call, no cost, always available
- The AI Portfolio Brief shows an `AUTO` gray badge in the UI

Both modes are fail-open — the core product works unchanged when AI is disabled or the cache table is unavailable.

### Live AI surfaces

- `GET /overview` — portfolio brief (headline, summary, topRisk, topOpportunity, evidence grid)
- `GET /sites/:id` — per-site brief (headline, summary, recommendations)
- `GET /alerts/:id` — alert explanation brief
- `GET /funnels/:id/analysis` — funnel AI brief layered on the existing analysis response

### Frontend AI features

- AI Portfolio Brief: AI/AUTO mode badge, Regenerate button (busts artifact cache via `?refresh=1&t=<timestamp>`), responsive 2/3-column evidence grid
- Reports Executive Summary: shows `siteDetail.ai.summary` with AI badge when available, falls back to deterministic `report.summary`
- Reports Friction Signals: renders `openAlertsList` from site detail as an amber callout with affected session counts

### Caching behaviour

- `ai_artifacts` table stores artifact per `(workspaceId, type)` key
- Artifacts expire after 24 hours; Regenerate forces a fresh generation regardless of cache age
- The `mode` field on the artifact (`'llm'` | `'deterministic'`) drives the badge in the UI
