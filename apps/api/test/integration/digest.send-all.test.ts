import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { signupAndAuthenticate } from '../helpers/auth.js';
import { setWorkspacePlan } from '../helpers/billing.js';
import { createTestApp, type ApiTestContext } from '../helpers/testApp.js';

describe('digest send-all', () => {
  let context: ApiTestContext | null = null;
  const fetchMock = vi.fn();
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock.mockReset();
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    infoSpy.mockClear();
    warnSpy.mockClear();
    errorSpy.mockClear();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await context?.cleanup();
    context = null;
  });

  afterAll(() => {
    infoSpy?.mockRestore();
    warnSpy?.mockRestore();
    errorSpy?.mockRestore();
  });

  const enableWorkspaceDigest = async () => {
    if (!context) {
      throw new Error('Missing API test context');
    }

    const { agent, workspace, response: signupResponse } = await signupAndAuthenticate(context.app);
    expect(signupResponse.status).toBe(201);
    expect(workspace?.id).toBeTruthy();
    setWorkspacePlan(context.db, workspace!.id as string, 'starter');

    context.db.prepare(`
      UPDATE workspaces
      SET telegram_bot_token = ?, telegram_chat_id = ?, digest_enabled = 1, digest_language = 'en'
      WHERE id = ?
    `).run('test-bot-token', 'chat-123', workspace!.id);

    return {
      agent,
      workspaceId: workspace!.id as string,
    };
  };

  it('falls back to JWT_SECRET in non-production when DIGEST_CRON_SECRET is absent', async () => {
    context = await createTestApp({
      env: {
        NODE_ENV: 'test',
        DIGEST_CRON_SECRET: undefined,
        JWT_SECRET: 'jwt-fallback-secret',
      },
    });
    await enableWorkspaceDigest();
    fetchMock.mockResolvedValue({ ok: true });

    const response = await request(context.app)
      .post('/digest/send-all')
      .set('x-digest-key', 'jwt-fallback-secret');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ sent: 1 });
  });

  it('treats blank DIGEST_CRON_SECRET as absent in non-production', async () => {
    context = await createTestApp({
      env: {
        NODE_ENV: 'test',
        DIGEST_CRON_SECRET: '   ',
        JWT_SECRET: 'jwt-fallback-secret',
      },
    });
    await enableWorkspaceDigest();
    fetchMock.mockResolvedValue({ ok: true });

    const response = await request(context.app)
      .post('/digest/send-all')
      .set('x-digest-key', 'jwt-fallback-secret');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ sent: 1 });
  });

  it('prefers DIGEST_CRON_SECRET over JWT_SECRET in non-production', async () => {
    context = await createTestApp({
      env: {
        NODE_ENV: 'test',
        DIGEST_CRON_SECRET: 'digest-secret',
        JWT_SECRET: 'jwt-fallback-secret',
      },
    });
    await enableWorkspaceDigest();
    fetchMock.mockResolvedValue({ ok: true });

    const jwtResponse = await request(context.app)
      .post('/digest/send-all')
      .set('x-digest-key', 'jwt-fallback-secret');

    expect(jwtResponse.status).toBe(401);

    const digestResponse = await request(context.app)
      .post('/digest/send-all')
      .set('x-digest-key', 'digest-secret');

    expect(digestResponse.status).toBe(200);
    expect(digestResponse.body).toEqual({ sent: 1 });
  });

  it('requires DIGEST_CRON_SECRET in production', async () => {
    context = await createTestApp({
      env: {
        NODE_ENV: 'production',
        DIGEST_CRON_SECRET: 'digest-secret',
        JWT_SECRET: 'jwt-fallback-secret',
      },
    });
    await enableWorkspaceDigest();
    fetchMock.mockResolvedValue({ ok: true });

    const jwtResponse = await request(context.app)
      .post('/digest/send-all')
      .set('x-digest-key', 'jwt-fallback-secret');

    expect(jwtResponse.status).toBe(401);

    const digestResponse = await request(context.app)
      .post('/digest/send-all')
      .set('x-digest-key', 'digest-secret');

    expect(digestResponse.status).toBe(200);
    expect(digestResponse.body).toEqual({ sent: 1 });
  });

  it('returns unauthorized in production when DIGEST_CRON_SECRET is missing', async () => {
    context = await createTestApp({
      env: {
        NODE_ENV: 'production',
        DIGEST_CRON_SECRET: undefined,
        JWT_SECRET: 'jwt-fallback-secret',
      },
    });
    await enableWorkspaceDigest();
    fetchMock.mockResolvedValue({ ok: true });

    const response = await request(context.app)
      .post('/digest/send-all')
      .set('x-digest-key', 'jwt-fallback-secret');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Unauthorized' });
  });

  it('logs run start and completion on successful delivery', async () => {
    context = await createTestApp({
      env: {
        NODE_ENV: 'test',
        DIGEST_CRON_SECRET: 'digest-secret',
      },
    });
    await enableWorkspaceDigest();
    fetchMock.mockResolvedValue({ ok: true });

    const response = await request(context.app)
      .post('/digest/send-all')
      .set('x-digest-key', 'digest-secret');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ sent: 1 });
    expect(infoSpy).toHaveBeenCalledWith('[digest] Starting digest run for 1 eligible workspaces');
    expect(infoSpy).toHaveBeenCalledWith('[digest] Completed digest run: eligible=1 sent=1 failed=0');
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logs failures and still returns the successful sent count', async () => {
    context = await createTestApp({
      env: {
        NODE_ENV: 'test',
        DIGEST_CRON_SECRET: 'digest-secret',
      },
    });
    const { workspaceId } = await enableWorkspaceDigest();
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValue('telegram error'),
    });

    const response = await request(context.app)
      .post('/digest/send-all')
      .set('x-digest-key', 'digest-secret');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ sent: 0 });
    expect(warnSpy).toHaveBeenCalledWith('[digest] Telegram delivery failed (500): telegram error');
    expect(warnSpy).toHaveBeenCalledWith(`[digest] Delivery failed for workspace ${workspaceId}`);
    expect(infoSpy).toHaveBeenCalledWith('[digest] Completed digest run: eligible=1 sent=0 failed=1');
  });
});
