import { formatDelta, formatMetric, type Locale, type MetricId } from '@pulse/metrics';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cx } from './components';

/**
 * A metric with its change vs the previous period. Formatting and "is up good?" come from
 * @pulse/metrics, so the same number reads the same everywhere (ADR-010).
 */
export function StatTile({
  label,
  metric,
  value,
  previous,
  locale = 'en',
  comparisonLabel,
}: {
  label: string;
  metric: MetricId;
  value: number | null;
  previous?: number | null;
  locale?: Locale;
  comparisonLabel?: string;
}) {
  const delta = value === null ? null : formatDelta(metric, value, previous, locale);
  const Arrow =
    delta?.direction === 'up' ? ArrowUpRight : delta?.direction === 'down' ? ArrowDownRight : Minus;
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <p className="text-xs font-semibold tracking-wide text-text-faint uppercase [:lang(am)_&]:normal-case [:lang(am)_&]:tracking-normal [:lang(am)_&]:text-sm">
        {label}
      </p>
      <p className="mt-1.5 font-display text-3xl font-bold tracking-tight text-text tabular-nums">
        {formatMetric(metric, value, locale)}
      </p>
      {delta ? (
        <p
          className={cx(
            'mt-1 inline-flex items-center gap-1 text-[0.8125rem] font-semibold',
            delta.sentiment === 'good'
              ? 'text-good'
              : delta.sentiment === 'bad'
                ? 'text-bad'
                : 'text-text-muted',
          )}
        >
          <Arrow size={14} aria-hidden="true" />
          <span>
            <span className="sr-only">
              {delta.direction === 'up' ? '+' : delta.direction === 'down' ? '−' : ''}
            </span>
            {delta.text}
          </span>
          {comparisonLabel ? <span className="font-normal text-text-muted">{comparisonLabel}</span> : null}
        </p>
      ) : null}
    </div>
  );
}
