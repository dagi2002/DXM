import request, { type Response } from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestApp, type ApiTestContext } from '../helpers/testApp.js';

interface SignupResult {
  cookieHeader: string;
  response: Response;
  workspace: { id: string; name: string };
}

const signupAndAuthenticate = async (app: unknown): Promise<SignupResult> => {
  const nonce = `${Date.now()}-${Math.round(Math.random() * 100000)}`;
  const response = await request(app).post('/auth/signup').send({
    name: 'Test User',
    email: `test-${nonce}@dxmpulse.local`,
    password: 'password1234',
    workspaceName: 'Test Workspace',
  });

  const cookieHeader = ((response.headers['set-cookie'] as string[] | undefined) ?? [])
    .map((value) => value.split(';')[0])
    .join('; ');

  return {
    cookieHeader,
    response,
    workspace: response.body?.workspace,
  };
};

const createSite = async (app: unknown, cookieHeader: string, name: string) =>
  request(app).post('/sites').set('Cookie', cookieHeader).send({
    name,
    domain: `https://${name.toLowerCase().replace(/\s+/g, '-')}.example/`,
  });

const createFunnel = async (
  app: unknown,
  cookieHeader: string,
  siteId: string,
  name = 'Checkout Funnel',
) =>
  request(app).post('/funnels').set('Cookie', cookieHeader).send({
    name,
    siteId,
    steps: [
      { name: 'Landing', urlPattern: '/landing' },
      { name: 'Cart', urlPattern: '/cart' },
      { name: 'Checkout', urlPattern: '/checkout' },
    ],
  });

const collectFunnelSession = async (
  app: unknown,
  siteKey: string,
  sessionId: string,
  paths: string[],
) => {
  const startedAt = Date.now();
  const events = paths.map((path, index) => ({
    type: 'pageview' as const,
    ts: startedAt + index * 1000,
    url: `https://client.example${path}`,
  }));

  return request(app).post('/collect').send({
    sessionId,
    siteId: siteKey,
    completed: true,
    events,
    metadata: {
      url: `https://client.example${paths[0] ?? '/'}`,
      userAgent: 'Mozilla/5.0',
      language: 'en-US',
      screen: { width: 1440, height: 900 },
    },
  });
};

