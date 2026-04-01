# Product Roadmap

This roadmap is grounded in the current codebase, which is positioned around agency operations rather than a generic single-site dashboard.

Last updated: 2026-04-01

## Recently Shipped (Session 2)

### UX Polish

- Settings sidebar navigation (Identity, Team, Sites, Connections, Billing, Signals) with sticky “Unsaved Changes” save bar
- Dashboard Friction Index metric — computed from alert pressure and bounce rate; emerald/amber/red colour coding
- Dashboard activity charts renamed to “Session Activity (last 24h)” and “Weekly Completion Trend (7d)”
- Heatmap stats panel fully redesigned — mode-aware (Click/Scroll/Hover show different content), prettified CSS selectors, intensity colour legend, icon pill mode selector
- Login page: “Enter your workspace” heading, rotating daily stats, SSL trust badge
- Signup page: 3-step milestone bar, ETB/Chapa trust signal, specific testimonial
- Navigation: EN / አማ language toggle pill with active-language highlighting
- Amharic localization: all 80+ translation keys confirmed complete in both locale files

### AI Upgrade

- DXM Pulse AI now supports LLM mode via `ANTHROPIC_API_KEY` (Claude) in addition to deterministic fallback
- AI Portfolio Brief shows AI (blue) vs AUTO (gray) mode badge in the UI
- Regenerate button on Overview page busts the 24-hour artifact cache on demand
- Reports Executive Summary pulls `siteDetail.ai.summary` with AI badge when available
- Reports Friction Signals section — renders active open alerts with affected session counts

### Marketing & Demo

- Landing page: competitive comparison table (vs Google Analytics, Hotjar/Clarity), bandwidth badge (~12KB · async · 3G-ready), ETB/Chapa payment callout, icon-enhanced workflow steps
- Demo page: Telegram notification simulation panel, Agency ROI widget, “Generate Client Email” modal with pre-written draft, evidence chips on alert cards

---

## Immediate Priorities

### 1. Finish the revenue path

- Turn manual billing into a real end-to-end Chapa flow
- Decide whether Telebirr should be direct or via Chapa only
- Add agency-tier upgrade confirmation, billing history, and plan-change states

### 2. Strengthen retention

- Scheduled weekly digest cron job in production (document trigger approach)
- Better alert tuning and workspace-level alert preferences
- Funnel templates for common Ethiopian client journeys
- Stronger PDF/print export for weekly account management rituals

### 3. Tighten mobile experience

- Overview, Clients, Reports, and Settings responsiveness at 375px
- Bottom tab bar improvements for analytics and alerts

---

## Next Two Engineering Weeks

### Week 1

- End-to-end Chapa billing flow for agency plan upgrades
- Live setup verification improvements (richer polling states, instant snippet copy)
- Reports: sparklines on key metrics, session highlight thumbnails
- Mobile polish on the three most-used operator screens

### Week 2

- Expand seed/demo data for more compelling sales demos
- Benchmark comparisons for page speed and client-site health
- Lightweight production scheduling guide for weekly digest
- Team-level permissions and internal collaboration states in Settings

---

## DXM Pulse AI — Next Phases

Shipped so far: LLM-backed portfolio brief, site brief, alert brief, funnel brief (all with deterministic fallback).

Next:

- Digest AI — LLM-generated weekly Telegram digest narrative
- Alert AI — natural-language explanation for alert spike context
- Amharic-first AI output — prefer Amharic when workspace digest language is set to Amharic

Avoid until telemetry is richer:

- A generic chatbot with no deep product context
- Revenue-at-risk or churn-prediction metrics (need e-commerce instrumentation)
- Anomaly detection requiring statistical baseline data (needs 30+ days of history)

---

## Longer-Term Business Upgrades

- Agency and partner onboarding flow
- Benchmarks by business type, traffic profile, or client vertical
- SSO (Google / GitHub login)
- Omnichannel signals (mobile app, email, CRM integrations)
- Role-based views (Marketer vs DevOps vs Account Manager toggle)
- White-label and reseller workflows if the agency channel proves strong
