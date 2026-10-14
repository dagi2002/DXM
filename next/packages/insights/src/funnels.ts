import { createHash } from 'node:crypto';
import type { FunnelConfig, FunnelMatcher, FunnelStep } from '@pulse/contracts';
import { globMatch } from './glob';

/** The event fields funnels look at (types: pv, ce, cl, rc, dc, fs, fx). */
export interface FunnelEvent {
  type: string;
  path: string | null;
  props: Record<string, unknown>;
}

/** Event types a funnel rollup needs to load. */
export const FUNNEL_EVENT_TYPES = ['pv', 'ce', 'cl', 'rc', 'dc', 'fs', 'fx'] as const;

const str = (v: unknown) => (typeof v === 'string' ? v : null);

export function matches(m: FunnelMatcher, e: FunnelEvent): boolean {
  switch (m.kind) {
    case 'path':
      return e.type === 'pv' && e.path !== null && globMatch(m.glob, e.path);
    case 'event':
      return e.type === 'ce' && str(e.props.n) === m.name;
    case 'click': {
      const s = str(e.props.s);
      return (
        (e.type === 'cl' || e.type === 'rc' || e.type === 'dc') && s !== null && globMatch(m.selector, s)
      );
    }
    case 'form': {
      if (e.type !== (m.stage === 'start' ? 'fs' : 'fx')) return false;
      const f = str(e.props.f);
      return m.form === undefined || (f !== null && globMatch(m.form, f));
    }
  }
}

const stepMatches = (step: FunnelStep, e: FunnelEvent) => step.match.some((m) => matches(m, e));

/**
 * How many steps one visit reached, in order: a step only counts after the step before it. One
 * event can satisfy at most one step. `events` must be in time order.
 */
export function funnelReach(steps: readonly FunnelStep[], events: readonly FunnelEvent[]): number {
  let reached = 0;
  for (const e of events) {
    if (reached === steps.length) break;
    if (stepMatches(steps[reached]!, e)) reached += 1;
  }
  return reached;
}

/** `counts[i]` = visits that reached step i (so counts never increase along the funnel). */
export function funnelCounts(
  steps: readonly FunnelStep[],
  visits: Iterable<readonly FunnelEvent[]>,
): number[] {
  const counts = steps.map(() => 0);
  for (const events of visits) {
    const r = funnelReach(steps, events);
    for (let i = 0; i < r; i += 1) counts[i]! += 1;
  }
  return counts;
}

/** Index of the step with the biggest drop from the step before; null without any drop. */
export function worstStep(counts: readonly number[]): number | null {
  let worst: number | null = null;
  let worstDrop = 0;
  for (let i = 1; i < counts.length; i += 1) {
    const prev = counts[i - 1]!;
    if (!prev) continue;
    const drop = 1 - counts[i]! / prev;
    if (drop > worstDrop) {
      worstDrop = drop;
      worst = i;
    }
  }
  return worst;
}

/** Last step / first step, or null when nobody entered. */
export function conversionOf(counts: readonly number[]): number | null {
  const first = counts[0] ?? 0;
  return first ? (counts.at(-1) ?? 0) / first : null;
}

/** Stable hash of the step list: rollups made with another step list are recomputed, not mixed. */
export function funnelHash(config: Pick<FunnelConfig, 'steps'>): string {
  const canonical = config.steps.map((s) => s.match.map((m) => Object.entries(m).sort()));
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex').slice(0, 16);
}

/** Adds per-day count arrays together (missing positions count as 0). */
export function sumCounts(rows: readonly (readonly number[])[], length: number): number[] {
  const out = Array.from({ length }, () => 0);
  for (const r of rows) for (let i = 0; i < length; i += 1) out[i]! += r[i] ?? 0;
  return out;
}
