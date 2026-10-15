import type { FixKind, ReportSnapshot } from '@pulse/contracts';
import { and, eq, inArray, isNull, issues, lt, organization, sites, sql, type Tx } from '@pulse/db';
import { normalizePath } from '@pulse/detectors';
import { periodRange, previousPeriod } from './period';
import { assembleSnapshot, fixWindows, type FixedIssueInput, type OpenIssueInput } from './snapshot';
import { rawEventsSource, ts, type ReportMetricsSource } from './source';

/** Event type each click-friction fix kind is measured by. Other kinds get no before/after. */
const FRICTION_EVENT: Partial<Record<FixKind, string>> = { rage_click: 'rc', dead_click: 'dc' };

export class ReportSiteGoneError extends Error {
  constructor() {
    super('site not found or deleted');
    this.name = 'ReportSiteGoneError';
  }
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);

/**
 * Friction events of one kind on one element of one page template, in [from, to). Paths are
 * stored raw, so they are normalized the same way the detectors grouped them.
 */
async function frictionCount(
  tx: Tx,
  siteId: string,
  eventType: string,
  path: string,
  selector: string,
  from: Date,
  to: Date,
): Promise<number> {
  if (to <= from) return 0;
  const res = await tx.execute<{ path: string | null }>(sql`
    select path from events
     where site_id = ${siteId} and type = ${eventType} and props->>'s' = ${selector}
       and ts_server >= ${ts(from)} and ts_server < ${ts(to)}`);
  return res.rows.filter((r) => normalizePath(r.path) === path).length;
}

/**
 * Builds the frozen snapshot for one site and month. Runs inside the caller's org-scoped
 * transaction (`withOrg`), so it can only ever read that org's data.
 */
export async function buildReportSnapshot(
  tx: Tx,
  args: { siteId: string; period: string; now: Date },
  source: ReportMetricsSource = rawEventsSource,
): Promise<ReportSnapshot> {
  const { siteId, now } = args;
  const range = periodRange(args.period);
  const prev = periodRange(previousPeriod(args.period));

  const [site] = await tx
    .select({ name: sites.name, domain: sites.domain, orgId: sites.orgId })
    .from(sites)
    .where(and(eq(sites.id, siteId), isNull(sites.deletedAt)))
    .limit(1);
  if (!site) throw new ReportSiteGoneError();
  const [org] = await tx
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, site.orgId))
    .limit(1);

  // A partial month is measured up to now; the previous month is always complete.
  const currentEnd = range.end < now ? range.end : now;
  const [current, previous, bucketVisits] = [
    await source.totals(tx, siteId, range.start, currentEnd),
    await source.totals(tx, siteId, prev.start, prev.end),
    await source.bucketVisits(tx, siteId, range),
  ];

  const fixedRows = await tx
    .select({
      number: issues.number,
      kind: issues.kind,
      status: issues.status,
      evidence: issues.evidence,
      fixedAt: issues.fixedAt,
      verifiedAt: issues.verifiedAt,
    })
    .from(issues)
    .where(
      and(
        eq(issues.siteId, siteId),
        inArray(issues.status, ['fixed', 'verified']),
        sql`${issues.fixedAt} >= ${ts(range.start)}`,
        lt(issues.fixedAt, range.end < now ? range.end : now),
      ),
    );

  const fixed: FixedIssueInput[] = [];
  for (const r of fixedRows) {
    const fixedAt = r.fixedAt!;
    const path = str(r.evidence.path);
    const selector = str(r.evidence.selector);
    const eventType = FRICTION_EVENT[r.kind];
    let beforeCount: number | null = null;
    let afterCount: number | null = null;
    if (eventType && path && selector) {
      const w = fixWindows(fixedAt, now);
      beforeCount = await frictionCount(tx, siteId, eventType, path, selector, w.before.from, w.before.to);
      afterCount = await frictionCount(tx, siteId, eventType, path, selector, w.after.from, w.after.to);
    }
    fixed.push({
      number: r.number,
      kind: r.kind,
      path,
      selector,
      status: r.status as 'fixed' | 'verified',
      fixedAt,
      verifiedAt: r.verifiedAt,
      beforeCount,
      afterCount,
    });
  }

  const openRows = await tx
    .select({
      number: issues.number,
      kind: issues.kind,
      severity: issues.severity,
      evidence: issues.evidence,
    })
    .from(issues)
    .where(and(eq(issues.siteId, siteId), inArray(issues.status, ['open', 'fixing'])));
  const open: OpenIssueInput[] = openRows.map((r) => ({
    number: r.number,
    kind: r.kind,
    path: str(r.evidence.path),
    selector: str(r.evidence.selector),
    severity: r.severity,
    visits: num(r.evidence.visits),
  }));

  return assembleSnapshot({
    range,
    now,
    site: { name: site.name, domain: site.domain },
    agency: org?.name ?? site.name,
    current,
    previous,
    bucketVisits,
    fixed,
    open,
  });
}
