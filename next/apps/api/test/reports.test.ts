import { createHash } from 'node:crypto';
import { PublicReport, ReportDetail, ReportList, ReportShareCreated } from '@pulse/contracts';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { redactPath } from '../src/routes/public-reports';
import { createRateLimiter } from '../src/rate-limit';
import { Client, adminQuery, createTestContext, resetDatabase, signUp, signUpWithOrg } from './helpers';

const ctx = createTestContext();
beforeEach(resetDatabase);
afterAll(() => ctx.database.close());

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const at = (s: string) => new Date(s);

async function orgWithSite(email: string, domain: string) {
  const { client, orgId } = await signUpWithOrg(ctx.app, email, `Agency ${domain}`);
  const res = await client.post('/api/v1/sites', { name: `Shop ${domain}`, domain });
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

let seq = 0;
/** Visits as the worker would have stored them (owner role, bypassing RLS). */
async function seedVisits(
  orgId: string,
  siteId: string,
  n: number,
  start: Date,
  opts: { device?: string; bounced?: boolean | null; pageviews?: number } = {},
) {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    seq += 1;
    const id = `v_${seq}`;
    const started = new Date(start.getTime() + i * 3600_000);
    await adminQuery(
      `insert into visits (site_id, id, org_id, started_at, last_seen_at, pageviews, bounced, device)
       values ($1, $2, $3, $4, $4, $5, $6, $7)`,
      [siteId, id, orgId, started, opts.pageviews ?? 2, opts.bounced ?? false, opts.device ?? 'desktop'],
    );
    ids.push(id);
  }
  return ids;
}

async function seedEvent(
  orgId: string,
  siteId: string,
  visitId: string,
  ts: Date,
  type: string,
  path: string,
  props: object,
) {
  await adminQuery(
    `insert into events (org_id, site_id, visit_id, ts_server, type, path, props) values ($1, $2, $3, $4, $5, $6, $7)`,
    [orgId, siteId, visitId, ts, type, path, JSON.stringify(props)],
  );
}

async function seedIssue(
  orgId: string,
  siteId: string,
  number: number,
  over: {
    status?: string;
    severity?: string;
    fixedAt?: Date | null;
    verifiedAt?: Date | null;
    visits?: number;
  },
) {
  await adminQuery(
    `insert into issues (id, org_id, site_id, number, kind, fingerprint, severity, status, evidence, first_seen, last_seen, fixed_at, verified_at)
     values ($1, $2, $3, $4, 'rage_click', $5, $6, $7, $8, $9, $9, $10, $11)`,
    [
      `iss_r${number}_${siteId.slice(-6)}`,
      orgId,
      siteId,
      number,
      `fp_${number}_${siteId}`,
      over.severity ?? 'watch',
      over.status ?? 'open',
      JSON.stringify({
        path: '/checkout',
        selector: `button.n${number}`,
        windowHours: 24,
        visits: over.visits ?? 5,
        occurrences: 9,
        leftOnPage: 2,
        devices: { desktop: 1, mobile: 4, tablet: 0 },
        topBrowser: null,
        sampleVisitIds: [],
      }),
      at('2026-09-02T00:00:00Z'),
      over.fixedAt ?? null,
      over.verifiedAt ?? null,
    ],
  );
}

/** A site with a real September: visits, phone LCP, one verified fix with friction before it, one open. */
async function seedSeptember(orgId: string, siteId: string) {
  const sept = await seedVisits(orgId, siteId, 30, at('2026-09-02T00:00:00Z'));
  const phones = await seedVisits(orgId, siteId, 10, at('2026-09-20T00:00:00Z'), {
    device: 'mobile',
    bounced: true,
    pageviews: 1,
  });
  await seedVisits(orgId, siteId, 20, at('2026-08-05T00:00:00Z'));
  for (const [i, v] of phones.entries()) {
    await seedEvent(orgId, siteId, v, at('2026-09-20T01:00:00Z'), 'vt', '/', { n: 'LCP', v: 2000 + i * 100 });
  }
  await seedIssue(orgId, siteId, 1, {
    status: 'verified',
    fixedAt: at('2026-09-15T00:00:00Z'),
    verifiedAt: at('2026-09-22T00:00:00Z'),
  });
  await seedIssue(orgId, siteId, 2, { status: 'open', severity: 'critical', visits: 12 });
  // 14 rage-click bursts on the fixed button the week before, 1 after (ids collapse to the template).
  for (let i = 0; i < 14; i++) {
    await seedEvent(
      orgId,
      siteId,
      sept[i]!,
      at(`2026-09-${String(8 + (i % 7)).padStart(2, '0')}T10:00:00Z`),
      'rc',
      `/checkout?step=${i}`,
      { s: 'button.n1', n: 4 },
    );
  }
  await seedEvent(orgId, siteId, sept[20]!, at('2026-09-18T10:00:00Z'), 'rc', '/checkout', {
    s: 'button.n1',
    n: 3,
  });
  // Another element on the same page doesn't count.
  await seedEvent(orgId, siteId, sept[21]!, at('2026-09-18T10:00:00Z'), 'rc', '/checkout', {
    s: 'a.other',
    n: 3,
  });
}

