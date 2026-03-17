# DXM Pulse

A **Digital Experience Management (DEM)** analytics platform that gives product teams real-time visibility into how users interact with their website — session recordings, heatmaps, user flow analysis, funnel tracking, and performance monitoring in one unified dashboard.

---

## Prerequisites

- **Node.js** v18 or later
- **npm** v9 or later

---

## Getting Started

The project has two independently-runnable packages: the frontend (Vite/React) and the backend (Express).

### 1. Install dependencies

```bash
# Frontend (project root)
npm install

# Backend
cd backend && npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and adjust if needed:

```bash
cp .env.example .env
```

### 3. Run in development

Open **two terminals**:

```bash
# Terminal 1 — backend (port 4000)
cd backend
npm run dev

# Terminal 2 — frontend (port 5173)
npm run dev
```

The frontend is available at `http://localhost:5173`.
The backend API is available at `http://localhost:4000`.

### 4. Build for production

```bash
npm run build       # outputs to /dist
npm run preview     # serve the built output locally
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | `http://localhost:4000` | Base URL of the Express backend. Must be set at **build time** (Vite embeds it). |

> **Note:** If you deploy the backend to a different host or port, set `VITE_API_URL` before building the frontend.

---

## Project Structure

```
project/
├── src/                        # Frontend source (React + TypeScript)
│   ├── components/
│   │   ├── Dashboard/          # Main dashboard view
│   │   ├── SessionReplays/     # Session list + replay player
│   │   ├── Analytics/
│   │   │   ├── HeatmapPage/    # Click / scroll / hover heatmaps
│   │   │   ├── Funnels/        # Conversion funnel analysis
│   │   │   ├── UserFlow/       # Page-to-page navigation flow
│   │   │   └── Performance/    # Core Web Vitals + performance metrics
│   │   ├── Alerts/             # System alerts list
│   │   └── Users/              # Platform user management
│   ├── hooks/
│   │   ├── useRealTimeData.ts  # Polls /sessions + /metrics every 5 s
│   │   └── useSessionRecorder.ts # Live browser event capture SDK
│   ├── lib/
│   │   └── api.ts              # Typed fetch wrapper
│   ├── data/
│   │   └── mockData.ts         # Static mock data for offline/demo use
│   ├── types/
│   │   └── index.ts            # Shared TypeScript interfaces
│   └── App.tsx                 # Root — view routing via useState
├── backend/
│   ├── server.js               # Express API server
│   ├── data.json               # Seed data: metrics, alerts, users
│   ├── sessions.json           # Live session recordings (auto-created)
│   └── seedUserFlows.js        # One-time script to seed test session data
├── .env.example
└── vite.config.ts
```

---

## Module Overview

| Module | Data Source | Status |
|---|---|---|
| Dashboard | Live — backend API (`/sessions`, `/metrics`, `/alerts`) | Working |
| Session Replays | Live — backend API (`/sessions`) | Working |
| Heatmaps | Live — backend API (`/sessions`) | Working |
| User Flow | Live — backend API (`/userflow`, computed from sessions) | Working |
| Funnel Analysis | Mock — static data in `mockData.ts` | UI complete, real data pending |
| Performance Monitoring | Mock — static data in `mockData.ts` | UI complete, real data pending |
| Users | Backend — `data.json` (static seed) | Working |
| Alerts | Backend — `data.json` (static seed) | Read-only; create/resolve not yet implemented |

---

## Session Recording SDK

`useSessionRecorder` (in `src/hooks/useSessionRecorder.ts`) is embedded in this app itself, so DXM Pulse records its own usage sessions as a built-in demo. It captures mouse moves, clicks, scrolls, and SPA navigation events, batching them to `POST /sessions` every 3 seconds.

To instrument an **external** website in the future, the hook's logic will be extracted into a standalone `<script>` snippet or npm package.

---

## Seeding Test Data

To populate `sessions.json` with synthetic session data for testing heatmaps and user flow:

```bash
cd backend
node seedUserFlows.js
```

This script is safe to re-run — it appends new sessions rather than overwriting existing ones.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend framework | React 18 + TypeScript |
| Build tool | Vite 5 |
| Styling | Tailwind CSS 3 |
| Icons | Lucide React |
| Backend | Express.js 4 (ES Modules) |
| Storage | JSON files (sessions.json, data.json) |
| Linting | ESLint 9 + TypeScript ESLint |
