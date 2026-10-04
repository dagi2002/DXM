# 01 — Product Brief

Status: proposal for approval (Phase 1). Every pricing and ICP statement here is a **hypothesis to test in pilots**, not a settled fact.

## 1. One-line positioning

**DXM Pulse tells Ethiopian businesses — and the agencies that build for them — exactly what's costing them customers online this week, in Amharic or English, on Telegram, and proves when it's fixed.**

It is not "Hotjar for Ethiopia". Microsoft Clarity already gives replay, heatmaps and AI summaries for free. We win on **what to do next, delivered where people already are, with local context**, and on the agency's need to **prove their work to clients**.

## 2. Why now / why us

- Ethiopian commerce is moving online through mobile web, Telegram channels/bots/Mini Apps, and telebirr/Chapa payments. Most businesses have no idea what happens between "visitor arrives" and "visitor pays".
- Global tools don't speak Amharic, don't deliver to Telegram, don't understand telebirr/Chapa checkout flows or Ethiopian mobile-network performance, and can't be paid for in ETB.
- Ethiopia's 2024 Personal Data Protection Proclamation makes **local hosting and a clear privacy posture** a selling point for banks, fintechs and government. A global free tool can't offer either.
- Benchmarks across Ethiopian sites ("your checkout is slower than 80% of Ethiopian e-commerce sites") are a **compounding data moat** that nobody else is positioned to build.

## 3. Ideal customer profiles (ranked)

| Rank | ICP | Why they pay | Buying motion | v1 fit |
|---|---|---|---|---|
| **1** | **Transactional SMBs**: e-commerce, delivery, hotels and tour booking, private schools and ed-tech, clinics, real estate. Website or Telegram shop, 1k–100k visits/month. | A broken checkout or slow page is lost birr they can count. | Founder-led: free audit → 14-day pilot → monthly plan or managed service. Decision maker is the owner. | **Primary** |
| **2** | **Web, digital and marketing agencies** (Addis-based, 3–30 staff, 5–50 client sites). | Retain clients by proving value. Monthly reports take them hours. Can resell monitoring as a retainer line item. | Partner deal: agency plan + white-label + margin. One agency brings 5–20 sites. | **Primary (channel)** |
| 3 | **Fintechs, banks' digital teams, telcos, airlines.** Mobile apps + web, high traffic. | Conversion on onboarding/KYC/payment flows. Regulatory comfort with local data. | Enterprise: pilots, security review, local hosting, procurement. 6–12 month cycles. | Later (needs mobile SDK + self-host) |
| 4 | **NGOs and government digital services.** | Service completion rates, accessibility, donor reporting. | Grants/procurement. | Later |
| — | **Telegram-native businesses** (bots, Mini Apps). | No analytics exists for them today. | Self-serve via a bot. | **Research track**: potentially the biggest wedge, needs a Mini App SDK |

**Explicit non-target for v1:** global product teams who already use Clarity + GA4 + Amplitude.

## 4. Jobs to be done

1. *"When a visitor can't complete a purchase, tell me before I lose more of them — and tell me what to fix."* (owner)
2. *"When my client asks 'what did you do for us this month?', give me a branded report that shows problems found, fixed, and the improvement."* (agency)
3. *"When I launch a change, tell me if it made things better or worse."* (both)
4. *"Don't make me learn analytics. Send me the important thing on Telegram."* (owner)

## 5. The core loop (the product is this loop)

```
Install (≤5 min) → First Fix found (≤24 h of traffic) → Fix shipped → Verified (before/after) → Proof (report / Telegram / client link) → next week
```

- **Activation** = a site has received sessions **and** has at least one Fix card with evidence.
- **North-star metric** = *verified fixes per active workspace per month.*
- **Retention driver** = a weekly "what changed / what to fix" message (Telegram or email), plus a monthly client report for agencies.
- **Supporting metrics:** time-to-first-session, time-to-first-fix, % of fixes marked fixed, % verified improved, report shares opened by clients, Telegram-linked workspaces, paid conversion from pilot.

## 6. v1 scope (what the rebuild ships)

**Must have (v1)**

