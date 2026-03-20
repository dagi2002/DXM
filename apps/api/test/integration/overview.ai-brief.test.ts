import request, { type Response } from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestApp, type ApiTestContext } from '../helpers/testApp.js';

interface SignupResult {
  cookieHeader: string;
  response: Response;
  user: { id: string; workspaceId: string };
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
    user: response.body?.user,
    workspace: response.body?.workspace,
  };
};

const collectSession = async (
  app: unknown,
  cookieHeader: string,
  siteKey: string,
  sessionId: string,
) => {
  return request(app).post('/collect').set('Cookie', cookieHeader).send({
    sessionId,
    siteId: siteKey,
    completed: true,
    events: [
      { type: 'pageview', ts: Date.now(), url: 'https://client.example/' },
      { type: 'click', ts: Date.now() + 1000, x: 12, y: 18, target: 'button.primary', url: 'https://client.example/' },
    ],
    metadata: {
      url: 'https://client.example/',
      userAgent: 'Mozilla/5.0',
      language: 'en-US',
      screen: { width: 1440, height: 900 },
    },
  });
};

describe('overview ai brief', () => {
  let context: ApiTestContext | null = null;

  afterEach(async () => {
    await context?.cleanup();
    context = null;
    delete process.env.DXM_AI_ENABLED;
  });

  it('skips ai generation entirely when DXM_AI_ENABLED is disabled', async () => {
    process.env.DXM_AI_ENABLED = 'false';
    context = await createTestApp();

    const { cookieHeader, response } = await signupAndAuthenticate(context.app);
    expect(response.status).toBe(201);

    const overviewResponse = await request(context.app).get('/overview').set('Cookie', cookieHeader);
    expect(overviewResponse.status).toBe(200);
    expect(overviewResponse.body.ai).toBeUndefined();

    const artifactCount =
      context.db.prepare<[], { count: number }>('SELECT COUNT(*) as count FROM ai_artifacts').get()?.count ?? 0;
    expect(artifactCount).toBe(0);
  });

  it('creates and caches a deterministic overview ai brief on first request', async () => {
    delete process.env.DXM_AI_ENABLED;
    context = await createTestApp();

    const { cookieHeader, response, workspace } = await signupAndAuthenticate(context.app);
    expect(response.status).toBe(201);

    const siteResponse = await request(context.app).post('/sites').set('Cookie', cookieHeader).send({
      name: 'Alpha Client',
      domain: 'https://alpha.example/',
    });
    expect(siteResponse.status).toBe(201);

    const collectResponse = await collectSession(
      context.app,
      cookieHeader,
      siteResponse.body.siteKey,
      'sess_overview_ai_cache',
    );
    expect(collectResponse.status).toBe(200);

    const overviewResponse = await request(context.app).get('/overview').set('Cookie', cookieHeader);
    expect(overviewResponse.status).toBe(200);
    expect(overviewResponse.body.ai).toMatchObject({
      period: '7d',
      mode: 'deterministic',
      recommendations: expect.any(Array),
      evidence: expect.any(Array),
    });

    const artifactRow = context.db
      .prepare<
        [string],
        { artifact_kind: string; generator_type: string; status: string }
      >(
        `
          SELECT artifact_kind, generator_type, status
          FROM ai_artifacts
          WHERE workspace_id = ?
            AND entity_type = 'workspace'
            AND artifact_kind = 'overview_brief'
            AND period_key = '7d'
        `,
      )
      .get(workspace.id);

    expect(artifactRow).toMatchObject({
      artifact_kind: 'overview_brief',
      generator_type: 'deterministic',
      status: 'ready',
    });
  });

  it('reuses the cached artifact when the overview input is unchanged', async () => {
    delete process.env.DXM_AI_ENABLED;
    context = await createTestApp();

    const { cookieHeader, response, workspace } = await signupAndAuthenticate(context.app);
    expect(response.status).toBe(201);

    const siteResponse = await request(context.app).post('/sites').set('Cookie', cookieHeader).send({
      name: 'Bravo Client',
      domain: 'https://bravo.example/',
    });
    expect(siteResponse.status).toBe(201);

    const collectResponse = await collectSession(
      context.app,
      cookieHeader,
      siteResponse.body.siteKey,
      'sess_overview_ai_repeat',
    );
    expect(collectResponse.status).toBe(200);

    const firstOverview = await request(context.app).get('/overview').set('Cookie', cookieHeader);
    const secondOverview = await request(context.app).get('/overview').set('Cookie', cookieHeader);

    expect(firstOverview.status).toBe(200);
    expect(secondOverview.status).toBe(200);
    expect(secondOverview.body.ai).toEqual(firstOverview.body.ai);

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
              AND entity_type = 'workspace'
              AND artifact_kind = 'overview_brief'
              AND period_key = '7d'
          `,
        )
        .get(workspace.id)?.count ?? 0;

    expect(artifactCount).toBe(1);
  });

  it('recomputes the cached artifact when the overview input changes', async () => {
    delete process.env.DXM_AI_ENABLED;
    context = await createTestApp();

    const { cookieHeader, response, workspace } = await signupAndAuthenticate(context.app);
    expect(response.status).toBe(201);

    const siteResponse = await request(context.app).post('/sites').set('Cookie', cookieHeader).send({
      name: 'Charlie Client',
      domain: 'https://charlie.example/',
    });
    expect(siteResponse.status).toBe(201);

    const collectResponse = await collectSession(
      context.app,
      cookieHeader,
      siteResponse.body.siteKey,
      'sess_overview_ai_invalidation',
    );
    expect(collectResponse.status).toBe(200);

    const firstOverview = await request(context.app).get('/overview').set('Cookie', cookieHeader);
    expect(firstOverview.status).toBe(200);
    expect(firstOverview.body.ai?.topRisk).toBeTruthy();

    const beforeArtifact = context.db
      .prepare<
        [string],
        { input_hash: string; output_json: string }
      >(
        `
          SELECT input_hash, output_json
          FROM ai_artifacts
          WHERE workspace_id = ?
            AND entity_type = 'workspace'
            AND artifact_kind = 'overview_brief'
            AND period_key = '7d'
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
          VALUES (?, ?, ?, ?, ?, ?, ?, 0, 3)
        `,
      )
      .run(
        `alert-overview-ai-${Date.now()}`,
        workspace.id,
        siteResponse.body.id,
        'frustration',
        'critical',
        'Rage click burst detected',
        'Users are struggling on the main CTA.',
      );

    const secondOverview = await request(context.app).get('/overview').set('Cookie', cookieHeader);
    expect(secondOverview.status).toBe(200);
    expect(secondOverview.body.ai?.headline).toBe('No client sites are live yet.');
    expect(secondOverview.body.ai?.topRisk).toContain('Rage click burst detected');

    const afterArtifact = context.db
      .prepare<
        [string],
        { input_hash: string; output_json: string }
      >(
        `
          SELECT input_hash, output_json
          FROM ai_artifacts
          WHERE workspace_id = ?
            AND entity_type = 'workspace'
            AND artifact_kind = 'overview_brief'
            AND period_key = '7d'
        `,
      )
      .get(workspace.id);

    expect(afterArtifact?.input_hash).not.toBe(beforeArtifact?.input_hash);
    expect(afterArtifact?.output_json).not.toBe(beforeArtifact?.output_json);
  });

  it('returns safe installation guidance for an empty portfolio', async () => {
    delete process.env.DXM_AI_ENABLED;
    context = await createTestApp();

    const { cookieHeader, response } = await signupAndAuthenticate(context.app);
    expect(response.status).toBe(201);

    const overviewResponse = await request(context.app).get('/overview').set('Cookie', cookieHeader);
    expect(overviewResponse.status).toBe(200);
    expect(overviewResponse.body.summary.totalClients).toBe(0);
    expect(overviewResponse.body.ai).toMatchObject({
      mode: 'deterministic',
      headline: 'No client sites are live yet.',
    });
    expect(overviewResponse.body.ai.summary).toContain('Add your first client site');
    expect(overviewResponse.body.ai.topOpportunity).toContain('Add your first client site');
  });
});
