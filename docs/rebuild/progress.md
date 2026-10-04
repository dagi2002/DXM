# Rebuild Progress Log

## 2026-10-04 — Phase 0 (audit) and Phase 1 (spec & architecture) complete

**Status:** Phase 1 approved on 2026-10-04. Phase 2 started.

**Done**
- Four parallel audits (frontend, backend/data, SDK/privacy, tests/ops/docs), plus a live walkthrough and a live cross-origin SDK test.
- API suite: 37 files, 138 tests passing in 37s.
- Deliverables 00–05, the design system HTML, and ADR-001 to ADR-012.
- Added `.claude/launch.json` (api :4000, web :5173; port 5000 is taken by macOS AirPlay).

**Founder decisions (2026-10-04)**
1. Pilots: **rebuild only.** No hotfix or deploy of the legacy app. (Recommendation was hotfix + pilots in parallel. The founder chose otherwise.)
2. Mobile: **PWA + Telegram bot in v1**, Expo companion app in slice 8. ADR-006 accepted.
3. ICP: **transactional businesses first, agencies as a channel.**
4. Brand: **Abay blue.** Design system accepted.
5. Hosting: not asked. Using the ADR-008 default (international VM + Ethiopian-VM option).
6. Pricing: stays a hypothesis (01 §7). Only the plan catalog structure is built. Prices get validated with pilots.

## Customer evidence
_(Add a line per pilot conversation: who, segment, pain, willingness to pay, quote.)_
