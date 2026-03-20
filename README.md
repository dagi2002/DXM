# DXM Pulse

DXM Pulse is a lightweight Digital Experience Management platform repositioned as a premium agency operating tool for Ethiopia. It combines portfolio overview, client-site management, session replay, heatmaps, funnels, alerts, performance monitoring, public site audit, and Telegram-first reporting into one coherent product.

## What Exists Today

- Public landing page with ETB pricing and instant site audit
- Email/password auth with workspace isolation
- Onboarding flow that creates tracked client sites and install snippets
- Real session collection via the SDK and SQLite-backed API
- Session replay, heatmaps, funnels, user flow, alerts, and Web Vitals
- Weekly Telegram digest plumbing
- Demo mode for offline or sales-led walkthroughs
- Agency-first overview, clients, reports, and settings surfaces

## Honest Status

Real and production-shaped:
- Auth, multi-tenancy, SQLite schema, workspace-scoped APIs
- SDK event collection and replay ingestion
- Landing page, site audit, overview, clients, alerts, reports, and demo mode
- Telegram alerts and weekly digest when credentials are configured

Still intentionally partial:
- Billing checkout is still manual/read-only in the product UI
- Some analytics panels remain simpler than a full enterprise DXM tool
- DXM Pulse AI is planned, but not shipped in this branch yet

## Monorepo Layout

```text
.
├── apps/
│   ├── api/        # Express + TypeScript + SQLite backend
│   └── web/        # React + Vite frontend
├── packages/
│   ├── contracts/  # Shared DTOs and endpoint constants
│   └── sdk/        # Tracking SDK and replay extension
├── docs/           # Architecture, API, schema, roadmap, status
├── .env.example
└── package.json
```

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Minimum required values:

```bash
JWT_SECRET=change_this_in_production_min_32_chars
JWT_REFRESH_SECRET=different_secret_also_min_32_chars
```

Optional integrations:
- Telegram for live alerts and weekly digest
- Chapa for future payment automation

See [docs/environment-variables.md](docs/environment-variables.md) for the full reference.

### 3. Run database setup

```bash
npm run migrate -w apps/api
npm run seed -w apps/api
```

`seed` is optional, but useful if you want the dashboard to feel alive immediately.

### 4. Start the full stack

```bash
npm run dev
```

This starts:
- `apps/web` on `http://localhost:5173`
- `apps/api` on `http://localhost:4000`
- `packages/sdk` in watch mode

### 5. Build or validate

```bash
npm run build
npm run lint
npm run check
```

## Default Local Flow

- Visit `http://localhost:5173/` for the agency landing page
- Visit `http://localhost:5173/demo` for the offline demo experience
- Sign up at `http://localhost:5173/signup`
- Add a client site, copy the snippet, and verify tracking

## Product Surface

| Area | Status | Notes |
|---|---|---|
| Landing page | Live | Agency positioning, public demo CTA, site audit |
| Auth + onboarding | Live | Workspace signup, client-site creation, install snippet |
| Overview | Live | Portfolio health, alert hotspots, recent activity, next actions |
| Clients | Live | Client-site list and detail with install, alerts, vitals, sessions |
| Session replay | Live | Replay ingestion and playback are wired |
| Heatmaps | Live | Aggregated click data from real events |
| Funnels | Live | Create funnels and analyze live paths |
| User flow | Live | Derived from navigation and pageview events |
| Alerts | Live | DB-backed alerts with Telegram delivery when configured |
| Reports | Live | Share-ready summaries generated from live portfolio data |
| Weekly digest | Live plumbing | Requires Telegram credentials and digest key trigger |
| Billing | Partial | Read-only/manual upgrade flow, webhook stub only |
| DXM Pulse AI | Planned | Documented, not implemented in this branch |

## Documentation

- [Codebase Onboarding](docs/codebase-onboarding.md)
- [Current Status](docs/current-status.md)
- [Product Roadmap](docs/product-roadmap.md)
- [Architecture Overview](docs/architecture.md)
- [API Reference](docs/api-reference.md)
- [Database Schema](docs/database-schema.md)
- [SDK Integration Guide](docs/sdk-integration.md)
- [Alert Engine](docs/alert-engine.md)
- [Environment Variables](docs/environment-variables.md)

## Notes For Contributors

- The stable target in this workspace is the monorepo line, not the older single-app Claude branch.
- We selectively reconstructed strong product ideas on top of the current architecture instead of merging divergent legacy structure.
- If you plan to build DXM Pulse AI next, start with [docs/product-roadmap.md](docs/product-roadmap.md) and [docs/current-status.md](docs/current-status.md).
