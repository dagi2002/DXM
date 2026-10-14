import {
  INSIGHTS_MIN_VISITS,
  type FunnelConfig,
  type InsightPage,
  type InsightsRange,
  type SiteInsights,
  type WeekSummary,
} from '@pulse/contracts';
import { DEVICES, NETWORKS } from '@pulse/contracts';
import { rateMetric } from '@pulse/metrics';
import { conversionOf, sumCounts, worstStep } from './funnels';
import { healthParts, healthScore } from './health';
import type { PageDayRollup, SiteDayRollup } from './rollup';
import { collect, p75, roundVital, summarizeVital, vitalsBy, type VitalSamples } from './vitals';

export const RANGE_DAYS: Record<InsightsRange, number> = { '7d': 7, '30d': 30 };
/** "Pages that need you" lists at most this many pages… */
export const PAGES_SHOWN = 5;
/** …each with at least this many visits in the range (or an open fix). */
export const PAGE_MIN_VISITS = 5;
/** Share of a page's visits counted as "had a bad time" when its p75 LCP is poor / needs work. */
export const SLOW_PAGE_WEIGHT = { poor: 0.5, 'needs-work': 0.25, good: 0 } as const;

const DAY_MS = 86_400_000;
export const utcDay = (d: Date) => d.toISOString().slice(0, 10);
export const dayStart = (day: string) => new Date(`${day}T00:00:00.000Z`);

/**
 * The UTC days of a range ending today (today included, so far), and the same number of days
 * before it — the comparison period ("week over week" for 7d).
 */
export function rangeDays(range: InsightsRange, now: Date): { days: string[]; previousDays: string[] } {
  const n = RANGE_DAYS[range];
  const today = dayStart(utcDay(now)).getTime();
  const day = (offset: number) => utcDay(new Date(today - offset * DAY_MS));
  return {
    days: Array.from({ length: n }, (_, i) => day(n - 1 - i)),
    previousDays: Array.from({ length: n }, (_, i) => day(2 * n - 1 - i)),
  };
}

type Dated<T> = T & { day: string };

export interface InsightInputs {
  siteId: string;
  range: InsightsRange;
  days: string[];
  previousDays: string[];
  /** Site-day rollups covering both periods (missing days count as zero). */
  siteDays: Dated<SiteDayRollup>[];
  /** Page-day rollups for the current period. */
  pageDays: Dated<PageDayRollup>[];
  vitals: { current: VitalSamples[]; previous: VitalSamples[] };
  funnel: {
    config: FunnelConfig;
    hash: string;
    days: { day: string; hash: string; counts: number[] }[];
  } | null;
  /** Open (or fixing) fixes with the page template they're on. */
  openFixes: { path: string; severity: 'critical' | 'watch' }[];
  updatedAt: Date | null;
}

const ZERO: SiteDayRollup = {
  visits: 0,
  pageviews: 0,
  closedVisits: 0,
  bouncedVisits: 0,
  frictionVisits: 0,
  errorVisits: 0,
  rageClicks: 0,
  deadClicks: 0,
  errors: 0,
};

export function sumSiteDays(rows: readonly SiteDayRollup[]): SiteDayRollup {
  const out = { ...ZERO };
  for (const r of rows) for (const k of Object.keys(out) as (keyof SiteDayRollup)[]) out[k] += r[k];
  return out;
}

const rate = (part: number, whole: number) => (whole > 0 ? Math.min(1, part / whole) : null);

function periodNumbers(rows: readonly SiteDayRollup[], vitals: readonly VitalSamples[]) {
  const t = sumSiteDays(rows);
  const v = (m: 'LCP' | 'INP' | 'CLS') => {
    const x = p75(collect(vitals, m));
    return x === null ? null : roundVital(m, x);
  };
  const frictionRate = rate(t.frictionVisits, t.visits);
  const errorRate = rate(t.errorVisits, t.visits);
  const health = { visits: t.visits, lcp: v('LCP'), inp: v('INP'), cls: v('CLS'), frictionRate, errorRate };
  return {
    totals: t,
    bounce: rate(t.bouncedVisits, t.closedVisits),
    frictionRate,
    errorRate,
    health,
    score: healthScore(health),
  };
}

/** Ranks page templates by how many visits likely had a bad time there. */
export function rankPages(
  pageDays: readonly PageDayRollup[],
  vitals: readonly VitalSamples[],
  openFixes: InsightInputs['openFixes'],
  limit = PAGES_SHOWN,
): InsightPage[] {
  const byPath = new Map<string, PageDayRollup>();
  for (const r of pageDays) {
    const p = byPath.get(r.path);
    if (!p) byPath.set(r.path, { ...r });
    else
      for (const k of ['visits', 'pageviews', 'entries', 'bounces', 'frictionVisits', 'errorVisits'] as const)
        p[k] += r[k];
  }
  const fixes = new Map<string, { critical: number; watch: number }>();
  for (const f of openFixes) {
    const c = fixes.get(f.path) ?? { critical: 0, watch: 0 };
    c[f.severity] += 1;
    fixes.set(f.path, c);
  }
  return [...byPath.values()]
    .filter((p) => p.path !== '(unknown)')
    .map((p) => {
      const lcpRaw = p75(collect(vitals, 'LCP', (g) => g.path === p.path));
      const lcp = lcpRaw === null ? null : roundVital('LCP', lcpRaw);
      const slow = lcp === null ? 0 : SLOW_PAGE_WEIGHT[rateMetric('lcp', lcp) ?? 'good'];
      const openFix = fixes.get(p.path) ?? { critical: 0, watch: 0 };
      return {
        path: p.path,
        visits: p.visits,
        pageviews: p.pageviews,
        bounce: rate(p.bounces, p.entries),
        lcp,
        frictionVisits: Math.min(p.frictionVisits, p.visits || p.frictionVisits),
        errorVisits: Math.min(p.errorVisits, p.visits || p.errorVisits),
        openFixes: openFix,
        need: Math.round((p.frictionVisits + p.errorVisits + slow * p.visits) * 10) / 10,
      };
    })
    .filter(
      (p) => (p.visits >= PAGE_MIN_VISITS && p.need > 0) || p.openFixes.critical + p.openFixes.watch > 0,
    )
    .sort(
      (a, b) =>
        b.openFixes.critical - a.openFixes.critical ||
        b.need - a.need ||
        b.visits - a.visits ||
        a.path.localeCompare(b.path),
    )
    .slice(0, limit);
}

