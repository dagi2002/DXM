import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { signupAndAuthenticate } from '../helpers/auth.js';
import { createWorkspaceUser } from '../helpers/users.js';
import { createTestApp, type ApiTestContext } from '../helpers/testApp.js';

describe('workspace API key lifecycle', () => {
  let context: ApiTestContext | null = null;

  afterEach(async () => {
    await context?.cleanup();
    context = null;
  });

  const createContext = async () =>
    createTestApp({ env: { WORKSPACE_API_PEPPER: 'test-pepper' } });

  it('owner creates a key; raw secret is shown exactly once', async () => {
    context = await createContext();
    const { agent } = await signupAndAuthenticate(context.app);

    const created = await agent.post('/api-keys').send({ name: 'Claude Desktop' });
    expect(created.status).toBe(201);
    expect(created.body.rawKey).toMatch(/^dxm_live_[0-9a-f]{64}$/);
    expect(created.body.key.prefix).toBe(created.body.rawKey.slice(0, 12));
    expect(created.body.key.name).toBe('Claude Desktop');

    const list = await agent.get('/api-keys');
    expect(list.status).toBe(200);
    expect(list.body.keys).toHaveLength(1);
    // Neither raw key nor hash ever appears in the listing.
    expect(JSON.stringify(list.body)).not.toContain(created.body.rawKey);
    expect(list.body.keys[0].prefix).toHaveLength(12);
  });

  it('viewer can list keys but cannot create or revoke', async () => {
    context = await createContext();
    const { agent: owner, workspace } = await signupAndAuthenticate(context.app);

    const created = await owner.post('/api-keys').send({ name: 'CI key' });
    expect(created.status).toBe(201);

    const { agent: viewer } = await createWorkspaceUser(context.app, context.db, {
      workspaceId: workspace!.id as string,
      role: 'viewer',
    });

    const list = await viewer.get('/api-keys');
    expect(list.status).toBe(200);
    expect(list.body.keys).toHaveLength(1);

    const create = await viewer.post('/api-keys').send({ name: 'sneaky' });
    expect(create.status).toBe(403);

    const revoke = await viewer.post(`/api-keys/${created.body.key.id}/revoke`);
    expect(revoke.status).toBe(403);
  });

  it('revocation takes effect on the very next MCP request', async () => {
    context = await createContext();
    const { agent } = await signupAndAuthenticate(context.app);

    const created = await agent.post('/api-keys').send({ name: 'MCP key' });
    const rawKey = created.body.rawKey as string;

    const before = await request(context.app)
      .get('/mcp')
      .set('Authorization', `Bearer ${rawKey}`);
    expect(before.status).toBe(200);
    expect(before.body.name).toBe('dxm-pulse');

    const revoke = await agent.post(`/api-keys/${created.body.key.id}/revoke`);
    expect(revoke.status).toBe(200);
    expect(revoke.body.key.revokedAt).toBeTruthy();

    const after = await request(context.app)
      .get('/mcp')
      .set('Authorization', `Bearer ${rawKey}`);
    expect(after.status).toBe(401);
    expect(after.body.error).toBe('API key revoked');
  });

  it('re-revoking is idempotent and keeps the original timestamp', async () => {
    context = await createContext();
    const { agent } = await signupAndAuthenticate(context.app);

    const created = await agent.post('/api-keys').send({ name: 'idempotent' });
    const first = await agent.post(`/api-keys/${created.body.key.id}/revoke`);
    const second = await agent.post(`/api-keys/${created.body.key.id}/revoke`);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.key.revokedAt).toBe(first.body.key.revokedAt);
  });

  it('cannot revoke another workspace\'s key by guessing its id', async () => {
    context = await createContext();
    const { agent: ownerA } = await signupAndAuthenticate(context.app);
    const { agent: ownerB } = await signupAndAuthenticate(context.app);

    const created = await ownerA.post('/api-keys').send({ name: 'workspace A key' });

    const revoke = await ownerB.post(`/api-keys/${created.body.key.id}/revoke`);
    expect(revoke.status).toBe(404);

    // Key still works.
    const check = await request(context.app)
      .get('/mcp')
      .set('Authorization', `Bearer ${created.body.rawKey}`);
    expect(check.status).toBe(200);
  });
});
