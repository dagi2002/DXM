import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { signupAndAuthenticate } from '../helpers/auth.js';
import { createTestApp, type ApiTestContext } from '../helpers/testApp.js';

describe('auth jwt guard', () => {
  let context: ApiTestContext | null = null;
  let context2: ApiTestContext | null = null;

  afterEach(async () => {
    await context2?.cleanup();
    context2 = null;
    await context?.cleanup();
    context = null;
  });

  it('rejects a token signed with a different secret', async () => {
    // App A: signup with secret A — produces a real JWT signed with secret A
    context = await createTestApp({
      env: { JWT_SECRET: 'secret-A-32chars-minimum-padding!!' },
    });
    const { response: signupRes } = await signupAndAuthenticate(context.app);
    expect(signupRes.status).toBe(201);

    // Extract the real dxm_access cookie from App A
    const cookies = signupRes.headers['set-cookie'] as string[];
    const accessCookie = cookies?.find((c: string) => c.startsWith('dxm_access='));
    expect(accessCookie).toBeTruthy();

    // App B: different secret — the token from App A should be invalid here
    context2 = await createTestApp({
      env: { JWT_SECRET: 'secret-B-32chars-minimum-padding!!' },
    });

    const res = await request(context2.app)
      .get('/auth/me')
      .set('Cookie', accessCookie!);

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'Invalid or expired session — please log in again' });
  });

  it('dev mode works without explicit JWT_SECRET (uses fallback)', async () => {
    // Neither JWT_SECRET nor JWT_REFRESH_SECRET provided — both auth.ts and
    // middleware/auth.ts fall back to dev defaults. Signup + login should work.
    context = await createTestApp({
      env: { JWT_SECRET: undefined, JWT_REFRESH_SECRET: undefined },
    });

    const { agent, response: signupRes } = await signupAndAuthenticate(context.app);
    expect(signupRes.status).toBe(201);

    const meRes = await agent.get('/auth/me');
    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBeTruthy();
  });

  it('custom JWT_SECRET is honored across signup and protected routes', async () => {
    const customSecret = 'my-custom-test-secret-at-least-32c';
    context = await createTestApp({ env: { JWT_SECRET: customSecret } });

    const { agent, response: signupRes } = await signupAndAuthenticate(context.app);
    expect(signupRes.status).toBe(201);

    // The token was signed with customSecret during signup.
    // requireAuth verifies with the same customSecret → should succeed.
    const meRes = await agent.get('/auth/me');
    expect(meRes.status).toBe(200);
    expect(meRes.body.user.email).toBeTruthy();
    expect(meRes.body.workspace.id).toBeTruthy();
  });
});
