import { afterEach, describe, expect, it } from 'vitest';
import { signupAndAuthenticate } from '../helpers/auth.js';
import { createTestApp, type ApiTestContext } from '../helpers/testApp.js';

describe('onboarding site compatibility routes', () => {
  let context: ApiTestContext | null = null;

  afterEach(async () => {
    await context?.cleanup();
    context = null;
    delete process.env.API_PUBLIC_URL;
  });

  it('keeps /onboarding/sites as a thin compatibility alias over /sites', async () => {
    process.env.API_PUBLIC_URL = '  https://app.dxmpulse.et/api/  ';
    context = await createTestApp();

    const { agent, response: signupResponse } = await signupAndAuthenticate(context.app);
    expect(signupResponse.status).toBe(201);

    const createResponse = await agent.post('/onboarding/sites').send({
      name: 'Compatibility Site',
      domain: 'https://compatibility.example/',
    });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body).toMatchObject({
      id: expect.stringMatching(/^site_/),
      name: 'Compatibility Site',
      domain: 'compatibility.example',
      verified: false,
      siteKey: expect.any(String),
      snippet: expect.any(String),
    });
    expect(createResponse.body.snippet).toContain('data-api-url="https://app.dxmpulse.et/api"');

    const siteId = createResponse.body.id as string;
    const siteKey = createResponse.body.siteKey as string;

    const listResponse = await agent.get('/onboarding/sites');
    expect(listResponse.status).toBe(200);
    expect(listResponse.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: siteId,
          name: 'Compatibility Site',
          domain: 'compatibility.example',
        }),
      ]),
    );

    const verifyBeforeCollect = await agent.get(`/onboarding/sites/${siteId}/verify`);
    expect(verifyBeforeCollect.status).toBe(200);
    expect(verifyBeforeCollect.body).toMatchObject({
      verified: false,
      sessionCount: 0,
    });

    const collectResponse = await agent.post('/collect').send({
      sessionId: 'sess_onboarding_compat_001',
      siteId: siteKey,
      completed: true,
      events: [{ type: 'pageview', ts: Date.now(), url: 'https://compatibility.example/' }],
      metadata: {
        url: 'https://compatibility.example/',
        userAgent: 'Mozilla/5.0',
        language: 'en-US',
        screen: { width: 1280, height: 720 },
      },
    });

    expect(collectResponse.status).toBe(200);

    const verifyAfterCollect = await agent.get(`/onboarding/sites/${siteId}/verify`);
    expect(verifyAfterCollect.status).toBe(200);
    expect(verifyAfterCollect.body).toMatchObject({
      verified: true,
      sessionCount: 1,
    });
  });
});
