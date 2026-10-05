import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Client, createTestContext, resetDatabase, signUp, signUpWithOrg } from './helpers';

const ctx = createTestContext();
beforeEach(resetDatabase);
afterAll(() => ctx.database.close());

describe('sign-up & session', () => {
  it('creates an account, sends a verification email and returns me with no orgs', async () => {
    const client = await signUp(ctx.app, 'abebe@example.et', { name: 'Abebe', locale: 'am' });
    const me = await client.get('/api/v1/me');
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ name: 'Abebe', email: 'abebe@example.et', locale: 'am', calendar: 'gregorian', emailVerified: false });
    expect(me.body.orgs).toEqual([]);
    expect(me.body.activeOrgId).toBeNull();
    const mail = ctx.mailer.lastTo('abebe@example.et');
    expect(mail?.subject).toBe('ለPulse ኢሜይልዎን ያረጋግጡ'); // localized from the user's sign-up language
    expect(mail?.text).toContain('/api/auth/verify-email?token=');
  });

  it('sets hardened session cookies', async () => {
    const res = await ctx.app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { origin: 'http://localhost:5174', 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'c@example.et', password: 'correct horse battery', name: 'C' }),
    });
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith('pulse.session_token='));
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('rejects short passwords and duplicate emails', async () => {
    const c = new Client(ctx.app);
    const short = await c.post('/api/auth/sign-up/email', { email: 'x@example.et', password: 'short', name: 'X' });
    expect(short.status).toBe(400);
    await signUp(ctx.app, 'dup@example.et');
    const dup = await new Client(ctx.app).post('/api/auth/sign-up/email', { email: 'dup@example.et', password: 'correct horse battery', name: 'D' });
    expect(dup.status).toBeGreaterThanOrEqual(400);
  });

  it('signs in, rejects a wrong password, and signs out server-side', async () => {
    await signUp(ctx.app, 'kidist@example.et');
    const c = new Client(ctx.app);
    const wrong = await c.post('/api/auth/sign-in/email', { email: 'kidist@example.et', password: 'nope nope nope' });
    expect(wrong.status).toBe(401);
    const ok = await c.post('/api/auth/sign-in/email', { email: 'kidist@example.et', password: 'correct horse battery' });
    expect(ok.status).toBe(200);
    expect((await c.get('/api/v1/me')).status).toBe(200);
    expect((await c.post('/api/auth/sign-out')).status).toBe(200);
    const after = await c.get('/api/v1/me');
    expect(after.status).toBe(401);
    expect(after.body.error.code).toBe('unauthenticated');
  });

  it('resets a password with an emailed, single-use token and revokes old sessions', async () => {
    const original = await signUp(ctx.app, 'reset@example.et');
    const c = new Client(ctx.app);
    const req = await c.post('/api/auth/request-password-reset', { email: 'reset@example.et', redirectTo: 'http://localhost:5174/reset-password' });
    expect(req.status).toBe(200);
    const url = ctx.mailer.lastTo('reset@example.et')!.text.match(/https?:\/\/\S+/)![0];
    const token = url.split('/reset-password/')[1]!.split('?')[0]!;
    const reset = await c.post('/api/auth/reset-password', { token, newPassword: 'a brand new passphrase' });
    expect(reset.status).toBe(200);
    expect((await c.post('/api/auth/reset-password', { token, newPassword: 'yet another passphrase' })).status).toBe(400);
    expect((await original.get('/api/v1/me')).status).toBe(401);
    expect((await c.post('/api/auth/sign-in/email', { email: 'reset@example.et', password: 'correct horse battery' })).status).toBe(401);
    expect((await c.post('/api/auth/sign-in/email', { email: 'reset@example.et', password: 'a brand new passphrase' })).status).toBe(200);
  });

  it('does not reveal whether an email has an account', async () => {
    const c = new Client(ctx.app);
    const res = await c.post('/api/auth/request-password-reset', { email: 'nobody@example.et', redirectTo: 'http://localhost:5174/reset-password' });
    expect(res.status).toBe(200);
    expect(ctx.mailer.lastTo('nobody@example.et')).toBeUndefined();
  });

  it('refuses cookie-authenticated requests from untrusted origins (CSRF)', async () => {
    const victim = await signUpWithOrg(ctx.app, 'victim@example.et');
    const forged = (path: string, method: string, body?: unknown) =>
      victim.client.request(path, { method, body, headers: { origin: 'https://evil.example' } });
    const site = await forged('/api/v1/sites', 'POST', { name: 'x', domain: 'x.et' });
    expect(site.status).toBe(403);
    expect(site.body.error.code).toBe('forbidden');
    expect((await forged('/api/auth/sign-out', 'POST', {})).status).toBe(403);
    // The legitimate origin still works.
    expect((await victim.client.post('/api/v1/sites', { name: 'x', domain: 'x.et' })).status).toBe(201);
  });
});

describe('preferences', () => {
  it('updates language and calendar and validates values', async () => {
    const c = await signUp(ctx.app, 'pref@example.et');
    const ok = await c.patch('/api/v1/me/preferences', { locale: 'am', calendar: 'ethiopian', name: 'Tigist' });
    expect(ok.status).toBe(200);
    expect(ok.body.user).toMatchObject({ locale: 'am', calendar: 'ethiopian', name: 'Tigist' });
    const bad = await c.patch('/api/v1/me/preferences', { locale: 'fr' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('validation_failed');
  });
});

describe('organizations', () => {
  it('creating an org makes the user its owner and the active org', async () => {
    const { client, orgId } = await signUpWithOrg(ctx.app, 'owner@example.et', 'Abebe Furniture');
    const me = await client.get('/api/v1/me');
    expect(me.body.activeOrgId).toBe(orgId);
    expect(me.body.orgs).toEqual([expect.objectContaining({ id: orgId, name: 'Abebe Furniture', role: 'owner' })]);
  });

  it('org-scoped routes require an active org', async () => {
    const c = await signUp(ctx.app, 'noorg@example.et');
    const res = await c.get('/api/v1/sites');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('no_active_org');
  });
});
