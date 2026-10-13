import { StatusBadge, cx } from '@pulse/ui';
import { FlaskConical, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Severity } from '../lib/sample';

/** Marks anything drawn from the sample dataset, so a demo never passes for real data. */
export function SamplePill({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <span
      title={t('sample.tooltip')}
      className={cx(
        'inline-flex h-6 items-center gap-1.5 rounded-full border border-dashed border-border-strong px-2.5 text-xs font-semibold text-text-muted',
        className,
      )}
    >
      <FlaskConical size={13} aria-hidden="true" />
      {t('sample.label')}
    </span>
  );
}

export function SeverityPill({ severity }: { severity: Severity }) {
  const { t } = useTranslation();
  return (
    <StatusBadge tone={severity === 'critical' ? 'bad' : 'warn'}>{t(`fix.severity.${severity}`)}</StatusBadge>
  );
}

export function AiBox({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('grid gap-2 rounded-md bg-ai-bg p-4', className)}>
      <span className="inline-flex items-center gap-1.5 text-[0.8125rem] font-semibold text-ai">
        <Sparkles size={14} aria-hidden="true" />
        {title}
      </span>
      <div className="text-[0.9375rem] leading-relaxed text-text">{children}</div>
    </div>
  );
}

/** A tiny trend line. Decorative: the number next to it carries the meaning. */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * 200},${32 - ((v - min) / span) * 28}`)
    .join(' ');
  return (
    <svg viewBox="0 0 200 36" width="100%" height="36" aria-hidden="true" className={className}>
      <polyline
        points={points}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Underlined status tab (React Aria Tabs: roving focus, arrows, Home/End, aria-controls). */
export const statusTabClass =
  'inline-flex min-h-11 shrink-0 cursor-default items-center border-b-2 border-transparent px-3.5 text-sm whitespace-nowrap text-text-muted outline-none data-[hovered]:text-text data-[selected]:border-text data-[selected]:font-semibold data-[selected]:text-text data-[focus-visible]:rounded-sm data-[focus-visible]:outline-3 data-[focus-visible]:-outline-offset-3 data-[focus-visible]:outline-primary';
export const tabPanelClass =
  'grid min-w-0 gap-4 rounded-md outline-none data-[focus-visible]:outline-3 data-[focus-visible]:outline-offset-2 data-[focus-visible]:outline-primary';

/** A horizontally scrolling table wrapper: focusable (tabIndex=0) with a visible focus ring. */
export const scrollRegionClass =
  'overflow-x-auto outline-none focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-primary';

const ringTone = (score: number) =>
  score >= 75 ? 'var(--good)' : score >= 50 ? 'var(--warn)' : 'var(--bad)';

/** 0–100 health ring. `size` in px. */
export function HealthRing({ score, size = 64, label }: { score: number; size?: number; label: string }) {
  const r = 27;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={label} className="shrink-0">
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--border)" strokeWidth="7" />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke={ringTone(score)}
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={`${(score / 100) * c} ${c}`}
        transform="rotate(-90 32 32)"
      />
      <text x="32" y="38" textAnchor="middle" fontSize="18" fontWeight="700" fill="currentColor">
        {score}
      </text>
    </svg>
  );
}

export const healthTone = (score: number) => (score >= 75 ? 'good' : score >= 50 ? 'warn' : 'bad');

/**
 * The phone in a replay clip: a wireframe of the checkout page, the cookie banner on top of
 * the pay button, and the rage-tap rings. Purely illustrative until real rrweb replay lands.
 * Semantic tokens only, so the wireframe follows light and dark themes.
 */
export function ReplayPhone({ scale = 1, label }: { scale?: number; label: string }) {
  return (
    <div
      role="img"
      aria-label={label}
      style={{ width: 248 * scale, height: 480 * scale }}
      className="relative shrink-0 overflow-hidden rounded-[16px] bg-bg ring-1 ring-border-strong"
    >
      <div
        style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: 248, height: 480 }}
        className="relative flex flex-col gap-2.5 px-3.5 py-4"
      >
        <div className="flex items-center justify-between">
          <div className="h-3 w-18 rounded bg-text" />
          <div className="h-3 w-6 rounded bg-border" />
        </div>
        <div className="mt-1.5 h-2.5 w-1/2 rounded bg-border" />
        <div className="grid gap-2 rounded-lg border border-border bg-surface p-3">
          <div className="flex justify-between">
            <div className="h-2 w-22 rounded-sm bg-border-strong" />
            <div className="h-2 w-10 rounded-sm bg-border-strong" />
          </div>
          <div className="flex justify-between">
            <div className="h-2 w-18 rounded-sm bg-border-strong" />
            <div className="h-2 w-10 rounded-sm bg-border-strong" />
          </div>
        </div>
        <div className="mt-1.5 grid gap-1.5">
          <div className="h-8.5 rounded-md border border-border bg-surface-sunken" />
          <div className="h-8.5 rounded-md border border-border bg-surface-sunken" />
        </div>
        <div
          className="absolute inset-x-3.5 top-[296px] grid h-10 place-items-center rounded-lg bg-primary text-xs font-semibold text-on-primary"
          lang="en"
        >
          Pay with telebirr
        </div>
        <div className="absolute inset-x-0 bottom-0 grid h-[150px] content-start gap-2.5 bg-border-strong p-3.5">
          <div className="h-2 w-4/5 rounded-sm bg-text-faint" />
          <div className="h-2 w-3/5 rounded-sm bg-text-faint" />
          <div className="h-6.5 w-14 rounded-md bg-text" />
        </div>
        <span className="absolute top-[322px] left-[112px] size-[30px] rounded-full border-2 border-warn bg-warn/25" />
        <span className="absolute top-[314px] left-[104px] size-[46px] rounded-full border-[1.5px] border-warn/50" />
        <span className="absolute top-[296px] left-[150px] rounded bg-bad px-1.5 py-0.5 text-[10px] font-bold text-on-primary">
          ×6
        </span>
      </div>
    </div>
  );
}

/** Section card with a title row and optional note. */
export function Panel({
  title,
  note,
  action,
  children,
  className,
  id,
}: {
  title?: ReactNode;
  note?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section
      aria-labelledby={title && id ? id : undefined}
      className={cx(
        'grid content-start gap-4 rounded-lg border border-border bg-surface p-5 sm:p-6',
        className,
      )}
    >
      {title || action ? (
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="grid gap-1">
            {title ? (
              <h2 id={id} className="text-[1.0625rem] font-semibold">
                {title}
              </h2>
            ) : null}
            {note ? <p className="text-[0.8125rem] text-text-muted">{note}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}
