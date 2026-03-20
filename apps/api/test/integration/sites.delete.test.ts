import { afterEach, describe, expect, it } from 'vitest';
import { signupAndAuthenticate } from '../helpers/auth.js';
import { createTestApp, type ApiTestContext } from '../helpers/testApp.js';

describe('sites delete flow', () => {
  let context: ApiTestContext | null = null;

  afterEach(async () => {
    await context?.cleanup();
    context = null;
  });

  it('deletes a clean site when no blockers exist', async () => {
    context = await createTestApp();

    const { agent, workspace, response: signupResponse } = await signupAndAuthenticate(context.app);
    expect(signupResponse.status).toBe(201);
    expect(workspace?.id).toBeTruthy();

    const createResponse = await agent.post('/sites').send({
      name: 'Delete Ready Site',
      domain: 'https://delete-ready.example/',
    });

    expect(createResponse.status).toBe(201);

    const siteId = createResponse.body.id as string;

    const deleteResponse = await agent.delete(`/sites/${siteId}`);
    expect(deleteResponse.status).toBe(204);
    expect(deleteResponse.text).toBe('');

    const listResponse = await agent.get('/sites');
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.find((site: { id: string }) => site.id === siteId)).toBeUndefined();

    const detailResponse = await agent.get(`/sites/${siteId}`);
    expect(detailResponse.status).toBe(404);
  });

  it('blocks deletion when dependent site data exists and returns blocker counts', async () => {
    context = await createTestApp();

    const { agent, workspace, response: signupResponse } = await signupAndAuthenticate(context.app);
    expect(signupResponse.status).toBe(201);
    expect(workspace?.id).toBeTruthy();

    const createResponse = await agent.post('/sites').send({
      name: 'Blocked Delete Site',
      domain: 'https://blocked-delete.example/',
    });

    expect(createResponse.status).toBe(201);

    const siteId = createResponse.body.id as string;
    const siteKey = createResponse.body.siteKey as string;
    const sessionId = 'sess_delete_blocked_001';
    const startedAt = Date.now();

    const collectResponse = await agent.post('/collect').send({
      sessionId,
      siteId: siteKey,
      completed: true,
      events: [{ type: 'pageview', ts: startedAt, url: 'https://blocked-delete.example/' }],
      metadata: {
        url: 'https://blocked-delete.example/',
        userAgent: 'Mozilla/5.0',
        language: 'en-US',
        screen: { width: 1280, height: 720 },
      },
    });

    expect(collectResponse.status).toBe(200);

    const replayResponse = await agent.post('/collect-replay/replay').send({
      sessionId,
      siteId: siteKey,
      replayEvents: [{ type: 2, timestamp: startedAt, data: { href: 'https://blocked-delete.example/' } }],
      chunkIndex: 0,
    });

    expect(replayResponse.status).toBe(200);

    context.db
      .prepare(
        `
          INSERT INTO alerts (id, workspace_id, site_id, type, severity, title, description)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
      )
      .run('alert_delete_blocked_001', workspace!.id, siteId, 'performance', 'high', 'Blocked delete alert', 'Alert linked to site');

    context.db
      .prepare(
        `
          INSERT INTO funnels (id, workspace_id, site_id, name, steps_json)
          VALUES (?, ?, ?, ?, ?)
        `,
      )
      .run(
        'funnel_delete_blocked_001',
        workspace!.id,
        siteId,
        'Blocked delete funnel',
        JSON.stringify([{ name: 'Landing', urlPattern: '/' }]),
      );

    const deleteResponse = await agent.delete(`/sites/${siteId}`);
    expect(deleteResponse.status).toBe(409);
    expect(deleteResponse.body).toEqual({
      error: 'Client site cannot be deleted because dependent data exists.',
      blockers: {
        sessions: 1,
        replays: 1,
        alerts: 1,
        funnels: 1,
      },
    });

    const detailResponse = await agent.get(`/sites/${siteId}`);
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.id).toBe(siteId);
  });
});
