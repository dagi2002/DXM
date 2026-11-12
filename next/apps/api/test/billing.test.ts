import { FakeChapaClient, signChapaBody, signChapaSecret } from '@pulse/billing';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Client, adminQuery, createTestContext, resetDatabase, signUp, signUpWithOrg } from './helpers';

const WEBHOOK_SECRET = 'whsec-test-0123456789abcdef0123456789abcdef';
const ADMIN_TOKEN = 'staff-token-0123456789abcdef0123456789abcdef';
const WEBHOOK = '/api/v1/billing/chapa/webhook';

const chapa = new FakeChapaClient('test');
const ctx = createTestContext(
  {
    CHAPA_SECRET_KEY: 'CHASECK_TEST-not-a-real-key',
    CHAPA_WEBHOOK_SECRET: WEBHOOK_SECRET,
    BILLING_ADMIN_TOKEN: ADMIN_TOKEN,
  },
  { chapa },
);
const bare = createTestContext(); // no Chapa keys at all
afterAll(async () => {
  await ctx.database.close();
  await bare.database.close();
});
beforeEach(async () => {
  await resetDatabase();
  chapa.initialized.length = 0;
  chapa.verifyCalls = 0;
  chapa.failInitialize = false;
  chapa.failVerify = false;
  chapa.beforeVerify = undefined;
  ctx.mailer.outbox.length = 0;
});

/** A Chapa webhook call. `sig` overrides the signature header(s). */
function webhook(body: Record<string, unknown>, headers?: Record<string, string>, app = ctx.app) {
  const raw = JSON.stringify(body);
  return app.request(WEBHOOK, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(headers ?? { 'x-chapa-signature': signChapaBody(raw, WEBHOOK_SECRET) }),
    },
    body: raw,
  });
}
const receipts = () => ctx.mailer.outbox.filter((m) => m.subject.includes('Receipt'));
const charge = (txRef: string) => ({ event: 'charge.success', status: 'success', tx_ref: txRef });

/** Owner with a trial started and an open invoice; returns a fresh pay link for it. */
async function ownerWithInvoice(email = 'owner@example.et') {
  const { client, orgId } = await signUpWithOrg(ctx.app, email);
  const trial = await client.post('/api/v1/billing/subscribe', { plan: 'business' });
  expect(trial.body.result).toEqual({ outcome: 'trial_started' });
  const inv = await client.post('/api/v1/billing/subscribe', { plan: 'business' });
  expect(inv.body.result).toMatchObject({ outcome: 'invoice', created: true });
  const invoiceId = inv.body.result.invoiceId as string;
  const pay = await client.post(`/api/v1/billing/invoices/${invoiceId}/pay`);
  expect(pay.status).toBe(201);
  return { client, orgId, invoiceId, txRef: pay.body.txRef as string, checkoutUrl: pay.body.checkoutUrl as string };
}

const payment = async (txRef: string) =>
  (await adminQuery('select * from payments where tx_ref = $1', [txRef])).rows[0]!;
const subscription = async (orgId: string) =>
  (await adminQuery('select * from subscriptions where org_id = $1', [orgId])).rows[0];
const audits = async (orgId: string, action: string) =>
  (await adminQuery('select * from audit_log where org_id = $1 and action = $2', [orgId, action])).rows;

async function addMember(orgId: string, email: string, role: string) {
  const client = await signUp(ctx.app, email);
  const me = await client.get('/api/v1/me');
  await adminQuery(
    `insert into member (id, organization_id, user_id, role, created_at) values ($1, $2, $3, $4, now())`,
    [`m_${role}_${Math.random().toString(36).slice(2, 8)}`, orgId, me.body.user.id, role],
  );
  const res = await client.post('/api/auth/organization/set-active', { organizationId: orgId });
  expect(res.status).toBe(200);
  return client;
}

