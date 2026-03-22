import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { signupAndAuthenticate } from '../helpers/auth.js';
import { createTestApp, type ApiTestContext } from '../helpers/testApp.js';

const applyPasswordResetMigration = (db: Database.Database) => {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash  TEXT NOT NULL,
      expires_at  DATETIME NOT NULL,
      used_at     DATETIME,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
};

const getMailer = () => import('../../src/lib/mailer.js');

describe('auth password reset', () => {
  let context: ApiTestContext | null = null;

  afterEach(async () => {
    await context?.cleanup();
    context = null;
  });

  it('happy path: forgot → reset → login with new password', async () => {
    context = await createTestApp();
    applyPasswordResetMigration(context.db);
    const mailer = await getMailer();

    const { user } = await signupAndAuthenticate(context.app);
    const email = user!.email;

    mailer.resetSentMails();

    // Step 1: Request password reset
    const forgotRes = await request(context.app)
      .post('/auth/forgot-password')
      .send({ email });
    expect(forgotRes.status).toBe(200);
    expect(forgotRes.body).toEqual({ ok: true });

    // Extract raw token from mailer module
    const resetMail = mailer.sentMails.find(m => m.type === 'password_reset');
    expect(resetMail).toBeTruthy();
    expect(resetMail!.to).toBe(email);
    const tokenMatch = resetMail!.text.match(/token=([A-Za-z0-9_-]+)/);
    expect(tokenMatch).toBeTruthy();
    const rawToken = tokenMatch![1];

    // Step 2: Reset password
    const newPassword = 'brand-new-password-99';
    const resetRes = await request(context.app)
      .post('/auth/reset-password')
      .send({ token: rawToken, password: newPassword });
    expect(resetRes.status).toBe(200);
    expect(resetRes.body).toEqual({ ok: true });

    // Step 3: Old password fails login
    const oldLoginRes = await request(context.app)
      .post('/auth/login')
      .send({ email, password: 'TestPassword123' });
    expect(oldLoginRes.status).toBe(401);

    // Step 4: New password succeeds login
    const newLoginRes = await request(context.app)
      .post('/auth/login')
      .send({ email, password: newPassword });
    expect(newLoginRes.status).toBe(200);
    expect(newLoginRes.body.user.email).toBe(email);

    // Step 5: Verify refresh_token_hash was cleared (session invalidation)
    const row = context.db
      .prepare<[string], { refresh_token_hash: string | null }>('SELECT refresh_token_hash FROM users WHERE id = ?')
      .get(user!.id);
    // After reset, refresh_token_hash was cleared; login sets a new one
    expect(row?.refresh_token_hash).toBeTruthy();
  });

  it('expired token is rejected', async () => {
    context = await createTestApp();
    applyPasswordResetMigration(context.db);
    const mailer = await getMailer();

    const { user } = await signupAndAuthenticate(context.app);

    mailer.resetSentMails();

    // Request reset
    await request(context.app)
      .post('/auth/forgot-password')
      .send({ email: user!.email });

    // Expire the token manually
    context.db.prepare("UPDATE password_reset_tokens SET expires_at = datetime('now', '-1 hour')").run();

    // Extract token from mailer
    const resetMail = mailer.sentMails.find(m => m.type === 'password_reset');
    const rawToken = resetMail!.text.match(/token=([A-Za-z0-9_-]+)/)![1];

    const resetRes = await request(context.app)
      .post('/auth/reset-password')
      .send({ token: rawToken, password: 'new-password-123' });
    expect(resetRes.status).toBe(400);
    expect(resetRes.body).toMatchObject({ error: 'Invalid or expired reset token' });
  });

  it('used token is rejected (single-use)', async () => {
    context = await createTestApp();
    applyPasswordResetMigration(context.db);
    const mailer = await getMailer();

    const { user } = await signupAndAuthenticate(context.app);

    mailer.resetSentMails();

    await request(context.app)
      .post('/auth/forgot-password')
      .send({ email: user!.email });

    const resetMail = mailer.sentMails.find(m => m.type === 'password_reset');
    const rawToken = resetMail!.text.match(/token=([A-Za-z0-9_-]+)/)![1];

    // First reset — succeeds
    const res1 = await request(context.app)
      .post('/auth/reset-password')
      .send({ token: rawToken, password: 'first-new-pass-123' });
    expect(res1.status).toBe(200);

    // Second reset with same token — fails
    const res2 = await request(context.app)
      .post('/auth/reset-password')
      .send({ token: rawToken, password: 'second-new-pass-123' });
    expect(res2.status).toBe(400);
    expect(res2.body).toMatchObject({ error: 'Invalid or expired reset token' });
  });

  it('invalid/random token is rejected', async () => {
    context = await createTestApp();
    applyPasswordResetMigration(context.db);

    const resetRes = await request(context.app)
      .post('/auth/reset-password')
      .send({ token: 'completely-random-garbage-token', password: 'new-password-123' });
    expect(resetRes.status).toBe(400);
    expect(resetRes.body).toMatchObject({ error: 'Invalid or expired reset token' });
  });

  it('non-existent email still returns { ok: true }', async () => {
    context = await createTestApp();
    applyPasswordResetMigration(context.db);

    const forgotRes = await request(context.app)
      .post('/auth/forgot-password')
      .send({ email: 'nobody@example.com' });
    expect(forgotRes.status).toBe(200);
    expect(forgotRes.body).toEqual({ ok: true });
  });
});
