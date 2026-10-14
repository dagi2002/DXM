import { canWorkOnReports, REPORT_MIN_VISITS, REPORT_SHARE_DEFAULT_DAYS } from '@pulse/contracts/constants';
import type {
  ReportDetail,
  ReportShare,
  ReportShareCreated,
  ReportSnapshot,
  ReportSummary,
} from '@pulse/contracts';
import { formatDate as formatCalendarDate, type Locale } from '@pulse/i18n';
import { formatMetric, type MetricId } from '@pulse/metrics';
import {
  Banner,
  Button,
  CopyField,
  EmptyState,
  Modal,
  PageHeader,
  Select,
  Skeleton,
  StatusBadge,
  buttonClass,
  cx,
} from '@pulse/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft, CheckCircle2, ChevronRight, Download, FileText, Link2, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { LanguageSwitch } from '../components/LanguageSwitch';
import { api, ApiError } from '../lib/api';
import { sitesQuery, useFormatDate, useMe } from '../lib/queries';
import {
  formatDay,
  formatPeriod,
  publicReportQuery,
  recentPeriods,
  reportQuery,
  reportsQuery,
  useReportText,
} from '../lib/reports';
import { Delta } from './today';

/** A "nice" axis top: 1, 2 or 5 × 10ⁿ at or above the largest value. */
function niceMax(v: number) {
  if (v <= 5) return 5;
  const pow = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 5, 10].map((m) => m * pow).find((m) => m >= v) ?? 10 * pow) as number;
}

/**
 * Visits per week. The SVG draws only lines and dots; every label is HTML positioned over it, so
 * text keeps its real size at 360px and follows the Ethiopic type rules. Screen readers get the
 * same numbers as a table.
 */
