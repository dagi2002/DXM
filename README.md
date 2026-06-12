# DXM Pulse

DXM Pulse is a full-stack **Digital Experience Management (DXM)** platform designed for agencies and businesses to monitor, analyze, and improve user behavior across their websites.

It combines **session replay, insights, alerts, analytics, billing, and reporting** into a single operational tool — built specifically for real-world deployment.

---

## ✨ What's New — Session 3 (April 2026)

- **Ask Pulse** — natural-language chat over your analytics (Claude Haiku 4.5 tool-use). Floating bubble on Dashboard + Overview, answers in English or Amharic, with clickable citations that deep-link back into the product.
- **MCP endpoint** — query DXM Pulse directly from Claude Desktop or Cursor. JSON-RPC 2.0 over bearer token; 4 read-only workspace-scoped tools. Settings → Connections ships a generate/list/revoke UI and a copy-ready Claude Desktop config snippet.
- **Per-session AI Recap** — every session now opens with a Claude-generated headline, narrative, friction moments, and opportunities (deterministic fallback when no API key).
- **Core Web Vitals surface** — LCP / INP / CLS / FCP / TTFB percentiles with Google-threshold colouring, range + device toggles on Dashboard and Client Detail.
- **Expanded friction detection** — dead clicks, U-turns, and form-abandonment detectors on top of the existing rage-click engine.
- **Auto journey map** — top-10 path Sankey on Client Detail (self-rolled SVG, no heavy dep).
- **SDK v2** — modular TypeScript rewrite, 3.6 KB gzipped, dead-click + form events, privacy API (`window.dxm.privacy`). v1 stays byte-frozen so no live installation breaks.

## 🚀 Key Features

- **Dashboard** — real-time metrics, live sessions, Core Web Vitals, Friction Index, and Ask Pulse chat  
- **Session Replay + AI Recap** — rrweb playback with Claude-generated narrative, friction moments, and opportunities  
- **Insights Engine** — rule-based detection (bounce rate, traffic drop, low engagement) plus dead-click / U-turn / form-abandon detectors  
- **Alerts System** — database-backed alerts with email + Telegram delivery  
- **Analytics Suite** — heatmaps, funnels, user flows, journey Sankey, Core Web Vitals percentiles  
- **Reports (Decision Layer)** — executive summaries, KPIs, recommendations, exports  
- **Ask Pulse** — natural-language analytics chat (Claude tool-use, English/Amharic)  
- **MCP endpoint** — query your workspace from Claude Desktop / Cursor over bearer token  
- **Billing (Chapa Integration)** — full payment flow with activation + fallback  
- **Observability** — structured logs, request IDs, optional Sentry integration  

---

## 🧠 Product Positioning

DXM Pulse is built as a **premium agency operating system**, not just an analytics dashboard.

It answers:
- What are users doing?
- Where are they dropping off?
- What should I fix?

---

## 🏗 Tech Stack

**Frontend**
- React (Vite)
- TypeScript

**Backend**
- Node.js (Express)
- TypeScript

**Database**
- SQLite (better-sqlite3)

**Integrations**
- rrweb (session replay)
- Chapa (payments)
- SMTP (email delivery)
- Telegram (alerts + digest)
- Sentry (optional error tracking)

---

## 📦 Monorepo Structure

```text
.
├── apps/
│   ├── api/        # Backend (Express + SQLite)
│   └── web/        # Frontend (React + Vite)
├── packages/
│   ├── contracts/  # Shared types + DTOs
│   └── sdk/        # Tracking SDK (events + replay)
├── docs/           # Architecture, roadmap, API docs
├── .env.example
└── package.json


⸻

⚙️ Getting Started

1. Install dependencies

npm install


⸻

2. Configure environment

cp .env.example .env

Minimum required:

JWT_SECRET=your_secret_here
JWT_REFRESH_SECRET=another_secret_here

Optional:
	•	SMTP (email)
	•	Chapa (payments)
	•	Telegram (alerts)

⸻

3. Setup database

npm run migrate -w apps/api
npm run seed -w apps/api   # optional


⸻

4. Run locally

npm run dev

Starts:
	•	Web → http://localhost:5173
	•	API → http://localhost:4000
	•	SDK → watch mode

⸻

5. SDK (optional dev server)

npm run dev:sdk:serve


⸻

6. Build

npm run build


⸻

📊 Usage Flow
	1.	Sign up → /signup
	2.	Create workspace + add site
	3.	Install tracking snippet (SDK)
	4.	Verify tracking
	5.	View:
	•	Dashboard
	•	Sessions & replay
	•	Insights
	•	Alerts
	•	Reports

⸻

📡 Observability & Production Features
	•	Structured JSON logging
	•	Request correlation (X-Request-Id)
	•	ErrorBoundary (frontend crash protection)
	•	Health check endpoint (/health)
	•	Optional Sentry integration (frontend + backend)

⸻

📜 Scripts

# Run full stack
npm run dev

# Run individual apps
npm run dev -w apps/web
npm run dev -w apps/api

# SDK dev server
npm run dev:sdk:serve

# Build
npm run build

# Lint + type check
npm run lint
npm run check


⸻

📈 Current Status
	•	✅ Feature complete (Sprint 1–11.6)
	•	✅ Production ready (Sprint 12)
	•	✅ Observability implemented (Sprint 13)
	•	✅ Testing & CI pipeline (28+ integration suites, GitHub Actions)
	•	✅ Session 3 — SDK v2, Ask Pulse, session AI, Core Web Vitals, MCP endpoint

⸻

🛣 Roadmap
	•	Team invites & role enforcement
	•	Shareable client report links
	•	Performance: route-level code splitting
	•	Landing & onboarding improvements

⸻

📚 Documentation
	•	docs/architecture.md
	•	docs/api-reference.md
	•	docs/database-schema.md
	•	docs/product-roadmap.md
	•	docs/current-status.md
	•	docs/sdk-integration.md

⸻

⚠️ Known Limitations
	•	SQLite concurrency (single-writer)
	•	No automated DB backups (manual script only)
	•	No request tracing UI (logs only)

⸻

🧾 License

TBD

---

