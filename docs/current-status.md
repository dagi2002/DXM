# Current Status

This document is the truthful snapshot of DXM Pulse on the stabilized agency-first monorepo line.

## What Is Shipping Now

### Product-facing

- Public landing page positioned for Ethiopian web and growth agencies
- Public site audit that measures response time, page size, and mobile-readiness
- Login, signup, and workspace onboarding
- Agency overview with portfolio health, alert hotspots, recent activity, and next actions
- Client-sites surface with detail views, install snippets, verification, edit flow, conservative delete flow, vitals, funnels, and recent sessions
- Reports surface with share-ready summaries generated from live portfolio data
- Demo mode that sells the agency portfolio story instead of a single-site dashboard
- Settings hub with profile, team, client-site setup, Telegram, digest, billing, and integrations sections

### Technical foundation

- SQLite-backed multi-tenant data model
- JWT auth with httpOnly cookies
- Workspace-scoped routes for overview, sites, sessions, alerts, analytics, funnels, settings, and users
- Tracking SDK in `packages/sdk`
- Shared public contracts in `packages/contracts`
- Replay ingestion via rrweb extension
- Alert engine with Telegram delivery
- Weekly digest compilation and sending pipeline

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
- Settings can now manage live client-site setup and weekly digest behavior
- Build, lint, and root `check` are passing targets for this branch
- The phase-1 AI foundation is live with deterministic overview, site, alert, and funnel briefs layered onto the primary detail routes

### Partial or intentionally deferred

- Billing is still honest/read-only in the UI and manual operationally
- Chapa webhook remains a stub until production credentials and flow details are ready
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

DXM Pulse AI has started in a deliberately small shape:

- `GET /overview` can now include an optional deterministic AI brief
- `GET /sites/:id` can now include an optional deterministic site AI brief
- `GET /alerts/:id` can now include an optional deterministic alert AI brief
- `GET /funnels/:id/analysis` can now include an optional deterministic funnel AI brief
- the AI layer reads the existing overview rollups instead of replacing them
- the site AI layer reads the existing client detail payload instead of replacing it
- the alert AI layer reads the existing alert detail record instead of re-deriving alert truth
- the funnel AI layer reads the existing funnel analysis response instead of replacing the funnel analysis route
- outputs are cached in `ai_artifacts`
- AI remains additive and fail-open, so the core product still works unchanged when AI is disabled

Later AI phases for reports, digests, and provider-backed generation remain roadmap work.