function TrendChart({ trend, locale }: { trend: ReportSnapshot['trend']; locale: Locale }) {
  const { t } = useTranslation();
  const W = 800;
  const H = 200;
  const hi = niceMax(Math.max(...trend.map((p) => p.visits), 0));
  const n = trend.length;
  const x = (i: number) => (n === 1 ? W / 2 : 12 + (i / (n - 1)) * (W - 24));
  const y = (v: number) => H - 12 - (v / hi) * (H - 48);
  const left = (px: number) => `calc(${px / W} * 100%)`;
  const top = (px: number) => `calc(${px / H} * 100%)`;
  const last = trend.at(-1)!;
  const fmt = (v: number) => formatMetric('visitors', v, locale);
  const ticks = [0, hi / 2, hi];
  return (
    <>
      <div aria-hidden="true" className="grid gap-2 text-xs text-text-muted tabular-nums">
        <div className="relative pl-12">
          {ticks.map((v) => (
            <span
              key={v}
              className="absolute left-0 w-10 -translate-y-1/2 text-end"
              style={{ top: top(y(v)) }}
            >
              {fmt(v)}
            </span>
          ))}
          <div className="relative">
            <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="block overflow-visible">
              {ticks.map((v) => (
                <line key={v} x1="0" x2={W} y1={y(v)} y2={y(v)} stroke="var(--border)" />
              ))}
              <polyline
                points={trend.map((p, i) => `${x(i)},${y(p.visits)}`).join(' ')}
                fill="none"
                stroke="var(--primary)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              {trend.map((p, i) =>
                p.fixesShipped ? (
                  <circle
                    key={p.start}
                    cx={x(i)}
                    cy={y(p.visits)}
                    r="7"
                    fill="var(--good)"
                    stroke="var(--surface)"
                    strokeWidth="2"
                  />
                ) : null,
              )}
            </svg>
            <span
              className="absolute -translate-x-full -translate-y-full pb-2 text-sm font-semibold text-text"
              style={{ left: left(x(n - 1)), top: top(y(last.visits)) }}
            >
              {fmt(last.visits)}
            </span>
          </div>
        </div>
        <div className="relative ml-12 h-5">
          {trend.map((p, i) => (
            <span
              key={p.start}
              className={cx(
                'absolute whitespace-nowrap',
                n === 1
                  ? '-translate-x-1/2'
                  : i === 0
                    ? ''
                    : i === n - 1
                      ? '-translate-x-full'
                      : '-translate-x-1/2',
                // Every other week on phones, so labels never collide.
                i % 2 === 1 && i !== n - 1 && 'max-sm:hidden',
              )}
              style={{ left: left(x(i)) }}
            >
              {formatDay(p.start, locale)}
            </span>
          ))}
        </div>
      </div>
      <table className="sr-only">
        <caption>{t('report.trendTable')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('report.col.week')}</th>
            <th scope="col">{t('report.kpi.visits')}</th>
            <th scope="col">{t('report.fixLive')}</th>
          </tr>
        </thead>
        <tbody>
          {trend.map((p) => (
            <tr key={p.start}>
              <th scope="row">{formatDay(p.start, locale)}</th>
              <td>{fmt(p.visits)}</td>
              <td>{p.fixesShipped ? '✓' : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

const KPIS: { key: keyof ReportSnapshot['kpis']; metric: MetricId; label: string }[] = [
  { key: 'visits', metric: 'visitors', label: 'report.kpi.visits' },
  { key: 'pageviews', metric: 'pageviews', label: 'report.kpi.pageviews' },
  { key: 'bounceRate', metric: 'bounce_rate', label: 'report.kpi.bounceRate' },
  { key: 'lcp', metric: 'lcp', label: 'report.kpi.lcp' },
];

/** The client-facing report. The same view renders inside the app and on the public share link. */
export function ReportView({
  snapshot,
  embedded = false,
}: {
  snapshot: ReportSnapshot;
  /** Inside the app the page already has an h1, so the report's outline starts one level down. */
  embedded?: boolean;
}) {
  const { t } = useTranslation();
  const text = useReportText();
  const { locale } = text;
  const Title = embedded ? 'h2' : 'h1';
  const Section = embedded ? 'h3' : 'h2';
  const s = snapshot;
  return (
    <article className="mx-auto grid w-full max-w-[60rem] gap-10 rounded-xl border border-border bg-surface p-6 sm:p-12 lg:p-16">
      <header className="grid gap-7 border-b border-border pb-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <span className="font-semibold">{s.agency}</span>
          <span className="text-sm text-text-muted">{t('report.monthly', { period: text.period(s) })}</span>
        </div>
        <div className="grid gap-3.5">
          <span className="text-sm font-semibold text-primary" lang="en">
            {s.site.domain}
          </span>
          <Title className="max-w-[40rem] font-display text-[clamp(1.875rem,1.2rem+2.4vw,2.875rem)] leading-[1.08] font-bold tracking-[-0.025em] text-balance">
            {text.headline(s)}
          </Title>
          <p className="max-w-[40rem] text-[1.0625rem] leading-relaxed text-text-muted">{text.summary(s)}</p>
          {s.partial ? <p className="text-sm font-semibold text-warn">{text.partial(s)}</p> : null}
        </div>
      </header>

      {s.enoughData ? (
        <section
          aria-label={t('report.results')}
          className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,11rem),1fr))] gap-6"
        >
          {KPIS.map(({ key, metric, label }) => {
            const k = s.kpis[key];
            return (
              <div key={key} className="grid content-start gap-1">
                <span className="text-[0.8125rem] text-text-muted">{t(label)}</span>
                {k.value === null ? (
                  <span className="text-[0.9375rem] text-text-muted">{t('report.notMeasured')}</span>
                ) : (
                  <>
                    <span className="text-[2.125rem] leading-tight font-semibold tracking-[-0.02em] tabular-nums">
                      {formatMetric(metric, k.value, locale)}
                    </span>
                    {k.previous !== null ? (
                      <Delta
                        metric={metric}
                        value={k.value}
                        previous={k.previous}
                        locale={locale}
                        suffix={t('report.vsLastMonth')}
                      />
                    ) : null}
                  </>
                )}
              </div>
            );
          })}
        </section>
      ) : (
        <section aria-label={t('report.results')} className="grid gap-1.5 rounded-lg bg-surface-sunken p-6">
          <p className="font-semibold">{t('report.thin.title')}</p>
          <p className="text-[0.9375rem] text-text-muted">
            {t('report.thin.body', { count: s.kpis.visits.value, min: REPORT_MIN_VISITS })}
          </p>
        </section>
      )}

      {s.enoughData && s.trend.length > 1 ? (
        <section aria-labelledby="trend-h" className="grid gap-3">
          <Section id="trend-h" className="text-lg font-semibold">
            {t('report.trend')}
          </Section>
          <p className="text-sm text-text-muted">{t('report.trendNote')}</p>
          <TrendChart trend={s.trend} locale={locale} />
        </section>
      ) : null}

      <section aria-labelledby="fixed-h">
        <Section id="fixed-h" className="mb-3 text-lg font-semibold">
          {t('report.fixed')}
        </Section>
        {s.fixed.length ? (
          <ul>
            {s.fixed.map((f) => (
              <li
                key={f.number}
                className="flex flex-wrap gap-x-6 gap-y-2 border-t border-border py-4.5 last:border-b"
              >
                <div className="grid min-w-0 flex-[999_1_20rem] gap-1">
                  <span className="font-semibold">{text.fixTitle(f)}</span>
                  <span className="text-sm text-text-muted">
                    {text.measure(f)} · {t('report.shipped', { date: text.date(f.fixedAt) })}
                  </span>
                </div>
                <div className="flex flex-auto flex-wrap items-center gap-2.5 text-[0.9375rem]">
                  <span className="text-text-muted">{text.perDay(f.before.perDay)}</span>
                  <span aria-hidden="true">→</span>
                  <span className="sr-only">{t('report.after')}</span>
                  <span className="font-semibold">{text.perDay(f.after.perDay)}</span>
                  <span
                    className={cx(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
                      f.status === 'verified' ? 'bg-good-bg text-good' : 'bg-surface-sunken text-text-muted',
                    )}
                  >
                    {f.status === 'verified' ? <CheckCircle2 size={12} aria-hidden="true" /> : null}
                    {t(`fix.status.${f.status}`)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[0.9375rem] text-text-muted">{t('report.fixed.none')}</p>
        )}
      </section>

      <section aria-labelledby="next-h" className="grid gap-2 rounded-lg bg-surface-sunken p-6">
        <Section id="next-h" className="text-lg font-semibold">
          {t('report.next')}
        </Section>
        {s.open.length ? (
          <ul className="grid list-disc gap-1.5 ps-5 text-[0.9375rem] leading-relaxed">
            {s.open.map((o) => (
              <li key={o.number}>{text.fixTitle(o)}</li>
            ))}
          </ul>
        ) : (
          <p className="text-[0.9375rem] leading-relaxed">{t('report.next.none')}</p>
        )}
      </section>

      <footer className="flex flex-wrap justify-between gap-2 text-[0.8125rem] text-text-muted">
        <span>{t('report.preparedBy', { agency: s.agency })}</span>
        <span>{t('report.poweredBy')}</span>
      </footer>
    </article>
  );
}

/* ── /reports ────────────────────────────────────────────────────────────── */

function CreateReportModal({
  isOpen,
  onOpenChange,
}: {
  isOpen: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const { orgId } = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: sites = [] } = useQuery(sitesQuery(orgId));
  const periods = recentPeriods();
  const [siteId, setSiteId] = useState<string | undefined>();
  const [period, setPeriod] = useState(periods[1]!);
  const chosenSite = siteId ?? sites[0]?.id;
  const create = useMutation({
    mutationFn: (body: { siteId: string; period: string }) => api<ReportDetail>('/reports', { body }),
    onSuccess: async ({ report }) => {
      await qc.invalidateQueries({ queryKey: reportsQuery(orgId).queryKey });
      qc.setQueryData(reportQuery(orgId, report.id).queryKey, { report, shares: [] });
      onOpenChange(false);
      await navigate({ to: '/reports/$reportId', params: { reportId: report.id } });
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (chosenSite) create.mutate({ siteId: chosenSite, period });
  };
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title={t('reports.create')}
      closeLabel={t('common.close')}
    >
      <form onSubmit={submit} className="grid gap-4">
        <p className="text-sm text-text-muted">{t('reports.create.help')}</p>
        <Select
          label={t('reports.create.site')}
          selectedKey={chosenSite}
          onSelectionChange={setSiteId}
          options={sites.map((s) => ({ id: s.id, label: `${s.name} · ${s.domain}` }))}
        />
        <Select
          label={t('reports.create.month')}
          selectedKey={period}
          onSelectionChange={setPeriod}
          options={periods.map((p, i) => ({
            id: p,
            label:
              i === 0
                ? t('reports.create.soFar', { period: formatPeriod(p, i18n.language as Locale) })
                : formatPeriod(p, i18n.language as Locale),
          }))}
        />
        {create.isError ? (
          <Banner
            tone="bad"
            title={
              create.error instanceof ApiError && create.error.code === 'forbidden'
                ? t('errors.forbidden')
                : t('errors.generic.body')
            }
          />
        ) : null}
        <Button
          type="submit"
          isPending={create.isPending}
          pendingLabel={t('reports.create.pending')}
          isDisabled={!chosenSite}
        >
          {t('reports.create.submit')}
        </Button>
      </form>
    </Modal>
  );
}

function ReportRow({ report }: { report: ReportSummary }) {
  const { t, i18n } = useTranslation();
  const formatDate = useFormatDate();
  return (
    <li>
      <Link
        to="/reports/$reportId"
        params={{ reportId: report.id }}
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface p-4 outline-none data-[status=active]:border-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary sm:p-5"
      >
        <div className="grid min-w-0 gap-0.5">
          <span className="font-semibold">
            {report.siteName} · {formatPeriod(report.period, i18n.language as Locale)}
          </span>
          <span className="text-sm text-text-muted">
            {report.source === 'auto'
              ? t('reports.madeAuto', { date: formatDate(report.createdAt) })
              : t('reports.madeBy', {
                  name: report.createdByName ?? '—',
                  date: formatDate(report.createdAt),
                })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {report.partial ? <StatusBadge tone="warn">{t('reports.inProgress')}</StatusBadge> : null}
          {report.activeShares ? (
            <StatusBadge tone="good">{t('reports.activeLinks', { count: report.activeShares })}</StatusBadge>
          ) : null}
          <ChevronRight size={18} aria-hidden="true" className="text-text-muted" />
        </div>
      </Link>
    </li>
  );
}

export function ReportsPage() {
  const { t } = useTranslation();
  const { orgId, role } = useMe();
  const team = canWorkOnReports(role);
  const { data: reports, isLoading } = useQuery({ ...reportsQuery(orgId), enabled: team });
  const { data: sites } = useQuery({ ...sitesQuery(orgId), enabled: team });
  const [creating, setCreating] = useState(false);
  const hasSites = !!sites?.length;
  return (
    <>
      <PageHeader
        eyebrow={t('nav.reports')}
        title={t('reports.headline')}
        summary={t('reports.intro')}
        actions={
          team && hasSites ? (
            <Button onPress={() => setCreating(true)}>
              <Plus size={18} aria-hidden="true" />
              {t('reports.create')}
            </Button>
          ) : null
        }
      />
      {!team ? (
        <EmptyState icon={<FileText size={22} aria-hidden="true" />} title={t('reports.viewerNote')} />
      ) : isLoading ? (
        <Skeleton className="h-48" />
      ) : !reports?.length ? (
        <EmptyState
          icon={<FileText size={22} aria-hidden="true" />}
          title={t('reports.empty')}
          body={hasSites ? t('reports.empty.body') : undefined}
          action={
            hasSites ? (
              <Button onPress={() => setCreating(true)}>{t('reports.create')}</Button>
            ) : (
              <Link to="/sites" className={buttonClass()}>
                {t('reports.empty.action')}
              </Link>
            )
          }
        />
      ) : (
        <ul className="grid gap-3" aria-label={t('reports.list')}>
          {reports.map((r) => (
            <ReportRow key={r.id} report={r} />
          ))}
        </ul>
      )}
      {creating ? <CreateReportModal isOpen={creating} onOpenChange={setCreating} /> : null}
    </>
  );
}

/* ── /reports/$reportId ──────────────────────────────────────────────────── */

const EXPIRY_OPTIONS = [7, 30, 90];

function ShareRow({ share, reportId }: { share: ReportShare; reportId: string }) {
  const { t } = useTranslation();
  const { orgId } = useMe();
  const qc = useQueryClient();
  const formatDate = useFormatDate();
  const revoke = useMutation({
    mutationFn: () => api<void>(`/reports/${reportId}/shares/${share.id}`, { method: 'DELETE' }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: reportQuery(orgId, reportId).queryKey });
      void qc.invalidateQueries({ queryKey: reportsQuery(orgId).queryKey, exact: true });
    },
  });
  const state = share.revokedAt ? 'revoked' : share.active ? 'active' : 'expired';
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-3 first:border-t-0">
      <div className="grid gap-0.5 text-sm">
        <span className="font-semibold">
          {t('reports.share.made', { date: formatDate(share.createdAt) })}
        </span>
        <span className="text-text-muted">
          {state === 'revoked'
            ? t('reports.share.revokedOn', { date: formatDate(share.revokedAt!) })
            : t(state === 'active' ? 'reports.expires' : 'reports.share.expiredOn', {
                date: formatDate(share.expiresAt),
              })}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge tone={state === 'active' ? 'good' : state === 'expired' ? 'warn' : 'bad'}>
          {t(`reports.share.${state}`)}
        </StatusBadge>
        {state === 'active' ? (
          <Button
            variant="danger-ghost"
            size="sm"
            onPress={() => revoke.mutate()}
            isPending={revoke.isPending}
            pendingLabel={t('reports.share.revoking')}
          >
            {t('reports.share.revoke')}
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function SharePanel({ detail }: { detail: ReportDetail }) {
  const { t } = useTranslation();
  const { orgId } = useMe();
  const qc = useQueryClient();
  const [days, setDays] = useState(String(REPORT_SHARE_DEFAULT_DAYS));
  const [created, setCreated] = useState<ReportShareCreated | null>(null);
  const reportId = detail.report.id;
  const create = useMutation({
    mutationFn: () =>
      api<ReportShareCreated>(`/reports/${reportId}/shares`, { body: { expiresInDays: Number(days) } }),
    onSuccess: (res) => {
      setCreated(res);
      void qc.invalidateQueries({ queryKey: reportQuery(orgId, reportId).queryKey });
      void qc.invalidateQueries({ queryKey: reportsQuery(orgId).queryKey, exact: true });
    },
  });
  const url = created ? `${window.location.origin}/r/${created.token}` : null;
  const stillActive = created && detail.shares.find((s) => s.id === created.share.id)?.active !== false;
  return (
    <section
      aria-labelledby="share-h"
      className="grid gap-4 rounded-lg border border-border bg-surface p-5 sm:p-6"
    >
      <div className="grid gap-1">
        <h2 id="share-h" className="text-[1.0625rem] font-semibold">
          {t('reports.share.title')}
        </h2>
        <p className="text-sm text-text-muted">{t('reports.share.help')}</p>
      </div>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Select
          label={t('reports.share.expiry')}
          selectedKey={days}
          onSelectionChange={setDays}
          options={EXPIRY_OPTIONS.map((d) => ({
            id: String(d),
            label: t('reports.share.days', { count: d }),
          }))}
          className="min-w-48"
        />
        <Button
          type="submit"
          variant="secondary"
          isPending={create.isPending}
          pendingLabel={t('reports.share.creating')}
        >
          <Link2 size={16} aria-hidden="true" />
          {t('reports.share.create')}
        </Button>
      </form>
      {create.isError ? <Banner tone="bad" title={t('errors.generic.body')} /> : null}
      {url && stillActive ? (
        <div className="grid gap-3 rounded-md bg-surface-sunken p-4">
          <CopyField
            value={url}
            label={t('reports.shareLink')}
            copyLabel={t('install.copy')}
            copiedLabel={t('install.copied')}
          />
          <p className="text-[0.8125rem] text-text-muted">{t('reports.share.once')}</p>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className={buttonClass('secondary', 'sm', 'justify-self-start')}
          >
            {t('reports.openShared')}
            <span className="sr-only"> {t('common.newTab')}</span>
          </a>
        </div>
      ) : null}
      {detail.shares.length ? (
        <ul aria-label={t('reports.share.list')}>
          {detail.shares.map((s) => (
            <ShareRow key={s.id} share={s} reportId={reportId} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function ReportPage() {
  const { t, i18n } = useTranslation();
  const { orgId } = useMe();
  const { reportId } = useParams({ strict: false }) as { reportId: string };
  const { data, isLoading, error } = useQuery({
    ...reportQuery(orgId, reportId),
    retry: (n, err) => !(err instanceof ApiError && err.status < 500) && n < 2,
  });
  const formatDate = useFormatDate();
  const back = (
    <Link to="/reports" className={buttonClass('ghost', 'sm', '-ms-3 mb-2')}>
      <ArrowLeft size={16} aria-hidden="true" />
      {t('reports.back')}
    </Link>
  );
  if (isLoading) return <Skeleton className="h-96" />;
  if (!data) {
    return (
      <>
        {back}
        <EmptyState
          title={t('errors.notFound.title')}
          body={
            error instanceof ApiError && error.status === 404
              ? t('reports.notFound')
              : t('errors.generic.body')
          }
        />
      </>
    );
  }
  const r = data.report;
  return (
    <>
      {back}
      <PageHeader
        eyebrow={t('nav.reports')}
        title={`${r.siteName} · ${formatPeriod(r.period, i18n.language as Locale)}`}
        summary={
          r.source === 'auto'
            ? t('reports.madeAuto', { date: formatDate(r.createdAt) })
            : t('reports.madeBy', { name: r.createdByName ?? '—', date: formatDate(r.createdAt) })
        }
      />
      <div className="grid gap-6">
        <SharePanel detail={data} />
        <div className="rounded-xl bg-surface-sunken p-3 sm:p-6">
          <ReportView snapshot={r.snapshot} embedded />
        </div>
      </div>
    </>
  );
}

/* ── /r/$token ───────────────────────────────────────────────────────────── */

/** Public, read-only share link. No sign-in; that one report only. */
export function PublicReportPage() {
  const { t, i18n } = useTranslation();
  const { token } = useParams({ strict: false }) as { token: string };
  const { data: report, isLoading, isError } = useQuery(publicReportQuery(token));
  const locale = i18n.language as Locale;
  return (
    <div className="min-h-dvh bg-surface-sunken px-3 pt-6 pb-14 sm:px-8">
      <div className="mx-auto mb-4 flex w-full max-w-[60rem] flex-wrap items-center justify-between gap-3">
        <span className="text-[0.8125rem] text-text-muted">
          {report ? t('report.sharedMeta', { date: formatCalendarDate(report.expiresAt, { locale }) }) : ' '}
        </span>
        <div className="flex items-center gap-2 print:hidden">
          <LanguageSwitch />
          {report ? (
            <button type="button" onClick={() => window.print()} className={cx(buttonClass('primary'))}>
              <Download size={16} aria-hidden="true" />
              {t('report.download')}
            </button>
          ) : null}
        </div>
      </div>
      <main id="main">
        {isLoading ? (
          <Skeleton className="mx-auto h-[40rem] max-w-[60rem]" />
        ) : report ? (
          <ReportView snapshot={report.snapshot} />
        ) : (
          <div className="mx-auto max-w-lg py-16">
            <EmptyState
              title={isError ? t('errors.generic.title') : t('errors.notFound.title')}
              body={isError ? t('errors.generic.body') : t('report.expired')}
            />
          </div>
        )}
      </main>
    </div>
  );
}
