# DXM Pulse — rebuild (`next/`)

The from-scratch rebuild described in [`docs/rebuild/`](../docs/rebuild/README.md). The legacy app in `apps/` and `packages/` at the repo root keeps running until cutover.

## What's here (slice 1: foundations)

| Path | What |
|---|---|
| `apps/api` | Hono API: Better Auth (email + password, magic link, Google, organizations with roles), sites, `/me`, health checks |
| `apps/web` | React 19 + Vite app: sign-in/up, onboarding, Today, Sites, Settings (profile, organization, team), English/Amharic, Ethiopian calendar, light/dark |
| `packages/contracts` | Zod API contracts. `@pulse/contracts/constants` is the zod-free subset for the browser. |
| `packages/db` | Drizzle schema, SQL migrations, Postgres row-level security, setup/migrate scripts |
| `packages/metrics` | The one place numbers are defined and formatted (ratios are 0–1, always) |
| `packages/i18n` | ICU messages (en/am, key-parallel), Ethiopian calendar and clock |
| `packages/tokens` | Design tokens → `tokens.css` for Tailwind v4 (contrast-tested) |
| `packages/ui` | Accessible components on React Aria |
| `packages/config` | Environment schema; refuses weak secrets in production |
| `ops/` | Dockerfile, Caddyfile, production compose (**not yet exercised on a server**) |

## Run it locally

Requires Node 22, pnpm 8+, and a local PostgreSQL 14+.

```bash
cd next
pnpm install
cp .env.example .env    # then set BETTER_AUTH_SECRET (openssl rand -base64 48) and DATABASE_ADMIN_URL
DATABASE_ADMIN_URL=postgres://$USER@localhost:5432/postgres pnpm db:setup   # app role + pulse_dev/pulse_test
DATABASE_ADMIN_URL=postgres://$USER@localhost:5432/pulse_dev pnpm db:migrate
pnpm --dir apps/api dev     # API on :4100
pnpm --dir apps/web dev     # app on http://localhost:5174 (proxies /api → :4100)
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