async function createReport(client: Client, siteId: string, period = '2026-09') {
  const res = await client.post('/api/v1/reports', { siteId, period });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return ReportDetail.parse(res.body);
}

async function share(client: Client, reportId: string, body: object = {}) {
  const res = await client.post(`/api/v1/reports/${reportId}/shares`, body);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return ReportShareCreated.parse(res.body);
}

const publicGet = (token: string, ip = '203.0.113.7') =>
  new Client(ctx.app).request(`/api/v1/public/reports/${token}`, { headers: { 'x-forwarded-for': ip } });

describe('reports API (authenticated)', () => {
  it('requires a session', async () => {
    const res = await new Client(ctx.app).get('/api/v1/reports');
    expect(res.status).toBe(401);
  });

  it('creates a frozen monthly snapshot with fixes, numbers and trend', async () => {
    const { client, orgId, siteId } = await orgWithSite('make@example.et', 'make.et');
    await seedSeptember(orgId, siteId);

    const { report, shares } = await createReport(client, siteId);
    expect(shares).toEqual([]);
    expect(report).toMatchObject({
      siteId,
      siteName: 'Shop make.et',
      siteDomain: 'make.et',
      period: '2026-09',
      source: 'manual',
      partial: false,
      createdByName: 'make',
      activeShares: 0,
    });
    const s = report.snapshot;
    expect(s.agency).toBe('Agency make.et');
    expect(s.site).toEqual({ name: 'Shop make.et', domain: 'make.et' });
    expect(s.enoughData).toBe(true);
    expect(s.kpis.visits).toEqual({ value: 40, previous: 20 });
    expect(s.kpis.pageviews).toEqual({ value: 70, previous: 40 });
    expect(s.kpis.bounceRate).toEqual({ value: 0.25, previous: 0 });
    // p75 of 2000..2900 on phones.
    expect(s.kpis.lcp).toEqual({ value: 2675, previous: null });
    expect(s.trend.map((p) => p.visits).reduce((a, b) => a + b, 0)).toBe(40);
    expect(s.trend.find((p) => p.start === '2026-09-15')!.fixesShipped).toBe(1);
    expect(s.fixed).toEqual([
      {
        number: 1,
        kind: 'rage_click',
        path: '/checkout',
        selector: 'button.n1',
        status: 'verified',
        fixedAt: '2026-09-15T00:00:00.000Z',
        verifiedAt: '2026-09-22T00:00:00.000Z',
        before: { perDay: 2, days: 7 },
        after: { perDay: 0.1, days: 7 },
      },
    ]);
    expect(s.open).toEqual([
      {
        number: 2,
        kind: 'rage_click',
        path: '/checkout',
        selector: 'button.n2',
        severity: 'critical',
        visits: 12,
      },
    ]);

    // Frozen: new data after the snapshot doesn't change what the report says.
    await seedVisits(orgId, siteId, 5, at('2026-09-25T00:00:00Z'));
    const again = await client.get(`/api/v1/reports/${report.id}`);
    expect(ReportDetail.parse(again.body).report.snapshot).toEqual(s);

    const list = ReportList.parse((await client.get('/api/v1/reports')).body);
    expect(list.reports.map((r) => r.id)).toEqual([report.id]);
    const audit = await adminQuery(`select action from audit_log where target_id = $1`, [report.id]);
    expect(audit.rows.map((r) => r.action)).toEqual(['report.created']);
  });

  it('says when a month has too few visits instead of inventing numbers', async () => {
    const { client, orgId, siteId } = await orgWithSite('thin@example.et', 'thin.et');
    await seedVisits(orgId, siteId, 3, at('2026-09-03T00:00:00Z'));
    const { report } = await createReport(client, siteId);
    expect(report.snapshot.enoughData).toBe(false);
    expect(report.snapshot.kpis.lcp).toEqual({ value: null, previous: null });
    expect(report.snapshot.fixed).toEqual([]);
  });

  it('validates the period and the site, and filters the list by site', async () => {
    const { client, orgId, siteId } = await orgWithSite('val@example.et', 'val.et');
    await adminQuery(`insert into org_plans (org_id, plan) values ($1, 'growth')`, [orgId]);
    const future = await client.post('/api/v1/reports', { siteId, period: '2999-01' });
    expect(future.status).toBe(400);
    expect(future.body.error.details).toEqual([{ path: 'period', message: 'future_period' }]);
    expect((await client.post('/api/v1/reports', { siteId, period: '2026-9' })).status).toBe(400);
    expect((await client.post('/api/v1/reports', { siteId: 'site_nope', period: '2026-09' })).status).toBe(
      404,
    );

    const other = (await client.post('/api/v1/sites', { name: 'Two', domain: 'two.et' })).body.site.id;
    const a = await createReport(client, siteId);
    const b = await createReport(client, other);
    const bySite = ReportList.parse((await client.get(`/api/v1/reports?siteId=${other}`)).body);
    expect(bySite.reports.map((r) => r.id)).toEqual([b.report.id]);
    expect(a.report.id).not.toBe(b.report.id);

    // A deleted site's reports disappear with it.
    expect((await client.delete(`/api/v1/sites/${other}`, { confirmDomain: 'two.et' })).status).toBe(204);
    expect((await client.get(`/api/v1/reports/${b.report.id}`)).status).toBe(404);
  });

  it("isolates tenants: another org's report, site and share ids are 404", async () => {
    const a = await orgWithSite('a@example.et', 'a.et');
    const b = await orgWithSite('b@example.et', 'b.et');
    const { report } = await createReport(a.client, a.siteId);
    const { share: link } = await share(a.client, report.id);

    expect((await b.client.get(`/api/v1/reports/${report.id}`)).status).toBe(404);
    expect((await b.client.post(`/api/v1/reports/${report.id}/shares`, {})).status).toBe(404);
    expect((await b.client.delete(`/api/v1/reports/${report.id}/shares/${link.id}`)).status).toBe(404);
    expect((await b.client.post('/api/v1/reports', { siteId: a.siteId, period: '2026-09' })).status).toBe(
      404,
    );
    expect(ReportList.parse((await b.client.get('/api/v1/reports')).body).reports).toEqual([]);

    // b's own report can't be used to reach a's share either.
    const own = await createReport(b.client, b.siteId);
    expect((await b.client.delete(`/api/v1/reports/${own.report.id}/shares/${link.id}`)).status).toBe(404);
  });

  it('lets members work on reports and keeps client viewers out', async () => {
    const { client: owner, siteId } = await orgWithSite('roles@example.et', 'roles.et');
    const member = await inviteAndJoin(owner, 'mem@example.et', 'member');
    const viewer = await inviteAndJoin(owner, 'view@example.et', 'client_viewer');
    const { report } = await createReport(member, siteId);
    expect((await member.post(`/api/v1/reports/${report.id}/shares`, {})).status).toBe(201);
    for (const res of [
      await viewer.get('/api/v1/reports'),
      await viewer.get(`/api/v1/reports/${report.id}`),
      await viewer.post('/api/v1/reports', { siteId, period: '2026-09' }),
      await viewer.post(`/api/v1/reports/${report.id}/shares`, {}),
    ]) {
      expect(res.status).toBe(403);
    }
  });

  it('blocks cross-site report creation (CSRF guard)', async () => {
    const { siteId } = await orgWithSite('csrf@example.et', 'csrf.et');
    const evil = new Client(ctx.app, 'https://evil.example');
    const res = await evil.post('/api/v1/reports', { siteId, period: '2026-09' });
    expect(res.status).toBe(403);
  });
});

