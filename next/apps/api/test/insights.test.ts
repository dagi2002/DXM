import { SiteFunnel, SiteInsights, WeekSummary } from '@pulse/contracts';
import { funnelHash, rangeDays } from '@pulse/insights';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Client, adminQuery, createTestContext, resetDatabase, signUp, signUpWithOrg } from './helpers';

const ctx = createTestContext();
beforeEach(resetDatabase);
afterAll(() => ctx.database.close());

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

const { days, previousDays } = rangeDays('7d', new Date());

/** Rollup rows as the worker would have written them (owner role, bypassing RLS). */
async function seedRollups(orgId: string, siteId: string, visitsPerDay = 20, prevVisitsPerDay = 10) {
  for (const [list, n] of [
    [days, visitsPerDay],
    [previousDays, prevVisitsPerDay],
  ] as const) {
    for (const day of list) {
      await adminQuery(
        `insert into rollup_site_day (site_id, org_id, day, visits, pageviews, closed_visits, bounced_visits,
           friction_visits, error_visits, rage_clicks, dead_clicks, errors)
         values ($1, $2, $3, $4, $5, $4, $6, $7, 0, $7, 0, 0)`,
        [siteId, orgId, day, n, n * 2, Math.floor(n / 4), Math.floor(n / 10)],
      );
    }
  }
  await adminQuery(
    `insert into rollup_page_day (site_id, org_id, day, path, visits, pageviews, entries, bounces, friction_visits, error_visits)
     values ($1, $2, $3, '/checkout', 40, 50, 10, 2, 12, 0), ($1, $2, $3, '/', 100, 120, 80, 20, 0, 0)`,
    [siteId, orgId, days.at(-1)],
  );
  await adminQuery(
    `insert into rollup_vitals_day (site_id, org_id, day, metric, device, network, path, values)
     values ($1, $2, $3, 'LCP', 'mobile', '3g', '/checkout', '{4800,5000,5200,5400,5600}'),
            ($1, $2, $3, 'LCP', 'desktop', 'unknown', '/', '{900,1000,1100,1200,1300}'),
            ($1, $2, $4, 'LCP', 'mobile', '4g', '/checkout', '{2000,2100,2200,2300,2400}')`,
    [siteId, orgId, days.at(-1), previousDays[0]],
  );
}

const funnel = {
  name: 'telebirr checkout',
  template: 'telebirr_checkout',
  steps: [
    { label: 'Viewed a product', match: [{ kind: 'path', glob: '/product*' }] },
    { label: 'Started checkout', match: [{ kind: 'path', glob: '/checkout*' }] },
    {
      label: 'Paid',
      match: [
        { kind: 'event', name: 'purchase' },
        { kind: 'path', glob: '*thank*' },
      ],
    },
  ],
};

