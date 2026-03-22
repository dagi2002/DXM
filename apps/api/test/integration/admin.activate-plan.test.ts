import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { signupAndAuthenticate } from '../helpers/auth.js';
import { createTestApp, type ApiTestContext } from '../helpers/testApp.js';

const ADMIN_SECRET = 'test-admin-secret-key';

describe('admin activate plan', () => {
  let context: ApiTestContext | null = null;

  afterEach(async () => {
    await context?.cleanup();
    context = null;
  });

  it('activates workspace plan with valid admin key', async () => {
    context = await createTestApp({ env: { ADMIN_SECRET } });

    const { workspace } = await signupAndAuthenticate(context.app);

    const res = await request(context.app)
      .patch(`/admin/workspaces/${workspace!.id}/plan`)
      .set('x-admin-key', ADMIN_SECRET)
      .set('Content-Type', 'application/json')
      .send({ plan: 'starter' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, workspaceId: workspace!.id, plan: 'starter' });

    const ws = context.db
      .prepare<[string], { plan: string; billing_status: string }>('SELECT plan, billing_status FROM workspaces WHERE id = ?')
      .get(workspace!.id);
    expect(ws?.plan).toBe('starter');
    expect(ws?.billing_status).toBe('active');
  });

  it('returns 401 when x-admin-key header is missing', async () => {
    context = await createTestApp({ env: { ADMIN_SECRET } });

    const { workspace } = await signupAndAuthenticate(context.app);

    const res = await request(context.app)
      .patch(`/admin/workspaces/${workspace!.id}/plan`)
      .set('Content-Type', 'application/json')
      .send({ plan: 'starter' });

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'Missing x-admin-key header' });
  });

  it('returns 401 for wrong admin key', async () => {
    context = await createTestApp({ env: { ADMIN_SECRET } });

    const { workspace } = await signupAndAuthenticate(context.app);

    const res = await request(context.app)
      .patch(`/admin/workspaces/${workspace!.id}/plan`)
      .set('x-admin-key', 'wrong-key-value')
      .set('Content-Type', 'application/json')
      .send({ plan: 'starter' });

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'Invalid admin key' });
  });

  it('returns 503 when ADMIN_SECRET is not configured', async () => {
    context = await createTestApp({ env: { ADMIN_SECRET: '' } });

    const { workspace } = await signupAndAuthenticate(context.app);

    const res = await request(context.app)
      .patch(`/admin/workspaces/${workspace!.id}/plan`)
      .set('x-admin-key', 'any-value')
      .set('Content-Type', 'application/json')
      .send({ plan: 'starter' });

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ error: 'Admin key not configured on this server' });
  });

  it('returns 404 for unknown workspace', async () => {
    context = await createTestApp({ env: { ADMIN_SECRET } });

    const res = await request(context.app)
      .patch('/admin/workspaces/nonexistent-workspace-id/plan')
      .set('x-admin-key', ADMIN_SECRET)
      .set('Content-Type', 'application/json')
      .send({ plan: 'starter' });

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'Workspace not found' });
  });
});
