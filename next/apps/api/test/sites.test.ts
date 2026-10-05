import { createDatabase, sites, withOrg } from '@pulse/db';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Client} from './helpers';
import { adminQuery, createTestContext, resetDatabase, signUp, signUpWithOrg, TEST_DATABASE_URL } from './helpers';

const ctx = createTestContext();
beforeEach(resetDatabase);
afterAll(() => ctx.database.close());

const setPlan = (orgId: string, plan: string) =>
  adminQuery(`insert into org_plans (org_id, plan) values ($1, $2) on conflict (org_id) do update set plan = $2`, [orgId, plan]);

describe('sites CRUD', () => {
  it('creates a site with a normalized domain, public key and origins, and lists it', async () => {
    const { client, orgId } = await signUpWithOrg(ctx.app, 'o@example.et');
    const res = await client.post('/api/v1/sites', { name: 'Shop', domain: 'https://WWW.Shop.et/path?x=1', platform: 'woocommerce' });
    expect(res.status).toBe(201);
    expect(res.body.site).toMatchObject({ orgId, name: 'Shop', domain: 'www.shop.et', platform: 'woocommerce', status: 'install', verifiedAt: null });
    expect(res.body.site.id).toMatch(/^site_[0-9A-Za-z]{20}$/);
    expect(res.body.site.publicKey).toMatch(/^pk_[0-9A-Za-z]{22}$/);
    const { rows } = await adminQuery('select allowed_origins from sites where id = $1', [res.body.site.id]);
    expect(rows[0]!.allowed_origins).toEqual(['https://shop.et', 'https://www.shop.et']);
    const list = await client.get('/api/v1/sites');
    expect(list.body.sites.map((s: { id: string }) => s.id)).toEqual([res.body.site.id]);
  });

  it('validates input with the standard error envelope', async () => {
    const { client } = await signUpWithOrg(ctx.app, 'v@example.et');
    const res = await client.post('/api/v1/sites', { name: '', domain: 'localhost' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation_failed');
    expect(res.body.error.requestId).toBeTruthy();
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'domain', message: 'invalid_domain' })]),
    );
  });

  it('enforces the plan site limit with a structured error', async () => {
    const { client } = await signUpWithOrg(ctx.app, 'free@example.et');
    expect((await client.post('/api/v1/sites', { name: 'A', domain: 'a.et' })).status).toBe(201);
    const second = await client.post('/api/v1/sites', { name: 'B', domain: 'b.et' });
    expect(second.status).toBe(409);
    expect(second.body.error).toMatchObject({
      code: 'plan_limit_reached',
      details: { currentPlan: 'free', limitType: 'sites', limit: 1, currentCount: 1 },
    });
  });

  it('rejects duplicate active domains but allows re-adding after delete', async () => {
    const { client, orgId } = await signUpWithOrg(ctx.app, 'dupe@example.et');
    await setPlan(orgId, 'growth');
    const first = await client.post('/api/v1/sites', { name: 'A', domain: 'shop.et' });
    const dupe = await client.post('/api/v1/sites', { name: 'B', domain: 'https://shop.et/' });
    expect(dupe.status).toBe(409);
    expect(dupe.body.error.code).toBe('conflict');
    expect((await client.delete(`/api/v1/sites/${first.body.site.id}`, { confirmDomain: 'shop.et' })).status).toBe(204);
    expect((await client.post('/api/v1/sites', { name: 'Again', domain: 'shop.et' })).status).toBe(201);
  });

  it('updates a site and refreshes allowed origins when the domain changes', async () => {
    const { client } = await signUpWithOrg(ctx.app, 'upd@example.et');
    const { body } = await client.post('/api/v1/sites', { name: 'A', domain: 'old.et' });
    const res = await client.patch(`/api/v1/sites/${body.site.id}`, { name: 'Renamed', domain: 'new.et' });
    expect(res.status).toBe(200);
    expect(res.body.site).toMatchObject({ name: 'Renamed', domain: 'new.et' });
    const { rows } = await adminQuery('select allowed_origins from sites where id = $1', [body.site.id]);
    expect(rows[0]!.allowed_origins).toEqual(['https://new.et', 'https://www.new.et']);
    expect((await client.patch(`/api/v1/sites/${body.site.id}`, {})).status).toBe(400);
  });

  it('requires typing the domain to delete, soft-deletes, and writes audit entries', async () => {
    const { client, orgId } = await signUpWithOrg(ctx.app, 'del@example.et');
    const { body } = await client.post('/api/v1/sites', { name: 'A', domain: 'gone.et' });
    const wrong = await client.delete(`/api/v1/sites/${body.site.id}`, { confirmDomain: 'nope.et' });
    expect(wrong.status).toBe(400);
    expect((await client.delete(`/api/v1/sites/${body.site.id}`, { confirmDomain: 'GONE.et' })).status).toBe(204);
    expect((await client.get(`/api/v1/sites/${body.site.id}`)).status).toBe(404);
    expect((await client.get('/api/v1/sites')).body.sites).toEqual([]);
    const { rows } = await adminQuery('select deleted_at from sites where id = $1', [body.site.id]);
    expect(rows[0]!.deleted_at).not.toBeNull();
    const audit = await adminQuery('select action from audit_log where org_id = $1 order by created_at', [orgId]);
    expect(audit.rows.map((r) => r.action)).toEqual(['site.created', 'site.deleted']);
  });
});

