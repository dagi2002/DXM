# ADR-012 — Billing with Chapa

**Status:** Proposed · **Date:** 2026-10-04

## Context
One payment grants a plan forever. There's no ledger and no verify call. A `tx_ref` overwrite can leave a customer paid but not upgraded. The callback is mis-wired.

## Decision
- Model `subscriptions` (plan, period start/end, status: `trialing` | `active` | `past_due` | `canceled`), `invoices`, and `payments` (one row per Chapa attempt, with a unique `tx_ref`, never overwritten).
- **Renewal by invoice:** Chapa has no card-on-file recurring billing for most local methods. Seven days before period end, the worker issues an invoice and sends a pay link through Telegram, email, and in-app. Grace period is 7 days, then the account downgrades to Free with no data loss during a 30-day hold.
- **Confirmation:**
  1. The webhook arrives (HMAC over the raw body, constant-time compare).
  2. **We call Chapa's verify endpoint.**
  3. Amount, currency, and reference are checked against the invoice.
  4. Payment and subscription are updated in one transaction.
  - The GET return URL only shows status. It never grants anything.
- Annual prepay, receipts (PDF, bilingual), admin override with an audit log, and Telebirr through Chapa.
