import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createTestApp, type ApiTestContext } from '../helpers/testApp.js';

describe('auth signup/login/me flow', () => {
  let context: ApiTestContext | null = null;

  afterEach(async () => {
    await context?.cleanup();
    context = null;
  });

  it('signs up, persists auth cookies, logs out, and logs back in', async () => {
    context = await createTestApp();
    const agent = request.agent(context.app);
    const credentials = {
      name: 'Abebe Kebede',
      email: 'abebe@example.com',
      password: 'securepassword123',
      workspaceName: 'Habesha Shop',
    };

    const signupResponse = await agent.post('/auth/signup').send(credentials);

    expect(signupResponse.status).toBe(201);
    expect(signupResponse.body.user).toMatchObject({
      name: credentials.name,
      email: credentials.email,
      role: 'owner',
    });
    expect(signupResponse.body.workspace).toMatchObject({
      name: credentials.workspaceName,
      plan: 'free',
      billingStatus: 'active',
    });
    expect(signupResponse.headers['set-cookie']).toEqual(
      expect.arrayContaining([
        expect.stringContaining('dxm_access='),
        expect.stringContaining('dxm_refresh='),
      ]),
    );

    const meAfterSignup = await agent.get('/auth/me');
    expect(meAfterSignup.status).toBe(200);
    expect(meAfterSignup.body.user).toMatchObject({
      email: credentials.email,
      role: 'owner',
    });
    expect(meAfterSignup.body.workspace).toMatchObject({
      name: credentials.workspaceName,
    });

    const logoutResponse = await agent.post('/auth/logout');
    expect(logoutResponse.status).toBe(200);
    expect(logoutResponse.body).toEqual({ ok: true });

    const meAfterLogout = await agent.get('/auth/me');
    expect(meAfterLogout.status).toBe(401);
    expect(meAfterLogout.body).toEqual({ error: 'Authentication required' });

    const loginResponse = await agent
      .post('/auth/login')
      .send({ email: credentials.email, password: credentials.password });
    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.user).toMatchObject({
      email: credentials.email,
      role: 'owner',
    });

    const meAfterLogin = await agent.get('/auth/me');
    expect(meAfterLogin.status).toBe(200);
    expect(meAfterLogin.body.user).toMatchObject({
      email: credentials.email,
      role: 'owner',
    });
  });
});
