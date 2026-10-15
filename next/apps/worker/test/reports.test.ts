import { ReportSnapshot } from '@pulse/contracts';
import { createDatabase } from '@pulse/db';
import type { Boss } from '@pulse/jobs';
import type { ReportMetricsSource } from '@pulse/reports';
import pg from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { generateMonthlyReport, sweepMonthlyReports } from '../src/reports';

const user = process.env.USER ?? 'postgres';
const APP_DB =
  process.env.TEST_DATABASE_URL ?? 'postgres://pulse_app:pulse_app_dev@localhost:5432/pulse_test';
const ADMIN_DB = process.env.TEST_DATABASE_ADMIN_URL ?? `postgres://${user}@localhost:5432/pulse_test`;
const database = createDatabase(APP_DB, { max: 3 });
afterAll(() => database.close());

async function admin(text: string, values: unknown[] = []) {
  const c = new pg.Client({ connectionString: ADMIN_DB });
  await c.connect();
  try {
    return await c.query(text, values);
  } finally {
    await c.end();
  }
}

const NOW = new Date('2026-10-01T04:23:00Z');

beforeEach(async () => {
  await admin(
    'truncate report_shares, reports, issue_events, issues, events, ingest_dedupe, visits, audit_log, sites, org_plans, invitation, member, organization, verification, account, session, "user" cascade',
  );
  await admin(
    `insert into organization (id, name, slug) values ('org_a','Agency A','org-a'), ('org_b','Agency B','org-b')`,
  );
  await admin(`insert into sites (id, org_id, name, domain, public_key, allowed_origins, status, deleted_at) values
    ('site_a','org_a','Shop A','shop-a.et','pk_a','{}','live', null),
    ('site_quiet','org_a','Quiet','quiet.et','pk_q','{}','live', null),
    ('site_gone','org_a','Gone','gone.et','pk_g','{}','live', now()),
    ('site_b','org_b','Shop B','shop-b.et','pk_b','{}','live', null)`);
  // September visits for a, gone and b; quiet only had visits in August.
  for (const [site, org, day] of [
    ['site_a', 'org_a', '2026-09-03'],
    ['site_a', 'org_a', '2026-09-20'],
    ['site_gone', 'org_a', '2026-09-05'],
    ['site_b', 'org_b', '2026-09-30'],
    ['site_quiet', 'org_a', '2026-08-15'],
  ] as const) {
    await admin(
      `insert into visits (site_id, id, org_id, started_at, last_seen_at, pageviews) values ($1, $2, $3, $4, $4, 3)`,
      [site, `v_${site}_${day}`, org, `${day}T12:00:00Z`],
    );
  }
});

describe('monthly reports', () => {
  it('queues one build per site visited last month, staggered and keyed by site and month', async () => {
    const sent: unknown[] = [];
    const boss = {
      send: async (name: string, data: unknown, options: unknown) => {
        sent.push({ name, data, options });
        return 'job';
      },
    } as unknown as Boss;
    expect(await sweepMonthlyReports(database.db, boss, NOW, () => 0.5)).toEqual({
      period: '2026-09',
      queued: 2,
    });
    expect(sent).toEqual(
      expect.arrayContaining([
        {
          name: 'reports.site',
          data: { siteId: 'site_a', orgId: 'org_a', period: '2026-09' },
          options: { singletonKey: 'site_a:2026-09', startAfter: 1800 },
        },
        {
          name: 'reports.site',
          data: { siteId: 'site_b', orgId: 'org_b', period: '2026-09' },
          options: { singletonKey: 'site_b:2026-09', startAfter: 1800 },
        },
      ]),
    );
    expect(sent).toHaveLength(2);
  });

  it('freezes one automatic report per site and month, idempotently', async () => {
    const first = await generateMonthlyReport(
      database.db,
      { siteId: 'site_a', orgId: 'org_a', period: '2026-09' },
      NOW,
    );
    expect(first.status).toBe('created');
    const again = await generateMonthlyReport(
      database.db,
      { siteId: 'site_a', orgId: 'org_a', period: '2026-09' },
      NOW,
    );
    expect(again).toEqual({ status: 'exists', reportId: first.reportId });

    const { rows } = await admin(`select * from reports`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      org_id: 'org_a',
      site_id: 'site_a',
      period: '2026-09',
      source: 'auto',
      created_by: null,
    });
    const snapshot = ReportSnapshot.parse(rows[0].snapshot);
    expect(snapshot).toMatchObject({ agency: 'Agency A', partial: false, enoughData: false });
    expect(snapshot.kpis.visits).toEqual({ value: 2, previous: 0 });
    expect(snapshot.kpis.pageviews).toEqual({ value: 6, previous: 0 });
  });

  it('skips deleted sites and never reaches across orgs', async () => {
    expect(
      await generateMonthlyReport(
        database.db,
        { siteId: 'site_gone', orgId: 'org_a', period: '2026-09' },
        NOW,
      ),
    ).toEqual({ status: 'site_gone' });
    // A job naming the wrong org sees nothing (RLS), so nothing is written.
    expect(
      await generateMonthlyReport(database.db, { siteId: 'site_b', orgId: 'org_a', period: '2026-09' }, NOW),
    ).toEqual({ status: 'site_gone' });
    expect((await admin(`select count(*)::int as n from reports`)).rows[0].n).toBe(0);
  });

  it('takes its numbers from a pluggable metrics source (for site insights rollups)', async () => {
    const source: ReportMetricsSource = {
      totals: async (_tx, _site, from) => ({
        visits: from.getUTCMonth() === 8 ? 900 : 800,
        pageviews: 2000,
        closedVisits: 800,
        bouncedVisits: 200,
        lcpP75: 2400,
      }),
      bucketVisits: async () => [200, 200, 200, 200, 100],
    };
    const res = await generateMonthlyReport(
      database.db,
      { siteId: 'site_a', orgId: 'org_a', period: '2026-09' },
      NOW,
      source,
    );
    expect(res.status).toBe('created');
    const snapshot = ReportSnapshot.parse((await admin(`select snapshot from reports`)).rows[0].snapshot);
    expect(snapshot.enoughData).toBe(true);
    expect(snapshot.kpis.visits).toEqual({ value: 900, previous: 800 });
    expect(snapshot.kpis.bounceRate.value).toBe(0.25);
    expect(snapshot.trend.map((p) => p.visits)).toEqual([200, 200, 200, 200, 100]);
  });

  it('the period helper refuses silly ranges', async () => {
    await expect(admin(`select * from pulse_report_candidates('2026-09-01', '2026-12-01')`)).rejects.toThrow(
      /out of range/,
    );
  });
});
