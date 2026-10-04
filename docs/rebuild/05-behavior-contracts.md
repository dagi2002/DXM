# 05 — Behavior Contracts to Preserve

These contracts come from the current API test suite (37 files, 138 tests, all passing on 2026-10-04). The rebuild ports their **intent**, not their exact shapes. Where the rebuild deliberately changes a contract, the entry says so (⟶), and the reason is recorded in an ADR.

## Auth & accounts
1. Signup creates an owner and a workspace on the free plan, sets session cookies, and sends a welcome email. Fit-profile answers (`agencyType`, `managedSitesBand`, `reportingWorkflow`, `evaluationReason`) are stored and readable in settings.
2. `me` returns 401 without a session. Logout invalidates the session immediately. ⟶ Sessions are DB-backed (ADR-004), so logout and password reset revoke **all** sessions, not just cookies.
3. A wrong password returns 401 with no account enumeration (uniform timing ⟶ add a dummy hash compare).
4. A token signed with a foreign secret is rejected. ⟶ Replaced by opaque session ids.
5. **Password reset:** forgot always returns 200. Tokens are 32-byte random, stored as sha256, expire after 1h, and are single-use. Reset kills existing sessions. Expired, reused, or random tokens return 400 with one generic message.
6. **Invites:** owner/admin only. The token is never returned in API bodies. The email link contains it. Public preview shows `{email, role, orgName}`. Accept creates the member and logs them in. Reuse returns 410. Revoked returns 404. Expired returns 410. Re-inviting replaces the earlier invite. Inviting as owner returns 400. ⟶ Inviting an existing account **adds a membership** instead of returning 409 (users can belong to many orgs).
7. **Viewer/member role cannot:** invite, create sites, change settings, create funnels, create API keys, or create share links (403). ⟶ Also cannot: create manual alerts, resolve alerts, or start payments (gaps today).

## Sites
8. A site id is opaque. The domain is normalized (no scheme, no trailing slash). A new site is `verified:false` with tracking status `install` and comes with a snippet.
9. The snippet includes the API URL only when configured. Values are trimmed and trailing slashes removed.
10. Verification flips to true after the first ingested session and returns the session count. The first session sends exactly one "site is live" email.
11. **A foreign org's site returns 404, never 403** (existence is never leaked). This applies to every resource type.
12. Deleting a site with no data returns 204. ⟶ Deleting a site **with** data is allowed: soft-delete, then purge after 7 days, with a confirmation typed by the user (today it returns 409 forever, which makes sites undeletable).

## Ingestion
13. An unknown site key returns 404. A valid batch returns 2xx quickly. ⟶ The collector returns 204 and processes asynchronously.
14. Events accumulate across batches. `completed` finalizes the session: end time, duration, clicks, max scroll depth, total events, bounce (single page), conversion (custom/goal event).
15. Ingest CORS is public and sends no credentials. ⟶ The SDK sends `text/plain` with `credentials:'omit'`, so no preflight is needed. The collector also answers preflights correctly for legacy SDKs (echoes the origin and allows `x-dxm-sdk`).
16. Ingest rate limiting is separate from dashboard rate limiting. ⟶ Limited per site **and per visitor session**, not per site alone.
17. Session quota is the plan's session count over the billing period. A new session over quota is rejected with code `session_quota_exceeded`. Existing sessions keep being accepted. Upgrades lift the quota instantly. ⟶ Replay ingest also counts toward the quota.
18. ⟶ **New:** a session is bound to its site. Events for an existing session id from a different site are rejected (this closes a cross-tenant injection hole).

## Replay & analytics
19. Replay chunks are stored in order and read back joined in order. A session with a replay shows `hasReplay`. ⟶ Chunks use sequence numbers assigned by the client and are never overwritten. Storage moves to object storage (gzip).
20. Heatmap points are scoped to the org and return click/scroll points with selector, coordinates, and depth.
21. **Web Vitals:** percentiles use `floor((n-1)*p)` ⟶ computed over **one final value per pageview** (`web-vitals` lib). Status is judged at p75 against Google thresholds. No samples gives `insufficient-data`. Device filter supported. Unsupported ranges return 400.
22. Journey: top paths by frequency. URLs are normalized to path only (no query or hash). Foreign site returns 404.
23. The overview summary includes total sites, live sites, and 7-day sessions. Each site rollup has verified status, tracking status, and 7-day sessions.

