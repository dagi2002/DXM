# DXM Pulse — rebuild (`next/`)

The from-scratch rebuild described in [`docs/rebuild/`](../docs/rebuild/README.md). The legacy app in `apps/` and `packages/` at the repo root keeps running until cutover.

## What's here (slices 1–2: foundations, install & verify)

| Path | What |
|---|---|
| `apps/api` | Hono API: Better Auth (email + password, magic link, Google, organizations with roles), sites, `/me`, health checks |
| `apps/collector` | Public ingest endpoint (`POST /i`, legacy `/collect`) and SDK file server; validates, checks the site's allowed origins, rate-limits, enqueues |
| `apps/worker` | pg-boss jobs: applies ingest batches (visits + partitioned events), flips sites live, emails owners, closes idle visits, keeps partitions ahead |
| `packages/sdk` | Tracking script v3: `p.js` (≤5 KB gz) + lazily loaded Web Vitals `v.js`; privacy by default, consent modes, legacy `/dxm.js` compatible |
| `packages/jobs` | Queue names, typed payloads, pg-boss setup, `migrateAll` (schema + queues + grants) |
| `packages/mail` | Mailer interface: memory (tests), console (dev), Resend (production) |
| `apps/web` | React 19 + Vite app: sign-in/up, onboarding, Today, Sites, Settings (profile, organization, team), English/Amharic, Ethiopian calendar, light/dark |
| `packages/contracts` | Zod API contracts. `@pulse/contracts/constants` is the zod-free subset for the browser. |
| `packages/db` | Drizzle schema, SQL migrations, Postgres row-level security, setup/migrate scripts |
| `packages/metrics` | The one place numbers are defined and formatted (ratios are 0–1, always) |
| `packages/i18n` | ICU messages (en/am, key-parallel), Ethiopian calendar and clock |
| `packages/tokens` | Design tokens → `tokens.css` for Tailwind v4 (contrast-tested) |
| `packages/ui` | Accessible components on React Aria |
| `packages/config` | Environment schema; refuses weak secrets in production |
| `ops/` | Dockerfile (targets: migrate, api, collector, worker, web), Caddyfile, production compose. Bundles are verified to run without node_modules; **Docker images and compose are not yet exercised on a server** |

## Run it locally

Requires Node 22, pnpm 8+, and a local PostgreSQL 14+.

```bash
cd next
pnpm install
cp .env.example .env    # then set BETTER_AUTH_SECRET (openssl rand -base64 48) and DATABASE_ADMIN_URL
DATABASE_ADMIN_URL=postgres://$USER@localhost:5432/postgres pnpm db:setup   # app role + pulse_dev/pulse_test
DATABASE_ADMIN_URL=postgres://$USER@localhost:5432/pulse_dev pnpm db:migrate   # schema + job queues + grants
pnpm --filter @pulse/sdk build   # builds p.js / v.js served by the collector
pnpm --dir apps/api dev          # API on :4100
pnpm --dir apps/collector dev    # collector on :4200 (SDK at /sdk/p.js, ingest at /i)
pnpm --dir apps/worker dev       # background jobs (health on :4250)
pnpm --dir apps/web dev          # app on http://localhost:5174 (proxies /api → :4100)
node apps/web/e2e/demo-server.mjs  # optional: a demo shop on :4300 to install the snippet on
```

In development, emails (verification, password reset, magic links, invitations) are printed to the API log instead of being sent.

## Checks

```bash
pnpm check                    # typecheck + lint + unit/component/API tests
pnpm --filter @pulse/web build   # includes the first-load JS budget check
pnpm e2e                      # Playwright: desktop + 360px mobile, axe WCAG 2.2 AA
```

The API tests and E2E run against real Postgres databases (`pulse_test`, `pulse_e2e`), connecting as the non-superuser `pulse_app` role so row-level security is genuinely exercised. CI: `.github/workflows/next-ci.yml`.

## Rules of the codebase

- Tenant data is read and written only inside `withOrg(db, orgId, …)`. RLS enforces it even if a query forgets its `WHERE`.
- Never format a number by hand: use `@pulse/metrics`. ESLint blocks `* 100` and hex colors in UI code.
- Every UI string goes through `@pulse/i18n`, in both languages. A test enforces key and placeholder parity.
- Don't show features that don't exist yet. Navigation grows slice by slice.
