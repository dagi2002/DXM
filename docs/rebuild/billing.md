# Billing (slice 7)

Plans, invoices and payment through Chapa (hosted checkout, which covers telebirr, cards and bank apps). Code: `next/packages/billing` (Chapa client, lifecycle, ledger writes), `next/apps/api/src/routes/billing.ts`, `next/apps/worker/src/billing.ts`, migration `0015_billing`.

**Nothing here has taken a real payment.** Tests use a fake Chapa client, and the server only accepts test-mode payments until `CHAPA_MODE=live` is set. Going live is the founder's step (last section).

## Plans

Plans live in code: `PLANS` in `next/packages/contracts/src/constants.ts`, from [01-product-brief.md](./01-product-brief.md) §7. Prices are integer santim (1 birr = 100 santim).

| Plan | Price / month | Sites | Sessions / month | Data kept | Replays |
|---|---|---|---|---|---|
| Free | 0 | 1 | 1,000 | 7 days | no |
| Business | 2,400 ETB | 1 | 15,000 | 30 days | yes |
| Growth | 5,900 ETB | 3 | 60,000 | 90 days | yes |
| Agency | 9,900 ETB | 10 | 200,000 | 90 days | yes |

- A year costs 10 months (2 months free).
- **The brief gives Agency no session figure. 200,000 is a placeholder; confirm or change it in `PLANS`.**
- Not built: Agency's "700 ETB per extra site", Pulse Care and Enterprise (sold by hand; use the staff override to comp the plan).

## Environment

| Variable | Where | What |
|---|---|---|
| `CHAPA_SECRET_KEY` | api | Chapa secret key. Unset = billing is "not configured": plans and usage show, no pay links are made, the webhook answers 503. |
| `CHAPA_WEBHOOK_SECRET` | api | The "secret hash" you type into Chapa's dashboard (Settings → Webhooks). Required whenever the key is set. Generate with `openssl rand -hex 32`. |
| `CHAPA_MODE` | api | `test` (default) or `live`: the kind of payment this server accepts. A payment whose mode differs is never marked paid. The server refuses to start if the mode and the key disagree (test keys carry `TEST` in the prefix). |
| `BILLING_ADMIN_TOKEN` | api | Bearer token for the staff override. Unset = the override answers 503. Generate with `openssl rand -hex 32`. |
| `REPLAY_RETENTION_DAYS` | worker | Now a server-wide cap (default 90). Each org keeps what its plan allows. |
| `DATA_RETENTION_DAYS` | worker | Server-wide cap on raw events and visits (default 90, minimum 7). Each org keeps what its plan allows. |

Keys are read from the environment only. They are never logged, stored in the database, or sent to the browser.

## Ledger (migration 0015)

- `subscriptions`: one row per org that has ever started a paid plan. No row = Free.
- `invoices`: amount in santim, currency `ETB`, the period it buys, `open` / `paid` / `void`. At most one open invoice per org. Never deleted.
- `payments`: one row per Chapa attempt, with a unique `tx_ref` (`pulse-` + 24 random characters, never reused), the amount and currency, and what Chapa's verify endpoint last said. A row can only be `paid` with a verification on record (a check constraint).
- `org_usage`: sessions stored per org per usage month.
- `org_plans` (existing) stays the fast read for limits; billing keeps it in step.

All four new tables are under forced row-level security. The app role cannot delete from `invoices` or `payments`.

## Lifecycle

```
free ──choose a plan──▶ trialing (14 days) ──pay──▶ active ──renewal paid──▶ active …
                              │                        │
                    period ends unpaid         period ends unpaid
                              ▼                        ▼
                          past_due (7 days of grace, plan still works)
                              │ grace ends                 │ pay
                              ▼                            ▼
                          restricted ───────pay────────▶ active
```

- **Trial:** the first plan an org picks starts a 14-day trial, once. Switching plan during the trial just switches.
- **Renewal:** 7 days before a period ends, the hourly `billing.sweep` job makes the invoice for the next period and emails the owners (in their language). The owner can also ask for it early in Settings → Billing.
- **Past due:** the period ended with the invoice unpaid. The plan keeps working for 7 days from the due date. Owners are emailed.
- **Restricted:** grace is over. Pulse stores no new sessions and applies the Free limits (1 site, no replay recording, 7-day replay retention). **Nothing is deleted and everything stays readable.** Owners are emailed. Paying the open invoice restores the plan, with the paid period starting that day.
- **Plan change after the trial:** makes an invoice for the new plan. The plan changes when it is paid, and a new period starts that day. There is no proration.
- **Receipt:** emailed to the owners when a payment is confirmed. The paid invoice in Settings shows the date, method and Chapa reference.

## How a payment is confirmed

