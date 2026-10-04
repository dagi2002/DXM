# DXM Pulse — Full Audit & Rebuild Prompt

> How to use: open a fresh Claude Code session (Opus) in this repo, and paste everything below the line.
> The rebuild is gated: it stops for your approval after Phase 0 and Phase 1, before writing product code.

---

You are the founding engineer, product designer, and product strategist for **DXM Pulse**. Your job: audit the entire existing product, then rebuild it from scratch as a production-grade product. It should look and feel world-class and be built for the market it serves. You have full authority over the technical design. Product and business decisions go to me at the checkpoints below.

## Context you must load first

1. Read `README.md`, everything in `docs/` (especially `current-status.md`, `architecture.md`, `product-roadmap.md`, `database-schema.md`, `api-reference.md`, `alert-engine.md`), and the `.docx` files in `docs/sdlc/` (extract their text).
2. Read the whole codebase: `apps/web`, `apps/api`, `packages/sdk`, `packages/contracts`, `ops/`, `tests/`, and the API test suite (37 files, 136 tests). The tests are the best record of intended behavior.
3. Run the current app locally (`npm run dev`) and walk every screen in the browser at 375px and 1440px, in English and Amharic. Take screenshots. Note every bug, dead end, inconsistency, and slow interaction.

Use parallel subagents for the read-through: one each for frontend, backend + data, SDK + ingestion, and docs/business. Merge their findings yourself.

## What DXM Pulse is (current understanding — challenge it)

A digital experience analytics platform (session replay, heatmaps, funnels, Core Web Vitals, friction detection, alerts, AI briefs, client reports) built for **Ethiopian businesses and the agencies that build their websites**. Differentiators today: Amharic UI and AI output, ETB billing via Chapa, Telegram alerts and digests, a lightweight SDK built for slow mobile networks, and shareable client reports.

The main competitive threat is **Microsoft Clarity**, which is free and offers replay, heatmaps, and AI summaries. Never compete on "we also have heatmaps". Every surface must answer: *what does this do that Clarity + GA4 can't, for an Ethiopian business owner or agency?* Working hypothesis for the wedge:

- **"What to fix, in plain Amharic/English, delivered where you already are (Telegram)"** — not dashboards to stare at.
- **Agency-grade client reporting** — white-label, scheduled, branded reports that make the agency look good to its client.
- **Local reality** — performance on Ethio Telecom / Safaricom mobile networks, local device mix, local payment-flow drop-off (telebirr, CBE Birr, Chapa checkout), benchmarks against other Ethiopian sites.
- **Mobile-first and Telegram-native** — many Ethiopian businesses run on Telegram channels, bots, and Mini Apps, not just websites.

## Phase 0 — Audit (deliverable: `docs/rebuild/00-audit.md`)

Produce an honest, specific audit, graded A–F per area with file:line evidence:

- **Product & UX** — information architecture, navigation, onboarding time-to-first-value (signup → first replay seen), empty states, copy, Amharic quality, mobile usability.
- **Visual design** — consistency, hierarchy, typography (including Ethiopic script rendering), color, density, motion, dark mode.
- **Architecture** — module boundaries, coupling, duplication, the contracts package, error handling, config.
- **Data layer** — schema, indexes, multi-tenancy isolation, ingestion path, replay storage, retention, migrations (note the naive `;` SQL splitter), and how far SQLite can scale for event ingestion.
- **Auth & security** — sessions/JWT, password storage, invites, roles, API keys, MCP, CORS, rate limits, CSRF, data privacy in replays (PII masking), OWASP Top 10, and compliance with Ethiopia's 2024 Personal Data Protection Proclamation.
- **Performance** — bundle size, LCP/INP on a throttled Slow 4G Moto G-class profile, API latency, SDK weight and its effect on customer sites.
- **Accessibility** — WCAG 2.2 AA: run axe on every page, check keyboard paths, focus, contrast, screen reader labels, reduced motion.
- **Tests & ops** — coverage gaps (there are no web component tests), CI, observability, backup/restore, and deployment readiness. **The product has never been deployed.** Note this.
- **Feature inventory** — a parity matrix of every feature, with its status (real / partial / mock), and your keep / rework / cut / new recommendation. Cut anything that does not serve the wedge.

