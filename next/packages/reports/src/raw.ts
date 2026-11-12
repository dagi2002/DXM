import type { FixEvidence, FixKind } from '@pulse/contracts';
import { and, events, gte, inArray, lt, or, sql, visits, type Tx } from '@pulse/db';
import {
  measureIssue,
  type DetectorEvent,
  type DetectorInput,
  type TimeRange,
  type VisitFacts,
} from '@pulse/detectors';

/**
 * Raw-event loading shared by reports, verification and the rollup fallbacks: the events of some
 * types in one or more time ranges ([start, end)), plus the facts about their visits, in the shape
 * the detectors read. Runs inside the caller's org-scoped transaction (RLS applies).
 */
export async function loadDetectorInput(
  tx: Tx,
  siteId: string,
  types: readonly string[],
  ranges: readonly TimeRange[],
): Promise<DetectorInput> {
  const live = ranges.filter((r) => r.end > r.start);
  const hours = live.reduce((a, r) => a + (r.end.getTime() - r.start.getTime()) / 3600_000, 0);
  const now = live.length ? new Date(Math.max(...live.map((r) => r.end.getTime()))) : undefined;
  if (!live.length || !types.length)
    return { events: [], visits: new Map(), windowHours: Math.round(hours), now };
  const rows: DetectorEvent[] = await tx
    .select({
      visitId: events.visitId,
      at: events.tsServer,
      clientAt: events.tsClient,
      type: events.type,
      path: events.path,
      props: events.props,
    })
    .from(events)
    .where(
      and(
        sql`${events.siteId} = ${siteId}`,
        inArray(events.type, [...types]),
        or(...live.map((r) => and(gte(events.tsServer, r.start), lt(events.tsServer, r.end)))),
      ),
    );
  const ids = [...new Set(rows.map((r) => r.visitId))];
  const facts = ids.length
    ? await tx
        .select({
          id: visits.id,
          device: visits.device,
          browser: visits.browser,
          os: visits.os,
          exitPath: visits.exitPath,
          network: visits.network,
          endedAt: visits.endedAt,
        })
        .from(visits)
        .where(and(sql`${visits.siteId} = ${siteId}`, inArray(visits.id, ids)))
    : [];
  return {
    events: rows,
    visits: new Map<string, VisitFacts>(facts.map((v) => [v.id, v])),
    windowHours: Math.round(hours),
    now,
  };
}

/**
 * Event types needed to count the visits a fix's problem *affected* (not its exposure), per kind.
 * Click kinds are counted as friction events instead (see `build.ts`); tracking isn't measured.
 */
export const AFFECTED_EVENT_TYPES: Partial<Record<FixKind, readonly string[]>> = {
  form_abandon: ['fs', 'fx', 'fe'],
  slow_page: ['vt'],
  js_error: ['er'],
  u_turn: ['pv'],
};

/**
 * Visits the problem behind a fix affected in [from, to), counted from raw events exactly the way
 * the detector found it (`measureIssue`): visits that gave up on the form, loaded the page at or
 * over the slow threshold, hit the error, or turned straight back. Null for kinds measured
 * another way.
 */
export async function rawFixAffected(
  tx: Tx,
  siteId: string,
  kind: FixKind,
  evidence: FixEvidence,
  range: TimeRange,
): Promise<number | null> {
  const types = AFFECTED_EVENT_TYPES[kind];
  if (!types) return null;
  if (range.end <= range.start) return 0;
  const input = await loadDetectorInput(tx, siteId, types, [range]);
  return measureIssue(kind, evidence, input).affected;
}
