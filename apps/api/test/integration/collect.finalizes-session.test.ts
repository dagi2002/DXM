import { afterEach, describe, expect, it } from 'vitest';
import { signupAndAuthenticate } from '../helpers/auth.js';
import { createTestApp, type ApiTestContext } from '../helpers/testApp.js';

interface SessionRow {
  id: string;
  site_id: string;
  workspace_id: string;
  ended_at: string | null;
  duration: number | null;
  clicks: number;
  scroll_depth: number;
  total_events: number;
  bounced: number;
  converted: number;
  completed: number;
}

describe('collect finalizes session', () => {
  let context: ApiTestContext | null = null;

  afterEach(async () => {
    await context?.cleanup();
    context = null;
  });

  it('finalizes session KPIs and exposes them through session read models', async () => {
    context = await createTestApp();

    const { agent, workspace, response: signupResponse } = await signupAndAuthenticate(context.app);
    expect(signupResponse.status).toBe(201);

    const siteResponse = await agent.post('/sites').send({
      name: 'DXM Checkout Test',
      domain: 'https://checkout.example/',
    });

    expect(siteResponse.status).toBe(201);

    const siteId = siteResponse.body.id as string;
    const siteKey = siteResponse.body.siteKey as string;
    const sessionId = 'sess_finalize_001';
    const startedAt = Date.now();

    const collectResponse = await agent.post('/collect').send({
      sessionId,
      siteId: siteKey,
      completed: true,
      events: [
        { type: 'pageview', ts: startedAt, url: 'https://checkout.example/' },
        { type: 'navigation', ts: startedAt + 1000, url: 'https://checkout.example/pricing' },
        { type: 'click', ts: startedAt + 2000, x: 120, y: 260, target: 'button.checkout', url: 'https://checkout.example/pricing' },
        { type: 'scroll', ts: startedAt + 3000, depth: 88, url: 'https://checkout.example/pricing' },
        { type: 'custom', ts: startedAt + 4000, event: 'lead_submitted', url: 'https://checkout.example/thank-you' },
      ],
      metadata: {
        url: 'https://checkout.example/',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
        language: 'en-US',
        screen: { width: 1440, height: 900 },
      },
    });

    expect(collectResponse.status).toBe(200);
    expect(collectResponse.body).toEqual({ ok: true });

    const sessionRow = context.db
      .prepare<[string], SessionRow>(`
        SELECT id, site_id, workspace_id, ended_at, duration, clicks, scroll_depth, total_events, bounced, converted, completed
        FROM sessions
        WHERE id = ?
      `)
      .get(sessionId);

    expect(sessionRow).toMatchObject({
      id: sessionId,
      site_id: siteId,
      workspace_id: workspace?.id,
      clicks: 1,
      scroll_depth: 88,
      total_events: 5,
      bounced: 0,
      converted: 1,
      completed: 1,
    });
    expect(sessionRow?.ended_at).toBeTruthy();
    expect(sessionRow?.duration).toBeGreaterThan(0);

    const sessionsResponse = await agent.get('/sessions');
    expect(sessionsResponse.status).toBe(200);
    expect(sessionsResponse.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: sessionId,
          completed: true,
          hasReplay: false,
          siteDomain: 'checkout.example',
          stats: expect.objectContaining({
            clicks: 1,
            scrollDepth: 88,
            totalEvents: 5,
            bounced: false,
            converted: true,
          }),
        }),
      ]),
    );

    const detailResponse = await agent.get(`/sessions/${sessionId}`);
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body).toMatchObject({
      id: sessionId,
      completed: true,
      stats: {
        clicks: 1,
        scrollDepth: 88,
        totalEvents: 5,
        bounced: false,
        converted: true,
      },
    });
    expect(detailResponse.body.events).toHaveLength(5);
    expect(detailResponse.body.events.map((event: { type: string }) => event.type)).toEqual([
      'pageview',
      'navigation',
      'click',
      'scroll',
      'custom',
    ]);
  });
});