## Plans & billing
24. Site-limit violation returns `plan_limit_reached` with `{currentPlan, limitType, limit, currentCount, upgradePlan}`.
25. A gated feature returns `feature_not_in_plan` with `{feature, currentPlan, upgradePlan}`. Every paid feature is gated, including AI, share links, and API keys (some are ungated today).
26. Upgrade requests are recorded with site count and limit at request time, and are marked activated when the plan changes.
27. Chapa: initiate returns a checkout URL and a tx ref. Not configured → 503. Upstream failure → 502 with a distinct message.
28. Webhook: HMAC-SHA256 over the raw body, compared in constant time. Bad, missing, or conflicting signature → 401. Unknown ref → 200 no-op. Success activates. Duplicates are harmless. ⟶ The webhook also **calls Chapa's verify endpoint and checks amount and currency**. Every payment is recorded in a `payments` ledger. Each attempt gets a unique tx ref, and refs are never overwritten. Plans have periods and expire.
29. Admin plan override needs an admin credential. Unknown org → 404. Unset secret → 503. ⟶ Becomes a role-gated staff console with an audit log.

## Alerts, email, digest
30. Critical alerts send email. Email opt-out suppresses site-live and critical emails.
31. Alert detail includes the AI explanation (why it fired, recommendations, state). Resolving updates the state. Unknown alert → 404.
32. **Friction thresholds (keep exactly as the starting point):**
    - Dead clicks: ≥3 on the same target within 10 minutes (2 does not fire).
    - U-turn: A→B→A within 30s (35s does not fire).
    - Form abandonment: ≥20 starts **and** >50% drop-off (exactly 50% does not fire).
    - Rage click: ≥3 clicks on the same target within 2s.
    - Slow LCP: p75 > 4000 ms.
    - Open-issue dedup per (org, site, type, fingerprint).
33. The digest job requires a secret. It counts only successful sends and logs failures. ⟶ Becomes an idempotent worker job with a `digest_runs` table.

## AI
34. AI can be disabled globally. When disabled, no `ai` keys appear and nothing is stored.
35. Briefs follow a fixed shape (`period, mode, headline, summary, topRisk, topOpportunity, recommendations[], evidence[]`). Every AI surface has a deterministic fallback.
36. Briefs are cached by input hash. Identical input returns identical output. ⟶ The hash excludes volatile fields (last activity time, latest session id), so caching actually works.
37. Fallback wording: "Not enough signal yet for X", "Add your first client site", "Tracking is not live on X yet", "X looks stable this week". ⟶ Moves to i18n keys in both languages.
38. Ask: requires auth, question length 3–500, and falls back gracefully with no key.
39. Session summary: `{headline, narrative, frictionMoments[], opportunities[]}`. Foreign session → 404.

## API keys & MCP (v1.x)
40. A key is `dxm_live_` + 64 hex characters, displayed with a 12-character prefix. The raw key is shown once and never listed again. Revocation is idempotent and takes effect on the very next call. A foreign key → 404.
41. MCP: bearer auth, JSON-RPC errors (−32601/−32600/−32602), notifications return 204, unknown tool returns `isError`, strict org isolation.

## Shared reports
42. A share link returns a public URL with a token. Listings never include tokens. Revoked, expired, or unknown → 404. The public payload is **whitelisted** (never the site key, snippet, or internal ids) ⟶ and entry URLs are scrubbed of query strings.

## Platform
43. Dashboard CORS is an allowlist with credentials. In dev it allows any localhost port (but not lookalike hosts). Production blocks localhost. The dev escape hatch is ignored in production.
44. Health reports DB status, uptime, and time. ⟶ Split into `/livez` and `/readyz` (DB, object storage, queue).
45. Every authenticated route returns 401 without a session.
