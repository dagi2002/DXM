# DXM Pulse

A **Digital Experience Management (DXM)** analytics platform built for Ethiopian SaaS teams. Gives product teams real-time visibility into how users interact with their website — session recordings, heatmaps, user flow analysis, funnel tracking, performance monitoring, and automated alerts in one unified dashboard.

---

## Prerequisites

- **Node.js** v18 or later
- **npm** v9 or later

---

## Getting Started

The project is a monorepo with two packages:

| Package | Location | Port |
|---|---|---|
| Web (React + Vite) | `apps/web` | 5173 |
| API (Express + SQLite) | `apps/api` | 4000 |

### 1. Install all dependencies

From the **project root**:

```bash
npm install
```

This installs dependencies for the root workspace, `apps/web`, and `apps/api` in one step.

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

```bash
JWT_SECRET=your_random_32_char_secret_here
JWT_REFRESH_SECRET=another_random_32_char_secret
```

For Telegram alerts and Chapa payments, fill in the optional fields. See [docs/environment-variables.md](docs/environment-variables.md) for the full reference.

### 3. Run the database migration

```bash
npm run migrate -w apps/api
```

This creates `apps/api/data/dxm.db` with all tables and indexes. Safe to re-run at any time.

### 4. (Optional) Seed demo data

```bash
npm run seed -w apps/api
```

Populates the database with a demo workspace, site, users, sessions, and events so the dashboard has data to display on first launch.

### 5. Start development servers

Open **two terminals** or use your preferred process manager:

```bash
# Terminal 1 — API server (port 4000)
npm run dev -w apps/api

# Terminal 2 — Web app (port 5173)
npm run dev -w apps/web
```

The web app is available at **http://localhost:5173**
The API is available at **http://localhost:4000**

### 6. Build for production

```bash
npm run build -w apps/web     # outputs to apps/web/dist/
npm run build -w apps/api     # compiles TypeScript to apps/api/dist/
```

---

## Project Structure

```
project/
├── apps/
│   ├── web/                          # React + Vite frontend
│   │   └── src/
│   │       ├── components/
│   │       │   ├── AppShell.tsx      # Main layout + mobile nav
│   │       │   ├── Navigation.tsx    # Sidebar navigation
│   │       │   ├── Dashboard/        # Overview metrics + live feed
│   │       │   ├── SessionReplays/   # Session list + rrweb replay player
│   │       │   ├── Analytics/
│   │       │   │   ├── HeatmapPage/  # Click / scroll / hover heatmaps
│   │       │   │   ├── Funnels/      # Funnel builder + conversion analysis
│   │       │   │   ├── UserFlow/     # Page-to-page navigation flow
│   │       │   │   └── Performance/  # Core Web Vitals monitoring
│   │       │   ├── Alerts/           # Alert feed + severity badges
│   │       │   └── Users/            # Workspace user management
│   │       ├── hooks/
│   │       │   └── useRealTimeData.ts  # Polls sessions + metrics every 5s
│   │       ├── lib/
│   │       │   └── api.ts            # Typed fetch wrapper (auto-sends cookies)
│   │       └── types/
│   │           └── index.ts          # Shared TypeScript interfaces
│   │
│   └── api/                          # Express + SQLite backend
│       ├── data/
│       │   └── dxm.db                # SQLite database (auto-created by migrate)
│       └── src/
│           ├── app.ts                # Express app setup + routes
│           ├── index.ts              # Server entry point
│           ├── db/
│           │   ├── schema.sql        # Full DB schema (tables + indexes)
│           │   ├── migrate.ts        # DDL runner (idempotent)
│           │   └── seed.ts           # Demo data seeder
│           ├── routes/
│           │   ├── auth.ts           # Login / signup / refresh / logout
│           │   ├── collect.ts        # SDK event ingestion (POST /collect)
│           │   ├── sessions.ts       # Session list + replay data
│           │   ├── analytics.ts      # Vitals, heatmap, user flow aggregates
│           │   ├── funnels.ts        # Funnel CRUD + step-by-step analysis
│           │   ├── alerts.ts         # Alert list + resolve
│           │   ├── billing.ts        # Chapa payment integration
│           │   ├── settings.ts       # Workspace + site settings
│           │   └── onboarding.ts     # First-run workspace setup
│           ├── services/
│           │   └── alertEngine.ts    # Background alert detection
│           └── middleware/
│               └── auth.ts           # JWT verification middleware
│
├── docs/                             # Detailed project documentation
│   ├── architecture.md
│   ├── api-reference.md
│   ├── database-schema.md
│   ├── sdk-integration.md
│   ├── alert-engine.md
│   └── environment-variables.md
│
├── .env.example                      # Environment variable template
└── package.json                      # Workspace root
```

---

## Module Status

| Module | Data Source | Status |
|---|---|---|
| Dashboard | Live — API (`/sessions`, `/metrics`) | ✅ Working |
| Session Replays | Live — API (`/sessions`, `/sessions/:id/replay`) | ✅ Working |
| Heatmaps | Live — API (`/analytics/heatmap`) | ✅ Working |
| User Flow | Live — API (`/analytics/userflow`) | ✅ Working |
| Funnel Analysis | Live — API (`/funnels`, `/funnels/:id/analysis`) | ✅ Working |
| Performance / Vitals | Live — API (`/analytics/vitals`) | ✅ Working |
| Alerts | Live — API (`/alerts`), auto-detected by alert engine | ✅ Working |
| Users | Live — API (`/settings/users`) | ✅ Working |
| Billing (Chapa) | Live — API (`/billing`) | ✅ Working |
| Telegram Notifications | Background service in alert engine | ✅ Working (optional) |

---

## Environment Variables

See [docs/environment-variables.md](docs/environment-variables.md) for the full reference.

Quick summary:

| Variable | Required | Description |
|---|---|---|
| `JWT_SECRET` | ✅ Yes | Access token signing key (32+ chars) |
| `JWT_REFRESH_SECRET` | ✅ Yes | Refresh token signing key (32+ chars) |
| `DB_PATH` | No | SQLite file path (default: `./data/dxm.db`) |
| `PORT` | No | API port (default: `4000`) |
| `TELEGRAM_DEFAULT_BOT_TOKEN` | No | Enables Telegram alert notifications |
| `CHAPA_SECRET_KEY` | No | Enables Chapa payment processing |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend framework | React 18 + TypeScript |
| Build tool | Vite 5 |
| Styling | Tailwind CSS 3 |
| Icons | Lucide React |
| i18n | i18next (Amharic + English) |
| API server | Express 5 + TypeScript |
| Runtime | tsx (ESM-native TS runner) |
| Database | SQLite via better-sqlite3 |
| Auth | JWT (httpOnly cookies, refresh token rotation) |
| Payments | Chapa (Ethiopian payment gateway) |
| Alerts | Telegram Bot API |
| Session replay | rrweb |

---

## Documentation

- [Architecture Overview](docs/architecture.md)
- [API Reference](docs/api-reference.md)
- [Database Schema](docs/database-schema.md)
- [SDK Integration Guide](docs/sdk-integration.md)
- [Alert Engine](docs/alert-engine.md)
- [Environment Variables](docs/environment-variables.md)
