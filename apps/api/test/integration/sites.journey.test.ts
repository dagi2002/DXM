import { afterEach, describe, expect, it } from 'vitest';
import { signupAndAuthenticate } from '../helpers/auth.js';
import { createTestApp, type ApiTestContext } from '../helpers/testApp.js';

describe('GET /sites/:id/journey', () => {
  let context: ApiTestContext | null = null;

  afterEach(async () => {
    await context?.cleanup();
    context = null;
  });

  const seedSessionPath = (
    db: ApiTestContext['db'],
    siteId: string,
    workspaceId: string,
    sessionId: string,
    urls: string[],
  ) => {
    db.prepare(`
      INSERT INTO sessions (id, site_id, workspace_id, entry_url, device, browser)
      VALUES (?, ?, ?, ?, 'desktop', 'Chrome')
    `).run(sessionId, siteId, workspaceId, urls[0]);

    const insert = db.prepare(`
      INSERT INTO events (session_id, type, ts, url)
      VALUES (?, 'pageview', ?, ?)
    `);
    urls.forEach((url, i) => insert.run(sessionId, Date.now() + i * 1000, url));
  };

  it('returns top paths ordered by frequency with normalized URLs', async () => {
    context = await createTestApp();
    const { agent, workspace } = await signupAndAuthenticate(context.app);
    const site = await agent.post('/sites').send({ name: 'Journey', domain: 'https://a.example' });
    const wsId = workspace!.id as string;

    // 2 sessions take home → pricing, 1 takes home → docs.
    seedSessionPath(context.db, site.body.id, wsId, 'j1', ['https://a.example/', 'https://a.example/pricing?utm=x']);
    seedSessionPath(context.db, site.body.id, wsId, 'j2', ['https://a.example/', 'https://a.example/pricing']);
    seedSessionPath(context.db, site.body.id, wsId, 'j3', ['https://a.example/', 'https://a.example/docs#install']);

    const response = await agent.get(`/sites/${site.body.id}/journey?range=7d`);
    expect(response.status).toBe(200);
    expect(response.body.totalSessions).toBe(3);

    const [top, second] = response.body.paths;
    expect(top.sessionCount).toBe(2);
    expect(top.steps.map((s: { url: string }) => s.url)).toEqual(['/', '/pricing']); // query stripped
    expect(second.sessionCount).toBe(1);
    expect(second.steps.map((s: { url: string }) => s.url)).toEqual(['/', '/docs']); // hash stripped
  });

  it('rejects invalid range and scopes to the workspace', async () => {
    context = await createTestApp();
    const { agent } = await signupAndAuthenticate(context.app);
    const site = await agent.post('/sites').send({ name: 'Own', domain: 'https://a.example' });

    const badRange = await agent.get(`/sites/${site.body.id}/journey?range=1y`);
    expect(badRange.status).toBe(400);

    const { agent: stranger } = await signupAndAuthenticate(context.app);
    const foreign = await stranger.get(`/sites/${site.body.id}/journey`);
    expect(foreign.status).toBe(404);
  });
});
