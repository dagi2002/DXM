import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { signupAndAuthenticate } from '../helpers/auth.js';
import { createTestApp, type ApiTestContext } from '../helpers/testApp.js';

describe('heatmap read model', () => {
  let context: ApiTestContext | null = null;

  afterEach(async () => {
    await context?.cleanup();
    context = null;
  });

  it('returns only click and scroll points for the authenticated workspace', async () => {
    context = await createTestApp();

    const workspaceA = await signupAndAuthenticate(context.app, {
      email: 'heatmap-a@example.com',
      workspaceName: 'Heatmap Workspace A',
    });
    const workspaceB = await signupAndAuthenticate(context.app, {
      email: 'heatmap-b@example.com',
      workspaceName: 'Heatmap Workspace B',
    });

    expect(workspaceA.response.status).toBe(201);
    expect(workspaceB.response.status).toBe(201);

    const siteAResponse = await workspaceA.agent.post('/sites').send({
      name: 'Workspace A Site',
      domain: 'https://workspace-a.example/',
    });
    const siteBResponse = await workspaceB.agent.post('/sites').send({
      name: 'Workspace B Site',
      domain: 'https://workspace-b.example/',
    });

    expect(siteAResponse.status).toBe(201);
    expect(siteBResponse.status).toBe(201);

    const sessionA = 'sess_heatmap_a_001';
    const sessionB = 'sess_heatmap_b_001';
    const startedAt = Date.now();

    const ingestA = await request(context.app).post('/collect').send({
      sessionId: sessionA,
      siteId: siteAResponse.body.siteKey,
      completed: true,
      events: [
        { type: 'pageview', ts: startedAt, url: 'https://workspace-a.example/' },
        { type: 'click', ts: startedAt + 1000, x: 120, y: 240, target: 'button.primary', url: 'https://workspace-a.example/' },
        { type: 'scroll', ts: startedAt + 2000, depth: 75, url: 'https://workspace-a.example/' },
      ],
      metadata: {
        url: 'https://workspace-a.example/',
        userAgent: 'Mozilla/5.0',
        language: 'en-US',
        screen: { width: 1440, height: 900 },
      },
    });

    const ingestB = await request(context.app).post('/collect').send({
      sessionId: sessionB,
      siteId: siteBResponse.body.siteKey,
      completed: true,
      events: [
        { type: 'pageview', ts: startedAt + 3000, url: 'https://workspace-b.example/' },
        { type: 'click', ts: startedAt + 4000, x: 33, y: 66, target: 'button.secondary', url: 'https://workspace-b.example/' },
        { type: 'scroll', ts: startedAt + 5000, depth: 45, url: 'https://workspace-b.example/' },
      ],
      metadata: {
        url: 'https://workspace-b.example/',
        userAgent: 'Mozilla/5.0',
        language: 'en-US',
        screen: { width: 1280, height: 800 },
      },
    });

    expect(ingestA.status).toBe(200);
    expect(ingestB.status).toBe(200);

    const heatmapResponse = await workspaceA.agent.get('/analytics/heatmap');

    expect(heatmapResponse.status).toBe(200);
    expect(heatmapResponse.body.sessions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: sessionA,
          siteDomain: 'workspace-a.example',
        }),
      ]),
    );
    expect(heatmapResponse.body.sessions.map((session: { id: string }) => session.id)).toContain(sessionA);
    expect(heatmapResponse.body.sessions.map((session: { id: string }) => session.id)).not.toContain(sessionB);

    expect(heatmapResponse.body.points).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'click',
          sessionId: sessionA,
          url: 'https://workspace-a.example/',
          x: 120,
          y: 240,
          target: 'button.primary',
          weight: 1,
        }),
        expect.objectContaining({
          type: 'scroll',
          sessionId: sessionA,
          url: 'https://workspace-a.example/',
          depth: 75,
          weight: 1,
        }),
      ]),
    );
    expect(heatmapResponse.body.points.every((point: { type: string }) => point.type === 'click' || point.type === 'scroll')).toBe(true);
    expect(heatmapResponse.body.points.every((point: { sessionId: string }) => point.sessionId === sessionA)).toBe(true);
  });
});