describe('GET /api/v1/sites/:id/insights', () => {
  it('requires a session', async () => {
    const res = await new Client(ctx.app).get('/api/v1/sites/site_x/insights');
    expect(res.status).toBe(401);
  });

  it('says there is not enough data for a new site, without inventing numbers', async () => {
    const { client, siteId } = await orgWithSite('new@example.et', 'new.et');
    const res = await client.get(`/api/v1/sites/${siteId}/insights`);
    expect(res.status).toBe(200);
    const body = SiteInsights.parse(res.body);
    expect(body).toMatchObject({
      siteId,
      range: '7d',
      from: days[0],
      to: days.at(-1),
      updatedAt: null,
      enoughData: false,
      health: { score: null, previous: null },
      visits: { value: 0, previous: 0, trend: [0, 0, 0, 0, 0, 0, 0] },
      bounce: { value: null, previous: null },
      vitals: { lcp: { p75: null, samples: 0, rating: null } },
      pages: [],
      byDevice: [],
      funnel: null,
    });
  });

  it('serves insights from the rollups, with week-over-week deltas', async () => {
    const { client, orgId, siteId } = await orgWithSite('shop@example.et', 'shop.et');
    await seedRollups(orgId, siteId);
    const res = await client.get(`/api/v1/sites/${siteId}/insights?range=7d`);
    expect(res.status).toBe(200);
    const body = SiteInsights.parse(res.body);
    expect(body.enoughData).toBe(true);
    expect(body.visits).toEqual({ value: 140, previous: 70, trend: [20, 20, 20, 20, 20, 20, 20] });
    expect(body.pageviews).toEqual({ value: 280, previous: 140 });
    expect(body.bounce).toEqual({ value: 35 / 140, previous: 14 / 70 });
    expect(body.frictionRate).toEqual({ value: 14 / 140, previous: 7 / 70 });
    expect(body.vitals.lcp).toEqual({ p75: 5000, previous: 2300, samples: 10, rating: 'poor' });
    expect(body.lcpPhones).toEqual({ p75: 5400, previous: 2300, samples: 5, rating: 'poor' });
    expect(body.byNetwork).toEqual([
      { network: '3g', lcp: 5400, inp: null, cls: null, samples: 5 },
      { network: 'unknown', lcp: 1200, inp: null, cls: null, samples: 5 },
    ]);
    expect(body.pages.map((p) => [p.path, p.need])).toEqual([['/checkout', 32]]);
    expect(body.health.score).toBeLessThan(body.health.previous!);
    expect(body.updatedAt).not.toBeNull();

    const month = SiteInsights.parse((await client.get(`/api/v1/sites/${siteId}/insights?range=30d`)).body);
    expect(month.range).toBe('30d');
    expect(month.visits.trend).toHaveLength(30);
    expect(month.visits.value).toBe(140 + 70);

    const bad = await client.get(`/api/v1/sites/${siteId}/insights?range=90d`);
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('validation_failed');
  });

  it('lists open fixes on their page', async () => {
    const { client, orgId, siteId } = await orgWithSite('fixes@example.et', 'fixes.et');
    await seedRollups(orgId, siteId);
    await adminQuery(
      `insert into issues (id, org_id, site_id, number, kind, fingerprint, severity, status, evidence, first_seen, last_seen)
       values ('iss_1', $1, $2, 1, 'rage_click', 'fp1', 'critical', 'open', '{"path":"/"}', now(), now()),
              ('iss_2', $1, $2, 2, 'dead_click', 'fp2', 'watch', 'fixed', '{"path":"/checkout"}', now(), now())`,
      [orgId, siteId],
    );
    const body = SiteInsights.parse((await client.get(`/api/v1/sites/${siteId}/insights`)).body);
    expect(body.pages.map((p) => [p.path, p.openFixes])).toEqual([
      ['/', { critical: 1, watch: 0 }],
      ['/checkout', { critical: 0, watch: 0 }],
    ]);
  });

  it('isolates tenants: another org’s site is a 404 and its rollups never leak', async () => {
    const a = await orgWithSite('a@example.et', 'a.et');
    const b = await orgWithSite('b@example.et', 'b.et');
    await seedRollups(b.orgId, b.siteId);
    for (const path of [`/api/v1/sites/${b.siteId}/insights`, `/api/v1/sites/${b.siteId}/funnel`]) {
      const res = await a.client.get(path);
      expect(res.status, path).toBe(404);
      expect(res.body.error.code).toBe('not_found');
    }
    expect((await a.client.put(`/api/v1/sites/${b.siteId}/funnel`, funnel)).status).toBe(404);
    expect((await a.client.delete(`/api/v1/sites/${b.siteId}/funnel`)).status).toBe(404);
    // Org A's own site sees none of B's numbers, and B's funnel is untouched.
    const own = SiteInsights.parse((await a.client.get(`/api/v1/sites/${a.siteId}/insights`)).body);
    expect(own.visits.value).toBe(0);
    expect((await adminQuery('select count(*)::int as n from site_funnels')).rows[0]!.n).toBe(0);
    // And the week summary only sums the caller's sites.
    expect(WeekSummary.parse((await a.client.get('/api/v1/insights/week')).body).visits.value).toBe(0);
    expect(WeekSummary.parse((await b.client.get('/api/v1/insights/week')).body).visits.value).toBe(140);
  });

  it('hides deleted sites', async () => {
    const { client, orgId, siteId } = await orgWithSite('del@example.et', 'del.et');
    await seedRollups(orgId, siteId);
    expect((await client.delete(`/api/v1/sites/${siteId}`, { confirmDomain: 'del.et' })).status).toBe(204);
    expect((await client.get(`/api/v1/sites/${siteId}/insights`)).status).toBe(404);
    expect(WeekSummary.parse((await client.get('/api/v1/insights/week')).body).visits.value).toBe(0);
  });
});

