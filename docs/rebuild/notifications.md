# Notifications (task 15)

How Pulse reaches people outside the app: Telegram (see [detection.md](detection.md#telegram-alerts)),
web push, the Monday email, and the installable PWA.

## Quiet hours: one rule

- Stored per org in `notification_settings` (`quiet_start`, `quiet_end`, `time_zone`; no row = always
  send, Addis Ababa time). Owners and admins set them in Settings → Notifications; members see them.
- Telegram and web push both call `quietUntil()` from `@pulse/mail/quiet-hours`: [start, end) in whole
  local hours, start > end wraps past midnight. An alert inside quiet hours is re-queued for the
  instant they end; nothing is dropped. Boundary tests: `packages/mail/src/quiet-hours.test.ts`.
- Migration `0018` moved the old per-chat quiet hours off `telegram_links` into this table. The
  Telegram status still reports them (read-only mirror), and `PATCH /telegram` still accepts them.

## Web push

- **Keys:** `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (both or neither; make a pair with
  `pnpm --filter @pulse/api vapid:keys`) and `VAPID_SUBJECT` (`mailto:` or `https://`), on the API
  and the worker. Without keys, Settings says push is "not configured" and the API refuses
  subscriptions (409). The private key is only used to sign; it is never logged.
- **Sending** (`packages/mail/src/push.ts`): VAPID (RFC 8292) JWTs signed with Node's crypto and
  aes128gcm payload encryption (RFC 8291), no third-party library. Endpoints must belong to a real
  browser push service (FCM, Mozilla, Apple, Windows), so the server never POSTs to an arbitrary URL.
  404/410 deletes the subscription.
- **Subscriptions** (`push_subscriptions`): per user and org (one row per browser per org), forced
  RLS, and a composite FK to `member` so leaving the org removes them. Each member manages only
  their own browsers (max 10 per org).
- **Permission:** asked only when the person presses "Turn on for this device" in Settings →
  Notifications. Nothing prompts on page load.
- **What's sent:** `alert.push` carries the same news as `alert.telegram` (created / escalated /
  reopened fixes) to every subscribed browser of the org's owners, admins and members, in each
  person's language. One fix opens that fix; several open Today. `tag` = site, so a newer alert
  replaces an older one for the same site.

## Monday email

- `digest.sweep` runs Mondays at 04:13 UTC (07:13 in Addis Ababa) and queues one `digest.org` per
  org with sites (`pulse_digest_orgs()`), keyed by org and week.
- The week is the 7 UTC days before that Monday. Content: fixes opened, marked fixed and verified
  that week; the top open fix (critical first, then most visitors); each site's health with its
  change on the week before (from rollups; "not enough visits" when there is no score).
- **No activity, no email:** an org with no fixes moving and no visits that week gets nothing.
- Recipients: owners, admins and members (not client viewers) whose `notification_prefs.weekly_digest`
  is on (default on). A member already sent that week's digest is skipped, so a retried job doesn't
  send twice. English or Amharic per person (Ethiopian calendar dates in Amharic).
- **Unsubscribe:** each membership has a random `unsubscribe_token`. The email links
  `/unsubscribe.html#<token>` (the token stays in the fragment, out of server logs; the page asks
  before doing anything) and carries `List-Unsubscribe` + `List-Unsubscribe-Post` for one-click
  (RFC 8058) to `POST /api/v1/public/digest/unsubscribe/:token`. GET does nothing, so link scanners
  can't unsubscribe anyone. The token can only switch that one digest off. The switch is also in
  Settings → Notifications.

## PWA

- `public/manifest.webmanifest` with 192/512 PNG icons and a maskable 512 icon.
- `public/sw.js` caches the **app shell only**: navigations (network first, cached `/` offline),
  hashed `/assets/*` (cache first), `boot.js`, icons and the manifest. It never touches `/api`, the
  collector, other origins or non-GET requests. Tests: `src/lib/sw.test.ts` and `e2e/notifications.spec.ts`
  (no `/api` response ever lands in the cache).
- It registers from `boot.js` after load, only on built pages. Neither the worker nor its
  registration is part of first-load JS. Caddy serves `sw.js` and the manifest with `no-cache`.
- The unsubscribe page is a separate Vite entry (`unsubscribe.html`), so it adds nothing to the
  app's first load either.
