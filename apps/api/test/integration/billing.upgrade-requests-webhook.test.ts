import request from 'supertest';
import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { signupAndAuthenticate } from '../helpers/auth.js';
import { applyBillingMigration } from '../helpers/billing.js';
import { createTestApp, type ApiTestContext } from '../helpers/testApp.js';

const CHAPA_SECRET_KEY = 'test-chapa-secret-key';
const WEBHOOK_SECRET = 'test-webhook-secret-32chars-min!';

const signWebhook = (body: string, secret: string): string =>
  createHmac('sha256', secret).update(Buffer.from(body)).digest('hex');

const mockChapaSuccess = () =>
  vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: { checkout_url: 'https://checkout.chapa.co/test' } }),
    text: async () => '',
  });

describe('billing upgrade-requests webhook flow', () => {
  let context: ApiTestContext | null = null;

  afterEach(async () => {
    vi.unstubAllGlobals();
    await context?.cleanup();
    context = null;
  });

  it('full flow: initiate → webhook → plan activated + request reconciled', async () => {
    context = await createTestApp({
      env: { CHAPA_SECRET_KEY, CHAPA_WEBHOOK_SECRET: WEBHOOK_SECRET },
    });
    applyBillingMigration(context.db);
    vi.stubGlobal('fetch', mockChapaSuccess());

    const { agent, workspace } = await signupAndAuthenticate(context.app);

    // Step 1: Initiate payment — creates upgrade_request + tx_ref
    const initRes = await agent
      .post('/billing/chapa/initiate')
      .send({ requestedPlan: 'starter' });
    expect(initRes.status).toBe(200);
    const { txRef } = initRes.body;
    expect(txRef).toBeTruthy();

    // Verify request exists and is pending
    const pendingReqs = await agent.get('/billing/upgrade-requests');
    expect(pendingReqs.status).toBe(200);
    expect(pendingReqs.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'requested', requestedPlan: 'starter' }),
      ]),
    );

    // Step 2: Simulate Chapa webhook callback
    const rawBody = JSON.stringify({ tx_ref: txRef, status: 'success' });
    const sig = signWebhook(rawBody, WEBHOOK_SECRET);

    const webhookRes = await request(context.app)
      .post('/billing/chapa/webhook')
      .set('Content-Type', 'application/json')
      .set('chapa-signature', sig)
      .send(rawBody);
    expect(webhookRes.status).toBe(200);

    // Step 3: Verify workspace plan changed
    const ws = context.db
      .prepare<[string], { plan: string; billing_status: string }>(
        'SELECT plan, billing_status FROM workspaces WHERE id = ?',
      )
      .get(workspace!.id);
    expect(ws?.plan).toBe('starter');
    expect(ws?.billing_status).toBe('active');

    // Step 4: Verify upgrade_request is reconciled
    const ur = context.db
      .prepare<[string], { status: string; activated_at: string | null }>(
        'SELECT status, activated_at FROM upgrade_requests WHERE chapa_tx_ref = ?',
      )
      .get(txRef);
    expect(ur?.status).toBe('activated');
    expect(ur?.activated_at).toBeTruthy();
  });

  it('webhook with non-success status does not activate', async () => {
    context = await createTestApp({
      env: { CHAPA_SECRET_KEY, CHAPA_WEBHOOK_SECRET: WEBHOOK_SECRET },
    });
    applyBillingMigration(context.db);
    vi.stubGlobal('fetch', mockChapaSuccess());

    const { agent, workspace } = await signupAndAuthenticate(context.app);

    // Initiate
    const initRes = await agent
      .post('/billing/chapa/initiate')
      .send({ requestedPlan: 'starter' });
    expect(initRes.status).toBe(200);
    const { txRef } = initRes.body;

    // Webhook with pending status
    const rawBody = JSON.stringify({ tx_ref: txRef, status: 'pending' });
    const sig = signWebhook(rawBody, WEBHOOK_SECRET);

    const webhookRes = await request(context.app)
      .post('/billing/chapa/webhook')
      .set('Content-Type', 'application/json')
      .set('chapa-signature', sig)
      .send(rawBody);
    expect(webhookRes.status).toBe(200);

    // Workspace plan unchanged
    const ws = context.db
      .prepare<[string], { plan: string }>(
        'SELECT plan FROM workspaces WHERE id = ?',
      )
      .get(workspace!.id);
    expect(ws?.plan).toBe('free');

    // Upgrade request still pending
    const ur = context.db
      .prepare<[string], { status: string }>(
        'SELECT status FROM upgrade_requests WHERE chapa_tx_ref = ?',
      )
      .get(txRef);
    expect(ur?.status).toBe('requested');
  });
});