describe('billing overview and plans', () => {
  it('starts on free with real usage, and says so when Chapa is not configured', async () => {
    const { client } = await signUpWithOrg(bare.app, 'free@example.et');
    const res = await client.get('/api/v1/billing');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      configured: false,
      mode: 'test',
      plan: 'free',
      subscription: null,
      trialAvailable: true,
      usage: { sessions: 0, sessionLimit: 1000, blocked: false, sites: 0, siteLimit: 1 },
      entitlements: { retentionDays: 7, replay: false },
      invoices: [],
    });
    // Prices are integer santim: 2,400 birr = 240000; a year is 10 months.
    expect(res.body.plans.find((p: { id: string }) => p.id === 'business')).toMatchObject({
      monthSantim: 240_000,
      yearSantim: 2_400_000,
    });
  });

  it('makes no pay links and accepts no webhooks without keys', async () => {
    const { client } = await signUpWithOrg(bare.app, 'nokeys@example.et');
    await client.post('/api/v1/billing/subscribe', { plan: 'growth' });
    const inv = await client.post('/api/v1/billing/subscribe', { plan: 'growth' });
    const pay = await client.post(`/api/v1/billing/invoices/${inv.body.result.invoiceId}/pay`);
    expect(pay.status).toBe(503);
    expect(pay.body.error.code).toBe('billing_not_configured');
    expect((await adminQuery('select count(*)::int as n from payments')).rows[0]!.n).toBe(0);
    expect((await webhook(charge('pulse-aaaaaaaaaaaaaaaaaaaaaaaa'), undefined, bare.app)).status).toBe(503);
  });

  it('starts a 14-day trial once, switches plan during it, and audits both', async () => {
    const { client, orgId } = await signUpWithOrg(ctx.app, 'trial@example.et');
    const start = await client.post('/api/v1/billing/subscribe', { plan: 'business' });
    expect(start.status).toBe(200);
    expect(start.body.billing).toMatchObject({
      plan: 'business',
      trialAvailable: false,
      subscription: { status: 'trialing', interval: 'month', comp: false },
      usage: { sessionLimit: 15_000, siteLimit: 1 },
      entitlements: { replay: true, retentionDays: 30 },
    });
    const sub = start.body.billing.subscription;
    const days = (Date.parse(sub.currentPeriodEnd) - Date.parse(sub.currentPeriodStart)) / 86_400_000;
    expect(days).toBe(14);

    const change = await client.post('/api/v1/billing/subscribe', { plan: 'growth', interval: 'year' });
    expect(change.body.result).toEqual({ outcome: 'plan_changed' });
    expect(change.body.billing).toMatchObject({ plan: 'growth', usage: { siteLimit: 3 } });
    expect(change.body.billing.subscription.currentPeriodEnd).toBe(sub.currentPeriodEnd); // no second trial
    expect(await audits(orgId, 'billing.trial_started')).toHaveLength(1);
    expect(await audits(orgId, 'billing.plan_changed')).toHaveLength(1);

    const inv = await client.post('/api/v1/billing/subscribe', { plan: 'growth', interval: 'year' });
    expect(inv.body.billing.invoices).toEqual([
      expect.objectContaining({
        number: 1,
        plan: 'growth',
        interval: 'year',
        amountSantim: 5_900_000,
        currency: 'ETB',
        status: 'open',
        periodStart: sub.currentPeriodEnd,
      }),
    ]);
    // Asking again returns the same open invoice instead of making another.
    const again = await client.post('/api/v1/billing/subscribe', { plan: 'growth', interval: 'year' });
    expect(again.body.result).toEqual({ outcome: 'invoice', invoiceId: inv.body.result.invoiceId, created: false });
  });

  it('rejects unknown plans and intervals', async () => {
    const { client } = await signUpWithOrg(ctx.app, 'bad@example.et');
    expect((await client.post('/api/v1/billing/subscribe', { plan: 'free' })).status).toBe(400);
    expect((await client.post('/api/v1/billing/subscribe', { plan: 'business', interval: 'week' })).status).toBe(400);
  });
});