| Area | What |
|---|---|
| Install | Site setup with platform guides (HTML, WordPress, Shopify/WooCommerce, React/Next, Telegram Mini App beta). One-line snippet. Live verification. Install-for-me email to the developer. |
| SDK v3 | ≤5 KB core. Reliable delivery (`text/plain` + keepalive, retry/backoff, per-tab queue). Correct Web Vitals (`web-vitals`). Consent modes. PII scrubbing by default. Replay lazy-loaded, sampled, text-masked by default. |
| Fix feed ("Today") | Detectors (rage/dead clicks, U-turns, form abandonment, JS errors, slow pages, broken links/404s, payment-step drop-off, traffic drop / tracking-broken). Each produces a **FixCard**: evidence, replay clips, impact estimate, AI-suggested fix, status workflow (open → fixing → fixed → verified). |
| Site view | Health score (one definition), Vitals by device/network, pages, funnels with Ethiopian templates (telebirr/Chapa checkout, lead form, Telegram hand-off), journeys, heatmaps on real page screenshots, replays. |
| Telegram bot | Link account. Alerts as FixCards with inline actions. Weekly digest. Amharic/English. `/status` command. |
| Reports | Monthly/weekly report builder from FixCards and KPIs. White-label (logo, colors, agency name). Share link + PDF. Scheduled send to client by email/Telegram. Amharic/English. |
| Agency layer | Portfolio of client sites, client-viewer role (client sees only their site), per-client branding. |
| Accounts | Orgs with many members, users in many orgs, roles (owner/admin/member/client-viewer), Google + magic link + password, optional 2FA. |
| Billing | Chapa (incl. telebirr) end-to-end: plans, renewals by invoice + pay link, receipts, grace period, admin override. |
| Mobile | PWA (installable, web push) for the Today feed, Fix detail, replays, and report sharing. The Expo companion app ships in slice 8 if pilots show push/phone usage beyond Telegram (see ADR-006). |
| Public | Marketing site (am/en), **public Site Health Check** (lead magnet: real mobile-network performance + top 3 issues + shareable result + "monitor this site" CTA), docs, privacy policy, DPA, status page. |
| Trust | Privacy center (retention per plan, visitor data deletion, consent docs), audit log, data residency statement. |

**Deferred to v1.x:** Ask Pulse chat (rebuilt on the same tool layer), MCP endpoint (cheap to re-add once the tool layer exists), benchmarks (need data from ≥30 sites), A/B "did this change help" annotations beyond before/after.

**Later:** React Native / Flutter / Mini App SDKs (ICP 3), self-hosted enterprise edition, CRM/e-commerce revenue integrations, partner marketplace.

**Cut:** Separate Overview / Dashboard / AI Portfolio Brief pages (merged into **Today** + **Sites**). Demo page with fabricated numbers (replaced by a real seeded demo workspace). Landing comparison table claims we can't back up.

## 7. Packaging & pricing (ETB, hypothesis)

The current pricing (1,490 / 3,490 ETB) charges software prices for what customers experience as a service. Recommended structure:

| Plan | Price / month | For | Includes |
|---|---|---|---|
| **Free Health Check** | 0 | Anyone | Public audit + 1 site, 1,000 sessions/mo, 7-day retention, top 3 fixes, Telegram alerts |
| **Business** | 2,400 ETB | Single SMB | 1 site, 15k sessions, 30-day retention, full Fix feed, replays, funnels, weekly digest, monthly report |
| **Growth** | 5,900 ETB | Larger SMB | 3 sites, 60k sessions, 90-day retention, client/team seats, scheduled reports, priority support |
| **Agency** | 9,900 ETB + 700 ETB per extra site | Agencies | 10 client sites, white-label reports, client-viewer seats, portfolio view, partner margin on resale |
| **Pulse Care** (managed) | from 15,000 ETB | SMBs without a web team | Everything in Business, plus a monthly human-reviewed fix plan, a 30-min call, and fix verification. **This is the early cash engine.** |
| **Enterprise** | Custom | Banks, fintech, gov | Local hosting / self-host, SSO, DPA, SLA |

Annual prepay = 2 months free. Pilot offer: 14 days free with a delivered report. Validate willingness to pay with the first 10 pilots before hard-coding prices.

## 8. Go-to-market (first 90 days, runs in parallel with the rebuild)

1. **Deploy the current app with the critical hotfixes** (see `00-audit.md` §Hotfix list) so pilots can start now. Don't wait for the rebuild.
2. Build a list of 50 transactional SMBs and 15 agencies. Run the Site Health Check on each and send a personal one-page result (Telegram, LinkedIn, email, or in person).
3. Offer a 14-day pilot → deliver a FixCard report with replay clips → convert to Business, Agency or Pulse Care.
4. Target: **10 pilots, 3 paying customers by day 60.** The segment that converts best sets the order of rebuild slices 3–6.
5. Every pilot conversation feeds `docs/rebuild/progress.md` → "Customer evidence".

## 9. Risks

| Risk | Mitigation |
|---|---|
| Clarity is free and good | Don't compete on capture features. Compete on fixes, proof, Telegram, Amharic, ETB, local hosting, and service. |
| Small agency market | Agencies are a channel, not the whole market. SMBs and managed service carry revenue. |
| Solo-founder bandwidth | Ruthless v1 scope. Managed service funds the work. Boring, single-VM ops. |
| Privacy/legal exposure from session replay | Text masked by default, consent modes, retention limits, visitor deletion, DPA, local hosting option. |
| FX / pricing power | ETB pricing with annual prepay. Enterprise in USD-indexed contracts. |
| AI cost | Haiku-class models for volume, cache aggressively, per-plan budgets, deterministic fallback. |

## 10. Decisions needed from the founder

See the Phase 1 checkpoint questions: primary ICP order, mobile strategy (PWA + Telegram first vs Expo now), hosting (international VM vs Ethiopian provider), pricing direction, and whether to hotfix and deploy the current app for pilots in parallel.
