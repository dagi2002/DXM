import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestApp, type ApiTestContext } from '../helpers/testApp.js';

describe('collect unknown site key', () => {
  let context: ApiTestContext | null = null;

  afterEach(async () => {
    await context?.cleanup();
    context = null;
  });

  it('returns 404 for collect payloads with an unknown site key', async () => {
    context = await createTestApp();

    const response = await request(context.app).post('/collect').send({
      sessionId: 'sess_unknown_site_key_001',
      siteId: 'missing-site-key',
      completed: true,
      events: [
        { type: 'pageview', ts: Date.now(), url: 'https://unknown.example/' },
      ],
      metadata: {
        url: 'https://unknown.example/',
        userAgent: 'Mozilla/5.0',
        language: 'en-US',
        screen: { width: 1280, height: 720 },
      },
    });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Unknown site key' });
  });
});
