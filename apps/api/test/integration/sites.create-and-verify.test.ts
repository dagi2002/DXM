import { afterEach, describe, expect, it } from 'vitest';
import { signupAndAuthenticate } from '../helpers/auth.js';
import { createTestApp, type ApiTestContext } from '../helpers/testApp.js';

describe('sites create and verify flow', () => {
  let context: ApiTestContext | null = null;

  afterEach(async () => {
    await context?.cleanup();
    context = null;
    delete process.env.API_PUBLIC_URL;
  });

  it('omits data-api-url when API_PUBLIC_URL is unset', async () => {
    context = await createTestApp();

    const { agent, workspace, response: signupResponse } = await signupAndAuthenticate(context.app);
    expect(signupResponse.status).toBe(201);
    expect(workspace?.id).toBeTruthy();

    const createResponse = await agent.post('/sites').send({
      name: 'Abebe Furniture',
      domain: 'https://abebefurniture.et/',
    });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body).toMatchObject({
      name: 'Abebe Furniture',
      domain: 'abebefurniture.et',
      verified: false,
      trackingStatus: 'install',
      siteKey: expect.any(String),
      snippet: expect.any(String),
    });
    expect(createResponse.body.id).toMatch(/^site_/);
    expect(createResponse.body.snippet).toContain('src="https://cdn.dxmpulse.com/dxm.js"');
    expect(createResponse.body.snippet).toContain(`data-site-id="${createResponse.body.siteKey}"`);
    expect(createResponse.body.snippet).not.toContain('data-api-url=');

    const listResponse = await agent.get('/sites');
    expect(listResponse.status).toBe(200);
    expect(listResponse.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: createResponse.body.id,
          domain: 'abebefurniture.et',
          trackingStatus: 'install',
        }),
      ]),
    );

    const verifyBeforeCollect = await agent.get(`/sites/${createResponse.body.id}/verify`);
    expect(verifyBeforeCollect.status).toBe(200);
    expect(verifyBeforeCollect.body).toMatchObject({
      verified: false,
      sessionCount: 0,
    });

    const collectResponse = await agent.post('/collect').send({
      sessionId: 'sess_test_verify_001',
      siteId: createResponse.body.siteKey,
      completed: true,
      events: [
        { type: 'pageview', ts: Date.now(), url: 'https://abebefurniture.et/' },
      ],
      metadata: {
        url: 'https://abebefurniture.et/',
        userAgent: 'Mozilla/5.0',
        language: 'en-US',
        screen: { width: 1440, height: 900 },
      },
    });

    expect(collectResponse.status).toBe(200);
    expect(collectResponse.body).toEqual({ ok: true });

    const verifyAfterCollect = await agent.get(`/sites/${createResponse.body.id}/verify`);
    expect(verifyAfterCollect.status).toBe(200);
    expect(verifyAfterCollect.body.verified).toBe(true);
    expect(verifyAfterCollect.body.sessionCount).toBe(1);
  });

  it('includes data-api-url when API_PUBLIC_URL is configured', async () => {
    process.env.API_PUBLIC_URL = 'https://app.dxmpulse.et/api';
    context = await createTestApp();

    const { agent, response: signupResponse } = await signupAndAuthenticate(context.app);
    expect(signupResponse.status).toBe(201);

    const createResponse = await agent.post('/sites').send({
      name: 'Configured API URL Site',
      domain: 'https://configured.example/',
    });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.snippet).toContain('src="https://cdn.dxmpulse.com/dxm.js"');
    expect(createResponse.body.snippet).toContain('data-api-url="https://app.dxmpulse.et/api"');
    expect(createResponse.body.snippet).toContain('src="https://cdn.dxmpulse.com/dxm.js"');
  });

  it('normalizes API_PUBLIC_URL before adding data-api-url to the snippet', async () => {
    process.env.API_PUBLIC_URL = '  https://app.dxmpulse.et/api/  ';
    context = await createTestApp();

    const { agent, response: signupResponse } = await signupAndAuthenticate(context.app);
    expect(signupResponse.status).toBe(201);

    const createResponse = await agent.post('/sites').send({
      name: 'Normalized API URL Site',
      domain: 'https://normalized.example/',
    });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.snippet).toContain('data-api-url="https://app.dxmpulse.et/api"');
    expect(createResponse.body.snippet).not.toContain('data-api-url="https://app.dxmpulse.et/api/"');
  });

  it('ignores blank API_PUBLIC_URL values', async () => {
    process.env.API_PUBLIC_URL = '   ';
    context = await createTestApp();

    const { agent, response: signupResponse } = await signupAndAuthenticate(context.app);
    expect(signupResponse.status).toBe(201);

    const createResponse = await agent.post('/sites').send({
      name: 'Blank API URL Site',
      domain: 'https://blank.example/',
    });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.snippet).not.toContain('data-api-url=');
  });
});
