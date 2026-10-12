import { createHmac } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { adminQuery, Client, createTestContext, resetDatabase, signUp } from './helpers';

const ctx = createTestContext();
beforeEach(resetDatabase);
afterAll(() => ctx.database.close());

const PASSWORD = 'correct horse battery';

/** RFC 4648 base32 (no padding) → bytes. */
function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of input.replace(/=+$/, '').toUpperCase()) {
    const idx = alphabet.indexOf(ch);
    if (idx < 0) throw new Error(`bad base32 char ${ch}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** RFC 6238 TOTP (SHA-1, 6 digits, 30 s) — what an authenticator app would show. */
function totpFromUri(uri: string, offsetSteps = 0): string {
  const secret = new URL(uri).searchParams.get('secret');
  if (!secret) throw new Error('no secret in otpauth uri');
  const counter = Math.floor(Date.now() / 30_000) + offsetSteps;
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', base32Decode(secret)).update(buf).digest();
  const offset = hmac[hmac.length - 1]! & 0xf;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, '0');
}

/** Signs up and completes 2FA enrollment. Returns the signed-in client, URI and backup codes. */
async function enrolled(email: string) {
  const client = await signUp(ctx.app, email);
  const enable = await client.post('/api/auth/two-factor/enable', { password: PASSWORD });
  expect(enable.status).toBe(200);
  const { totpURI, backupCodes } = enable.body as { totpURI: string; backupCodes: string[] };
  const verify = await client.post('/api/auth/two-factor/verify-totp', { code: totpFromUri(totpURI) });
  expect(verify.status).toBe(200);
  return { client, totpURI, backupCodes };
}

async function startSignIn(email: string) {
  const c = new Client(ctx.app);
  const res = await c.post('/api/auth/sign-in/email', { email, password: PASSWORD });
  return { c, res };
}

describe('two-factor enrollment', () => {
  it('returns an otpauth URI and 10 backup codes, and only turns on after a valid code', async () => {
    const client = await signUp(ctx.app, 'tigist@example.et');
    const enable = await client.post('/api/auth/two-factor/enable', { password: PASSWORD });
    expect(enable.status).toBe(200);
    expect(enable.body.totpURI).toMatch(/^otpauth:\/\/totp\/DXM%20Pulse:tigist%40example\.et\?/);
    expect(enable.body.totpURI).toContain('issuer=DXM+Pulse');
    expect(enable.body.backupCodes).toHaveLength(10);

    // Not on yet: the authenticator hasn't been proven.
    expect((await client.get('/api/v1/me')).body.user.twoFactorEnabled).toBe(false);
    const signInBeforeVerify = await startSignIn('tigist@example.et');
    expect(signInBeforeVerify.res.body.twoFactorRedirect).toBeUndefined();

    const wrong = await client.post('/api/auth/two-factor/verify-totp', { code: '000000' });
    expect(wrong.status).toBe(401);
    expect((await client.get('/api/v1/me')).body.user.twoFactorEnabled).toBe(false);

    const ok = await client.post('/api/auth/two-factor/verify-totp', {
      code: totpFromUri(enable.body.totpURI),
    });
    expect(ok.status).toBe(200);
    const me = await client.get('/api/v1/me');
    expect(me.status).toBe(200); // session survives the rotation the plugin does on enable
    expect(me.body.user.twoFactorEnabled).toBe(true);
  });

  it('stores the secret and backup codes encrypted', async () => {
    const { totpURI, backupCodes } = await enrolled('enc@example.et');
    const secret = new URL(totpURI).searchParams.get('secret')!;
    const { rows } = await adminQuery<{ secret: string; backup_codes: string }>(
      'select secret, backup_codes from two_factor',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.secret).not.toContain(secret);
    expect(rows[0]!.backup_codes).not.toContain(backupCodes[0]!);
  });

  it('requires the account password to enable or disable', async () => {
    const client = await signUp(ctx.app, 'pw@example.et');
    const bad = await client.post('/api/auth/two-factor/enable', { password: 'not my password' });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('INVALID_PASSWORD');

    const { client: on } = await enrolled('pw2@example.et');
    const badDisable = await on.post('/api/auth/two-factor/disable', { password: 'not my password' });
    expect(badDisable.status).toBe(400);
    expect((await on.get('/api/v1/me')).body.user.twoFactorEnabled).toBe(true);
  });

  it('rejects anonymous enable requests', async () => {
    const res = await new Client(ctx.app).post('/api/auth/two-factor/enable', { password: PASSWORD });
    expect(res.status).toBe(401);
  });
});

describe('two-factor sign-in challenge', () => {
  it('withholds the session until a valid TOTP code is entered', async () => {
    const { totpURI } = await enrolled('hana@example.et');
    const { c, res } = await startSignIn('hana@example.et');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ twoFactorRedirect: true, twoFactorMethods: ['totp'] });
    expect((await c.get('/api/v1/me')).status).toBe(401);

    const wrong = await c.post('/api/auth/two-factor/verify-totp', { code: '123456' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.code).toBe('INVALID_CODE');
    expect((await c.get('/api/v1/me')).status).toBe(401);

    const ok = await c.post('/api/auth/two-factor/verify-totp', { code: totpFromUri(totpURI) });
    expect(ok.status).toBe(200);
    expect((await c.get('/api/v1/me')).status).toBe(200);
  });

  it('cannot be completed without the challenge cookie from a password sign-in', async () => {
    const { totpURI } = await enrolled('nocookie@example.et');
    const stranger = new Client(ctx.app);
    const res = await stranger.post('/api/auth/two-factor/verify-totp', { code: totpFromUri(totpURI) });
    expect(res.status).toBe(401);
    expect((await stranger.get('/api/v1/me')).status).toBe(401);
  });

  it('burns the challenge after 5 wrong codes', async () => {
    const { totpURI } = await enrolled('brute@example.et');
    const { c } = await startSignIn('brute@example.et');
    for (let i = 0; i < 5; i++) {
      expect((await c.post('/api/auth/two-factor/verify-totp', { code: '000000' })).status).toBe(401);
    }
    const sixth = await c.post('/api/auth/two-factor/verify-totp', { code: totpFromUri(totpURI) });
    expect(sixth.status).toBeGreaterThanOrEqual(400);
    expect((await c.get('/api/v1/me')).status).toBe(401);
  });

  it('accepts each backup code exactly once', async () => {
    const { backupCodes } = await enrolled('backup@example.et');
    const first = await startSignIn('backup@example.et');
    const ok = await first.c.post('/api/auth/two-factor/verify-backup-code', { code: backupCodes[0] });
    expect(ok.status).toBe(200);
    expect((await first.c.get('/api/v1/me')).status).toBe(200);

    const second = await startSignIn('backup@example.et');
    const reused = await second.c.post('/api/auth/two-factor/verify-backup-code', { code: backupCodes[0] });
    expect(reused.status).toBe(401);
    expect((await second.c.get('/api/v1/me')).status).toBe(401);
  });

  it('can regenerate backup codes, invalidating the old set', async () => {
    const { client, backupCodes } = await enrolled('regen@example.et');
    const regen = await client.post('/api/auth/two-factor/generate-backup-codes', { password: PASSWORD });
    expect(regen.status).toBe(200);
    expect(regen.body.backupCodes).toHaveLength(10);
    const { c } = await startSignIn('regen@example.et');
    const old = await c.post('/api/auth/two-factor/verify-backup-code', { code: backupCodes[1] });
    expect(old.status).toBe(401);
    const fresh = await c.post('/api/auth/two-factor/verify-backup-code', {
      code: regen.body.backupCodes[0],
    });
    expect(fresh.status).toBe(200);
  });

  it('stops challenging after two-factor is disabled', async () => {
    const { client } = await enrolled('off@example.et');
    const off = await client.post('/api/auth/two-factor/disable', { password: PASSWORD });
    expect(off.status).toBe(200);
    expect((await client.get('/api/v1/me')).body.user.twoFactorEnabled).toBe(false);
    const { rows } = await adminQuery('select 1 from two_factor');
    expect(rows).toHaveLength(0);
    const { c, res } = await startSignIn('off@example.et');
    expect(res.body.twoFactorRedirect).toBeUndefined();
    expect((await c.get('/api/v1/me')).status).toBe(200);
  });

  it('does not let a magic link skip the second factor', async () => {
    await enrolled('magic@example.et');
    const c = new Client(ctx.app);
    const res = await c.post('/api/auth/sign-in/magic-link', {
      email: 'magic@example.et',
      callbackURL: 'http://localhost:5174/',
    });
    expect(res.status).toBe(200); // same response as for any other address
    const mail = ctx.mailer.lastTo('magic@example.et');
    expect(mail?.subject).toBe('Sign in to Pulse with your password');
    expect(mail?.text).not.toContain('/magic-link/verify');
    expect(mail?.text).toContain('http://localhost:5174/sign-in');
  });

  it('still sends magic links to accounts without two-factor', async () => {
    await signUp(ctx.app, 'plain@example.et');
    await new Client(ctx.app).post('/api/auth/sign-in/magic-link', {
      email: 'plain@example.et',
      callbackURL: 'http://localhost:5174/',
    });
    expect(ctx.mailer.lastTo('plain@example.et')?.text).toContain('/magic-link/verify');
  });
});