describe('billing access', () => {
  it('needs a session', async () => {
    const anon = new Client(ctx.app);
    expect((await anon.get('/api/v1/billing')).status).toBe(401);
    expect((await anon.post('/api/v1/billing/subscribe', { plan: 'business' })).status).toBe(401);
    expect((await anon.post('/api/v1/billing/invoices/inv_x/pay')).status).toBe(401);
  });

  it('is owner only: admins, members and client viewers get 403', async () => {
    const { orgId, invoiceId } = await ownerWithInvoice();
    for (const role of ['admin', 'member', 'client_viewer']) {
      const client = await addMember(orgId, `${role}@example.et`, role);
      expect((await client.get('/api/v1/billing')).status, role).toBe(403);
      expect((await client.post('/api/v1/billing/subscribe', { plan: 'agency' })).status, role).toBe(403);
      expect((await client.post(`/api/v1/billing/invoices/${invoiceId}/pay`)).status, role).toBe(403);
    }
    expect((await subscription(orgId))!.plan).toBe('business');
  });

  it("keeps organizations apart: another org's invoice is a 404 and never listed", async () => {
    const a = await ownerWithInvoice('a@example.et');
    const b = await signUpWithOrg(ctx.app, 'b@example.et');
    const pay = await b.client.post(`/api/v1/billing/invoices/${a.invoiceId}/pay`);
    expect(pay.status).toBe(404);
    expect(pay.body.error.code).toBe('not_found');
    const overview = await b.client.get('/api/v1/billing');
    expect(overview.body).toMatchObject({ plan: 'free', subscription: null, invoices: [] });
    expect(chapa.initialized).toHaveLength(1); // only A's own link
  });
});

describe('pay links', () => {
  it('records each attempt with its own tx_ref and the invoice amount in santim', async () => {
    const { client, invoiceId, txRef, checkoutUrl } = await ownerWithInvoice();
    expect(txRef).toMatch(/^pulse-[A-Za-z0-9]{24}$/);
    expect(checkoutUrl).toContain(txRef);
    expect(chapa.initialized[0]).toMatchObject({ txRef, amountSantim: 240_000, currency: 'ETB', email: 'owner@example.et' });
    expect(await payment(txRef)).toMatchObject({ status: 'pending', amount_santim: 240_000, currency: 'ETB', invoice_id: invoiceId });

    // A second click soon after reuses the pending link…
    const again = await client.post(`/api/v1/billing/invoices/${invoiceId}/pay`);
    expect(again.body.txRef).toBe(txRef);
    // …and an old one is replaced by a new attempt with a new ref.
    await adminQuery(`update payments set created_at = now() - interval '1 hour' where tx_ref = $1`, [txRef]);
    const later = await client.post(`/api/v1/billing/invoices/${invoiceId}/pay`);
    expect(later.body.txRef).not.toBe(txRef);
    expect((await adminQuery('select count(*)::int as n from payments')).rows[0]!.n).toBe(2);
  });

  it('answers 502 when Chapa fails, and keeps the failed attempt on the ledger', async () => {
    const { client } = await signUpWithOrg(ctx.app, 'down@example.et');
    await client.post('/api/v1/billing/subscribe', { plan: 'business' });
    const inv = await client.post('/api/v1/billing/subscribe', { plan: 'business' });
    chapa.failInitialize = true;
    const pay = await client.post(`/api/v1/billing/invoices/${inv.body.result.invoiceId}/pay`);
    expect(pay.status).toBe(502);
    expect(pay.body.error.code).toBe('payment_provider_error');
    const rows = (await adminQuery('select status, checkout_url from payments')).rows;
    expect(rows).toEqual([{ status: 'failed', checkout_url: null }]);
  });

  it('will not make a link for a paid invoice', async () => {
    const { client, invoiceId, txRef } = await ownerWithInvoice();
    chapa.pay(txRef);
    expect((await webhook(charge(txRef))).status).toBe(200);
    const pay = await client.post(`/api/v1/billing/invoices/${invoiceId}/pay`);
    expect(pay.status).toBe(409);
  });
});