## Phase 1 — Product spec & architecture (deliverables in `docs/rebuild/`)

1. `01-product-brief.md` — ideal customer profiles (rank them: agencies, e-commerce/delivery, fintech/banks, NGOs, Telegram-first businesses), jobs-to-be-done, the core loop (install → first insight → fix → proof of improvement → report to client/boss), pricing and packaging recommendations in ETB, and what's in v1 vs later.
2. `02-design-system.md` — design principles, tokens (color, type scale, spacing, radius, elevation, motion), light and dark themes, Ethiopic + Latin font pairing (e.g. Noto Sans Ethiopic + Inter, subsetted), component inventory, data-viz palette (colorblind-safe), and RTL-safe/locale-safe layout rules. Produce an HTML style-guide page that I can open.
3. `03-architecture.md` plus one ADR per major decision in `docs/rebuild/adr/`. Recommended direction (deviate only with a written reason):
   - **Monorepo** (npm or pnpm workspaces + Turborepo), strict TypeScript everywhere, shared Zod contracts that generate the API types.
   - **Marketing site**: static and SEO-first (Astro or equivalent). Under 100 KB of JS. Bilingual routes.
   - **Web app**: React + Vite + TanStack Router + TanStack Query + Tailwind, with accessible primitives (Radix/React Aria). Route-level code splitting. Offline-tolerant, and installable as a PWA.
   - **API**: Node + TypeScript (Hono or Fastify), with a layered structure: routes → services → repositories. Typed errors, OpenAPI output, idempotent webhooks.
   - **Data**: Postgres for the app data, with row-level tenant isolation enforced in the repository layer and backed by RLS. Partitioned event tables, or ClickHouse once volume requires it. Replay blobs go in S3-compatible object storage. Set a retention policy per plan. Use real migrations (Drizzle or Kysely). Keep the system able to run on a single VM, and keep it deployable on Ethiopian-hosted infrastructure (for data-residency deals with banks and government).
   - **Ingestion**: a separate lightweight collector with batching and backpressure. It must never slow down a customer's site.
   - **Auth**: DB-backed sessions in httpOnly SameSite cookies, argon2id, email magic link + Google sign-in, optional TOTP 2FA. Use a **users ↔ organizations many-to-many** model, so one person can belong to several workspaces (this fixes the current globally unique email limitation). Roles: owner / admin / member / client-viewer. Store hashed API keys with scopes.
   - **SDK**: no more than 5 KB gzipped for the core. Lazy-load the replay module. Mask inputs by default, respect consent, keep the current `/dxm.js` contract backward compatible. Design a path to a React Native / Flutter SDK and a Telegram Mini App SDK. Treat these as research items, not v1.
   - **Mobile app** (companion for DXM users, not end-user tracking): Expo/React Native app for push alerts, the daily "what to fix" feed, site health at a glance, and client report viewing/sharing. Share types and the API client with the web app. Decide in the ADR whether v1 ships the native app, or ships the PWA plus a **Telegram bot** first. Recommend the cheapest path that still gets the experience right for an agency owner on a phone in Addis.
   - **AI**: Claude for briefs, session recaps, Ask Pulse, and "what to fix" recommendations. Use the latest Claude models, with prompt caching, cost caps per plan, a deterministic fallback, and Amharic as a first-class output language. Track AI cost per workspace.
   - **Payments**: Chapa (plus telebirr via Chapa) with a full end-to-end flow: plan change, proration rules, receipts, failed-payment handling, and an admin override.
   - **Notifications**: email (a real transactional provider), Telegram bot, and mobile push, with per-user preferences.
   - **Observability**: Sentry, OpenTelemetry traces, structured logs, uptime checks, and a product analytics dashboard for *our own* funnel (dogfood DXM on DXM).
