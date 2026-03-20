# Product Roadmap

This roadmap is grounded in the current codebase, which is now positioned around agency operations rather than a generic single-site dashboard.

## Immediate Priorities

### 1. Make the current product unmistakably valuable

- Keep the landing page, demo, overview, and reports focused on agency outcomes
- Push more plain-language insight into the overview, client detail, and digest
- Tighten the mobile experience on the most-used operator screens
- Keep removing UI that implies unfinished behavior

### 2. Finish the revenue path

- Turn manual billing into a real Chapa flow
- Decide whether Telebirr should be direct or supported through Chapa only
- Add clear agency-tier upgrade confirmation, billing history, and plan-change states

### 3. Strengthen retention

- Scheduled weekly digest job in production
- Better alert tuning and workspace-level preferences
- Funnel templates tied to common Ethiopian client journeys
- Stronger report exports for weekly account management rituals

## Next Two Engineering Weeks

### Week 1

- Finish end-to-end Chapa billing flow for agency plans
- Add richer live setup verification and editing for client sites
- Improve overview, clients, landing page, and reports responsiveness at 375px width
- Add better operator-level insight copy to alerts, sessions, analytics, and reports

### Week 2

- Expand seed/demo data for stronger sales demos
- Add benchmark-style comparisons for page speed, drop-off, and client-site health
- Improve reporting and export surfaces without falling back to mock pages
- Add a lightweight scheduling story for weekly digest in deployment docs
- Add team-level permissions and better internal collaboration states in Settings

## DXM Pulse AI

DXM Pulse AI should be layered onto the live system once the billing and retention foundations are strong.

### Best first AI surfaces

- Plain-language weekly summaries in English and Amharic
- AI-generated explanations for alert spikes and funnel drop-offs
- Recommended fixes based on replay, vitals, and alert combinations
- “What changed this week?” summaries for founders and operators

### Avoid as a first step

- A generic chatbot with no deep product context
- AI pages that duplicate charts without changing decisions
- Anything that requires inventing data where the underlying telemetry is thin

## Longer-Term Business Upgrades

- Agency and partner onboarding flow
- Benchmarks by business type, traffic profile, or client vertical
- Stronger operator-ready reports that can be shared outside the product
- More local payment, support, and onboarding flows tailored to Ethiopian SMEs
- White-label and reseller workflows if the agency channel proves strong