describe('tenant isolation', () => {
  it("never exposes another org's site: 404 on read, update and delete, and absent from lists", async () => {
    const a = await signUpWithOrg(ctx.app, 'a@example.et', 'Org A');
    const b = await signUpWithOrg(ctx.app, 'b@example.et', 'Org B');
    const { body } = await a.client.post('/api/v1/sites', { name: 'A site', domain: 'a-site.et' });
    const id = body.site.id;
    for (const res of [
      await b.client.get(`/api/v1/sites/${id}`),
      await b.client.patch(`/api/v1/sites/${id}`, { name: 'hijack' }),
      await b.client.delete(`/api/v1/sites/${id}`, { confirmDomain: 'a-site.et' }),
    ]) {
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('not_found');
    }
    expect((await b.client.get('/api/v1/sites')).body.sites).toEqual([]);
    expect((await a.client.get(`/api/v1/sites/${id}`)).body.site.name).toBe('A site');
  });

  it('lets each org use the same domain independently', async () => {
    const a = await signUpWithOrg(ctx.app, 'a2@example.et');
    const b = await signUpWithOrg(ctx.app, 'b2@example.et');
    expect((await a.client.post('/api/v1/sites', { name: 'X', domain: 'shared.et' })).status).toBe(201);
    expect((await b.client.post('/api/v1/sites', { name: 'X', domain: 'shared.et' })).status).toBe(201);
  });

  it('enforces isolation in the database itself (RLS), even without WHERE clauses', async () => {
    const a = await signUpWithOrg(ctx.app, 'rls-a@example.et');
    const b = await signUpWithOrg(ctx.app, 'rls-b@example.et');
    await a.client.post('/api/v1/sites', { name: 'A', domain: 'rls-a.et' });
    const appDb = createDatabase(TEST_DATABASE_URL, { max: 1 });
    try {
      expect(await withOrg(appDb.db, b.orgId, (tx) => tx.select().from(sites))).toEqual([]);
      expect(await withOrg(appDb.db, a.orgId, (tx) => tx.select().from(sites))).toHaveLength(1);
      // No org scope at all → nothing.
      expect(await appDb.db.select().from(sites)).toEqual([]);
      // Writing a row for another org is rejected by the policy's WITH CHECK.
      await expect(
        withOrg(appDb.db, b.orgId, (tx) =>
          tx.insert(sites).values({ id: 'site_x', orgId: a.orgId, name: 'x', domain: 'x.et', publicKey: 'pk_x' }),
        ),
      ).rejects.toMatchObject({ cause: { message: expect.stringMatching(/row-level security/) } });
    } finally {
      await appDb.close();
    }
  });
});