describe('share links', () => {
  it('returns the token once and stores only its SHA-256 hash', async () => {
    const { client, siteId } = await orgWithSite('hash@example.et', 'hash.et');
    const { report } = await createReport(client, siteId);
    const created = await share(client, report.id, { expiresInDays: 7 });
    expect(created.token).toMatch(/^[A-Za-z0-9]{32}$/);
    expect(created.share.active).toBe(true);
    const days = (Date.parse(created.share.expiresAt) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);

    const { rows } = await adminQuery(`select * from report_shares where report_id = $1`, [report.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.token_hash).toBe(sha256(created.token));
    // The plain token appears in no column.
    expect(JSON.stringify(rows[0])).not.toContain(created.token);

    // And it's never handed out again.
    const detail = await client.get(`/api/v1/reports/${report.id}`);
    expect(JSON.stringify(detail.body)).not.toContain(created.token);
    expect(ReportDetail.parse(detail.body).shares).toEqual([created.share]);
    expect(ReportDetail.parse(detail.body).report.activeShares).toBe(1);

    expect((await client.post(`/api/v1/reports/${report.id}/shares`, { expiresInDays: 365 })).status).toBe(
      400,
    );
  });

  it('the database rejects plain tokens in token_hash', async () => {
    const { client, orgId, siteId } = await orgWithSite('ck@example.et', 'ck.et');
    const { report } = await createReport(client, siteId);
    await expect(
      adminQuery(
        `insert into report_shares (id, org_id, report_id, token_hash, expires_at) values ('rsh_x', $1, $2, 'plain-token', now() + interval '1 day')`,
        [orgId, report.id],
      ),
    ).rejects.toThrow(/report_shares_token_hash_ck/);
  });
});

describe('GET /api/v1/public/reports/:token', () => {
  it('returns only the snapshot for a valid token, without a session', async () => {
    const { client, orgId, siteId } = await orgWithSite('pub@example.et', 'pub.et');
    await seedSeptember(orgId, siteId);
    const { report } = await createReport(client, siteId);
    const { token, share: link } = await share(client, report.id);

    const res = await publicGet(token);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-robots-tag')).toContain('noindex');
    const body = PublicReport.parse(res.body);
    expect(body).toEqual({
      report: { period: '2026-09', expiresAt: link.expiresAt, snapshot: report.snapshot },
    });
    // Nothing beyond the snapshot: no ids for the org, site, report or share.
    expect(Object.keys(res.body.report).sort()).toEqual(['expiresAt', 'period', 'snapshot']);
    const raw = JSON.stringify(res.body);
    for (const secret of [orgId, siteId, report.id, link.id]) expect(raw).not.toContain(secret);
  });

  it('rejects an unknown token', async () => {
    for (const token of ['unknownTokenUnknownToken12345678', 'short', 'bad token!', 'x'.repeat(200)]) {
      const res = await publicGet(encodeURIComponent(token));
      expect(res.status, token).toBe(404);
      expect(res.body.error.code).toBe('not_found');
    }
  });

  it('rejects an expired token', async () => {
    const { client, siteId } = await orgWithSite('exp@example.et', 'exp.et');
    const { report } = await createReport(client, siteId);
    const { token, share: link } = await share(client, report.id);
    expect((await publicGet(token)).status).toBe(200);
    await adminQuery(`update report_shares set expires_at = now() - interval '1 second' where id = $1`, [
      link.id,
    ]);
    const res = await publicGet(token);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
    expect(
      ReportDetail.parse((await client.get(`/api/v1/reports/${report.id}`)).body).shares[0]!.active,
    ).toBe(false);
  });

  it('rejects a revoked token', async () => {
    const { client, siteId } = await orgWithSite('rev@example.et', 'rev.et');
    const { report } = await createReport(client, siteId);
    const keep = await share(client, report.id);
    const drop = await share(client, report.id);
    expect((await client.delete(`/api/v1/reports/${report.id}/shares/${drop.share.id}`)).status).toBe(204);
    // Revoking twice is fine.
    expect((await client.delete(`/api/v1/reports/${report.id}/shares/${drop.share.id}`)).status).toBe(204);

    expect((await publicGet(drop.token)).status).toBe(404);
    expect((await publicGet(keep.token)).status).toBe(200);
    const detail = ReportDetail.parse((await client.get(`/api/v1/reports/${report.id}`)).body);
    expect(detail.shares.find((s) => s.id === drop.share.id)).toMatchObject({ active: false });
    expect(detail.report.activeShares).toBe(1);
    const audit = await adminQuery(`select action from audit_log where target_id = $1 order by created_at`, [
      report.id,
    ]);
    expect(audit.rows.map((r) => r.action)).toEqual([
      'report.created',
      'report.shared',
      'report.shared',
      'report.share_revoked',
    ]);
  });

  it("returns only the token's own report", async () => {
    const a = await orgWithSite('own-a@example.et', 'own-a.et');
    const b = await orgWithSite('own-b@example.et', 'own-b.et');
    await seedVisits(a.orgId, a.siteId, 2, at('2026-08-03T00:00:00Z'));
    const augA = await createReport(a.client, a.siteId, '2026-08');
    const sepA = await createReport(a.client, a.siteId, '2026-09');
    const sepB = await createReport(b.client, b.siteId, '2026-09');
    const tAug = (await share(a.client, augA.report.id)).token;
    const tSep = (await share(a.client, sepA.report.id)).token;
    const tB = (await share(b.client, sepB.report.id)).token;

    const got = async (t: string) => PublicReport.parse((await publicGet(t)).body).report;
    expect(await got(tAug)).toMatchObject({ period: '2026-08', snapshot: augA.report.snapshot });
    expect(await got(tSep)).toMatchObject({ period: '2026-09', snapshot: sepA.report.snapshot });
    expect((await got(tB)).snapshot.site.domain).toBe('own-b.et');
    expect((await got(tAug)).snapshot.kpis.visits.value).toBe(2);
  });

  it('stops working once the site is deleted', async () => {
    const { client, siteId } = await orgWithSite('gone@example.et', 'gone.et');
    const { report } = await createReport(client, siteId);
    const { token } = await share(client, report.id);
    expect((await client.delete(`/api/v1/sites/${siteId}`, { confirmDomain: 'gone.et' })).status).toBe(204);
    expect((await publicGet(token)).status).toBe(404);
  });

  it('is rate limited per client IP', async () => {
    const limited = createTestContext();
    try {
      const { client, siteId } = await orgWithSite('rate@example.et', 'rate.et');
      const { token } = await share(client, (await createReport(client, siteId)).report.id);
      const get = (ip: string) =>
        new Client(limited.app).request(`/api/v1/public/reports/${token}`, {
          headers: { 'x-forwarded-for': ip },
        });
      const statuses: number[] = [];
      for (let i = 0; i < 31; i++) statuses.push((await get('198.51.100.1')).status);
      expect(statuses.slice(0, 30).every((s) => s === 200)).toBe(true);
      const blocked = await get('198.51.100.1');
      expect(statuses[30]).toBe(429);
      expect(blocked.status).toBe(429);
      expect(blocked.body.error.code).toBe('rate_limited');
      expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
      // Unknown tokens spend the same budget (no free guessing).
      expect(
        (
          await new Client(limited.app).request('/api/v1/public/reports/guessGuessGuess1', {
            headers: { 'x-forwarded-for': '198.51.100.1' },
          })
        ).status,
      ).toBe(429);
      // Another visitor isn't affected.
      expect((await get('198.51.100.2')).status).toBe(200);
    } finally {
      await limited.database.close();
    }
  });
});

describe('rate limiter and log redaction', () => {
  it('refills over time and bounds memory', () => {
    let now = 0;
    const rl = createRateLimiter({ capacity: 2, refillPerSecond: 1, maxKeys: 3 }, () => now);
    expect([rl.take('a').ok, rl.take('a').ok, rl.take('a').ok]).toEqual([true, true, false]);
    expect(rl.take('a').retryAfter).toBe(1);
    now += 1000;
    expect(rl.take('a').ok).toBe(true);
    for (const k of ['b', 'c', 'd', 'e']) rl.take(k);
    expect(rl.size).toBeLessThanOrEqual(3);
  });

  it('never logs a share token', () => {
    expect(redactPath('/api/v1/public/reports/abcDEF123456789')).toBe('/api/v1/public/reports/:token');
    expect(redactPath('/api/v1/reports/rpt_1')).toBe('/api/v1/reports/rpt_1');
  });
});