describe('Chapa webhook', () => {
  it('rejects a missing or wrong signature before looking anything up', async () => {
    const { txRef } = await ownerWithInvoice();
    chapa.pay(txRef);
    const raw = JSON.stringify(charge(txRef));
    expect((await webhook(charge(txRef), {})).status).toBe(401);
    expect((await webhook(charge(txRef), { 'x-chapa-signature': 'deadbeef' })).status).toBe(401);
    expect((await webhook(charge(txRef), { 'x-chapa-signature': signChapaBody(raw, 'another-secret') })).status).toBe(401);
    // Signed for a different body (tampered payload).
    expect(
      (await webhook(charge(txRef), { 'x-chapa-signature': signChapaBody(raw.replace('success', 'failed'), WEBHOOK_SECRET) })).status,
    ).toBe(401);
    // Both headers present and both wrong.
    expect((await webhook(charge(txRef), { 'x-chapa-signature': 'aa', 'chapa-signature': 'bb' })).status).toBe(401);
    expect(chapa.verifyCalls).toBe(0);
    expect((await payment(txRef)).status).toBe('pending');
  });

  it('marks nothing paid on the webhook body alone: verify must confirm', async () => {
    const { orgId, txRef } = await ownerWithInvoice();
    // The webhook says success, but Chapa's verify endpoint knows of no payment.
    const res = await webhook(charge(txRef));
    expect(res.status).toBe(200);
    expect(chapa.verifyCalls).toBe(1);
    expect((await payment(txRef)).status).toBe('pending');
    expect((await subscription(orgId))!.status).toBe('trialing');
    expect(receipts()).toHaveLength(0);
  });

  it('activates the plan once signature and verify agree, sends one receipt, and audits it', async () => {
    const { client, orgId, invoiceId, txRef } = await ownerWithInvoice();
    const before = await subscription(orgId);
    chapa.pay(txRef);
    expect((await webhook(charge(txRef))).status).toBe(200);

    expect(await payment(txRef)).toMatchObject({ status: 'paid', method: 'telebirr', mode: 'test' });
    expect((await payment(txRef)).verified_at).not.toBeNull();
    const sub = await subscription(orgId);
    expect(sub).toMatchObject({ status: 'active', plan: 'business', comp: false, grace_ends_at: null });
    // Paid during the trial: the paid month starts when the trial ends.
    const overview = await client.get('/api/v1/billing');
    const inv = overview.body.invoices[0];
    expect(inv).toMatchObject({ id: invoiceId, status: 'paid', paymentMethod: 'telebirr' });
    expect(inv.paidAt).not.toBeNull();
    expect(inv.paymentReference).toBeTruthy();
    expect(new Date(sub!.current_period_end).toISOString()).toBe(inv.periodEnd);
    expect(new Date(sub!.current_period_end).getTime()).toBeGreaterThan(new Date(before!.current_period_end).getTime());

    expect(await audits(orgId, 'billing.invoice_paid')).toHaveLength(1);
    const receipt = ctx.mailer.lastTo('owner@example.et');
    expect(receipt?.subject).toContain('Receipt');
    expect(receipt?.text).toContain('ETB 2,400');
  });

  it('accepts the chapa-signature header on its own', async () => {
    const { txRef } = await ownerWithInvoice();
    chapa.pay(txRef);
    const res = await webhook(charge(txRef), { 'chapa-signature': signChapaSecret(WEBHOOK_SECRET) });
    expect(res.status).toBe(200);
    expect((await payment(txRef)).status).toBe('paid');
  });

  it.each([
    ['amount', { amount: '2399.99' }],
    ['amount', { amount: 24 }],
    ['amount', { amount: '2400.001' }],
    ['currency', { currency: 'USD' }],
    ['mode', { mode: 'live' }],
    ['tx_ref', { txRef: 'pulse-someoneelsesreference00' }],
  ])('does not mark paid when verify disagrees on %s (%o)', async (reason, over) => {
    const { orgId, txRef } = await ownerWithInvoice();
    chapa.pay(txRef, over);
    expect((await webhook(charge(txRef))).status).toBe(200);
    const row = await payment(txRef);
    expect(row.status).toBe('mismatch');
    expect(row.verify_result).toMatchObject({ verdict: 'mismatch', reason });
    expect(row.verified_at).toBeNull();
    expect((await subscription(orgId))!.status).toBe('trialing');
    expect((await adminQuery(`select status from invoices`)).rows).toEqual([{ status: 'open' }]);
    expect(await audits(orgId, 'billing.payment_mismatch')).toHaveLength(1);
    expect(await audits(orgId, 'billing.invoice_paid')).toHaveLength(0);
    expect(receipts()).toHaveLength(0);
  });

  it('records a failed payment as failed and leaves the invoice open for another attempt', async () => {
    const { client, invoiceId, txRef } = await ownerWithInvoice();
    chapa.tamper(txRef, { status: 'failed', txRef });
    expect((await webhook({ event: 'charge.failed', tx_ref: txRef })).status).toBe(200);
    expect((await payment(txRef)).status).toBe('failed');
    const retry = await client.post(`/api/v1/billing/invoices/${invoiceId}/pay`);
    expect(retry.status).toBe(201);
    expect(retry.body.txRef).not.toBe(txRef); // refs are never reused
  });

  it('is idempotent: a replayed webhook changes nothing', async () => {
    const { orgId, txRef } = await ownerWithInvoice();
    chapa.pay(txRef);
    expect((await webhook(charge(txRef))).status).toBe(200);
    const first = { pay: await payment(txRef), sub: await subscription(orgId) };
    for (let i = 0; i < 3; i++) expect((await webhook(charge(txRef))).status).toBe(200);
    // Even if Chapa later reported something else for the ref, a paid row is final.
    chapa.tamper(txRef, { status: 'failed', txRef });
    expect((await webhook(charge(txRef))).status).toBe(200);
    expect(await payment(txRef)).toEqual(first.pay);
    expect(await subscription(orgId)).toEqual(first.sub);
    expect(await audits(orgId, 'billing.invoice_paid')).toHaveLength(1);
    expect(receipts()).toHaveLength(1);
  });

  it('applies the payment once when two webhooks arrive at the same moment', async () => {
    const { orgId, txRef } = await ownerWithInvoice();
    chapa.pay(txRef);
    // Hold both deliveries inside verify() until both have got there.
    let waiting = 0;
    let release!: () => void;
    const both = new Promise<void>((resolve) => (release = resolve));
    chapa.beforeVerify = async () => {
      if (++waiting === 2) release();
      await both;
    };
    const [a, b] = await Promise.all([webhook(charge(txRef)), webhook(charge(txRef))]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(chapa.verifyCalls).toBe(2);
    expect((await payment(txRef)).status).toBe('paid');
    expect(await audits(orgId, 'billing.invoice_paid')).toHaveLength(1);
    expect(receipts()).toHaveLength(1);
    expect((await adminQuery(`select count(*)::int as n from invoices where status = 'paid'`)).rows[0]!.n).toBe(1);
  });

  it('does not apply a second payment for the same invoice, and flags it for review', async () => {
    const { client, orgId, invoiceId, txRef } = await ownerWithInvoice();
    await adminQuery(`update payments set created_at = now() - interval '1 hour' where tx_ref = $1`, [txRef]);
    const second = (await client.post(`/api/v1/billing/invoices/${invoiceId}/pay`)).body.txRef as string;
    chapa.pay(txRef);
    chapa.pay(second);
    await webhook(charge(txRef));
    const after = await subscription(orgId);
    await webhook(charge(second));
    expect((await payment(second)).status).toBe('paid'); // the money did arrive: keep the record
    expect(await subscription(orgId)).toEqual(after); // …but the period is not extended twice
    expect(await audits(orgId, 'billing.invoice_paid')).toHaveLength(1);
    expect(await audits(orgId, 'billing.payment_needs_review')).toHaveLength(1);
  });

  it('answers 200 and does nothing for refs it does not know, and for events without one', async () => {
    expect((await webhook(charge('pulse-000000000000000000000000'))).status).toBe(200);
    expect((await webhook({ event: 'payout.success', reference: 'x' })).status).toBe(200);
    expect(chapa.verifyCalls).toBe(0);
  });

  it('answers 502 when verify is unreachable so Chapa retries, and stays unpaid', async () => {
    const { txRef } = await ownerWithInvoice();
    chapa.pay(txRef);
    chapa.failVerify = true;
    expect((await webhook(charge(txRef))).status).toBe(502);
    expect((await payment(txRef)).status).toBe('pending');
    chapa.failVerify = false;
    expect((await webhook(charge(txRef))).status).toBe(200);
    expect((await payment(txRef)).status).toBe('paid');
  });
});

describe('staff override', () => {
  const override = (orgId: string, body: unknown, token: string | null = ADMIN_TOKEN, app = ctx.app) =>
    app.request(`/api/v1/admin/billing/orgs/${orgId}/override`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body),
    });
  const until = new Date(Date.now() + 90 * 86_400_000).toISOString();
  const comp = { action: 'comp', plan: 'agency', until, note: 'Pilot partner, agreed with the founder' };

  it('needs the staff credential (503 when unset, 401 when wrong, never a session)', async () => {
    const { client, orgId } = await signUpWithOrg(ctx.app, 'o@example.et');
    expect((await override(orgId, comp, ADMIN_TOKEN, bare.app)).status).toBe(503);
    expect((await override(orgId, comp, null)).status).toBe(401);
    expect((await override(orgId, comp, 'wrong-token')).status).toBe(401);
    // An owner's session is not a staff credential.
    expect((await client.post(`/api/v1/admin/billing/orgs/${orgId}/override`, comp)).status).toBe(401);
    expect(await subscription(orgId)).toBeUndefined();
  });

  it('answers 404 for an unknown org and 400 for a bad body', async () => {
    expect((await override('org_missing', comp)).status).toBe(404);
    const { orgId } = await signUpWithOrg(ctx.app, 'o2@example.et');
    expect((await override(orgId, { action: 'comp', plan: 'agency', until })).status).toBe(400); // no note
    expect((await override(orgId, { action: 'extend', days: 0, note: 'nope' })).status).toBe(400);
  });

  it('comps a plan until a date and writes an audit entry with the note', async () => {
    const { client, orgId } = await signUpWithOrg(ctx.app, 'comp@example.et');
    const res = await override(orgId, comp);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ orgId, plan: 'agency', status: 'active', comp: true, currentPeriodEnd: until });
    const overview = await client.get('/api/v1/billing');
    expect(overview.body).toMatchObject({ plan: 'agency', subscription: { status: 'active', comp: true }, usage: { siteLimit: 10 } });
    const [entry] = await audits(orgId, 'billing.override.comp');
    expect(entry).toMatchObject({ actor_user_id: null, target_type: 'subscription' });
    expect(entry!.metadata).toMatchObject({ plan: 'agency', until, note: comp.note, previous: null });
  });

  it('extends a lapsed subscription, lifts the restriction, and audits it', async () => {
    const { orgId } = await ownerWithInvoice('late@example.et');
    await adminQuery(
      `update subscriptions set status = 'restricted', current_period_start = now() - interval '40 days',
         current_period_end = now() - interval '10 days',
         grace_ends_at = now() - interval '3 days' where org_id = $1`,
      [orgId],
    );
    const res = await override(orgId, { action: 'extend', days: 14, note: 'Bank transfer on its way' });
    expect(res.status).toBe(200);
    const sub = await subscription(orgId);
    expect(sub).toMatchObject({ status: 'active', grace_ends_at: null });
    const days = (new Date(sub!.current_period_end).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThan(14.1);
    const [entry] = await audits(orgId, 'billing.override.extend');
    expect(entry!.metadata).toMatchObject({ days: 14, note: 'Bank transfer on its way', previous: { status: 'restricted' } });
    // Nothing to extend on a free org.
    const free = await signUpWithOrg(ctx.app, 'free2@example.et');
    expect((await override(free.orgId, { action: 'extend', days: 5, note: 'nothing here' })).status).toBe(409);
  });
});