describe('funnel ai brief', () => {
  let context: ApiTestContext | null = null;

  afterEach(async () => {
    await context?.cleanup();
    context = null;
    delete process.env.DXM_AI_ENABLED;
  });

  it('skips funnel ai generation entirely when DXM_AI_ENABLED is disabled', async () => {
    process.env.DXM_AI_ENABLED = 'false';
    context = await createTestApp();

    const { cookieHeader, response, workspace } = await signupAndAuthenticate(context.app);
    expect(response.status).toBe(201);

    const siteResponse = await createSite(context.app, cookieHeader, 'Disabled Funnel Client');
    expect(siteResponse.status).toBe(201);

    const funnelResponse = await createFunnel(context.app, cookieHeader, siteResponse.body.id);
    expect(funnelResponse.status).toBe(201);

    const analysisResponse = await request(context.app)
      .get(`/funnels/${funnelResponse.body.id}/analysis?period=7d`)
      .set('Cookie', cookieHeader);

    expect(analysisResponse.status).toBe(200);
    expect(analysisResponse.body.ai).toBeUndefined();

    const artifactCount =
      context.db
        .prepare<
          [string],
          { count: number }
        >(
          `
            SELECT COUNT(*) as count
            FROM ai_artifacts
            WHERE workspace_id = ?
              AND entity_type = 'funnel'
              AND artifact_kind = 'funnel_brief'
          `,
        )
        .get(workspace.id)?.count ?? 0;

    expect(artifactCount).toBe(0);
  });

  it('creates a deterministic funnel ai brief on first analysis request', async () => {
    context = await createTestApp();

    const { cookieHeader, response, workspace } = await signupAndAuthenticate(context.app);
    expect(response.status).toBe(201);

    const siteResponse = await createSite(context.app, cookieHeader, 'Funnel Client');
    expect(siteResponse.status).toBe(201);

    const funnelResponse = await createFunnel(context.app, cookieHeader, siteResponse.body.id);
    expect(funnelResponse.status).toBe(201);

    await collectFunnelSession(context.app, siteResponse.body.siteKey, 'sess_funnel_ai_one', [
      '/landing',
      '/cart',
      '/checkout',
    ]);
    await collectFunnelSession(context.app, siteResponse.body.siteKey, 'sess_funnel_ai_two', [
      '/landing',
      '/cart',
    ]);
    await collectFunnelSession(context.app, siteResponse.body.siteKey, 'sess_funnel_ai_three', [
      '/landing',
    ]);
    await collectFunnelSession(context.app, siteResponse.body.siteKey, 'sess_funnel_ai_four', [
      '/landing',
      '/cart',
      '/checkout',
    ]);
    await collectFunnelSession(context.app, siteResponse.body.siteKey, 'sess_funnel_ai_five', [
      '/landing',
      '/cart',
    ]);

    const analysisResponse = await request(context.app)
      .get(`/funnels/${funnelResponse.body.id}/analysis?period=7d`)
      .set('Cookie', cookieHeader);

    expect(analysisResponse.status).toBe(200);
    expect(analysisResponse.body.ai).toMatchObject({
      period: '7d',
      mode: 'deterministic',
    });
    expect(analysisResponse.body.ai.headline).toContain('Checkout is the biggest drop-off point');
    expect(analysisResponse.body.ai.biggestDropoff).toContain('Checkout');

    const artifactRow = context.db
      .prepare<
        [string],
        { artifact_kind: string; generator_type: string; status: string; site_id: string | null; period_key: string }
      >(
        `
          SELECT artifact_kind, generator_type, status, site_id, period_key
          FROM ai_artifacts
          WHERE workspace_id = ?
            AND entity_type = 'funnel'
            AND artifact_kind = 'funnel_brief'
        `,
      )
      .get(workspace.id);

    expect(artifactRow).toMatchObject({
      artifact_kind: 'funnel_brief',
      generator_type: 'deterministic',
      status: 'ready',
      site_id: siteResponse.body.id,
      period_key: '7d',
    });
  });

  it('reuses the cached funnel artifact when the input is unchanged', async () => {
    context = await createTestApp();

    const { cookieHeader, response, workspace } = await signupAndAuthenticate(context.app);
    expect(response.status).toBe(201);

    const siteResponse = await createSite(context.app, cookieHeader, 'Cached Funnel Client');
    expect(siteResponse.status).toBe(201);

    const funnelResponse = await createFunnel(context.app, cookieHeader, siteResponse.body.id);
    expect(funnelResponse.status).toBe(201);

    await collectFunnelSession(context.app, siteResponse.body.siteKey, 'sess_funnel_ai_repeat', [
      '/landing',
      '/cart',
      '/checkout',
    ]);

    const firstResponse = await request(context.app)
      .get(`/funnels/${funnelResponse.body.id}/analysis?period=7d`)
      .set('Cookie', cookieHeader);
    const secondResponse = await request(context.app)
      .get(`/funnels/${funnelResponse.body.id}/analysis?period=7d`)
      .set('Cookie', cookieHeader);

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body.ai).toEqual(firstResponse.body.ai);

    const artifactCount =
      context.db
        .prepare<
          [string],
          { count: number }
        >(
          `
            SELECT COUNT(*) as count
            FROM ai_artifacts
            WHERE workspace_id = ?
              AND entity_type = 'funnel'
              AND artifact_kind = 'funnel_brief'
          `,
        )
        .get(workspace.id)?.count ?? 0;

    expect(artifactCount).toBe(1);
  });

  it('recomputes the cached funnel artifact when the funnel analysis input changes', async () => {
    context = await createTestApp();

    const { cookieHeader, response, workspace } = await signupAndAuthenticate(context.app);
    expect(response.status).toBe(201);

    const siteResponse = await createSite(context.app, cookieHeader, 'Refresh Funnel Client');
    expect(siteResponse.status).toBe(201);

    const funnelResponse = await createFunnel(context.app, cookieHeader, siteResponse.body.id);
    expect(funnelResponse.status).toBe(201);

    await collectFunnelSession(context.app, siteResponse.body.siteKey, 'sess_funnel_ai_refresh_one', [
      '/landing',
      '/cart',
      '/checkout',
    ]);
    await collectFunnelSession(context.app, siteResponse.body.siteKey, 'sess_funnel_ai_refresh_two', [
      '/landing',
      '/cart',
    ]);

    const firstResponse = await request(context.app)
      .get(`/funnels/${funnelResponse.body.id}/analysis?period=7d`)
      .set('Cookie', cookieHeader);

    expect(firstResponse.status).toBe(200);

    const beforeArtifact = context.db
      .prepare<
        [string],
        { input_hash: string; output_json: string }
      >(
        `
          SELECT input_hash, output_json
          FROM ai_artifacts
          WHERE workspace_id = ?
            AND entity_type = 'funnel'
            AND artifact_kind = 'funnel_brief'
            AND period_key = '7d'
        `,
      )
      .get(workspace.id);

    expect(beforeArtifact).toBeTruthy();

    await collectFunnelSession(context.app, siteResponse.body.siteKey, 'sess_funnel_ai_refresh_three', [
      '/landing',
    ]);

    const secondResponse = await request(context.app)
      .get(`/funnels/${funnelResponse.body.id}/analysis?period=7d`)
      .set('Cookie', cookieHeader);

    expect(secondResponse.status).toBe(200);

    const afterArtifact = context.db
      .prepare<
        [string],
        { input_hash: string; output_json: string }
      >(
        `
          SELECT input_hash, output_json
          FROM ai_artifacts
          WHERE workspace_id = ?
            AND entity_type = 'funnel'
            AND artifact_kind = 'funnel_brief'
            AND period_key = '7d'
        `,
      )
      .get(workspace.id);

    expect(afterArtifact?.input_hash).not.toBe(beforeArtifact?.input_hash);
    expect(afterArtifact?.output_json).not.toBe(beforeArtifact?.output_json);
  });

  it('stores separate funnel artifacts per analysis period', async () => {
    context = await createTestApp();

    const { cookieHeader, response, workspace } = await signupAndAuthenticate(context.app);
    expect(response.status).toBe(201);

    const siteResponse = await createSite(context.app, cookieHeader, 'Period Funnel Client');
    expect(siteResponse.status).toBe(201);

    const funnelResponse = await createFunnel(context.app, cookieHeader, siteResponse.body.id);
    expect(funnelResponse.status).toBe(201);

    await collectFunnelSession(context.app, siteResponse.body.siteKey, 'sess_funnel_ai_period', [
      '/landing',
      '/cart',
      '/checkout',
    ]);

    const [sevenDayResponse, thirtyDayResponse] = await Promise.all([
      request(context.app).get(`/funnels/${funnelResponse.body.id}/analysis?period=7d`).set('Cookie', cookieHeader),
      request(context.app).get(`/funnels/${funnelResponse.body.id}/analysis?period=30d`).set('Cookie', cookieHeader),
    ]);

    expect(sevenDayResponse.status).toBe(200);
    expect(thirtyDayResponse.status).toBe(200);

    const periodKeys = context.db
      .prepare<
        [string],
        { period_key: string }[]
      >(
        `
          SELECT period_key
          FROM ai_artifacts
          WHERE workspace_id = ?
            AND entity_type = 'funnel'
            AND artifact_kind = 'funnel_brief'
          ORDER BY period_key ASC
        `,
      )
      .all(workspace.id)
      .map((row) => row.period_key);

    expect(periodKeys).toEqual(['30d', '7d']);
  });

  it('returns low-signal guidance when no sessions match the funnel', async () => {
    context = await createTestApp();

    const { cookieHeader, response } = await signupAndAuthenticate(context.app);
    expect(response.status).toBe(201);

    const siteResponse = await createSite(context.app, cookieHeader, 'Empty Funnel Client');
    expect(siteResponse.status).toBe(201);

    const funnelResponse = await createFunnel(context.app, cookieHeader, siteResponse.body.id);
    expect(funnelResponse.status).toBe(201);

    const analysisResponse = await request(context.app)
      .get(`/funnels/${funnelResponse.body.id}/analysis?period=7d`)
      .set('Cookie', cookieHeader);

    expect(analysisResponse.status).toBe(200);
    expect(analysisResponse.body.totalSessions).toBe(0);
    expect(analysisResponse.body.ai.headline).toBe(`Not enough signal yet for ${funnelResponse.body.name}.`);
    expect(analysisResponse.body.ai.likelyReason).toContain('Not enough signal yet');
  });

  it('uses conservative heuristic language for high drop-off funnels', async () => {
    context = await createTestApp();

    const { cookieHeader, response } = await signupAndAuthenticate(context.app);
    expect(response.status).toBe(201);

    const siteResponse = await createSite(context.app, cookieHeader, 'Leak Funnel Client');
    expect(siteResponse.status).toBe(201);

    const funnelResponse = await createFunnel(context.app, cookieHeader, siteResponse.body.id);
    expect(funnelResponse.status).toBe(201);

    await collectFunnelSession(context.app, siteResponse.body.siteKey, 'sess_funnel_ai_leak_one', [
      '/landing',
      '/cart',
      '/checkout',
    ]);
    await collectFunnelSession(context.app, siteResponse.body.siteKey, 'sess_funnel_ai_leak_two', [
      '/landing',
    ]);
    await collectFunnelSession(context.app, siteResponse.body.siteKey, 'sess_funnel_ai_leak_three', [
      '/landing',
    ]);
    await collectFunnelSession(context.app, siteResponse.body.siteKey, 'sess_funnel_ai_leak_four', [
      '/landing',
    ]);
    await collectFunnelSession(context.app, siteResponse.body.siteKey, 'sess_funnel_ai_leak_five', [
      '/landing',
    ]);

    const analysisResponse = await request(context.app)
      .get(`/funnels/${funnelResponse.body.id}/analysis?period=7d`)
      .set('Cookie', cookieHeader);

    expect(analysisResponse.status).toBe(200);
    expect(analysisResponse.body.ai.headline).toContain('Cart is the biggest drop-off point');
    expect(analysisResponse.body.ai.biggestDropoff).toContain('Cart');
    expect(analysisResponse.body.ai.likelyReason).toMatch(/often suggests|likely explanation|may indicate/i);
    expect(analysisResponse.body.ai.summary).toContain('heuristic');
  });

  it('preserves the existing 404 response for unknown funnels', async () => {
    context = await createTestApp();

    const { cookieHeader, response } = await signupAndAuthenticate(context.app);
    expect(response.status).toBe(201);

    const analysisResponse = await request(context.app)
      .get('/funnels/funnel_does_not_exist/analysis?period=7d')
      .set('Cookie', cookieHeader);

    expect(analysisResponse.status).toBe(404);
    expect(analysisResponse.body).toEqual({ error: 'Funnel not found' });
  });
});
