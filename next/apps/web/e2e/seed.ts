import pg from 'pg';

const user = process.env.USER ?? 'postgres';
const E2E_ADMIN_DB = process.env.E2E_DATABASE_ADMIN_URL ?? `postgres://${user}@localhost:5432/pulse_e2e`;

export const SEEDED = {
  lead: 'Visitors tap “button.pay-telebirr” again and again on /checkout',
  form: 'Visitors give up on the “lead” form on /contact',
  fixing: 'A JavaScript error breaks /products/*',
  verified: 'Visitors open /delivery and go straight back',
};

const visitor = (visits: number) => ({
  windowHours: 24,
  leftOnPage: Math.floor(visits / 2),
  devices: { desktop: 1, mobile: visits - 1, tablet: 0 },
  topBrowser: { browser: 'Chrome', os: 'Android', visits: visits - 1 },
  sampleVisitIds: [],
});

/**
 * Seeds real issues for the site at `/sites/<siteId>`, the way the worker's detectors would
 * have written them (the e2e doesn't wait for detection). Returns the issue ids by role.
 */
export async function seedIssues(siteId: string) {
  const db = new pg.Client({ connectionString: E2E_ADMIN_DB });
  await db.connect();
  try {
    const { rows } = await db.query<{ org_id: string }>('select org_id from sites where id = $1', [siteId]);
    const orgId = rows[0]?.org_id;
    if (!orgId) throw new Error(`no site ${siteId}`);
    const now = Date.now();
    const issues = [
      {
        key: 'lead',
        kind: 'rage_click',
        severity: 'critical',
        status: 'open',
        evidence: {
          type: 'click',
          ...visitor(31),
          path: '/checkout',
          selector: 'button.pay-telebirr',
          visits: 31,
          occurrences: 40,
          clicks: 160,
          maxBurst: 9,
        },
        impact: { visitsPerDay: 31, leftPerDay: 15 },
      },
      {
        key: 'form',
        kind: 'form_abandon',
        severity: 'watch',
        status: 'open',
        evidence: {
          type: 'form',
          ...visitor(8),
          path: '/contact',
          form: 'lead',
          visits: 8,
          starts: 12,
          submits: 4,
          abandonRate: 0.667,
          errorFields: [{ field: 'phone', visits: 5, message: 'Invalid number' }],
        },
        impact: { visitsPerDay: 8, leftPerDay: 4 },
      },
      {
        key: 'fixing',
        kind: 'js_error',
        severity: 'watch',
        status: 'fixing',
        evidence: {
          type: 'js_error',
          ...visitor(6),
          path: '/products/*',
          visits: 6,
          message: "Cannot read properties of undefined (reading 'price')",
          source: '/assets/app.js',
          line: 120,
          occurrences: 9,
          pages: [{ path: '/products/*', visits: 6 }],
        },
        impact: { visitsPerDay: 6, leftPerDay: 3 },
      },
      {
        key: 'verified',
        kind: 'u_turn',
        severity: 'watch',
        status: 'verified',
        evidence: {
          type: 'u_turn',
          ...visitor(9),
          path: '/delivery',
          visits: 9,
          uTurns: 11,
          reached: 25,
          rate: 0.36,
          medianSeconds: 3,
          from: [{ path: '/products', visits: 9 }],
        },
        impact: { visitsPerDay: 9, leftPerDay: 0 },
        verification: {
          outcome: 'verified',
          measure: 'rate',
          before: { affected: 9, exposed: 25, value: 0.36 },
          after: { affected: 1, exposed: 30, value: 0.0333 },
          checkedAt: new Date(now - 3600_000).toISOString(),
        },
      },
    ];
    const { rows: max } = await db.query<{ n: number }>(
      'select coalesce(max(number), 0)::int as n from issues where org_id = $1',
      [orgId],
    );
    const ids: Record<string, string> = {};
    let number = max[0]!.n;
    for (const issue of issues) {
      number += 1;
      const id = `iss_e2e${issue.key}${Math.random().toString(36).slice(2, 12)}`;
      ids[issue.key] = id;
      await db.query(
        `insert into issues (id, org_id, site_id, number, kind, fingerprint, severity, status, evidence, impact,
                             first_seen, last_seen, fixed_at, verified_at, verification)
         values ($1, $2, $3, $4, $5, $1, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          id,
          orgId,
          siteId,
          number,
          issue.kind,
          issue.severity,
          issue.status,
          JSON.stringify(issue.evidence),
          JSON.stringify(issue.impact),
          new Date(now - 6 * 3600_000),
          new Date(now - 5 * 60_000),
          issue.status === 'verified' ? new Date(now - 8 * 86_400_000) : null,
          issue.status === 'verified' ? new Date(now - 3600_000) : null,
          issue.verification ? JSON.stringify(issue.verification) : null,
        ],
      );
    }
    return ids as Record<keyof typeof SEEDED, string>;
  } finally {
    await db.end();
  }
}
