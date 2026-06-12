import { afterEach, describe, expect, it } from 'vitest';
import { signupAndAuthenticate } from '../helpers/auth.js';
import { createTestApp, type ApiTestContext } from '../helpers/testApp.js';

describe('GET /sites/:id/vitals', () => {
  let context: ApiTestContext | null = null;

  afterEach(async () => {
    await context?.cleanup();
    context = null;
  });

  const seedVitals = (
    db: ApiTestContext['db'],
    siteId: string,
    workspaceId: string,
    values: number[],
    device = 'desktop',
  ) => {
    db.prepare(`
      INSERT INTO sessions (id, site_id, workspace_id, entry_url, device, browser)
      VALUES (?, ?, ?, 'https://a.example/', ?, 'Chrome')
    `).run(`sess_vitals_${device}`, siteId, workspaceId, device);

    const insert = db.prepare(`
      INSERT INTO events (session_id, type, ts, value_text)
      VALUES (?, 'vital', ?, ?)
    `);
    values.forEach((v, i) => insert.run(`sess_vitals_${device}`, Date.now() + i, `LCP:${v}`));
  };

  it('computes percentiles from a known distribution', async () => {
    context = await createTestApp();
    const { agent, workspace } = await signupAndAuthenticate(context.app);
    const site = await agent.post('/sites').send({ name: 'Vitals', domain: 'https://a.example' });
    expect(site.status).toBe(201);

    // 20 LCP samples: 100, 200, …, 2000.
    const values = Array.from({ length: 20 }, (_, i) => (i + 1) * 100);
    seedVitals(context.db, site.body.id, workspace!.id as string, values);

    const response = await agent.get(`/sites/${site.body.id}/vitals?range=7d`);
    expect(response.status).toBe(200);

    const lcp = response.body.metrics.find((m: { name: string }) => m.name === 'LCP');
    expect(lcp.sampleSize).toBe(20);
    // pickPercentile uses floor((n-1)*pct): p50→idx 9 (1000), p75→idx 14 (1500), p95→idx 18 (1900).
    expect(lcp.p50).toBe(1000);
    expect(lcp.p75).toBe(1500);
    expect(lcp.p95).toBe(1900);
    expect(lcp.status).toBe('good'); // p75 1500 ≤ 2500

    const inp = response.body.metrics.find((m: { name: string }) => m.name === 'INP');
    expect(inp.sampleSize).toBe(0);
    expect(inp.status).toBe('insufficient-data');
  });

  it('filters by device', async () => {
    context = await createTestApp();
    const { agent, workspace } = await signupAndAuthenticate(context.app);
    const site = await agent.post('/sites').send({ name: 'Devices', domain: 'https://a.example' });

    seedVitals(context.db, site.body.id, workspace!.id as string, [1000, 1000], 'desktop');
    seedVitals(context.db, site.body.id, workspace!.id as string, [5000, 5000], 'mobile');

    const mobile = await agent.get(`/sites/${site.body.id}/vitals?device=mobile`);
    const lcp = mobile.body.metrics.find((m: { name: string }) => m.name === 'LCP');
    expect(lcp.sampleSize).toBe(2);
    expect(lcp.p75).toBe(5000);
    expect(lcp.status).toBe('poor');
  });

  it('rejects invalid query params and unknown or foreign sites', async () => {
    context = await createTestApp();
    const { agent } = await signupAndAuthenticate(context.app);
    const site = await agent.post('/sites').send({ name: 'Own', domain: 'https://a.example' });

    const badRange = await agent.get(`/sites/${site.body.id}/vitals?range=90d`);
    expect(badRange.status).toBe(400);

    const unknown = await agent.get('/sites/site_does_not_exist/vitals');
    expect(unknown.status).toBe(404);

    // Another workspace's site looks like 404, not 403 — no existence leak.
    const { agent: stranger } = await signupAndAuthenticate(context.app);
    const foreign = await stranger.get(`/sites/${site.body.id}/vitals`);
    expect(foreign.status).toBe(404);
  });
});
