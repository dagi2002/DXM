import { Fix, FixDetail, FixList } from '@pulse/contracts';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Client, adminQuery, createTestContext, resetDatabase, signUp, signUpWithOrg } from './helpers';

const ctx = createTestContext();
beforeEach(resetDatabase);
afterAll(() => ctx.database.close());

const evidence = (over: Record<string, unknown> = {}) => ({
  path: '/checkout',
  selector: 'button.pay',
  windowHours: 24,
  visits: 12,
  occurrences: 14,
  clicks: 70,
  maxBurst: 9,
  leftOnPage: 9,
  devices: { desktop: 1, mobile: 11, tablet: 0 },
  topBrowser: { browser: 'Chrome', os: 'Android', visits: 10 },
  sampleVisitIds: ['visit_1', 'visit_2'],
  ...over,
});

let n = 0;
/** Inserts an issue as the owner role, the way the worker would have. */
async function seedIssue(
  orgId: string,
  siteId: string,
  over: { status?: string; severity?: string; kind?: string; lastSeen?: Date; number?: number } = {},
) {
  n += 1;
  const id = `iss_test${String(n).padStart(16, '0')}`;
  await adminQuery(
    `insert into issues (id, org_id, site_id, number, kind, fingerprint, severity, status, evidence, impact, first_seen, last_seen)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      id,
      orgId,
      siteId,
      over.number ?? n,
      over.kind ?? 'rage_click',
      `fp_${n}`,
      over.severity ?? 'watch',
      over.status ?? 'open',
      JSON.stringify(evidence(over.kind === 'dead_click' ? { clicks: undefined, maxBurst: undefined } : {})),
      JSON.stringify({ visitsPerDay: 12, leftPerDay: 9 }),
      new Date('2026-10-12T06:00:00Z'),
      over.lastSeen ?? new Date('2026-10-12T09:00:00Z'),
    ],
  );
  return id;
}

async function orgWithSite(email: string, domain: string) {
  const { client, orgId } = await signUpWithOrg(ctx.app, email);
  const res = await client.post('/api/v1/sites', { name: domain, domain });
  expect(res.status).toBe(201);
  return { client, orgId, siteId: res.body.site.id as string };
}

async function inviteAndJoin(owner: Client, email: string, role: string) {
  const inv = await owner.post('/api/auth/organization/invite-member', { email, role });
  expect(inv.status).toBe(200);
  const id = ctx.mailer.lastTo(email)!.text.match(/accept-invitation\/(\S+)/)![1]!;
  const invitee = await signUp(ctx.app, email);
  expect((await invitee.post('/api/auth/organization/accept-invitation', { invitationId: id })).status).toBe(
    200,
  );
  return invitee;
}

describe('GET /api/v1/fixes', () => {
  it('requires a session', async () => {
    const res = await new Client(ctx.app).get('/api/v1/fixes');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('unauthenticated');
  });

  it('returns an empty feed for a new organization', async () => {
    const { client } = await orgWithSite('new@example.et', 'new.et');
    const res = await client.get('/api/v1/fixes');
    expect(res.status).toBe(200);
    expect(FixList.parse(res.body)).toEqual({ fixes: [] });
  });

  it('lists fixes in contract shape: active first, critical first, then most recent', async () => {
    const { client, orgId, siteId } = await orgWithSite('list@example.et', 'shop.et');
    const watchOld = await seedIssue(orgId, siteId, { lastSeen: new Date('2026-10-12T07:00:00Z') });
    const watchNew = await seedIssue(orgId, siteId, { lastSeen: new Date('2026-10-12T10:00:00Z') });
    const critical = await seedIssue(orgId, siteId, { severity: 'critical' });
    const fixing = await seedIssue(orgId, siteId, { status: 'fixing', severity: 'critical' });
    const dismissed = await seedIssue(orgId, siteId, { status: 'dismissed', kind: 'dead_click' });

    const res = await client.get('/api/v1/fixes');
    expect(res.status).toBe(200);
    const body = FixList.parse(res.body);
    expect(body.fixes.map((f) => f.id)).toEqual([critical, watchNew, watchOld, fixing, dismissed]);
    expect(body.fixes[0]).toEqual({
      id: critical,
      number: expect.any(Number),
      siteId,
      siteName: 'shop.et',
      siteDomain: 'shop.et',
      kind: 'rage_click',
      severity: 'critical',
      status: 'open',
      // Seeded without `type` (a pre-0014 row): read as click evidence.
      evidence: { type: 'click', ...evidence() },
      impact: { visitsPerDay: 12, leftPerDay: 9 },
      verification: null,
      suggestion: null,
      firstSeen: '2026-10-12T06:00:00.000Z',
      lastSeen: '2026-10-12T09:00:00.000Z',
      updatedAt: body.fixes[0]!.updatedAt,
      fixedAt: null,
      verifiedAt: null,
    });
  });

  it('filters by status and site, and validates the query', async () => {
    const { client, orgId, siteId } = await orgWithSite('filter@example.et', 'filter.et');
    await adminQuery(`insert into org_plans (org_id, plan) values ($1, 'growth')`, [orgId]);
    const other = await client.post('/api/v1/sites', { name: 'Two', domain: 'two.et' });
    const open = await seedIssue(orgId, siteId);
    await seedIssue(orgId, siteId, { status: 'fixed' });
    const onOther = await seedIssue(orgId, other.body.site.id);

    const byStatus = await client.get('/api/v1/fixes?status=open');
    expect(byStatus.body.fixes.map((f: Fix) => f.id).sort()).toEqual([open, onOther].sort());
    const bySite = await client.get(`/api/v1/fixes?siteId=${other.body.site.id}`);
    expect(bySite.body.fixes.map((f: Fix) => f.id)).toEqual([onOther]);
    expect((await client.get('/api/v1/fixes?limit=1')).body.fixes).toHaveLength(1);

    const bad = await client.get('/api/v1/fixes?status=solved');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('validation_failed');
  });

  it('hides fixes of deleted sites', async () => {
    const { client, orgId, siteId } = await orgWithSite('del@example.et', 'del.et');
    const id = await seedIssue(orgId, siteId);
    expect((await client.delete(`/api/v1/sites/${siteId}`, { confirmDomain: 'del.et' })).status).toBe(204);
    expect((await client.get('/api/v1/fixes')).body.fixes).toEqual([]);
    expect((await client.get(`/api/v1/fixes/${id}`)).status).toBe(404);
  });
});

describe('GET /api/v1/fixes/:id', () => {
  it('returns the fix with its status history', async () => {
    const { client, orgId, siteId } = await orgWithSite('detail@example.et', 'detail.et');
    const id = await seedIssue(orgId, siteId);
    await adminQuery(
      `insert into issue_events (id, org_id, issue_id, from_status, to_status, reason, created_at)
       values ('ise_1', $1, $2, null, 'open', 'detected', '2026-10-12T06:00:00Z')`,
      [orgId, id],
    );
    expect((await client.patch(`/api/v1/fixes/${id}`, { status: 'fixing' })).status).toBe(200);

    const res = await client.get(`/api/v1/fixes/${id}`);
    expect(res.status).toBe(200);
    const body = FixDetail.parse(res.body);
    expect(body.fix).toMatchObject({ id, status: 'fixing' });
    expect(body.history).toEqual([
      {
        fromStatus: null,
        toStatus: 'open',
        actorUserId: null,
        actorName: null,
        at: '2026-10-12T06:00:00.000Z',
      },
      {
        fromStatus: 'open',
        toStatus: 'fixing',
        actorUserId: expect.any(String),
        actorName: 'detail',
        at: expect.any(String),
      },
    ]);
  });

  it('404s for unknown ids', async () => {
    const { client } = await orgWithSite('unknown@example.et', 'unknown.et');
    const res = await client.get('/api/v1/fixes/iss_doesnotexist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
  });
});

describe('PATCH /api/v1/fixes/:id', () => {
  it('moves a fix through the workflow and stamps fixed/verified times', async () => {
    const { client, orgId, siteId } = await orgWithSite('flow@example.et', 'flow.et');
    const id = await seedIssue(orgId, siteId);

    const fixing = await client.patch(`/api/v1/fixes/${id}`, { status: 'fixing' });
    expect(fixing.status).toBe(200);
    expect(Fix.parse(fixing.body.fix)).toMatchObject({ status: 'fixing', fixedAt: null });

    const fixed = await client.patch(`/api/v1/fixes/${id}`, { status: 'fixed' });
    expect(fixed.body.fix.status).toBe('fixed');
    expect(Date.parse(fixed.body.fix.fixedAt)).toBeGreaterThan(Date.now() - 60_000);

    const verified = await client.patch(`/api/v1/fixes/${id}`, { status: 'verified' });
    expect(verified.body.fix).toMatchObject({ status: 'verified', fixedAt: fixed.body.fix.fixedAt });
    expect(verified.body.fix.verifiedAt).toBeTruthy();

    const reopened = await client.patch(`/api/v1/fixes/${id}`, { status: 'open' });
    expect(reopened.body.fix).toMatchObject({ status: 'open', fixedAt: null, verifiedAt: null });

    const { rows } = await adminQuery(
      'select from_status, to_status, actor_user_id is not null as by_person from issue_events where issue_id = $1 order by created_at',
      [id],
    );
    expect(rows.map((r) => [r.from_status, r.to_status, r.by_person])).toEqual([
      ['open', 'fixing', true],
      ['fixing', 'fixed', true],
      ['fixed', 'verified', true],
      ['verified', 'open', true],
    ]);
  });

  it('rejects transitions that skip the fix, and treats a repeat as a no-op', async () => {
    const { client, orgId, siteId } = await orgWithSite('rules@example.et', 'rules.et');
    const id = await seedIssue(orgId, siteId);
    const skip = await client.patch(`/api/v1/fixes/${id}`, { status: 'verified' });
    expect(skip.status).toBe(409);
    expect(skip.body.error).toMatchObject({ code: 'conflict', details: { from: 'open', to: 'verified' } });

    const same = await client.patch(`/api/v1/fixes/${id}`, { status: 'open' });
    expect(same.status).toBe(200);
    expect((await adminQuery('select count(*)::int as n from issue_events')).rows[0]!.n).toBe(0);
  });

  it('validates the body', async () => {
    const { client, orgId, siteId } = await orgWithSite('body@example.et', 'body.et');
    const id = await seedIssue(orgId, siteId);
    for (const body of [{}, { status: 'solved' }, { status: 1 }]) {
      const res = await client.patch(`/api/v1/fixes/${id}`, body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('validation_failed');
    }
  });

  it('blocks cross-site requests (CSRF)', async () => {
    const { client, orgId, siteId } = await orgWithSite('csrf@example.et', 'csrf.et');
    const id = await seedIssue(orgId, siteId);
    const res = await client.request(`/api/v1/fixes/${id}`, {
      method: 'PATCH',
      body: { status: 'dismissed' },
      headers: { origin: 'https://evil.example' },
    });
    expect(res.status).toBe(403);
  });
});

describe('tenant isolation', () => {
  it('another organization can neither see nor change a fix (404, not 403)', async () => {
    const a = await orgWithSite('a@example.et', 'a-shop.et');
    const b = await orgWithSite('b@example.et', 'b-shop.et');
    const fixA = await seedIssue(a.orgId, a.siteId);
    const fixB = await seedIssue(b.orgId, b.siteId);

    expect((await b.client.get('/api/v1/fixes')).body.fixes.map((f: Fix) => f.id)).toEqual([fixB]);
    expect((await b.client.get(`/api/v1/fixes?siteId=${a.siteId}`)).body.fixes).toEqual([]);
    for (const res of [
      await b.client.get(`/api/v1/fixes/${fixA}`),
      await b.client.patch(`/api/v1/fixes/${fixA}`, { status: 'dismissed' }),
    ]) {
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('not_found');
    }
    const { rows } = await adminQuery('select status from issues where id = $1', [fixA]);
    expect(rows[0]!.status).toBe('open');
    expect((await adminQuery('select count(*)::int as n from issue_events')).rows[0]!.n).toBe(0);
  });
});

describe('roles', () => {
  it('members can work on fixes; client viewers cannot see them', async () => {
    const owner = await orgWithSite('owner@example.et', 'agency.et');
    const id = await seedIssue(owner.orgId, owner.siteId);
    const member = await inviteAndJoin(owner.client, 'dev@example.et', 'member');
    const viewer = await inviteAndJoin(owner.client, 'customer@example.et', 'client_viewer');

    expect((await member.get('/api/v1/fixes')).body.fixes).toHaveLength(1);
    expect((await member.patch(`/api/v1/fixes/${id}`, { status: 'fixing' })).status).toBe(200);

    for (const res of [
      await viewer.get('/api/v1/fixes'),
      await viewer.get(`/api/v1/fixes/${id}`),
      await viewer.patch(`/api/v1/fixes/${id}`, { status: 'dismissed' }),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('forbidden');
    }
  });
});
