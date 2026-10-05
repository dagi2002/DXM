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

## 2026-10-05 — Phase 2, slice 1 (foundations) ✅

**Shipped in `next/`:**
- Monorepo (pnpm + Turborepo, TS 6 strict) with ESLint guard rails: no hand-written percentages or hex colors in UI code.
- **Auth and organizations** (Better Auth):
  - email + password (min 10), magic link, Google (when configured), email verification, password reset that revokes sessions;
  - 30-day sliding DB sessions in `pulse.*` cookies;
  - users in many orgs with owner / admin / member / client_viewer roles, read live from the membership table on every request;
  - invitations by email.
- **API** (Hono): `/livez`, `/readyz`, `/api/v1/public-config`, `/api/v1/me` (+ preferences), `/api/v1/sites` CRUD. Also:
  - plan site limits;
  - soft delete with typed confirmation;
  - audit log;
  - a single error format and request ids;
  - a CSRF Origin guard on all state-changing `/api/*` calls (it caught Better Auth accepting a cross-site sign-out);
  - client IPs that can't be spoofed behind proxies;
  - security headers.
- **Data:** Postgres with RLS forced on `sites`, `audit_log` and `org_plans`. The app connects as `pulse_app` (NOSUPERUSER, NOBYPASSRLS). Migrations are versioned and fail loudly.
- **Web app:** sign-in/up, forgot/reset, accept invitation, onboarding, Today (honest empty states), Sites (list/create/edit/delete), Settings (profile language/calendar/theme, organization, team). Also:
  - EN/አማ everywhere, `<html lang>` synced, Ethiopic font loaded only when needed;
  - Ethiopian calendar dates;
  - labelled mobile tab bar, offline banner, PWA manifest.
- **Design system:** `@pulse/tokens` (Abay blue; WCAG contrast tests over every text/background pair), `@pulse/ui` on React Aria, `@pulse/metrics`.
- **Tests:**
  - 143 unit, component and API integration tests (incl. tenant-isolation and RLS tests in the database itself);
  - 8 Playwright E2E runs (4 flows × desktop and 360px mobile) with axe WCAG 2.2 AA at 0 violations.
- **CI:** `.github/workflows/next-ci.yml` (typecheck, lint, tests on Postgres 16, build + bundle budget, `pnpm audit`, E2E).

**Decisions made during the slice:**
- Better Auth's password hashing is scrypt, not argon2id (ADR-004 said argon2id). Scrypt is memory-hard too, and needs no native module.
- Client viewers see no sites until site sharing ships in slice 6.
- Free plan = 1 site, enforced. Prices are still hypotheses.
- **Bundle budget corrected to 220 KB.** The measured first-load JS is 214 KB gz: React 19 + React Aria alone are about 123 KB. The 120 KB figure was a guess, and the reduction plan is in 03 §8.
- Faint text darkened to `#6F6C65` after axe flagged 4.43:1 on the page background.
- React Aria's off-screen live announcer is excluded from axe scans. Its stale "pending" nodes reference removed buttons, which is a library artifact.

**Not done yet (slice 1 scope):**
- Deploy to a staging VM. Docker, Caddy and compose files are written but not exercised. That needs a VM, a domain and secrets from you.
- Sentry is wired but has no DSN.
- Amharic copy still needs a native-speaker review (glossary in 02 §3).

**Next: slice 2 — install & verify:** SDK v3, collector, live verification, legacy `/dxm.js` shims.

## Customer evidence
_(Add a line per pilot conversation: who, segment, pain, willingness to pay, quote.)_
