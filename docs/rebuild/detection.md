# Fix detection, verification and alerts (slice 3)

How Pulse turns visits into Fix cards, proves a fix worked, and tells people. Code:
`next/packages/detectors` (pure), `next/apps/worker/src` (jobs), `next/apps/api/src/routes`
(`fixes.ts`, `telegram.ts`). Every threshold below is a named constant in
`packages/detectors/src/thresholds.ts`; tests pin each boundary.

## Detectors

All run in `detect.site` (every ~2 min per recently active site) over a rolling 24 h window,
inside the org's RLS scope. One issue per (site, fingerprint); a recurring problem refreshes its
row. Money pages (checkout, cart, pay, order, book, sign-up, register) turn critical sooner.

| Kind | Reads | Groups by | Becomes a fix when | Critical at |
|---|---|---|---|---|
| `rage_click` | `rc` | page template + element | ≥ 3 visits | 10 visits (money page: 5) |
| `dead_click` | `dc` | page template + element | ≥ 5 visits | 25 visits (money page: 5) |
| `form_abandon` | `fs` `fx` `fe` | page template + form | ≥ 5 abandoned visits **and** ≥ 40% of starts | 20 visits (money page: 5) |
| `slow_page` | `vt` (LCP, INP) | page template + metric, split by network | ≥ 10 visits measured and p75 ≥ poor line (LCP 4 s, INP 500 ms), overall **or** on any network with ≥ 5 visits | p75 ≥ 2 × poor (8 s / 1 s), or any money page |
| `js_error` | `er` | normalized message + script (pages are evidence) | ≥ 5 visits | 25 visits (on a money page: 5) |
| `u_turn` | `pv` | the page visitors bounce back from | A → B → A within 10 s, ≥ 5 visits **and** ≥ 25% of visits that opened B | 25 visits (money page: 5) |
| `tracking_broken` | visits | site | see below | ≥ 50 visits/day usually |

Notes:
- **Form abandonment** waits 30 minutes after a visit's last form start (or for the visit to end)
  before counting it, so people still typing aren't counted.
- **JS errors**: ids, long numbers, urls and uuids are collapsed in messages; script urls lose
  their query string. `Script error.` (opaque cross-origin) and `ResizeObserver loop…` are ignored.
- **U-turns** use the browser clock to order pageviews inside a batch (one batch shares a server
  time), and fall back to server time when a visit has no plausible client clock.
- **Tracking broken** runs hourly (`detect.tracking`), not on activity, because a broken site
  produces none. It needs ≥ 5 visits/day over the week before the last activity, and silence of
  at least `max(6 h, 8 × the site's usual gap between visits)`. When data comes back, the issue is
  marked fixed (`reason: resumed`) and verification confirms it kept flowing for 24 h.
- A fixed issue ignores occurrences for 30 minutes after `fixed_at` (deploy lag), then reopens on
  regression. Dismissed issues stay dismissed.

## Verification (`issue.verify`)

Hourly, `issue.verify-sweep` lists fixed issues whose after-window is complete (narrow SECURITY
DEFINER function, ids only) and queues one `issue.verify` per issue.

- **Windows:** the 7 days before `fixed_at` vs days 3–7 after it (tracking: the 24 h after).
- **Measure:** the same grouping the detector used.
  - Rate kinds: affected visits ÷ exposed visits (clicks: visits that viewed the page; forms:
    visits that started it; JS errors: all visits; U-turns: visits that opened the page).
  - Slow pages: p75 of the metric on the template.
  - Tracking: visits arriving.
- **Outcome:**
  - `verified` when the after rate is ≤ half the before rate (or zero), the p75 is under the poor
    line, or data kept flowing.
  - `reopened` otherwise.
  - `waiting` while the after window has < 20 exposed visits (< 10 measured for speed). Pulse keeps
    checking until 28 days after `fixed_at`, then leaves it fixed.
- The result is stored in `issues.verification` and shown on the fix and in Today's verified rows.
  A person changing the status meanwhile wins (conditional update on status and `fixed_at`).

## Telegram alerts

- **Server setup:** create a bot with @BotFather, then set
  - `TELEGRAM_BOT_TOKEN` (secret)
  - `TELEGRAM_BOT_USERNAME` (without `@`)
  - `TELEGRAM_WEBHOOK_SECRET` (`openssl rand -hex 24`; required in production)

  Register the webhook once:

  ```bash
  curl -sS "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
    -d url=https://app.dxmpulse.et/api/v1/telegram/webhook \
    -d secret_token=$TELEGRAM_WEBHOOK_SECRET \
    -d 'allowed_updates=["message"]'
  ```

  Without a token, Settings and Today say alerts aren't set up; nothing else changes.
- **Linking (owners/admins):** Settings → Notifications → "Connect a Telegram chat" creates a
  single-use code (only its SHA-256 is stored, expires in 15 minutes) and a `t.me/<bot>?start=<code>`
  link. Telegram calls the webhook (secret header checked in constant time); a SECURITY DEFINER
  function consumes the code and links the chat to that code's org. One chat per org; linking
  again replaces it.
- **What's sent:** after each detection run, one message per site listing the fixes that were
  created, escalated to critical, or reopened (also when verification reopens one). Fixes that
  were fixed or dismissed before the message goes out are dropped. Plain text, no markup.
- **Quiet hours:** whole local hours (Africa/Addis_Ababa), e.g. 22 → 7. An alert that lands inside
  them is re-queued to send when they end.
- **Language:** each chat picks English or Amharic (defaults to the language of the person who
  linked it).
- A chat that blocked or removed the bot (403, "chat not found") is unlinked instead of retried.

## AI suggested fixes (`ai.recommend`)

- **Off by default.** On only with `AI_ENABLED=1` **and** `ANTHROPIC_API_KEY`. `AI_MODEL` picks the
  model; `AI_MONTHLY_BUDGET` caps calls per org per calendar month (UTC).
- With AI off, the API returns `suggestion: null` everywhere (even if older suggestions are
  stored), `/public-config` says `aiEnabled: false`, and the UI hides every AI box. Nothing is faked.
- Queued for new and reopened fixes. Cached in `ai_artifacts` by (issue, hash of the evidence),
  so the same evidence never pays twice.
- **The model sees** the fix kind, the site domain and the detector evidence: paths, selectors,
  form and field names, error messages, counts. It never sees visitor ids, replays or anything
  visitors typed. Evidence goes in a `<data>` block with an instruction not to follow
  instructions inside it (ADR-009).
- The reply must be JSON (`{text, code}`); anything else is dropped, not stored.

## Tenancy

`issues`, `issue_events`, `telegram_links`, `telegram_link_codes` and `ai_artifacts` are under
forced RLS with org policies (the RLS invariant test covers them). Cross-org work happens only
through narrow SECURITY DEFINER functions that return ids:

- `pulse_sites_with_recent_activity`
- `pulse_live_sites`
- `pulse_issues_due_for_verification`
- `pulse_claim_telegram_link`

Each per-org step then runs in `withOrg`.
