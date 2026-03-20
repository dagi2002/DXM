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

const createAlert = async (
  app: unknown,
  cookieHeader: string,
  payload: {
    type: 'error' | 'performance' | 'frustration' | 'conversion';
    severity: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    description: string;
    siteId?: string | null;
    affectedSessions?: number;
  },
) =>
  request(app).post('/alerts').set('Cookie', cookieHeader).send(payload);

describe('alert ai brief', () => {
  let context: ApiTestContext | null = null;

  afterEach(async () => {
    await context?.cleanup();
    context = null;
    delete process.env.DXM_AI_ENABLED;
  });

  it('skips alert ai generation entirely when DXM_AI_ENABLED is disabled', async () => {
    process.env.DXM_AI_ENABLED = 'false';
    context = await createTestApp();

    const { cookieHeader, response, workspace } = await signupAndAuthenticate(context.app);
    expect(response.status).toBe(201);

    const alertResponse = await createAlert(context.app, cookieHeader, {
      type: 'performance',
      severity: 'high',
      title: 'Slow page load detected',
      description: 'Recent signals suggest slower-than-expected rendering.',
      affectedSessions: 7,
    });
    expect(alertResponse.status).toBe(201);

    const detailResponse = await request(context.app)
      .get(`/alerts/${alertResponse.body.id}`)
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
              AND entity_type = 'alert'
              AND artifact_kind = 'alert_brief'
          `,
        )
        .get(workspace.id)?.count ?? 0;

    expect(artifactCount).toBe(0);
  });

  it('creates a deterministic alert ai brief on first detail request', async () => {
    context = await createTestApp();

    const { cookieHeader, response, workspace } = await signupAndAuthenticate(context.app);
    expect(response.status).toBe(201);

    const siteResponse = await createSite(context.app, cookieHeader, 'Alert Client');
    expect(siteResponse.status).toBe(201);

    const alertResponse = await createAlert(context.app, cookieHeader, {
      type: 'frustration',
      severity: 'critical',
      title: 'Rage click detected',
      description: 'A visitor clicked the main CTA repeatedly in two seconds.',
      siteId: siteResponse.body.id,
      affectedSessions: 5,
    });
    expect(alertResponse.status).toBe(201);

    const detailResponse = await request(context.app)
      .get(`/alerts/${alertResponse.body.id}`)
      .set('Cookie', cookieHeader);

    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.ai).toMatchObject({
      period: 'current',
      mode: 'deterministic',
      state: 'active',
      headline: 'Rage click detected needs immediate review.',
    });
    expect(detailResponse.body.ai.whyFired).toContain('repeated clicks');
    expect(detailResponse.body.ai.recommendations).toEqual(expect.any(Array));

    const artifactRow = context.db
      .prepare<
        [string],
        { artifact_kind: string; generator_type: string; status: string; site_id: string | null }
      >(
        `
          SELECT artifact_kind, generator_type, status, site_id
          FROM ai_artifacts
          WHERE workspace_id = ?
            AND entity_type = 'alert'
            AND artifact_kind = 'alert_brief'
        `,
      )
      .get(workspace.id);

    expect(artifactRow).toMatchObject({
      artifact_kind: 'alert_brief',
      generator_type: 'deterministic',
      status: 'ready',
      site_id: siteResponse.body.id,
    });
  });

  it('reuses the cached alert artifact when the input is unchanged', async () => {
    context = await createTestApp();

    const { cookieHeader, response, workspace } = await signupAndAuthenticate(context.app);
    expect(response.status).toBe(201);

    const alertResponse = await createAlert(context.app, cookieHeader, {
      type: 'performance',
      severity: 'high',
      title: 'Slow page load detected',
      description: 'Recent signals suggest slower-than-expected rendering.',
      affectedSessions: 7,
    });
    expect(alertResponse.status).toBe(201);

    const firstResponse = await request(context.app)
      .get(`/alerts/${alertResponse.body.id}`)
      .set('Cookie', cookieHeader);
    const secondResponse = await request(context.app)
      .get(`/alerts/${alertResponse.body.id}`)
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
              AND entity_type = 'alert'
              AND artifact_kind = 'alert_brief'
          `,
        )
        .get(workspace.id)?.count ?? 0;

    expect(artifactCount).toBe(1);
  });

  it('recomputes the cached alert artifact after the alert is resolved', async () => {
    context = await createTestApp();

    const { cookieHeader, response, workspace } = await signupAndAuthenticate(context.app);
    expect(response.status).toBe(201);

    const alertResponse = await createAlert(context.app, cookieHeader, {
      type: 'conversion',
      severity: 'high',
      title: 'High bounce rate',
      description: 'Visitors are leaving before meaningful engagement.',
      affectedSessions: 11,
    });
    expect(alertResponse.status).toBe(201);

    const firstResponse = await request(context.app)
      .get(`/alerts/${alertResponse.body.id}`)
      .set('Cookie', cookieHeader);

    expect(firstResponse.status).toBe(200);
    expect(firstResponse.body.ai?.state).toBe('active');

    const beforeArtifact = context.db
      .prepare<
        [string],
        { input_hash: string; output_json: string }
      >(
        `
          SELECT input_hash, output_json
          FROM ai_artifacts
          WHERE workspace_id = ?
            AND entity_type = 'alert'
            AND artifact_kind = 'alert_brief'
        `,
      )
      .get(workspace.id);

    expect(beforeArtifact).toBeTruthy();

    const resolveResponse = await request(context.app)
      .patch(`/alerts/${alertResponse.body.id}/resolve`)
      .set('Cookie', cookieHeader);

    expect(resolveResponse.status).toBe(200);
    expect(resolveResponse.body).toEqual({ ok: true });

    const secondResponse = await request(context.app)
      .get(`/alerts/${alertResponse.body.id}`)
      .set('Cookie', cookieHeader);

    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body.ai?.state).toBe('resolved');
    expect(secondResponse.body.ai?.headline).toBe('High bounce rate has been resolved.');

    const afterArtifact = context.db
      .prepare<
        [string],
        { input_hash: string; output_json: string }
      >(
        `
          SELECT input_hash, output_json
          FROM ai_artifacts
          WHERE workspace_id = ?
            AND entity_type = 'alert'
            AND artifact_kind = 'alert_brief'
        `,
      )
      .get(workspace.id);

    expect(afterArtifact?.input_hash).not.toBe(beforeArtifact?.input_hash);
    expect(afterArtifact?.output_json).not.toBe(beforeArtifact?.output_json);
  });

  it('keeps GET /alerts on the list-item shape without inline ai', async () => {
    context = await createTestApp();

    const { cookieHeader, response } = await signupAndAuthenticate(context.app);
    expect(response.status).toBe(201);

    const alertResponse = await createAlert(context.app, cookieHeader, {
      type: 'performance',
      severity: 'high',
      title: 'Slow page load detected',
      description: 'Recent signals suggest slower-than-expected rendering.',
      affectedSessions: 7,
    });
    expect(alertResponse.status).toBe(201);

    const listResponse = await request(context.app)
      .get('/alerts')
      .set('Cookie', cookieHeader);

    expect(listResponse.status).toBe(200);
    expect(Array.isArray(listResponse.body)).toBe(true);
    expect(listResponse.body[0].id).toBe(alertResponse.body.id);
    expect(listResponse.body[0].ai).toBeUndefined();
  });

  it('maps known alert titles to type-specific why-fired explanations', async () => {
    context = await createTestApp();

    const { cookieHeader, response } = await signupAndAuthenticate(context.app);
    expect(response.status).toBe(201);

    const frustrationResponse = await createAlert(context.app, cookieHeader, {
      type: 'frustration',
      severity: 'medium',
      title: 'Rage click detected',
      description: 'Visitors repeated the same interaction.',
      affectedSessions: 2,
    });
    const performanceResponse = await createAlert(context.app, cookieHeader, {
      type: 'performance',
      severity: 'high',
      title: 'Slow page load detected',
      description: 'LCP behavior is degrading the first impression.',
      affectedSessions: 4,
    });
    const conversionResponse = await createAlert(context.app, cookieHeader, {
      type: 'conversion',
      severity: 'medium',
      title: 'High bounce rate',
      description: 'Visitors are leaving without engaging.',
      affectedSessions: 9,
    });

    expect(frustrationResponse.status).toBe(201);
    expect(performanceResponse.status).toBe(201);
    expect(conversionResponse.status).toBe(201);

    const [frustrationDetail, performanceDetail, conversionDetail] = await Promise.all([
      request(context.app).get(`/alerts/${frustrationResponse.body.id}`).set('Cookie', cookieHeader),
      request(context.app).get(`/alerts/${performanceResponse.body.id}`).set('Cookie', cookieHeader),
      request(context.app).get(`/alerts/${conversionResponse.body.id}`).set('Cookie', cookieHeader),
    ]);

    expect(frustrationDetail.body.ai?.whyFired).toContain('repeated clicks');
    expect(performanceDetail.body.ai?.whyFired).toContain('slower-than-expected load');
    expect(conversionDetail.body.ai?.whyFired).toContain('leaving quickly');
  });

  it('preserves the existing 404 response for unknown alerts', async () => {
    context = await createTestApp();

    const { cookieHeader, response } = await signupAndAuthenticate(context.app);
    expect(response.status).toBe(201);

    const detailResponse = await request(context.app)
      .get('/alerts/alert_does_not_exist')
      .set('Cookie', cookieHeader);

    expect(detailResponse.status).toBe(404);
    expect(detailResponse.body).toEqual({ error: 'Alert not found' });
  });
});
