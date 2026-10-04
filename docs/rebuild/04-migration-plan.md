# 04 — Migration Plan

Status: proposal for approval (Phase 1).

## Principles
1. The current app keeps running, with the hotfixes from `00-audit.md`, until the rebuild reaches parity on the core loop.
2. No SDK snippet that a customer installed ever needs to change.
3. No public URL ever 404s: `/r/:token`, `/accept-invite`, `/reset-password`, `/dxm.js`, `/dxm.v2.js`.
4. Cutover happens once, during a scheduled low-traffic window (Sunday night, Addis time), with a rehearsed rollback.

## 1. URLs and SDK compatibility

| Legacy | Rebuild behavior |
|---|---|
| `/dxm.js` (v1), `/dxm.v2.js` (v2) | Served as **compatibility shims**. They keep the same public API (`window.dxm.track`, `identify`, `privacy.*`) and read the same `data-site-id` / `data-api-url` attributes, but run on the v3 transport. Both shims are covered by tests. A "frozen" file is no longer possible anyway, because current v1 output changes with contracts and esbuild versions. |
| `/dxm-replay.js`, `/dxm-replay.v2.js` | Shim to the v3 replay module, with text masking ON (a deliberate privacy change, noted in the release notes). |
| `POST /collect`, `/collect-replay/replay` (JSON, legacy payload shape) | The collector accepts the legacy route and shape, maps them to v3 (`siteId` → public key, `sessionId` → visit id bound to the site), and answers CORS preflights correctly (echoes the origin, allows `x-dxm-sdk`). This **also rescues legacy installs whose data is currently lost**. |
| `/r/:token` | Same path. Old tokens are migrated (they're already sha256 at rest, so they carry over unchanged) and expiry dates are preserved. |
| `/accept-invite?token=`, `/reset-password?token=` | Same paths. Pending invites migrate as Better Auth invitations, keeping their hashes and expiry. Reset tokens are **not** migrated, because they live for 1 hour. |
| `/dashboard`, `/overview`, `/clients/:id`, `/sessions`, `/analytics/*`, `/alerts` | Client-side redirects to `/today`, `/sites/:id`, `/replays`, `/sites/:id/insights/*`, and `/today?filter=alerts`. |
| `/mcp`, API keys (`dxm_live_…`) | Re-added in v1.x with the same key format. Existing keys migrate, since they're peppered hashes and the pepper is kept. |

## 2. Data migration (SQLite → PostgreSQL)

There are no production users yet, so the migration mainly matters for any pilots started on the hotfixed current app. Script: `next/packages/db/migrate-legacy.ts` (idempotent, resumable, dry-run mode).

| Source | Target | Notes |
|---|---|---|
| `workspaces` | `orgs` + `subscriptions` | Plan maps 1:1 (free / starter → Business / pro → Growth, at the grandfathered price). Telegram tokens are re-encrypted. |
| `users` | `users` + `memberships` + `accounts` | **Password hashes:** existing users are migrated as bcrypt, verified with bcrypt on first login, then transparently re-hashed to argon2id. Emails are lowercased, and case-duplicates are merged after a manual review report. |
| `sites` | `sites` | Gains `allowed_origins = [domain, www.domain]`. Keeps `site_key` as `public_key`. |
| `sessions` + `events` | `visits` + `events_*` partitions | Only data inside the target plan's retention window is migrated. `value_text` is parsed into typed columns. Vitals are recomputed as one value per pageview (best effort: last LCP candidate, summed CLS window). |
| `session_replays`, `session_replay_chunks` | Object storage + `replay_chunks` | Recompressed. Chunks found to be overwritten get flagged as `incomplete`. |
| `alerts` + `insights` | `issues` | Mapped by detector kind to a fingerprint. Status open/resolved becomes open/fixed. |
| `funnels` | `funnels` + `funnel_steps` | Regex steps are converted to glob where possible. The rest go to a manual review list. |
| `report_shares`, `workspace_invites`, `workspace_api_keys` | Same concepts | Hashes are preserved. |
| `upgrade_requests` | `payments` (historical, read-only) | |
| `ai_artifacts` | Not migrated | They are regenerated. |

**Verification:** row counts per org, plus checksums of per-site session counts by day, plus a spot-check UI that compares old and new dashboards for the pilot orgs.

## 3. Cutover runbook (summary)

1. **T−7d.** Freeze schema changes on the legacy app. Rehearse the full migration on a production snapshot in staging and record timings.
2. **T−1d.** Notify pilots (Telegram and email, in Amharic and English): ~30 minutes of dashboard downtime. Tracking keeps flowing.
3. **T0.**
   1. Put the legacy dashboard in read-only mode.
   2. Point `/collect` at the new collector, which buffers into the queue.
   3. Run the migration.
   4. Run verification.
   5. Switch Caddy routes for the app and API.
   6. Run smoke tests: login, Today, replay, report share, Telegram test message.
4. **Rollback (any step fails).** Switch the Caddy routes back. The legacy DB is untouched (read-only snapshot). Events received during the window are replayed into legacy from the queue's export.
5. **T+7d.** Retire the legacy app. Archive the SQLite file to cold storage for 90 days, then delete it per the retention policy.

## 4. Repository transition

- The rebuild lives in `next/` on the branch `rebuild`. The legacy `apps/` and `packages/` stay untouched apart from approved hotfixes on `main`.
- After cutover, `next/*` moves to the repo root in a single commit. The legacy tree goes to `legacy/` for one release, then is removed.
- Clean-up at cutover: remove the broken `claude-skills` gitlink, the tracked empty `dxm.db`, `apps/api/archived/`, the `.replit` secrets, and `docs/qms` boilerplate. Mark the stale SDLC `.docx` files as superseded by `docs/rebuild/*`.
