import { afterEach, describe, expect, it } from 'vitest';
import { signupAndAuthenticate } from '../helpers/auth.js';
import { setWorkspacePlan } from '../helpers/billing.js';
import { createTestApp, type ApiTestContext } from '../helpers/testApp.js';

describe('overview grouped rollups', () => {
  let context: ApiTestContext | null = null;

  afterEach(async () => {
    await context?.cleanup();
    context = null;
  });

  it('returns the same workspace overview shape using grouped site rollups', async () => {
    context = await createTestApp();

    const { agent, response: signupResponse } = await signupAndAuthenticate(context.app);
    expect(signupResponse.status).toBe(201);
    setWorkspacePlan(context.db, signupResponse.body.workspace.id, 'starter');

    const firstSiteResponse = await agent.post('/sites').send({
      name: 'First Client',
      domain: 'https://first.example/',
    });
    const secondSiteResponse = await agent.post('/sites').send({
      name: 'Second Client',
      domain: 'https://second.example/',
    });

    expect(firstSiteResponse.status).toBe(201);
    expect(secondSiteResponse.status).toBe(201);

    const collectResponse = await agent.post('/collect').send({
      sessionId: 'sess_overview_001',
      siteId: firstSiteResponse.body.siteKey,
      completed: true,
      events: [
        { type: 'pageview', ts: Date.now(), url: 'https://first.example/' },
        { type: 'click', ts: Date.now() + 1000, x: 10, y: 20, target: 'button.hero', url: 'https://first.example/' },
      ],
      metadata: {
        url: 'https://first.example/',
        userAgent: 'Mozilla/5.0',
        language: 'en-US',
        screen: { width: 1440, height: 900 },
      },
    });

    expect(collectResponse.status).toBe(200);

    const overviewResponse = await agent.get('/overview');
    expect(overviewResponse.status).toBe(200);
    expect(overviewResponse.body.summary).toMatchObject({
      totalClients: 2,
      liveClients: 1,
      sessions7d: 1,
    });
    expect(overviewResponse.body.siteRollups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: firstSiteResponse.body.id,
          verified: true,
          trackingStatus: 'live',
          sessionCount7d: 1,
        }),
        expect.objectContaining({
          id: secondSiteResponse.body.id,
          verified: false,
          trackingStatus: 'install',
          sessionCount7d: 0,
        }),
      ]),
    );
  });
});
