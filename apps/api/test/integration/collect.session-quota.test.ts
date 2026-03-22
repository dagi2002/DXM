import { afterEach, describe, expect, it } from 'vitest';
import { signupAndAuthenticate } from '../helpers/auth.js';
import { setWorkspacePlan } from '../helpers/billing.js';
import { createTestApp, type ApiTestContext } from '../helpers/testApp.js';

describe('collect session quota', () => {
  let context: ApiTestContext | null = null;

  afterEach(async () => {
    await context?.cleanup();
    context = null;
  });

  const makeCollectPayload = (sessionId: string, siteKey: string) => ({
    sessionId,
    siteId: siteKey,
    events: [{ type: 'pageview' as const, ts: Date.now(), url: 'https://example.et/' }],
    metadata: {
      url: 'https://example.et/',
      userAgent: 'Mozilla/5.0',
      language: 'en-US',
      screen: { width: 1280, height: 720 },
    },
  });

  const setupWorkspaceWithSite = async (ctx: ApiTestContext) => {
    const { agent, workspace } = await signupAndAuthenticate(ctx.app);
    const siteRes = await agent.post('/sites').send({ name: 'Quota Test', domain: 'quota.example.et' });
    expect(siteRes.status).toBe(201);
    return {
      agent,
      workspaceId: workspace!.id,
      siteId: siteRes.body.id as string,
      siteKey: siteRes.body.siteKey as string,
    };
  };

  const seedSessions = (ctx: ApiTestContext, count: number, siteId: string, workspaceId: string) => {
    const insert = ctx.db.prepare(
      `INSERT INTO sessions (id, site_id, workspace_id, started_at, completed) VALUES (?, ?, ?, datetime('now'), 0)`,
    );
    ctx.db.transaction(() => {
      for (let i = 0; i < count; i++) {
        insert.run(`sess_quota_${i}`, siteId, workspaceId);
      }
    })();
  };

  const getSessionLimit = async (): Promise<number> => {
    // Dynamic import to get the limit from billing after env is set up by createTestApp
    const { getWorkspaceSessionLimit } = await import('../../src/lib/billing.js');
    return getWorkspaceSessionLimit('free');
  };

  it('allows first session on free plan (under quota)', async () => {
    context = await createTestApp();
    const { agent, siteKey } = await setupWorkspaceWithSite(context);

    const res = await agent.post('/collect').send(makeCollectPayload('sess_first_001', siteKey));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('blocks new session when at quota limit with 403', async () => {
    context = await createTestApp();
    const limit = await getSessionLimit();
    const { agent, siteId, siteKey, workspaceId } = await setupWorkspaceWithSite(context);

    seedSessions(context, limit, siteId, workspaceId);

    const res = await agent.post('/collect').send(makeCollectPayload('sess_over_quota', siteKey));

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      code: 'session_quota_exceeded',
      plan: 'free',
      limit,
    });
  });

  it('allows continuation batch for existing session even at quota', async () => {
    context = await createTestApp();
    const limit = await getSessionLimit();
    const { agent, siteId, siteKey, workspaceId } = await setupWorkspaceWithSite(context);

    // Seed limit-1 sessions, then add one with known id
    seedSessions(context, limit - 1, siteId, workspaceId);
    context.db.prepare(
      `INSERT INTO sessions (id, site_id, workspace_id, started_at, completed) VALUES (?, ?, ?, datetime('now'), 0)`,
    ).run('sess_existing', siteId, workspaceId);

    // Now at exactly `limit` sessions. New session would be blocked, but existing passes.
    const res = await agent.post('/collect').send(makeCollectPayload('sess_existing', siteKey));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('allows new session after plan upgrade increases limit', async () => {
    context = await createTestApp();
    const limit = await getSessionLimit();
    const { agent, siteId, siteKey, workspaceId } = await setupWorkspaceWithSite(context);

    seedSessions(context, limit, siteId, workspaceId);

    // Verify blocked on free
    const blocked = await agent.post('/collect').send(makeCollectPayload('sess_pre_upgrade', siteKey));
    expect(blocked.status).toBe(403);

    // Upgrade to starter
    setWorkspacePlan(context.db, workspaceId, 'starter');

    const res = await agent.post('/collect').send(makeCollectPayload('sess_post_upgrade', siteKey));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