describe('roles', () => {
  async function inviteAndJoin(owner: Client, email: string, role: string) {
    const inv = await owner.post('/api/auth/organization/invite-member', { email, role });
    expect(inv.status).toBe(200);
    const id = ctx.mailer.lastTo(email)!.text.match(/accept-invitation\/(\S+)/)![1]!;
    const invitee = await signUp(ctx.app, email);
    const accepted = await invitee.post('/api/auth/organization/accept-invitation', { invitationId: id });
    expect(accepted.status).toBe(200);
    return invitee;
  }

  it('members can read sites but cannot change them; admins can', async () => {
    const owner = await signUpWithOrg(ctx.app, 'boss@example.et', 'Agency');
    await setPlan(owner.orgId, 'agency');
    const { body } = await owner.client.post('/api/v1/sites', { name: 'Client', domain: 'client.et' });
    const memberClient = await inviteAndJoin(owner.client, 'staff@example.et', 'member');
    const adminClient = await inviteAndJoin(owner.client, 'lead@example.et', 'admin');

    const me = await memberClient.get('/api/v1/me');
    expect(me.body.orgs[0]).toMatchObject({ id: owner.orgId, role: 'member' });
    expect(me.body.activeOrgId).toBe(owner.orgId);

    expect((await memberClient.get('/api/v1/sites')).body.sites).toHaveLength(1);
    for (const res of [
      await memberClient.post('/api/v1/sites', { name: 'N', domain: 'n.et' }),
      await memberClient.patch(`/api/v1/sites/${body.site.id}`, { name: 'N' }),
      await memberClient.delete(`/api/v1/sites/${body.site.id}`, { confirmDomain: 'client.et' }),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('forbidden');
    }
    expect((await adminClient.patch(`/api/v1/sites/${body.site.id}`, { name: 'Renamed by admin' })).status).toBe(200);
  });

  it('client viewers see no sites until sites are shared with them', async () => {
    const owner = await signUpWithOrg(ctx.app, 'ag@example.et');
    const { body } = await owner.client.post('/api/v1/sites', { name: 'Client', domain: 'cv.et' });
    const viewer = await inviteAndJoin(owner.client, 'client@example.et', 'client_viewer');
    expect((await viewer.get('/api/v1/sites')).body.sites).toEqual([]);
    expect((await viewer.get(`/api/v1/sites/${body.site.id}`)).status).toBe(404);
  });

  it('role changes and removals apply on the very next request', async () => {
    const owner = await signUpWithOrg(ctx.app, 'own@example.et');
    const staff = await inviteAndJoin(owner.client, 'temp@example.et', 'admin');
    expect((await staff.post('/api/v1/sites', { name: 'S', domain: 's.et' })).status).toBe(201);
    await adminQuery(`update member set role = 'member' where organization_id = $1 and role = 'admin'`, [owner.orgId]);
    expect((await staff.patch('/api/v1/sites/whatever', { name: 'x' })).status).toBe(403);
    await adminQuery(`delete from member where organization_id = $1 and role = 'member'`, [owner.orgId]);
    expect((await staff.get('/api/v1/sites')).status).toBe(403);
  });

  it('only the invited email can accept an invitation', async () => {
    const owner = await signUpWithOrg(ctx.app, 'inv-owner@example.et');
    await owner.client.post('/api/auth/organization/invite-member', { email: 'right@example.et', role: 'member' });
    const id = ctx.mailer.lastTo('right@example.et')!.text.match(/accept-invitation\/(\S+)/)![1]!;
    const intruder = await signUp(ctx.app, 'wrong@example.et');
    const res = await intruder.post('/api/auth/organization/accept-invitation', { invitationId: id });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect((await intruder.get('/api/v1/me')).body.orgs).toEqual([]);
  });
});
