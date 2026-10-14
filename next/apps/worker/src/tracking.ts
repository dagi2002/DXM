import {
  TRACKING_BASELINE_DAYS,
  TRACKING_FINGERPRINT,
  detectTrackingBroken,
  trackingResumed,
} from '@pulse/detectors';
import { and, eq, gt, isNull, issues, lt, sites, sql, visits, withOrg, type Db } from '@pulse/db';
import { applyFindings, loadExisting, recordStatus } from './detect';

export interface TrackingSiteResult {
  siteId: string;
  orgId: string;
  created: string[];
  reopened: string[];
  escalated: string[];
  refreshed: number;
  resumed: string[];
}

/** Cross-org: live sites. Runs through a narrow SECURITY DEFINER function (ids only). */
export async function liveSites(db: Db) {
  const res = await db.execute<{ site_id: string; org_id: string }>(
    sql`select site_id, org_id from pulse_live_sites()`,
  );
  return res.rows.map((r) => ({ siteId: r.site_id, orgId: r.org_id }));
}

/**
 * Tracking-broken check for one site, inside its org's scope. Opens (or refreshes) the issue when
 * a live site has been silent far longer than its traffic explains, and marks an open one fixed
 * when data flows again — `issue.verify` then confirms it kept flowing.
 */
export async function checkTracking(
  db: Db,
  site: { siteId: string; orgId: string },
  now: Date = new Date(),
): Promise<TrackingSiteResult> {
  const result: TrackingSiteResult = {
    ...site,
    created: [],
    reopened: [],
    escalated: [],
    refreshed: 0,
    resumed: [],
  };
  return withOrg(db, site.orgId, async (tx) => {
    const [live] = await tx
      .select({ id: sites.id })
      .from(sites)
      .where(and(eq(sites.id, site.siteId), eq(sites.status, 'live'), isNull(sites.deletedAt)))
      .limit(1);
    if (!live) return result;

    const [last] = await tx
      .select({ at: sql<Date | null>`max(${visits.lastSeenAt})`.mapWith((v) => (v ? new Date(v) : null)) })
      .from(visits)
      .where(eq(visits.siteId, site.siteId));
    const lastEventAt = last?.at ?? null;
    let baselineVisits = 0;
    if (lastEventAt) {
      const since = new Date(lastEventAt.getTime() - TRACKING_BASELINE_DAYS * 86_400_000);
      const [row] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(visits)
        .where(
          and(eq(visits.siteId, site.siteId), gt(visits.startedAt, since), lt(visits.startedAt, lastEventAt)),
        );
      baselineVisits = row?.n ?? 0;
    }

    const existing = await loadExisting(tx, site.siteId, 'tracking_broken');
    const current = existing.get(TRACKING_FINGERPRINT);
    const finding = detectTrackingBroken({ now, lastEventAt, baselineVisits });
    if (finding) {
      await applyFindings(tx, site.orgId, site.siteId, [finding], existing, result);
      return result;
    }
    if (
      current &&
      (current.status === 'open' || current.status === 'fixing') &&
      trackingResumed(current.lastSeen, lastEventAt)
    ) {
      await tx
        .update(issues)
        .set({ status: 'fixed', fixedAt: lastEventAt, verifiedAt: null, verification: null })
        .where(and(eq(issues.id, current.id), eq(issues.status, current.status)));
      await recordStatus(tx, site.orgId, current.id, current.status, 'fixed', 'resumed');
      result.resumed.push(current.id);
    }
    return result;
  });
}

/** Runs the tracking check for every live site; returns per-site results that changed something. */
export async function sweepTracking(db: Db, now: Date = new Date()) {
  const out: TrackingSiteResult[] = [];
  for (const site of await liveSites(db)) {
    const r = await checkTracking(db, site, now);
    if (r.created.length || r.reopened.length || r.escalated.length || r.resumed.length) out.push(r);
  }
  return out;
}
