import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { signupAndAuthenticate } from '../helpers/auth.js';
import { createWorkspaceUser } from '../helpers/users.js';
import { createTestApp, type ApiTestContext } from '../helpers/testApp.js';

describe('workspace invites', () => {
  let context: ApiTestContext | null = null;

  afterEach(async () => {
    await context?.cleanup();
    context = null;
  });

  /** Pull the raw invite token out of the invite email body. */
  const tokenFromLastInviteMail = async () => {
    const { sentMails } = await import('../../src/lib/mailer.js');
    const mail = [...sentMails].reverse().find((m) => m.type === 'workspace_invite');
    expect(mail).toBeDefined();
    const match = mail!.text.match(/accept-invite\?token=([A-Za-z0-9_-]+)/);
    expect(match).toBeTruthy();
    return match![1];
  };

  it('runs the full invite → email → accept → login cycle with the invited role', async () => {
    context = await createTestApp();
    const { agent: owner } = await signupAndAuthenticate(context.app);

    const invited = await owner
      .post('/users/invites')
      .send({ email: 'teammate@client.example', role: 'viewer' });
    expect(invited.status).toBe(201);
    expect(invited.body.invite.email).toBe('teammate@client.example');
    // Raw token never leaks through the API response.
    expect(JSON.stringify(invited.body)).not.toContain('token');

    const token = await tokenFromLastInviteMail();

    const preview = await request(context.app).get(`/auth/invites/${token}`);
    expect(preview.status).toBe(200);
    expect(preview.body.email).toBe('teammate@client.example');
    expect(preview.body.role).toBe('viewer');
    expect(preview.body.workspaceName).toBeTruthy();

    const member = request.agent(context.app);
    const accepted = await member
      .post('/auth/invites/accept')
      .send({ token, name: 'New Teammate', password: 'password1234' });
    expect(accepted.status).toBe(201);
    expect(accepted.body.user.role).toBe('viewer');

    // Cookies were set — the member is logged in and workspace-scoped.
    const me = await member.get('/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('teammate@client.example');

    // The invite no longer shows as pending.
    const pending = await owner.get('/users/invites');
    expect(pending.body.invites).toHaveLength(0);

    // Token is single-use.
    const reuse = await request(context.app)
      .post('/auth/invites/accept')
      .send({ token, name: 'Imposter', password: 'password1234' });
    expect(reuse.status).toBe(410);
  });

  it('viewers cannot invite; admins can', async () => {
    context = await createTestApp();
    const { agent: owner, workspace } = await signupAndAuthenticate(context.app);
    const wsId = workspace!.id as string;

    const { agent: viewer } = await createWorkspaceUser(context.app, context.db, {
      workspaceId: wsId,
      role: 'viewer',
    });
    const denied = await viewer
      .post('/users/invites')
      .send({ email: 'x@client.example', role: 'viewer' });
    expect(denied.status).toBe(403);

    const { agent: admin } = await createWorkspaceUser(context.app, context.db, {
      workspaceId: wsId,
      role: 'admin',
    });
    const allowed = await admin
      .post('/users/invites')
      .send({ email: 'y@client.example', role: 'viewer' });
    expect(allowed.status).toBe(201);

    // owner-only sanity: viewer also can't list invites
    const list = await viewer.get('/users/invites');
    expect(list.status).toBe(403);
    void owner;
  });

  it('rejects invites for existing accounts and disallows owner role', async () => {
    context = await createTestApp();
    const { agent: owner, payload } = await signupAndAuthenticate(context.app);

    const existing = await owner
      .post('/users/invites')
      .send({ email: payload.email, role: 'viewer' });
    expect(existing.status).toBe(409);

    const ownerRole = await owner
      .post('/users/invites')
      .send({ email: 'boss@client.example', role: 'owner' });
    expect(ownerRole.status).toBe(400);
  });

  it('revoked and expired invites cannot be previewed or accepted', async () => {
    context = await createTestApp();
    const { agent: owner } = await signupAndAuthenticate(context.app);

    await owner.post('/users/invites').send({ email: 'r@client.example', role: 'viewer' });
    const revokedToken = await tokenFromLastInviteMail();
    const pending = await owner.get('/users/invites');
    const revoke = await owner.post(`/users/invites/${pending.body.invites[0].id}/revoke`);
    expect(revoke.status).toBe(200);

    expect((await request(context.app).get(`/auth/invites/${revokedToken}`)).status).toBe(404);

    await owner.post('/users/invites').send({ email: 'e@client.example', role: 'admin' });
    const expiredToken = await tokenFromLastInviteMail();
    context.db.prepare(`
      UPDATE workspace_invites SET expires_at = datetime('now', '-1 day') WHERE email = 'e@client.example'
    `).run();

    expect((await request(context.app).get(`/auth/invites/${expiredToken}`)).status).toBe(410);
    const accept = await request(context.app)
      .post('/auth/invites/accept')
      .send({ token: expiredToken, name: 'Late', password: 'password1234' });
    expect(accept.status).toBe(410);
  });

  it('re-inviting the same email supersedes the previous pending invite', async () => {
    context = await createTestApp();
    const { agent: owner } = await signupAndAuthenticate(context.app);

    await owner.post('/users/invites').send({ email: 'twice@client.example', role: 'viewer' });
    const firstToken = await tokenFromLastInviteMail();
    await owner.post('/users/invites').send({ email: 'twice@client.example', role: 'admin' });

    const pending = await owner.get('/users/invites');
    expect(pending.body.invites).toHaveLength(1);
    expect(pending.body.invites[0].role).toBe('admin');

    expect((await request(context.app).get(`/auth/invites/${firstToken}`)).status).toBe(404);
  });

  it('viewers cannot mutate sites, funnels, or settings (role-gap regression)', async () => {
    context = await createTestApp();
    const { workspace } = await signupAndAuthenticate(context.app);
    const { agent: viewer } = await createWorkspaceUser(context.app, context.db, {
      workspaceId: workspace!.id as string,
      role: 'viewer',
    });

    const site = await viewer.post('/sites').send({ name: 'Nope', domain: 'https://n.example' });
    expect(site.status).toBe(403);

    const onboarding = await viewer
      .post('/onboarding/sites')
      .send({ name: 'Nope', domain: 'https://n.example' });
    expect(onboarding.status).toBe(403);

    const settings = await viewer.patch('/settings').send({ emailNotificationsEnabled: false });
    expect(settings.status).toBe(403);

    const funnel = await viewer.post('/funnels').send({ name: 'Nope', steps: [] });
    expect(funnel.status).toBe(403);
  });
});
