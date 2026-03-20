import { afterEach, describe, expect, it } from 'vitest';
import { signupAndAuthenticate } from '../helpers/auth.js';
import { createTestApp, type ApiTestContext } from '../helpers/testApp.js';

describe('collect telemetry limiter', () => {
  let context: ApiTestContext | null = null;

  afterEach(async () => {
    await context?.cleanup();
    context = null;
  });

  it('uses the collect-specific limiter instead of the general API limiter', async () => {
    context = await createTestApp();

    const { agent, response: signupResponse } = await signupAndAuthenticate(context.app);
    expect(signupResponse.status).toBe(201);

    const siteResponse = await agent.post('/sites').send({
      name: 'Limiter Site',
      domain: 'https://limiter.example/',
    });

    expect(siteResponse.status).toBe(201);

    const siteKey = siteResponse.body.siteKey as string;
    const startedAt = Date.now();

    for (let index = 0; index < 105; index += 1) {
      const collectResponse = await agent.post('/collect').send({
        sessionId: `sess_limiter_${index}`,
        siteId: siteKey,
        completed: true,
        events: [
          {
            type: 'pageview',
            ts: startedAt + index,
            url: 'https://limiter.example/',
          },
        ],
        metadata: {
          url: 'https://limiter.example/',
          userAgent: 'Mozilla/5.0',
          language: 'en-US',
          screen: { width: 1280, height: 720 },
        },
      });

      expect(collectResponse.status).toBe(200);
      expect(collectResponse.body).toEqual({ ok: true });
    }
  });
});
