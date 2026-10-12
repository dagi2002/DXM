import type { Locale } from '@pulse/i18n';
import { formatMetric } from '@pulse/metrics';
import { CopyField, EmptyState, PageHeader, Skeleton, buttonClass, cx } from '@pulse/ui';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { CheckCircle2, Download, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { SamplePill } from '../components/pulse';
import { sampleReportsQuery, type Report } from '../lib/sample';
import { Delta } from './today';

function TrendChart({ report, locale }: { report: Report; locale: Locale }) {
  const { t } = useTranslation();
  const W = 800;
  const H = 220;
  const lo = 0.25;
  const hi = 0.45;
  const x = (i: number) => 80 + (i / (report.trend.length - 1)) * 680;
  const y = (v: number) => 190 - ((v - lo) / (hi - lo)) * 140;
  const last = report.trend.at(-1)!;
  const pct = (v: number) => formatMetric('conversion_rate', v, locale);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label={t('report.trendLabel', { values: report.trend.map((p) => pct(p.value)).join(', ') })}
      className="overflow-visible"
    >
      {[lo, 0.35, hi].map((v) => (
        <g key={v}>
          <line x1="40" x2="780" y1={y(v)} y2={y(v)} stroke="var(--border)" />
          <text x="32" y={y(v) + 4} textAnchor="end" fontSize="12" fill="var(--text-muted)">
            {pct(v)}
          </text>
        </g>
      ))}
      <polyline
        points={report.trend.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')}
        fill="none"
        stroke="var(--primary)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {report.trend.map((p, i) =>
        p.fix ? (
          <circle
            key={p.label}
            cx={x(i)}
            cy={y(p.value)}
            r="6"
            fill="var(--good)"
            stroke="var(--surface)"
            strokeWidth="2"
          />
        ) : null,
      )}
      <text
        x={x(report.trend.length - 1)}
        y={y(last.value) - 14}
        textAnchor="end"
        fontSize="14"
        fontWeight="600"
        fill="var(--text)"
      >
        {pct(last.value)}
      </text>
      {report.trend.map((p, i) => (
        <text key={p.label} x={x(i)} y="214" textAnchor="middle" fontSize="12" fill="var(--text-muted)">
          {p.label}
        </text>
      ))}
    </svg>
  );
}

