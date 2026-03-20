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

const collectSession = async (
  app: unknown,
  cookieHeader: string,
  siteKey: string,
  sessionId: string,
  options: {
    durationMs?: number;
    conversionEvent?: string | null;
    url?: string;
  } = {},
) => {
  const startedAt = Date.now();
  const durationMs = options.durationMs ?? 1000;
  const url = options.url ?? 'https://client.example/';
  const clickTimestamp = startedAt + Math.min(durationMs, 60_000);
  const events = [
    { type: 'pageview' as const, ts: startedAt, url },
    { type: 'click' as const, ts: clickTimestamp, x: 12, y: 18, target: 'button.primary', url },
  ];

  if (options.conversionEvent) {
    events.push({
      type: 'custom' as const,
      ts: startedAt + durationMs,
      event: options.conversionEvent,
      url,
    });
  }

  return request(app).post('/collect').set('Cookie', cookieHeader).send({
    sessionId,
    siteId: siteKey,
    completed: true,
    events,
    metadata: {
      url,
      userAgent: 'Mozilla/5.0',
      language: 'en-US',
      screen: { width: 1440, height: 900 },
    },
  });
};

describe('site ai brief', () => {
  let context: ApiTestContext | null = null;

  afterEach(async () => {
    await context?.cleanup();
    context = null;
    delete process.env.DXM_AI_ENABLED;
  });

  it('skips site ai generation entirely when DXM_AI_ENABLED is disabled', async () => {
    process.env.DXM_AI_ENABLED = 'false';
    context = await createTestApp();

    const { cookieHeader, response, workspace } = await signupAndAuthenticate(context.app);
    expect(response.status).toBe(201);

    const siteResponse = await createSite(context.app, cookieHeader, 'Disabled Client');
    expect(siteResponse.status).toBe(201);

    const detailResponse = await request(context.app)
      .get(`/sites/${siteResponse.body.id}`)
      .set('Cookie', cookieHeader);

    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.ai).toBeUndefined();

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
              AND entity_type = 'site'
              AND artifact_kind = 'site_brief'
          `,
        )
        .get(workspace.id)?.count ?? 0;

    expect(artifactCount).toBe(0);
  });

  it('creates a deterministic site ai brief with install-first guidance for an unverified site', async () => {
    context = await createTestApp();

    const { cookieHeader, response, workspace } = await signupAndAuthenticate(context.app);
    expect(response.status).toBe(201);

    const siteResponse = await createSite(context.app, cookieHeader, 'Unverified Client');
    expect(siteResponse.status).toBe(201);

    const detailResponse = await request(context.app)
      .get(`/sites/${siteResponse.body.id}`)
      .set('Cookie', cookieHeader);

    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.ai).toMatchObject({
      period: '7d',
      mode: 'deterministic',
      headline: `Tracking is not live on ${siteResponse.body.name} yet.`,
    });
    expect(detailResponse.body.ai.summary).toContain('Finish installation');
    expect(detailResponse.body.ai.topOpportunity).toContain('Finish installation');

    const artifactRow = context.db
      .prepare<
        [string],
        { artifact_kind: string; generator_type: string; status: string; site_id: string }
      >(
        `
          SELECT artifact_kind, generator_type, status, site_id
          FROM ai_artifacts
          WHERE workspace_id = ?
            AND entity_type = 'site'
            AND artifact_kind = 'site_brief'
        `,
      )
      .get(workspace.id);

    expect(artifactRow).toMatchObject({
      artifact_kind: 'site_brief',
      generator_type: 'deterministic',
      status: 'ready',
      site_id: siteResponse.body.id,
    });
  });

  it('reuses the cached site artifact when the input is unchanged', async () => {
    context = await createTestApp();

    const { cookieHeader, response, workspace } = await signupAndAuthenticate(context.app);
    expect(response.status).toBe(201);

    const siteResponse = await createSite(context.app, cookieHeader, 'Cached Client');
    expect(siteResponse.status).toBe(201);

    const collectResponse = await collectSession(
      context.app,
      cookieHeader,
      siteResponse.body.siteKey,
      'sess_site_ai_repeat',
    );
    expect(collectResponse.status).toBe(200);

    const firstResponse = await request(context.app)
      .get(`/sites/${siteResponse.body.id}`)
      .set('Cookie', cookieHeader);
    const secondResponse = await request(context.app)
      .get(`/sites/${siteResponse.body.id}`)
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
              AND entity_type = 'site'
              AND artifact_kind = 'site_brief'
          `,
        )
        .get(workspace.id)?.count ?? 0;

    expect(artifactCount).toBe(1);
  });

  it('recomputes the cached site artifact when the site input changes', async () => {
    context = await createTestApp();

    const { cookieHeader, response, workspace } = await signupAndAuthenticate(context.app);
    expect(response.status).toBe(201);

    const siteResponse = await createSite(context.app, cookieHeader, 'Refresh Client');
    expect(siteResponse.status).toBe(201);

    const collectResponse = await collectSession(
      context.app,
      cookieHeader,
      siteResponse.body.siteKey,
      'sess_site_ai_refresh',
    );
    expect(collectResponse.status).toBe(200);

    const firstResponse = await request(context.app)
      .get(`/sites/${siteResponse.body.id}`)
      .set('Cookie', cookieHeader);

    expect(firstResponse.status).toBe(200);
    expect(firstResponse.body.ai?.topRisk).toBeTruthy();

    const beforeArtifact = context.db
      .prepare<
        [string],
        { input_hash: string; output_json: string }
      >(
        `
          SELECT input_hash, output_json
          FROM ai_artifacts
          WHERE workspace_id = ?
            AND entity_type = 'site'
            AND artifact_kind = 'site_brief'
        `,
      )
      .get(workspace.id);

    expect(beforeArtifact).toBeTruthy();

    context.db
      .prepare(
        `
          INSERT INTO alerts (
            id,
            workspace_id,
            site_id,
            type,
            severity,
            title,
            description,
            resolved,
            affected_sessions
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, 0, 4)
        `,
      )
      .run(
        `alert-site-ai-${Date.now()}`,
        workspace.id,
        siteResponse.body.id,
        'frustration',
        'critical',
        'Checkout rage clicks detected',
        'Visitors are struggling near the checkout CTA.',
      );

    const secondResponse = await request(context.app)
      .get(`/sites/${siteResponse.body.id}`)
      .set('Cookie', cookieHeader);

    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body.ai?.headline).toContain('critical alert');
    expect(secondResponse.body.ai?.topRisk).toContain('Checkout rage clicks detected');

    const afterArtifact = context.db
      .prepare<
        [string],
        { input_hash: string; output_json: string }
      >(
        `
          SELECT input_hash, output_json
          FROM ai_artifacts
          WHERE workspace_id = ?
            AND entity_type = 'site'
            AND artifact_kind = 'site_brief'
        `,
      )
      .get(workspace.id);

    expect(afterArtifact?.input_hash).not.toBe(beforeArtifact?.input_hash);
    expect(afterArtifact?.output_json).not.toBe(beforeArtifact?.output_json);
  });

  it('returns a stable healthy brief for a live site with a funnel and no alerts', async () => {
    context = await createTestApp();

    const { cookieHeader, response, workspace } = await signupAndAuthenticate(context.app);
    expect(response.status).toBe(201);

    const siteResponse = await createSite(context.app, cookieHeader, 'Healthy Client');
    expect(siteResponse.status).toBe(201);

    const collectResponse = await collectSession(
      context.app,
      cookieHeader,
      siteResponse.body.siteKey,
      'sess_site_ai_healthy',
      {
        durationMs: 180_000,
        conversionEvent: 'purchase',
      },
    );
    expect(collectResponse.status).toBe(200);

    context.db
      .prepare(
        `
          INSERT INTO funnels (id, workspace_id, site_id, name, steps_json)
          VALUES (?, ?, ?, ?, ?)
        `,
      )
      .run(
        `funnel-site-ai-${Date.now()}`,
        workspace.id,
        siteResponse.body.id,
        'Checkout funnel',
        JSON.stringify([
          { name: 'Landing', urlPattern: '/' },
          { name: 'Checkout', urlPattern: '/checkout' },
        ]),
      );

    const detailResponse = await request(context.app)
      .get(`/sites/${siteResponse.body.id}`)
      .set('Cookie', cookieHeader);

    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.ai?.headline).toBe(`${siteResponse.body.name} looks stable this week.`);
    expect(detailResponse.body.ai?.summary).toContain('no unresolved alerts');
    expect(detailResponse.body.ai?.topOpportunity).toContain('client-ready update');
  });

  it('keeps /sites/:id/overview valid without adding the new ai block', async () => {
    context = await createTestApp();

    const { cookieHeader, response } = await signupAndAuthenticate(context.app);
    expect(response.status).toBe(201);

    const siteResponse = await createSite(context.app, cookieHeader, 'Alias Client');
    expect(siteResponse.status).toBe(201);

    const primaryResponse = await request(context.app)
      .get(`/sites/${siteResponse.body.id}`)
      .set('Cookie', cookieHeader);
    const aliasResponse = await request(context.app)
      .get(`/sites/${siteResponse.body.id}/overview`)
      .set('Cookie', cookieHeader);

    expect(primaryResponse.status).toBe(200);
    expect(primaryResponse.body.ai).toBeTruthy();
    expect(aliasResponse.status).toBe(200);
    expect(aliasResponse.body.ai).toBeUndefined();
  });

  it('preserves the existing 404 response for unknown sites', async () => {
    context = await createTestApp();

    const { cookieHeader, response } = await signupAndAuthenticate(context.app);
    expect(response.status).toBe(201);

    const detailResponse = await request(context.app)
      .get('/sites/site_does_not_exist')
      .set('Cookie', cookieHeader);

    expect(detailResponse.status).toBe(404);
    expect(detailResponse.body).toEqual({ error: 'Client site not found' });
  });
});
