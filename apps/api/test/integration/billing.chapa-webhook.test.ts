import request from 'supertest';
import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { signupAndAuthenticate } from '../helpers/auth.js';
import { applyBillingMigration } from '../helpers/billing.js';
import { createTestApp, type ApiTestContext } from '../helpers/testApp.js';

const WEBHOOK_SECRET = 'test-webhook-secret-32chars-min!';

const signWebhook = (body: string, secret: string): string =>
  createHmac('sha256', secret).update(Buffer.from(body)).digest('hex');


const seedUpgradeRequest = (
  ctx: ApiTestContext,
  id: string,
  workspaceId: string,
  userId: string,
  currentPlan: string,
  requestedPlan: string,
  txRef: string,
) => {
  ctx.db.prepare(`
    INSERT INTO upgrade_requests
      (id, workspace_id, requested_by_user_id, current_plan, requested_plan, source, status, chapa_tx_ref)
    VALUES (?, ?, ?, ?, ?, 'direct_billing', 'requested', ?)
  `).run(id, workspaceId, userId, currentPlan, requestedPlan, txRef);
};

describe('billing chapa webhook', () => {
  let context: ApiTestContext | null = null;

  afterEach(async () => {
    await context?.cleanup();
    context = null;
  });

  it('activates workspace plan on valid HMAC + known tx_ref', async () => {
    context = await createTestApp({ env: { CHAPA_WEBHOOK_SECRET: WEBHOOK_SECRET } });
    applyBillingMigration(context.db);

    const { workspace, user } = await signupAndAuthenticate(context.app);
    seedUpgradeRequest(context, 'ur_1', workspace!.id, user!.id, 'free', 'starter', 'dxmTEST1');

    const rawBody = JSON.stringify({ tx_ref: 'dxmTEST1', status: 'success' });
    const sig = signWebhook(rawBody, WEBHOOK_SECRET);

    const res = await request(context.app)
      .post('/billing/chapa/webhook')
      .set('Content-Type', 'application/json')
      .set('chapa-signature', sig)
      .send(rawBody);

    expect(res.status).toBe(200);

    const ws = context.db
      .prepare<[string], { plan: string; billing_status: string }>('SELECT plan, billing_status FROM workspaces WHERE id = ?')
      .get(workspace!.id);
    expect(ws?.plan).toBe('starter');
    expect(ws?.billing_status).toBe('active');
  });

  it('returns 401 for bad HMAC', async () => {
    context = await createTestApp({ env: { CHAPA_WEBHOOK_SECRET: WEBHOOK_SECRET } });

    const rawBody = JSON.stringify({ tx_ref: 'dxmBAD', status: 'success' });

    const res = await request(context.app)
      .post('/billing/chapa/webhook')
      .set('Content-Type', 'application/json')
      .set('chapa-signature', 'badhash')
      .send(rawBody);

    expect(res.status).toBe(401);
  });

  it('returns 401 when signature header is missing', async () => {
    context = await createTestApp({ env: { CHAPA_WEBHOOK_SECRET: WEBHOOK_SECRET } });

    const rawBody = JSON.stringify({ tx_ref: 'dxmNOSIG', status: 'success' });

    const res = await request(context.app)
      .post('/billing/chapa/webhook')
      .set('Content-Type', 'application/json')
      .send(rawBody);

    expect(res.status).toBe(401);
  });

  it('returns 401 when both signature headers conflict', async () => {
    context = await createTestApp({ env: { CHAPA_WEBHOOK_SECRET: WEBHOOK_SECRET } });

    const rawBody = JSON.stringify({ tx_ref: 'dxmCONFLICT', status: 'success' });
    const sigA = signWebhook(rawBody, WEBHOOK_SECRET);

    const res = await request(context.app)
      .post('/billing/chapa/webhook')
      .set('Content-Type', 'application/json')
      .set('chapa-signature', sigA)
      .set('x-chapa-signature', 'different-value')
      .send(rawBody);

    expect(res.status).toBe(401);
  });

  it('returns 200 for unknown tx_ref without changing any plan', async () => {
    context = await createTestApp({ env: { CHAPA_WEBHOOK_SECRET: WEBHOOK_SECRET } });
    applyBillingMigration(context.db);

    const { workspace } = await signupAndAuthenticate(context.app);

    const rawBody = JSON.stringify({ tx_ref: 'dxmUNKNOWN999', status: 'success' });
    const sig = signWebhook(rawBody, WEBHOOK_SECRET);

    const res = await request(context.app)
      .post('/billing/chapa/webhook')
      .set('Content-Type', 'application/json')
      .set('chapa-signature', sig)
      .send(rawBody);

    expect(res.status).toBe(200);

    const ws = context.db
      .prepare<[string], { plan: string }>('SELECT plan FROM workspaces WHERE id = ?')
      .get(workspace!.id);
    expect(ws?.plan).toBe('free');
  });

  it('is idempotent — duplicate webhook does not double-upgrade', async () => {
    context = await createTestApp({ env: { CHAPA_WEBHOOK_SECRET: WEBHOOK_SECRET } });
    applyBillingMigration(context.db);

    const { workspace, user } = await signupAndAuthenticate(context.app);
    seedUpgradeRequest(context, 'ur_dup', workspace!.id, user!.id, 'free', 'starter', 'dxmDUP1');

    const rawBody = JSON.stringify({ tx_ref: 'dxmDUP1', status: 'success' });
    const sig = signWebhook(rawBody, WEBHOOK_SECRET);

    // First webhook — activates
    const res1 = await request(context.app)
      .post('/billing/chapa/webhook')
      .set('Content-Type', 'application/json')
      .set('chapa-signature', sig)
      .send(rawBody);
    expect(res1.status).toBe(200);

    // Second webhook — idempotent no-op
    const res2 = await request(context.app)
      .post('/billing/chapa/webhook')
      .set('Content-Type', 'application/json')
      .set('chapa-signature', sig)
      .send(rawBody);
    expect(res2.status).toBe(200);

    const ws = context.db
      .prepare<[string], { plan: string }>('SELECT plan FROM workspaces WHERE id = ?')
      .get(workspace!.id);
    expect(ws?.plan).toBe('starter');

    const ur = context.db
      .prepare<[string], { status: string }>('SELECT status FROM upgrade_requests WHERE chapa_tx_ref = ?')
      .get('dxmDUP1');
    expect(ur?.status).toBe('activated');
  });

  it('accepts x-chapa-signature header', async () => {
    context = await createTestApp({ env: { CHAPA_WEBHOOK_SECRET: WEBHOOK_SECRET } });
    applyBillingMigration(context.db);

    const { workspace, user } = await signupAndAuthenticate(context.app);
    seedUpgradeRequest(context, 'ur_xhdr', workspace!.id, user!.id, 'free', 'starter', 'dxmXHDR1');

    const rawBody = JSON.stringify({ tx_ref: 'dxmXHDR1', status: 'success' });
    const sig = signWebhook(rawBody, WEBHOOK_SECRET);

    const res = await request(context.app)
      .post('/billing/chapa/webhook')
      .set('Content-Type', 'application/json')
      .set('x-chapa-signature', sig)
      .send(rawBody);

    expect(res.status).toBe(200);

    const ws = context.db
      .prepare<[string], { plan: string; billing_status: string }>('SELECT plan, billing_status FROM workspaces WHERE id = ?')
      .get(workspace!.id);
    expect(ws?.plan).toBe('starter');
    expect(ws?.billing_status).toBe('active');
  });
});