4. `04-migration-plan.md` — how existing data, existing SDK installs, and existing URLs (`/r/:token`, `/accept-invite`, `/dxm.js`, `/dxm.v2.js`) keep working.

**⛔ STOP after Phase 1.** Summarize the audit's top 10 findings, the product decisions you need from me (as multiple-choice questions with your recommendation first), and the architecture in one page. Do not write product code until I approve.

## Phase 2 — Build (after approval)

Build in a new top-level `next/` workspace on a branch named `rebuild`, so the current app stays runnable and deployable the whole time. Work in vertical slices. Each slice must be fully working end to end (DB → API → web → mobile where relevant → tests) before you start the next one. Order:

1. Foundations: monorepo, CI, design system + Storybook (or Ladle), auth + orgs + roles, observability, deploy pipeline to a staging VM.
2. Install & verify: site creation, snippet, SDK v3, live verification. Target: **under 5 minutes from signup to first live session.**
3. The "what to fix" feed: friction detection, Web Vitals, alerts, AI recommendations, and the Telegram bot.
4. Replay & heatmaps, built for speed on low-end Android.
5. Funnels, journeys, and Ethiopian funnel templates (telebirr checkout, lead form, Telegram handoff).
6. Agency layer: multi-client portfolio, white-label scheduled reports, client-viewer role, share links.
7. Billing (Chapa end to end) and plan limits.
8. Mobile companion (Expo) or PWA + bot, per the approved ADR.
9. Marketing site, public site audit tool (lead magnet), docs, and status page.
10. Data migration from the old SQLite DB, plus a cutover runbook.

Commit after every meaningful step using conventional commit messages. Do not push. Update `docs/rebuild/progress.md` at the end of each slice with what shipped, what's left, and any decisions made.

## Quality bar (definition of done for every slice)

- **UI/UX**: every screen has designed loading, empty, error, and partial-data states. No mock data in authenticated screens. Ever. Copy is concrete and translated, and the Amharic is reviewed for naturalness, not just literal translation. Works at 360px.
- **Accessibility**: WCAG 2.2 AA. axe-core reports zero violations in CI. Full keyboard operability, visible focus, 4.5:1 contrast, and charts that have a table/text alternative.
- **Performance budgets** (enforced in CI with Lighthouse CI): app shell JS ≤ 120 KB gzipped, marketing pages ≤ 100 KB JS, mobile LCP < 2.5 s on Slow 4G, INP < 200 ms, API p95 < 300 ms for dashboard reads, SDK core ≤ 5 KB gzipped.
- **Security**: tenant isolation tests on every endpoint (user A can never read B's data), rate limits on auth and ingestion, CSRF protection, a strict CSP, secrets only from env, dependency audit in CI, and PII masked in replays by default.
- **Tests**: unit tests (Vitest) for logic, API integration tests per route (port the *intent* of all 136 existing tests), component tests (Testing Library) for every interactive component, Playwright E2E for the core loop in both languages and both viewports, plus visual regression on key screens. The test suite must run green before every commit.
- **Ops**: one-command local dev, seeded demo workspace with realistic Ethiopian data, a backup/restore that has been tested, a health endpoint, and a runbook.

## Rules

- Never fake functionality. If something isn't built, the UI must not imply it is.
- Never break existing customer SDK installs or public URLs.
- Don't touch the old `apps/` code except to fix a bug I ask about.
- When a product decision isn't covered by this prompt or the approved spec, choose the option that gets a paying customer to value fastest, note it in `progress.md`, and keep going. Ask me only when the decision is expensive to reverse.
- At the end, give me an honest summary: what's done, what's not, known risks, and the exact commands to run, test, and deploy.
