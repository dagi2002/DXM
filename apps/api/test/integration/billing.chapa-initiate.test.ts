import { afterEach, describe, expect, it, vi } from 'vitest';
import { signupAndAuthenticate } from '../helpers/auth.js';
import { applyBillingMigration } from '../helpers/billing.js';
import { createTestApp, type ApiTestContext } from '../helpers/testApp.js';

const CHAPA_SECRET_KEY = 'test-chapa-secret-key';

const mockChapaSuccess = () =>
  vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: { checkout_url: 'https://checkout.chapa.co/test-session' } }),
    text: async () => '',
  });

describe('billing chapa initiate', () => {
  let context: ApiTestContext | null = null;

  afterEach(async () => {
    vi.unstubAllGlobals();
    await context?.cleanup();
    context = null;
  });

  it('creates upgrade request and returns checkout URL', async () => {
    context = await createTestApp({ env: { CHAPA_SECRET_KEY } });
    applyBillingMigration(context.db);

    const fetchMock = mockChapaSuccess();
    vi.stubGlobal('fetch', fetchMock);

    const { agent, workspace } = await signupAndAuthenticate(context.app);

    const res = await agent
      .post('/billing/chapa/initiate')
      .send({ requestedPlan: 'starter' });

    expect(res.status).toBe(200);
    expect(res.body.checkoutUrl).toBe('https://checkout.chapa.co/test-session');
    expect(res.body.txRef).toBeTruthy();

    // Verify fetch was called with Chapa endpoint and auth header
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.chapa.co/v1/transaction/initialize');
    expect(opts.headers.Authorization).toBe(`Bearer ${CHAPA_SECRET_KEY}`);

    // Verify upgrade_request row with chapa_tx_ref
    const ur = context.db
      .prepare<[string], { chapa_tx_ref: string; requested_plan: string; status: string }>(
        'SELECT chapa_tx_ref, requested_plan, status FROM upgrade_requests WHERE workspace_id = ? LIMIT 1',
      )
      .get(workspace!.id);
    expect(ur?.chapa_tx_ref).toBe(res.body.txRef);
    expect(ur?.requested_plan).toBe('starter');
    expect(ur?.status).toBe('requested');
  });

  it('returns 503 when CHAPA_SECRET_KEY is not configured', async () => {
    context = await createTestApp({ env: { CHAPA_SECRET_KEY: '' } });

    const { agent } = await signupAndAuthenticate(context.app);

    const res = await agent
      .post('/billing/chapa/initiate')
      .send({ requestedPlan: 'starter' });

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ error: 'Payment provider not configured on this server' });
  });

  it('returns 502 when Chapa API is unreachable', async () => {
    context = await createTestApp({ env: { CHAPA_SECRET_KEY } });
    applyBillingMigration(context.db);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    const { agent } = await signupAndAuthenticate(context.app);

    const res = await agent
      .post('/billing/chapa/initiate')
      .send({ requestedPlan: 'starter' });

    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({ error: 'Payment provider unreachable' });
  });

  it('returns 502 when Chapa returns non-ok response', async () => {
    context = await createTestApp({ env: { CHAPA_SECRET_KEY } });
    applyBillingMigration(context.db);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'Bad request from Chapa',
    }));

    const { agent } = await signupAndAuthenticate(context.app);

    const res = await agent
      .post('/billing/chapa/initiate')
      .send({ requestedPlan: 'starter' });

    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({ error: 'Payment provider returned an error' });
  });

  it('returns 502 when Chapa response is missing checkout_url', async () => {
    context = await createTestApp({ env: { CHAPA_SECRET_KEY } });
    applyBillingMigration(context.db);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: {} }),
      text: async () => '',
    }));

    const { agent } = await signupAndAuthenticate(context.app);

    const res = await agent
      .post('/billing/chapa/initiate')
      .send({ requestedPlan: 'starter' });

    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({ error: 'No checkout URL in provider response' });
  });
});