describe('funnel config', () => {
  it('saves, reads back, audits, and shows as recomputing until rolled up', async () => {
    const { client, orgId, siteId } = await orgWithSite('funnel@example.et', 'funnel.et');
    await seedRollups(orgId, siteId);
    expect(SiteFunnel.parse((await client.get(`/api/v1/sites/${siteId}/funnel`)).body)).toEqual({
      funnel: null,
      updatedAt: null,
    });

    const put = await client.put(`/api/v1/sites/${siteId}/funnel`, funnel);
    expect(put.status).toBe(200);
    expect(SiteFunnel.parse(put.body)).toEqual({ funnel, updatedAt: expect.any(String) });
    expect(SiteFunnel.parse((await client.get(`/api/v1/sites/${siteId}/funnel`)).body).funnel).toEqual(
      funnel,
    );
    const audit = await adminQuery(`select action, metadata from audit_log where action like 'funnel.%'`);
    expect(audit.rows).toEqual([
      { action: 'funnel.updated', metadata: { template: 'telebirr_checkout', steps: 3 } },
    ]);

    // No funnel rollups yet: the funnel shows up, marked as recomputing, with zero counts.
    let ins = SiteInsights.parse((await client.get(`/api/v1/sites/${siteId}/insights`)).body);
    expect(ins.funnel).toMatchObject({ name: 'telebirr checkout', stale: true, conversion: { value: null } });

    // Once the worker has rolled it up, the counts appear.
    const hash = funnelHash({ steps: funnel.steps as never });
    for (const day of days)
      await adminQuery(
        `insert into rollup_funnel_day (site_id, org_id, day, hash, counts) values ($1, $2, $3, $4, '{10,5,2}')`,
        [siteId, orgId, day, hash],
      );
    ins = SiteInsights.parse((await client.get(`/api/v1/sites/${siteId}/insights`)).body);
    expect(ins.funnel).toMatchObject({
      stale: false,
      steps: [
        { label: 'Viewed a product', count: 70 },
        { label: 'Started checkout', count: 35 },
        { label: 'Paid', count: 14 },
      ],
      worst: 2,
      conversion: { value: 0.2, previous: null },
    });
    const week = WeekSummary.parse((await client.get('/api/v1/insights/week')).body);
    expect(week.conversion).toMatchObject({ value: 0.2, previous: null });

    expect((await client.delete(`/api/v1/sites/${siteId}/funnel`)).status).toBe(204);
    expect(SiteFunnel.parse((await client.get(`/api/v1/sites/${siteId}/funnel`)).body).funnel).toBeNull();
    expect((await client.get(`/api/v1/sites/${siteId}/insights`)).body.funnel).toBeNull();
  });

  it('validates the step list', async () => {
    const { client, siteId } = await orgWithSite('valid@example.et', 'valid.et');
    for (const body of [
      { ...funnel, steps: funnel.steps.slice(0, 1) },
      { ...funnel, template: 'paypal' },
      { ...funnel, steps: [...funnel.steps, { label: 'Bad', match: [{ kind: 'regex', pattern: '.*' }] }] },
      {
        ...funnel,
        steps: [...funnel.steps, { label: 'Stars', match: [{ kind: 'path', glob: '/*a*b*c*d*e*f*g' }] }],
      },
    ]) {
      const res = await client.put(`/api/v1/sites/${siteId}/funnel`, body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('validation_failed');
    }
  });
});

describe('roles', () => {
  it('members read insights and funnels; only managers change funnels; client viewers see nothing', async () => {
    const owner = await orgWithSite('owner@example.et', 'agency.et');
    await seedRollups(owner.orgId, owner.siteId);
    const member = await inviteAndJoin(owner.client, 'dev@example.et', 'member');
    const viewer = await inviteAndJoin(owner.client, 'customer@example.et', 'client_viewer');

    expect((await member.get(`/api/v1/sites/${owner.siteId}/insights`)).status).toBe(200);
    expect((await member.get(`/api/v1/sites/${owner.siteId}/funnel`)).status).toBe(200);
    expect((await member.get('/api/v1/insights/week')).status).toBe(200);
    for (const res of [
      await member.put(`/api/v1/sites/${owner.siteId}/funnel`, funnel),
      await member.delete(`/api/v1/sites/${owner.siteId}/funnel`),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('forbidden');
    }

    for (const res of [
      await viewer.get(`/api/v1/sites/${owner.siteId}/insights`),
      await viewer.get(`/api/v1/sites/${owner.siteId}/funnel`),
      await viewer.put(`/api/v1/sites/${owner.siteId}/funnel`, funnel),
    ])
      expect(res.status).toBe(404);
    expect((await viewer.get('/api/v1/insights/week')).status).toBe(403);
  });

  it('rejects cross-site funnel writes without the CSRF origin', async () => {
    const { client, siteId } = await orgWithSite('csrf@example.et', 'csrf.et');
    const res = await client.request(`/api/v1/sites/${siteId}/funnel`, {
      method: 'PUT',
      body: funnel,
      headers: { origin: 'https://evil.example' },
    });
    expect(res.status).toBe(403);
    expect((await adminQuery('select count(*)::int as n from site_funnels')).rows[0]!.n).toBe(0);
  });
});
