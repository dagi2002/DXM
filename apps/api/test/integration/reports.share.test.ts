import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { signupAndAuthenticate } from '../helpers/auth.js';
import { createWorkspaceUser } from '../helpers/users.js';
import { createTestApp, type ApiTestContext } from '../helpers/testApp.js';

describe('shareable client reports', () => {
  let context: ApiTestContext | null = null;

  afterEach(async () => {
    await context?.cleanup();
    context = null;
  });

  const setup = async () => {
    context = await createTestApp();
    const { agent: owner, workspace } = await signupAndAuthenticate(context.app);
    const site = await owner.post('/sites').send({ name: 'Client A', domain: 'https://a.example' });
    expect(site.status).toBe(201);
    return { owner, siteId: site.body.id as string, workspaceId: workspace!.id as string };
  };

  const tokenFromUrl = (shareUrl: string) => shareUrl.split('/r/')[1];

  it('serves the shared report publicly without auth and without secrets', async () => {
    const { owner, siteId } = await setup();

    const created = await owner.post(`/sites/${siteId}/report-share`).send({});
    expect(created.status).toBe(201);
    expect(created.body.shareUrl).toContain('/r/');
    expect(created.body.share.active).toBe(true);

    const token = tokenFromUrl(created.body.shareUrl);
    const response = await request(context!.app).get(`/public/reports/${token}`);

    expect(response.status).toBe(200);
    expect(response.body.site.name).toBe('Client A');
    expect(response.body.workspaceName).toBeTruthy();
    expect(Array.isArray(response.body.insights)).toBe(true);

    // The security gate: no install secrets, no internal ids.
    expect(response.body.site.siteKey).toBeUndefined();
    expect(response.body.site.snippet).toBeUndefined();
    const raw = JSON.stringify(response.body);
    expect(raw).not.toContain('siteKey');
    expect(raw).not.toContain('workspace_id');
    expect(raw).not.toMatch(/ws_[A-Za-z0-9_-]{16}/);
  });

  it('viewer cannot create a share link; listing shows status', async () => {
    const { owner, siteId, workspaceId } = await setup();

    const { agent: viewer } = await createWorkspaceUser(context!.app, context!.db, {
      workspaceId,
      role: 'viewer',
    });
    const denied = await viewer.post(`/sites/${siteId}/report-share`).send({});
    expect(denied.status).toBe(403);

    await owner.post(`/sites/${siteId}/report-share`).send({ expiresInDays: 7 });
    const list = await owner.get(`/sites/${siteId}/report-shares`);
    expect(list.status).toBe(200);
    expect(list.body.shares).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toContain('/r/'); // tokens are one-time
  });

  it('revocation and expiry both turn the public link into a 404', async () => {
    const { owner, siteId } = await setup();

    const created = await owner.post(`/sites/${siteId}/report-share`).send({});
    const token = tokenFromUrl(created.body.shareUrl);

    const revoke = await owner.post(`/sites/${siteId}/report-shares/${created.body.share.id}/revoke`);
    expect(revoke.status).toBe(200);
    expect((await request(context!.app).get(`/public/reports/${token}`)).status).toBe(404);

    const second = await owner.post(`/sites/${siteId}/report-share`).send({});
    const secondToken = tokenFromUrl(second.body.shareUrl);
    context!.db.prepare(
      "UPDATE report_shares SET expires_at = datetime('now', '-1 day') WHERE id = ?",
    ).run(second.body.share.id);
    expect((await request(context!.app).get(`/public/reports/${secondToken}`)).status).toBe(404);

    expect((await request(context!.app).get('/public/reports/not-a-real-token-aaaa')).status).toBe(404);
  });

  it('a token only ever resolves to its own site', async () => {
    const { owner, siteId } = await setup();
    const siteB = await owner.post('/sites').send({ name: 'Client B', domain: 'https://b.example' });

    const created = await owner.post(`/sites/${siteId}/report-share`).send({});
    const token = tokenFromUrl(created.body.shareUrl);

    const response = await request(context!.app).get(`/public/reports/${token}`);
    expect(response.body.site.id).toBe(siteId);
    expect(response.body.site.id).not.toBe(siteB.body.id);

    // Cross-site revoke attempt 404s (share belongs to site A, not B).
    const crossRevoke = await owner.post(
      `/sites/${siteB.body.id}/report-shares/${created.body.share.id}/revoke`,
    );
    expect(crossRevoke.status).toBe(404);
  });
});