describe('plan gating', () => {
  it('limits sites by plan, and a restricted org falls back to the free limit', async () => {
    const { client, orgId } = await signUpWithOrg(ctx.app, 'gate@example.et');
    await client.post('/api/v1/billing/subscribe', { plan: 'growth' });
    for (const d of ['a.et', 'b.et', 'c.et']) {
      expect((await client.post('/api/v1/sites', { name: d, domain: d })).status).toBe(201);
    }
    const fourth = await client.post('/api/v1/sites', { name: 'd', domain: 'd.et' });
    expect(fourth.status).toBe(409);
    expect(fourth.body.error).toMatchObject({
      code: 'plan_limit_reached',
      details: { currentPlan: 'growth', limitType: 'sites', limit: 3, currentCount: 3, upgradePlan: 'agency' },
    });

    await adminQuery(`update subscriptions set status = 'restricted' where org_id = $1`, [orgId]);
    await client.delete(`/api/v1/sites/${(await client.get('/api/v1/sites')).body.sites[2].id}`, { confirmDomain: 'c.et' });
    const blocked = await client.post('/api/v1/sites', { name: 'e', domain: 'e.et' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.details).toMatchObject({ limit: 1 });
    // Read access stays.
    expect((await client.get('/api/v1/sites')).body.sites).toHaveLength(2);
    const overview = await client.get('/api/v1/billing');
    expect(overview.body).toMatchObject({
      subscription: { status: 'restricted' },
      usage: { sessionLimit: 0, blocked: true, siteLimit: 1 },
    });
  });
});