/**
 * Everything the site Overview shows, from rollups. Pure: the same inputs always give the same
 * insights, which is what lets reports (task 9) freeze a snapshot of it.
 */
export function computeSiteInsights(input: InsightInputs): SiteInsights {
  const inPeriod = (set: readonly string[]) => {
    const s = new Set(set);
    return input.siteDays.filter((r) => s.has(r.day));
  };
  const curRows = inPeriod(input.days);
  const prevRows = inPeriod(input.previousDays);
  const cur = periodNumbers(curRows, input.vitals.current);
  const prev = periodNumbers(prevRows, input.vitals.previous);
  const visitsByDay = new Map(curRows.map((r) => [r.day, r.visits]));
  const phone = (g: VitalSamples) => g.device === 'mobile';

  let funnel: SiteInsights['funnel'] = null;
  if (input.funnel) {
    const { config, hash } = input.funnel;
    const n = config.steps.length;
    const valid = input.funnel.days.filter((d) => d.hash === hash && d.counts.length === n);
    const byDay = new Map(valid.map((d) => [d.day, d.counts]));
    const counts = sumCounts(
      input.days.map((d) => byDay.get(d) ?? []),
      n,
    );
    const prevCounts = sumCounts(
      input.previousDays.map((d) => byDay.get(d) ?? []),
      n,
    );
    const visitedDays = input.days.filter((d) => (visitsByDay.get(d) ?? 0) > 0);
    funnel = {
      name: config.name,
      template: config.template,
      stale:
        input.funnel.days.some((d) => input.days.includes(d.day) && d.hash !== hash) ||
        visitedDays.some((d) => !byDay.has(d)),
      steps: config.steps.map((s, i) => ({ label: s.label, count: counts[i]! })),
      worst: worstStep(counts),
      conversion: { value: conversionOf(counts), previous: conversionOf(prevCounts) },
      trend: input.days.map((d) => conversionOf(byDay.get(d) ?? [])),
    };
  }

  return {
    siteId: input.siteId,
    range: input.range,
    from: input.days[0]!,
    to: input.days.at(-1)!,
    updatedAt: input.updatedAt ? input.updatedAt.toISOString() : null,
    enoughData: cur.totals.visits >= INSIGHTS_MIN_VISITS,
    health: { score: cur.score, previous: prev.score, parts: healthParts(cur.health) },
    visits: {
      value: cur.totals.visits,
      previous: prev.totals.visits,
      trend: input.days.map((d) => visitsByDay.get(d) ?? 0),
    },
    pageviews: { value: cur.totals.pageviews, previous: prev.totals.pageviews },
    bounce: { value: cur.bounce, previous: prev.bounce },
    frictionRate: { value: cur.frictionRate, previous: prev.frictionRate },
    errorRate: { value: cur.errorRate, previous: prev.errorRate },
    vitals: {
      lcp: summarizeVital('LCP', collect(input.vitals.current, 'LCP'), collect(input.vitals.previous, 'LCP')),
      inp: summarizeVital('INP', collect(input.vitals.current, 'INP'), collect(input.vitals.previous, 'INP')),
      cls: summarizeVital('CLS', collect(input.vitals.current, 'CLS'), collect(input.vitals.previous, 'CLS')),
    },
    lcpPhones: summarizeVital(
      'LCP',
      collect(input.vitals.current, 'LCP', phone),
      collect(input.vitals.previous, 'LCP', phone),
    ),
    byDevice: vitalsBy(input.vitals.current, 'device', DEVICES),
    byNetwork: vitalsBy(input.vitals.current, 'network', NETWORKS),
    pages: rankPages(input.pageDays, input.vitals.current, input.openFixes),
    funnel,
  };
}

export interface WeekInputs {
  days: string[];
  previousDays: string[];
  /** Visits per day across all sites (both periods). */
  visitsByDay: Map<string, number>;
  /** Per site with a funnel: valid (current-hash) per-day step counts. */
  funnels: Map<string, number[]>[];
  verified: { thisMonth: number; lastMonth: number };
}

/** Today's "this week" panel across the organization's sites. */
export function computeWeekSummary(input: WeekInputs): WeekSummary {
  const sum = (days: string[]) => days.reduce((a, d) => a + (input.visitsByDay.get(d) ?? 0), 0);
  const ends = (days: string[]) => {
    let first = 0;
    let last = 0;
    for (const f of input.funnels)
      for (const d of days) {
        const c = f.get(d);
        if (!c?.length) continue;
        first += c[0]!;
        last += c.at(-1)!;
      }
    return first ? last / first : null;
  };
  const value = ends(input.days);
  return {
    visits: {
      value: sum(input.days),
      previous: sum(input.previousDays),
      trend: input.days.map((d) => input.visitsByDay.get(d) ?? 0),
    },
    conversion:
      value === null
        ? null
        : { value, previous: ends(input.previousDays), trend: input.days.map((d) => ends([d])) },
    verifiedThisMonth: { value: input.verified.thisMonth, previous: input.verified.lastMonth },
  };
}
