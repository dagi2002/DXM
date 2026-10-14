import { DEVICES, INSIGHT_NETWORKS, type Device, type InsightNetwork } from '@pulse/contracts';
import { normalizePath } from '@pulse/detectors';
import { VITAL_METRICS, type VitalMetric, type VitalSamples } from './vitals';

/**
 * Pure day aggregation for the rollup job: one site, one UTC day of rows in, rollup rows out.
 * Visit-based numbers count visits that *started* that day; event-based numbers count events
 * that *arrived* that day.
 */

export interface DayVisit {
  id: string;
  entryPath: string | null;
  /** Null while the visit is still open. */
  bounced: boolean | null;
  pageviews: number;
}

export interface DayEvent {
  visitId: string;
  type: string;
  path: string | null;
}

export interface DayVital {
  visitId: string;
  path: string | null;
  name: string;
  value: number;
}

export interface VisitDims {
  device: string;
  network: string | null;
}

export interface SiteDayRollup {
  visits: number;
  pageviews: number;
  closedVisits: number;
  bouncedVisits: number;
  /** Distinct visits with a rage or dead click. */
  frictionVisits: number;
  /** Distinct visits with a JavaScript error. */
  errorVisits: number;
  rageClicks: number;
  deadClicks: number;
  errors: number;
}

export interface PageDayRollup {
  path: string;
  visits: number;
  pageviews: number;
  /** Visits that started on this page and have ended. */
  entries: number;
  bounces: number;
  frictionVisits: number;
  errorVisits: number;
}

/** Page template for grouping: ids collapsed, unknown paths grouped under `(unknown)`. */
export const pageKey = (path: string | null) => normalizePath(path) ?? '(unknown)';

export const toDevice = (d: string): Device =>
  (DEVICES as readonly string[]).includes(d) ? (d as Device) : 'desktop';
/** `slow-2g` folds into `2g`; anything else unknown. */
export function toNetwork(n: string | null): InsightNetwork {
  if (n === 'slow-2g') return '2g';
  return n && (INSIGHT_NETWORKS as readonly string[]).includes(n) ? (n as InsightNetwork) : 'unknown';
}

export function rollupSiteDay(visits: readonly DayVisit[], events: readonly DayEvent[]): SiteDayRollup {
  const friction = new Set<string>();
  const errored = new Set<string>();
  let rage = 0;
  let dead = 0;
  let errors = 0;
  for (const e of events) {
    if (e.type === 'rc') {
      rage += 1;
      friction.add(e.visitId);
    } else if (e.type === 'dc') {
      dead += 1;
      friction.add(e.visitId);
    } else if (e.type === 'er') {
      errors += 1;
      errored.add(e.visitId);
    }
  }
  return {
    visits: visits.length,
    pageviews: visits.reduce((a, v) => a + v.pageviews, 0),
    closedVisits: visits.filter((v) => v.bounced !== null).length,
    bouncedVisits: visits.filter((v) => v.bounced === true).length,
    frictionVisits: friction.size,
    errorVisits: errored.size,
    rageClicks: rage,
    deadClicks: dead,
    errors,
  };
}

export function rollupPagesDay(visits: readonly DayVisit[], events: readonly DayEvent[]): PageDayRollup[] {
  const pages = new Map<
    string,
    {
      visits: Set<string>;
      pageviews: number;
      entries: number;
      bounces: number;
      friction: Set<string>;
      errors: Set<string>;
    }
  >();
  const page = (key: string) => {
    let p = pages.get(key);
    if (!p) {
      p = { visits: new Set(), pageviews: 0, entries: 0, bounces: 0, friction: new Set(), errors: new Set() };
      pages.set(key, p);
    }
    return p;
  };
  for (const e of events) {
    if (e.type === 'pv') {
      const p = page(pageKey(e.path));
      p.pageviews += 1;
      p.visits.add(e.visitId);
    } else if (e.type === 'rc' || e.type === 'dc') {
      page(pageKey(e.path)).friction.add(e.visitId);
    } else if (e.type === 'er') {
      page(pageKey(e.path)).errors.add(e.visitId);
    }
  }
  for (const v of visits) {
    if (v.bounced === null || !v.entryPath) continue;
    const p = page(pageKey(v.entryPath));
    p.entries += 1;
    if (v.bounced) p.bounces += 1;
  }
  return [...pages]
    .map(([path, p]) => ({
      path,
      visits: p.visits.size,
      pageviews: p.pageviews,
      entries: p.entries,
      bounces: p.bounces,
      frictionVisits: p.friction.size,
      errorVisits: p.errors.size,
    }))
    .sort((a, b) => b.pageviews - a.pageviews || a.path.localeCompare(b.path));
}

/** Groups final vital values by metric × device × network × page template. */
export function rollupVitalsDay(
  vitals: readonly DayVital[],
  dims: ReadonlyMap<string, VisitDims>,
): VitalSamples[] {
  const groups = new Map<string, VitalSamples>();
  for (const v of vitals) {
    if (!(VITAL_METRICS as readonly string[]).includes(v.name) || !Number.isFinite(v.value) || v.value < 0)
      continue;
    const d = dims.get(v.visitId);
    const device = toDevice(d?.device ?? 'desktop');
    const network = toNetwork(d?.network ?? null);
    const path = pageKey(v.path);
    const key = `${v.name}\u0000${device}\u0000${network}\u0000${path}`;
    let g = groups.get(key);
    if (!g) {
      g = { metric: v.name as VitalMetric, device, network, path, values: [] };
      groups.set(key, g);
    }
    g.values.push(v.value);
  }
  return [...groups.values()];
}