/** The client-facing report. The same view renders inside the app and on the public share link. */
export function ReportView({ report, locale }: { report: Report; locale: Locale }) {
  const { t } = useTranslation();
  return (
    <article className="mx-auto grid w-full max-w-[60rem] gap-10 rounded-xl border border-border bg-surface p-6 sm:p-12 lg:p-16">
      <header className="grid gap-7 border-b border-border pb-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-md border-[1.5px] border-dashed border-border-strong text-[0.625rem] text-text-muted">
              LOGO
            </span>
            <span className="font-semibold">{report.agency}</span>
          </div>
          <span className="text-sm text-text-muted">{t('report.monthly', { period: report.period })}</span>
        </div>
        <div className="grid gap-3.5">
          <span className="text-sm font-semibold text-primary" lang="en">
            {report.site}
          </span>
          <h1 className="max-w-[40rem] font-display text-[clamp(1.875rem,1.2rem+2.4vw,2.875rem)] leading-[1.08] font-bold tracking-[-0.025em] text-balance">
            {report.headline}
          </h1>
          <p className="max-w-[40rem] text-[1.0625rem] leading-relaxed text-text-muted">{report.summary}</p>
        </div>
      </header>

      <section
        aria-label={t('report.results')}
        className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))] gap-6"
      >
        {report.kpis.map((k) => (
          <div key={k.label} className="grid gap-1">
            <span className="text-[0.8125rem] text-text-muted">{k.label}</span>
            <span className="text-[2.125rem] leading-tight font-semibold tracking-[-0.02em] tabular-nums">
              {formatMetric(k.metric, k.value, locale)}
            </span>
            <Delta metric={k.metric} value={k.value} previous={k.previous} locale={locale} />
          </div>
        ))}
      </section>

      <section aria-labelledby="trend-h" className="grid gap-3">
        <h2 id="trend-h" className="text-lg font-semibold">
          {t('report.trend')}
        </h2>
        <p className="text-sm text-text-muted">{t('report.trendNote')}</p>
        <TrendChart report={report} locale={locale} />
      </section>

      <section aria-labelledby="fixed-h">
        <h2 id="fixed-h" className="mb-3 text-lg font-semibold">
          {t('report.fixed')}
        </h2>
        <ul>
          {report.fixed.map((f) => (
            <li
              key={f.title}
              className="flex flex-wrap gap-x-6 gap-y-2 border-t border-border py-4.5 last:border-b"
            >
              <div className="grid min-w-0 flex-[999_1_20rem] gap-1">
                <span className="font-semibold">{f.title}</span>
                <span className="text-sm text-text-muted">{f.measure}</span>
              </div>
              <div className="flex flex-auto items-center gap-2.5 text-[0.9375rem]">
                <span className="text-text-muted">{f.before}</span>
                <span aria-hidden="true">→</span>
                <span className="font-semibold">{f.after}</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-good-bg px-2 py-0.5 text-xs font-semibold text-good">
                  <CheckCircle2 size={12} aria-hidden="true" />
                  {t('fix.status.verified')}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="next-h" className="grid gap-2 rounded-lg bg-surface-sunken p-6">
        <h2 id="next-h" className="text-lg font-semibold">
          {t('report.next')}
        </h2>
        <p className="text-[0.9375rem] leading-relaxed">{report.next}</p>
      </section>

      <footer className="flex flex-wrap justify-between gap-2 text-[0.8125rem] text-text-muted">
        <span>{t('report.preparedBy', { agency: report.agency })}</span>
        <span>{t('report.poweredBy')}</span>
      </footer>
    </article>
  );
}

export function ReportsPage() {
  const { t, i18n } = useTranslation();
  const { data: reports, isLoading } = useQuery(sampleReportsQuery);
  const report = reports?.[0];
  return (
    <>
      <PageHeader
        eyebrow={t('nav.reports')}
        title={t('reports.headline')}
        summary={t('reports.intro')}
        actions={<SamplePill />}
      />
      {isLoading ? (
        <Skeleton className="h-96" />
      ) : !report ? (
        <EmptyState
          icon={<FileText size={22} aria-hidden="true" />}
          title={t('reports.empty')}
          action={
            <Link to="/sites" className={buttonClass()}>
              {t('reports.empty.action')}
            </Link>
          }
        />
      ) : (
        <div className="grid gap-6">
          <section className="grid gap-4 rounded-lg border border-border bg-surface p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="grid gap-0.5">
                <h2 className="text-[1.0625rem] font-semibold">
                  {report.site} · {report.period}
                </h2>
                <p className="text-sm text-text-muted">{t('reports.expires', { date: report.expires })}</p>
              </div>
              <Link
                to="/r/$token"
                params={{ token: report.token }}
                target="_blank"
                className={buttonClass('secondary')}
              >
                {t('reports.openShared')}
              </Link>
            </div>
            <CopyField
              value={`${window.location.origin}/r/${report.token}`}
              label={t('reports.shareLink')}
              copyLabel={t('install.copy')}
              copiedLabel={t('install.copied')}
            />
          </section>
          <div className="rounded-xl bg-surface-sunken p-3 sm:p-6">
            <ReportView report={report} locale={i18n.language as Locale} />
          </div>
        </div>
      )}
    </>
  );
}

/** Public, read-only share link. No sign-in; the agency's report only. */
export function PublicReportPage() {
  const { t, i18n } = useTranslation();
  const { token } = useParams({ strict: false }) as { token: string };
  const { data: reports, isLoading } = useQuery(sampleReportsQuery);
  const report = reports?.find((r) => r.token === token);
  return (
    <div className="min-h-dvh bg-surface-sunken px-3 pt-6 pb-14 sm:px-8">
      <div className="mx-auto mb-4 flex w-full max-w-[60rem] flex-wrap items-center justify-between gap-3">
        <span className="text-[0.8125rem] text-text-muted">
          {report ? t('report.sharedMeta', { date: report.expires }) : ' '}
        </span>
        <div className="flex items-center gap-2 print:hidden">
          <LanguageSwitch />
          <button type="button" onClick={() => window.print()} className={cx(buttonClass('primary'))}>
            <Download size={16} aria-hidden="true" />
            {t('report.download')}
          </button>
        </div>
      </div>
      <main id="main">
        {isLoading ? (
          <Skeleton className="mx-auto h-[40rem] max-w-[60rem]" />
        ) : report ? (
          <ReportView report={report} locale={i18n.language as Locale} />
        ) : (
          <div className="mx-auto max-w-lg py-16">
            <EmptyState title={t('errors.notFound.title')} body={t('report.expired')} />
          </div>
        )}
      </main>
    </div>
  );
}