1. The owner presses "Pay with Chapa". The API writes a `payments` row (`pending`, new `tx_ref`) and then asks Chapa for a hosted checkout (`POST /v1/transaction/initialize`). The owner is sent there.
2. Chapa calls `POST /api/v1/billing/chapa/webhook`. The API checks the signature against the raw body in constant time: `x-chapa-signature` (HMAC-SHA256 of the body with the secret hash) or `chapa-signature` (HMAC-SHA256 of the secret hash with itself). No valid signature → 401.
3. The API then calls Chapa's verify endpoint (`GET /v1/transaction/verify/<tx_ref>`). The payment is marked paid **only if** Chapa reports `success` for the same `tx_ref`, the same amount to the santim, the same currency, and the mode in `CHAPA_MODE`. Any difference is recorded as `mismatch` with the reason, written to the audit log, and nothing is activated. The webhook body is never trusted for any of this.
4. Everything happens under a row lock on the payment. A paid row is never touched again, so replayed and simultaneous webhooks do nothing. A second payment for an invoice that is already paid is kept on the ledger, does not extend the plan, and is flagged in the audit log (`billing.payment_needs_review`) for a manual refund.

The browser coming back from Chapa confirms nothing: the Billing screen shows "Waiting for Chapa to confirm" until the webhook has done its work. If Chapa's verify endpoint is unreachable the webhook answers 502, and Chapa retries (every 10 minutes, up to 10 times).

## Quota and plan gating

- **Sessions:** the worker counts each new visit against the org's usage month (calendar months for Free; months counted from the start of the billing period for subscribers). At the limit, new sessions are not stored; batches for sessions that already exist still are. The count is bumped atomically, so the limit holds under load. An upgrade lifts it on the next batch.
- **Collector:** caches each org's state for 30 seconds. For an org that is over quota or restricted it answers a new session with `403 {"error":"session_quota_exceeded"}`, which makes the SDK stop for that page. Healthy orgs get no extra query.
- **Replay:** recorded only on plans that include it. The collector answers `403 feature_not_in_plan` otherwise, and replay chunks count toward the session quota.
- **Sites:** `plan_limit_reached` with `{currentPlan, limitType, limit, currentCount, upgradePlan}`.
- **Retention:** `retentionDaysForPlan(plan, status)` in `@pulse/contracts`. Replay retention uses it, and so does raw event and visit retention through task 14's `retentionDaysFor(org)` in `@pulse/insights` (the plan's days, capped by `DATA_RETENTION_DAYS`).
- **In the app:** Today and Replays show a notice to the whole team when sessions are not being stored. Settings → Billing (owner only) shows the plan, usage against the quota, invoices and the plans.

## Staff override

`POST /api/v1/admin/billing/orgs/<orgId>/override` with `Authorization: Bearer $BILLING_ADMIN_TOKEN`. Every call writes an audit-log entry in that org, with the note.

```bash
# Comp a plan until a date
curl -X POST "$API/api/v1/admin/billing/orgs/$ORG/override" -H "authorization: Bearer $BILLING_ADMIN_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"action":"comp","plan":"agency","until":"2027-03-01T00:00:00.000Z","note":"Pilot partner"}'

# Give 14 more days (also lifts past-due / restricted)
curl -X POST "$API/api/v1/admin/billing/orgs/$ORG/override" -H "authorization: Bearer $BILLING_ADMIN_TOKEN" \
  -H 'content-type: application/json' -d '{"action":"extend","days":14,"note":"Bank transfer on its way"}'
```

This is a token-guarded endpoint, not yet the role-gated staff console that contract 29 describes.

## Going live (the founder's steps)

1. Open a Chapa business account and finish its verification.
2. **Try it in test mode first, on staging.** Set `CHAPA_SECRET_KEY` to the *test* secret key, `CHAPA_WEBHOOK_SECRET` to a fresh random string, and leave `CHAPA_MODE=test`.
3. In Chapa's dashboard → Settings → Webhooks, set the URL to `https://<your app host>/api/v1/billing/chapa/webhook` and the secret hash to the same string as `CHAPA_WEBHOOK_SECRET`.
4. In Pulse, as an owner: Settings → Billing → start a trial → "Get the next invoice now" → "Pay with Chapa". Pay with a Chapa test number (telebirr `0900123456`) or test card. Check that the invoice turns to Paid, the receipt email arrives, and `audit_log` has `billing.invoice_paid`.
5. Also pay one with a failing test number and confirm the invoice stays "To pay".
6. Confirm with a real Chapa test call that webhooks arrive signed the way step 2 of "How a payment is confirmed" describes. **This has only been checked against Chapa's documentation, not against Chapa itself**, and the documentation is unclear about which key signs the webhook. If signatures are rejected (401s in the API log), that is the first place to look.
7. Confirm the prices and the Agency session figure in `PLANS`.
8. Switch to live: set `CHAPA_SECRET_KEY` to the *live* key and `CHAPA_MODE=live`, restart the API, and repeat step 3 for live mode. Make one small real payment yourself and refund it from Chapa's dashboard.
9. Set `BILLING_ADMIN_TOKEN` and keep it in the password manager.

## Not built yet

- Proration on plan changes, and a "downgrade to Free" button (use the staff override, or let the subscription lapse).
- Refunds and Chapa's refund / reversal events (handle them in Chapa's dashboard; the ledger is not updated).
- Printable invoice or receipt PDFs (the receipt is an email and a row in Settings).
- Extra Agency sites at 700 ETB, Pulse Care, Enterprise.
- Gating of features other than sites, sessions, replay and retention (AI, share links and API keys are not plan-gated).
- A staff console; the override is an API call.
