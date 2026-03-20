import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { signupAndAuthenticate } from '../helpers/auth.js';
import { createTestApp, type ApiTestContext } from '../helpers/testApp.js';

describe('cors behavior', () => {
  let context: ApiTestContext | null = null;

  afterEach(async () => {
    await context?.cleanup();
    context = null;
  });

  it('allows cross-origin POST /collect without credentials', async () => {
    context = await createTestApp();

    const { agent, response: signupResponse } = await signupAndAuthenticate(context.app);
    expect(signupResponse.status).toBe(201);

    const siteResponse = await agent.post('/sites').send({
      name: 'CORS Collect Site',
      domain: 'https://client.example/',
    });

    expect(siteResponse.status).toBe(201);

    const response = await request(context.app)
      .post('/collect')
      .set('Origin', 'https://client.example')
      .send({
        sessionId: 'sess_cors_collect_001',
        siteId: siteResponse.body.siteKey,
        completed: false,
        events: [
          { type: 'pageview', ts: Date.now(), url: 'https://client.example/' },
        ],
        metadata: {
          url: 'https://client.example/',
          userAgent: 'Mozilla/5.0',
          language: 'en-US',
          screen: { width: 1440, height: 900 },
        },
      });

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('*');
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('answers ingest preflight for /collect with POST, OPTIONS, and Content-Type support', async () => {
    context = await createTestApp();

    const response = await request(context.app)
      .options('/collect')
      .set('Origin', 'https://client.example')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Content-Type');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('*');
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
    expect(response.headers['access-control-allow-methods']).toContain('POST');
    expect(response.headers['access-control-allow-methods']).toContain('OPTIONS');
    expect(response.headers['access-control-allow-headers']).toContain('Content-Type');
  });

  it('answers ingest preflight for /collect-replay/replay with POST, OPTIONS, and Content-Type support', async () => {
    context = await createTestApp();

    const response = await request(context.app)
      .options('/collect-replay/replay')
      .set('Origin', 'https://client.example')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Content-Type');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('*');
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
    expect(response.headers['access-control-allow-methods']).toContain('POST');
    expect(response.headers['access-control-allow-methods']).toContain('OPTIONS');
    expect(response.headers['access-control-allow-headers']).toContain('Content-Type');
  });

  it('keeps dashboard CORS bound to WEB_ORIGIN with credentials', async () => {
    context = await createTestApp();

    const response = await request(context.app)
      .get('/auth/me')
      .set('Origin', 'http://localhost:5173');

    expect(response.status).toBe(401);
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('does not allow arbitrary origins on dashboard routes', async () => {
    context = await createTestApp();

    const response = await request(context.app)
      .get('/auth/me')
      .set('Origin', 'https://client.example');

    expect(response.status).toBe(401);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('keeps GET /health unchanged for local and non-browser checks', async () => {
    context = await createTestApp();

    const response = await request(context.app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      ts: expect.any(String),
    });
  });
});
