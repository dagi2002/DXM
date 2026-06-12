import { afterEach, describe, expect, it } from 'vitest';
import { signupAndAuthenticate } from '../helpers/auth.js';
import { createTestApp, type ApiTestContext } from '../helpers/testApp.js';

describe('GET /sessions/:id/summary', () => {
  let context: ApiTestContext | null = null;

  afterEach(async () => {
    await context?.cleanup();
    context = null;
  });

  const seedSession = async () => {
    context = await createTestApp({ env: { ANTHROPIC_API_KEY: undefined } });
    const { agent, workspace } = await signupAndAuthenticate(context.app);
    const site = await agent.post('/sites').send({ name: 'Recap', domain: 'https://r.example' });

    context.db.prepare(`
      INSERT INTO sessions (id, site_id, workspace_id, entry_url, device, browser, duration, bounced)
      VALUES ('sess_sum_1', ?, ?, 'https://r.example/', 'desktop', 'Chrome', 42, 0)
    `).run(site.body.id, workspace!.id as string);
    context.db.prepare(`
      INSERT INTO events (session_id, type, ts, url) VALUES ('sess_sum_1', 'pageview', ?, 'https://r.example/')
    `).run(Date.now());

    return { agent };
  };

  it('returns a deterministic recap when no LLM key is configured', async () => {
    const { agent } = await seedSession();

    const response = await agent.get('/sessions/sess_sum_1/summary');

    expect(response.status).toBe(200);
    expect(response.body.sessionId).toBe('sess_sum_1');
    expect(response.body.mode).not.toBe('llm');
    expect(typeof response.body.headline).toBe('string');
    expect(response.body.headline.length).toBeGreaterThan(0);
    expect(typeof response.body.narrative).toBe('string');
    expect(Array.isArray(response.body.frictionMoments)).toBe(true);
    expect(Array.isArray(response.body.opportunities)).toBe(true);
  });

  it('404s for unknown sessions and sessions in other workspaces', async () => {
    const { agent } = await seedSession();

    const unknown = await agent.get('/sessions/sess_nope/summary');
    expect(unknown.status).toBe(404);

    const { agent: stranger } = await signupAndAuthenticate(context!.app);
    const foreign = await stranger.get('/sessions/sess_sum_1/summary');
    expect(foreign.status).toBe(404);
  });
});
