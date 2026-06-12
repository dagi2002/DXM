import React from 'react';
import type { WebVitalMetric, WebVitalName } from '../../../../../packages/contracts/index';

interface Props {
  metric: WebVitalMetric;
}

const UNIT_FORMATTERS: Record<WebVitalName, (v: number) => string> = {
  LCP: (v) => (v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${Math.round(v)}ms`),
  FCP: (v) => (v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${Math.round(v)}ms`),
  TTFB: (v) => (v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${Math.round(v)}ms`),
  INP: (v) => `${Math.round(v)}ms`,
  CLS: (v) => v.toFixed(3),
};

const METRIC_META: Record<
  WebVitalName,
  { label: string; description: string; good: string; poor: string }
> = {
  LCP: {
    label: 'LCP',
    description: 'Largest Contentful Paint',
    good: '≤ 2.5s',
    poor: '> 4.0s',
  },
  INP: {
    label: 'INP',
    description: 'Interaction to Next Paint',
    good: '≤ 200ms',
    poor: '> 500ms',
  },
  CLS: {
    label: 'CLS',
    description: 'Cumulative Layout Shift',
    good: '≤ 0.1',
    poor: '> 0.25',
  },
  FCP: {
    label: 'FCP',
    description: 'First Contentful Paint',
    good: '≤ 1.8s',
    poor: '> 3.0s',
  },
  TTFB: {
    label: 'TTFB',
    description: 'Time to First Byte',
    good: '≤ 800ms',
    poor: '> 1.8s',
  },
};

const STATUS_STYLES: Record<
  WebVitalMetric['status'],
  { border: string; bg: string; ring: string; badge: string; label: string; dot: string }
> = {
  good: {
    border: 'border-emerald-200',
    bg: 'bg-emerald-50',
    ring: 'ring-emerald-100',
    badge: 'bg-emerald-100 text-emerald-700',
    label: 'Good',
    dot: 'bg-emerald-500',
  },
  'needs-improvement': {
    border: 'border-amber-200',
    bg: 'bg-amber-50',
    ring: 'ring-amber-100',
    badge: 'bg-amber-100 text-amber-700',
    label: 'Needs work',
    dot: 'bg-amber-500',
  },
  poor: {
    border: 'border-rose-200',
    bg: 'bg-rose-50',
    ring: 'ring-rose-100',
    badge: 'bg-rose-100 text-rose-700',
    label: 'Poor',
    dot: 'bg-rose-500',
  },
  'insufficient-data': {
    border: 'border-surface-200',
    bg: 'bg-surface-50',
    ring: 'ring-surface-100',
    badge: 'bg-surface-100 text-surface-500',
    label: 'No data',
    dot: 'bg-surface-300',
  },
};

export const VitalGauge: React.FC<Props> = ({ metric }) => {
  const fmt = UNIT_FORMATTERS[metric.name];
  const meta = METRIC_META[metric.name];
  const styles = STATUS_STYLES[metric.status];
  const hasData = metric.status !== 'insufficient-data' && metric.p75 !== null;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border ${styles.border} ${styles.bg} p-4 ring-1 ${styles.ring}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${styles.dot}`} />
            <p className="text-sm font-semibold text-surface-900">{meta.label}</p>
          </div>
          <p className="mt-0.5 text-[11px] text-surface-500">{meta.description}</p>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] ${styles.badge}`}
        >
          {styles.label}
        </span>
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <p className="text-2xl font-bold tabular-nums text-surface-900">
          {hasData ? fmt(metric.p75 ?? 0) : '—'}
        </p>
        <p className="text-[11px] font-medium text-surface-500">p75</p>
      </div>

      {hasData && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-lg bg-white/70 px-2 py-1.5">
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-surface-400">
              p50
            </p>
            <p className="tabular-nums font-semibold text-surface-800">
              {metric.p50 !== null ? fmt(metric.p50) : '—'}
            </p>
          </div>
          <div className="rounded-lg bg-white/70 px-2 py-1.5">
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-surface-400">
              p95
            </p>
            <p className="tabular-nums font-semibold text-surface-800">
              {metric.p95 !== null ? fmt(metric.p95) : '—'}
            </p>
          </div>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between text-[10px] text-surface-500">
        <span className="font-mono">{metric.sampleSize} samples</span>
        <span>
          <span className="text-emerald-600">{meta.good}</span>
          <span className="mx-1 text-surface-300">·</span>
          <span className="text-rose-600">{meta.poor}</span>
        </span>
      </div>
    </div>
  );
};
