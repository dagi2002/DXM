import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Client, createTestContext, resetDatabase, signUp } from './helpers';

const ctx = createTestContext();
beforeEach(resetDatabase);
afterAll(() => ctx.database.close());

const PASSWORD = 'correct horse battery';

async function signInAgain(email: string, userAgent: string) {
  const c = new Client(ctx.app);
  const res = await c.request('/api/auth/sign-in/email', {
    method: 'POST',
    body: { email, password: PASSWORD },
    headers: { 'user-agent': userAgent },
  });
  expect(res.status).toBe(200);
  return c;
}

const PHONE_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';

describe('active sessions', () => {
  it('lists the caller’s sessions with the current one first and no tokens', async () => {
    const laptop = await signUp(ctx.app, 'sara@example.et');
    await signInAgain('sara@example.et', PHONE_UA);
    await signUp(ctx.app, 'someone-else@example.et');

    const res = await laptop.get('/api/v1/me/sessions');
    expect(res.status).toBe(200);
    expect(res.body.sessions).toHaveLength(2); // never another user's sessions
    expect(res.body.sessions[0].current).toBe(true);
    expect(res.body.sessions.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
    const phone = res.body.sessions.find((s: { current: boolean }) => !s.current);
    expect(phone.userAgent).toBe(PHONE_UA);
    expect(phone.ipAddress).toBe('127.0.0.1');
    expect(Date.parse(phone.lastActiveAt)).not.toBeNaN();
    expect(JSON.stringify(res.body)).not.toMatch(/token/i);
  });

  it('requires a session', async () => {
    const res = await new Client(ctx.app).get('/api/v1/me/sessions');
    expect(res.status).toBe(401);
  });

  it('revokes one other device, which is signed out immediately', async () => {
    const laptop = await signUp(ctx.app, 'meron@example.et');
    const phone = await signInAgain('meron@example.et', PHONE_UA);
    const list = await laptop.get('/api/v1/me/sessions');
    const phoneId = list.body.sessions.find((s: { current: boolean }) => !s.current).id;

    const del = await laptop.delete(`/api/v1/me/sessions/${phoneId}`);
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ revoked: 1, current: false });
    expect((await phone.get('/api/v1/me')).status).toBe(401);
    expect((await laptop.get('/api/v1/me')).status).toBe(200);
    expect((await laptop.get('/api/v1/me/sessions')).body.sessions).toHaveLength(1);
  });

  it("can't revoke another user's session (404, untouched)", async () => {
    const victim = await signUp(ctx.app, 'victim@example.et');
    const attacker = await signUp(ctx.app, 'attacker@example.et');
    const victimId = (await victim.get('/api/v1/me/sessions')).body.sessions[0].id;

    const res = await attacker.delete(`/api/v1/me/sessions/${victimId}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
    expect((await victim.get('/api/v1/me')).status).toBe(200);
  });

  it('revoking the current session signs the caller out', async () => {
    const c = await signUp(ctx.app, 'self@example.et');
    const id = (await c.get('/api/v1/me/sessions')).body.sessions[0].id;
    const del = await c.delete(`/api/v1/me/sessions/${id}`);
    expect(del.body).toEqual({ revoked: 1, current: true });
    expect((await c.get('/api/v1/me')).status).toBe(401);
  });

  it('revokes all other sessions and keeps the current one', async () => {
    const laptop = await signUp(ctx.app, 'yonas@example.et');
    const phone = await signInAgain('yonas@example.et', PHONE_UA);
    const tablet = await signInAgain('yonas@example.et', 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)');
    const other = await signUp(ctx.app, 'bystander@example.et');

    const res = await laptop.post('/api/v1/me/sessions/revoke-others');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ revoked: 2 });
    expect((await phone.get('/api/v1/me')).status).toBe(401);
    expect((await tablet.get('/api/v1/me')).status).toBe(401);
    expect((await laptop.get('/api/v1/me')).status).toBe(200);
    expect((await other.get('/api/v1/me')).status).toBe(200);
  });

  it('blocks cross-site revoke requests', async () => {
    const c = await signUp(ctx.app, 'csrf@example.et');
    const evil = await c.request('/api/v1/me/sessions/revoke-others', {
      method: 'POST',
      body: {},
      headers: { origin: 'https://evil.example' },
    });
    expect(evil.status).toBe(403);
  });
});
