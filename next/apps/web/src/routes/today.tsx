import { canManage } from '@pulse/contracts/constants';
import type { Today } from '@pulse/contracts';
import { formatRelative, type Locale } from '@pulse/i18n';
import { formatDelta, formatMetric } from '@pulse/metrics';
import { Banner, Button, EmptyState, PageHeader, Skeleton, buttonClass, cx } from '@pulse/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Activity, CheckCircle2, Play, Plus, Send } from 'lucide-react';
import { useRef, useState } from 'react';
import { Tab, TabList, TabPanel, Tabs } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import {
  AiBox,
  Panel,
  SamplePill,
  SeverityPill,
  Sparkline,
  statusTabClass,
  tabPanelClass,
} from '../components/pulse';
import { todayQuery, useFormatDate, useMe } from '../lib/queries';
import { FIX_STATUSES, sampleFixesQuery, sampleWeekQuery, type Fix, type FixStatus } from '../lib/sample';

/** Moves a sample fix through the workflow (open → fixing → fixed → verified, or dismissed). */
export function useSetFixStatus() {
  const qc = useQueryClient();
  return (id: string, status: FixStatus) =>
    qc.setQueryData(sampleFixesQuery.queryKey, (fixes) =>
      fixes?.map((f) => (f.id === id ? { ...f, status } : f)),
    );
}

function FixMeta({ fix }: { fix: Fix }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <SeverityPill severity={fix.severity} />
      <span className="text-sm text-text-muted" lang="en">
        {fix.site} · {fix.page}
      </span>
    </div>
  );
}

/** The full card for the most important fix: evidence, impact, AI suggestion, next actions. */
function FixCard({
  fix,
  locale,
  onStatusChange,
}: {
  fix: Fix;
  locale: Locale;
  onStatusChange: (id: string, status: FixStatus) => void;
}) {
  const { t } = useTranslation();
  const setStatus = onStatusChange;
  return (
    <article className="grid gap-4 rounded-lg border border-border bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FixMeta fix={fix} />
        <span className="text-[0.8125rem] text-text-muted">
          {t('fix.seen', { first: fix.firstSeen, updated: fix.updated })}
        </span>
      </div>
      <div className="grid gap-1.5">
        <h3 className="text-[1.375rem] leading-snug font-semibold tracking-[-0.01em]">
          <Link
            to="/fixes/$fixId"
            params={{ fixId: fix.id }}
            className="text-text outline-none hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {fix.title}
          </Link>
        </h3>
        <p className="text-[0.9375rem] leading-relaxed text-text-muted">{fix.summary}</p>
      </div>
      {fix.chips.length ? (
        <ul className="flex flex-wrap gap-2" aria-label={t('fix.evidence')}>
          {fix.chips.map((c) => (
            <li key={c} className="rounded-sm bg-surface-sunken px-2.5 py-1.5 text-[0.8125rem]">
              {c}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        {fix.impact ? (
          <div className="grid content-start gap-1 rounded-md border border-border p-4">
            <span className="text-[0.8125rem] text-text-muted">{t('fix.impact')}</span>
            <span className="text-2xl font-semibold tracking-[-0.01em]">
              {t('fix.ordersPerDay', { count: fix.impact.ordersPerDay })}
            </span>
            <span className="text-[0.8125rem] text-text-muted">
              {t('fix.averageOrder', {
                amount: formatMetric('revenue_at_risk', fix.impact.averageOrder, locale),
              })}
            </span>
          </div>
        ) : null}
        {fix.suggestion ? <AiBox title={t('fix.suggested')}>{fix.suggestion.text}</AiBox> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/fixes/$fixId" params={{ fixId: fix.id }} className={buttonClass('primary')}>
          {t('fix.open')}
        </Link>
        {fix.replayIds[0] ? (
          <Link
            to="/replays/$replayId"
            params={{ replayId: fix.replayIds[0] }}
            className={buttonClass('secondary')}
          >
            <Play size={16} aria-hidden="true" />
            {t('fix.watchReplays', { count: fix.replayIds.length })}
          </Link>
        ) : null}
        {fix.status === 'open' ? (
          <Button variant="ghost" onPress={() => setStatus(fix.id, 'fixing')}>
            {t('fix.markFixing')}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          className="text-text-muted sm:ml-auto"
          onPress={() => setStatus(fix.id, 'dismissed')}
        >
          {t('fix.dismiss')}
        </Button>
      </div>
    </article>
  );
}

function FixRow({ fix }: { fix: Fix }) {
  const { t } = useTranslation();
  return (
    <article className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border border-border bg-surface px-5 py-4 sm:px-6">
      <div className="grid min-w-0 flex-[999_1_20rem] gap-2">
        <FixMeta fix={fix} />
        <h3 className="text-lg leading-snug font-semibold">{fix.title}</h3>
        <p className="text-sm leading-relaxed text-text-muted">{fix.summary}</p>
      </div>
      <Link
        to="/fixes/$fixId"
        params={{ fixId: fix.id }}
        className={buttonClass('secondary', 'md', 'flex-auto')}
      >
        {t('fix.open')}
      </Link>
    </article>
  );
}

function VerifiedRow({ fix }: { fix: Fix }) {
  const { t } = useTranslation();
  if (!fix.verified) return null;
  return (
    <article className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg bg-good-bg px-5 py-4 sm:px-6">
      <div className="grid min-w-0 flex-[999_1_20rem] gap-1.5">
        <span className="inline-flex items-center gap-1.5 text-[0.8125rem] font-semibold text-good">
          <CheckCircle2 size={15} aria-hidden="true" />
          {t('fix.verifiedWhen', { when: fix.verified.when })}
        </span>
        <h3 className="text-[1.0625rem] font-semibold">
          {fix.verified.label}: {fix.verified.before} → {fix.verified.after}
        </h3>
      </div>
      <Link to="/reports" className={buttonClass('secondary', 'md', 'flex-auto border-transparent')}>
        {t('fix.addToReport')}
      </Link>
    </article>
  );
}

type TodaySite = Today['sites'][number];

function SiteRow({ site, locale }: { site: TodaySite; locale: Locale }) {
  const { t } = useTranslation();
  const live = site.status === 'live';
  return (
    <li className="border-t border-border first:border-t-0">
      <Link
        to="/sites/$siteId"
        params={{ siteId: site.id }}
        className="flex min-h-14 items-center gap-3 py-2 text-text outline-none hover:text-primary focus-visible:outline-3 focus-visible:outline-primary"
      >
        <span
          aria-hidden="true"
          className={cx(
            'grid size-10 shrink-0 place-items-center rounded-full border-[3px]',
            live ? 'border-good text-good' : 'border-dashed border-border-strong text-text-faint',
          )}
        >
          <Activity size={16} />
        </span>
        <span className="grid min-w-0 flex-1">
          <span className="truncate text-sm font-medium">{site.name}</span>
          <span className="truncate text-[0.8125rem] text-text-muted">
            {live
              ? `${t('today.visits24h')}: ${formatMetric('visitors', site.visits24h, locale)}`
              : t('today.waitingFor')}
          </span>
        </span>
      </Link>
    </li>
  );
}

export function TodayPage() {
  const { t, i18n } = useTranslation();
  const { orgId, role } = useMe();
  const formatDate = useFormatDate();
  const navigate = useNavigate();
  const locale = i18n.language as Locale;
  const { data, isLoading } = useQuery(todayQuery(orgId));
  const { data: fixes = [] } = useQuery(sampleFixesQuery);
  const { data: week } = useQuery(sampleWeekQuery);
  const [tab, setTab] = useState<FixStatus>('open');
  const setStatus = useSetFixStatus();
  const listRef = useRef<HTMLDivElement>(null);
  const [announcement, setAnnouncement] = useState('');
  /**
   * The changed fix leaves this tab, taking the focused button with it: announce the change and
   * move focus to the next fix in the list (or the selected tab when the list is now empty).
   */
  const changeStatus = (id: string, status: FixStatus) => {
    setStatus(id, status);
    setAnnouncement(t('fix.statusNow', { status: t(`fix.status.${status}`) }));
    requestAnimationFrame(() => {
      const root = listRef.current;
      const target =
        root?.querySelector<HTMLElement>('[role="tabpanel"] a[href]') ??
        document.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
      target?.focus();
    });
  };
  const sites = data?.sites ?? [];
  const live = sites.filter((s) => s.status === 'live');
  const eyebrow = t('today.eyebrow', { date: formatDate(new Date()) });
  const addSite = () => navigate({ to: '/sites', search: { new: true } });

  if (isLoading) {
    return (
      <>
        <PageHeader eyebrow={eyebrow} title={' '} />
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <Skeleton className="h-72" />
          <Skeleton className="hidden h-56 xl:block" />
        </div>
      </>
    );
  }

  if (sites.length === 0) {
    return (
      <>
        <PageHeader eyebrow={eyebrow} title={t('today.headline.none')} />
        <EmptyState
          icon={<Activity size={22} aria-hidden="true" />}
          title={t('today.empty.title')}
          body={t('today.empty.noSites')}
          action={
            canManage(role) ? (
              <Button onPress={addSite}>
                <Plus size={18} aria-hidden="true" />
                {t('today.empty.addSite')}
              </Button>
            ) : undefined
          }
        />
      </>
    );
  }

  const open = fixes.filter((f) => f.status === 'open');
  const critical = open.filter((f) => f.severity === 'critical');
  const lead = critical[0] ?? open[0];
  const onLeadSite = lead ? open.filter((f) => f.site === lead.site).length : 0;
  const shown = fixes.filter((f) => f.status === tab);
  const verifiedRecent = fixes.filter((f) => f.status === 'verified' && f.verified);
  const counts = Object.fromEntries(FIX_STATUSES.map((s) => [s, fixes.filter((f) => f.status === s).length]));

  return (
    <>
      <PageHeader
        eyebrow={eyebrow}
        title={
          lead ? t('today.fixHeadline', { count: onLeadSite, site: lead.site }) : t('today.fixHeadlineClear')
        }
        summary={t('today.fixSummary', {
          critical: critical.length,
          watch: open.length - critical.length,
          sites: sites.length,
        })}
        actions={
          <>
            <SamplePill className="self-center" />
            {canManage(role) ? (
              <Button onPress={addSite}>
                <Plus size={18} aria-hidden="true" />
                {t('sites.add')}
              </Button>
            ) : null}
          </>
        }
      />

      {live.length > 0 ? (
        <div className="mb-6">
          <Banner tone="info" title={t('today.collecting')} />
        </div>
      ) : null}

      <Tabs selectedKey={tab} onSelectionChange={(k) => setTab(k as FixStatus)}>
        <TabList
          aria-label={t('fix.statusLabel')}
          className="mb-6 flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none]"
        >
          {FIX_STATUSES.map((s) => (
            <Tab key={s} id={s} className={statusTabClass}>
              {t(`fix.status.${s}`)}
              {counts[s] ? <span className="ml-1.5 font-medium text-text-muted">{counts[s]}</span> : null}
            </Tab>
          ))}
        </TabList>

        <p role="status" className="sr-only">
          {announcement}
        </p>
        <div ref={listRef} className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          {FIX_STATUSES.map((s) => (
            <TabPanel key={s} id={s} className={tabPanelClass}>
              {shown.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border-strong px-6 py-10 text-center text-text-muted">
                  {t('fix.emptyTab')}
                </p>
              ) : null}
              {shown.map((f, i) =>
                f.status === 'verified' ? (
                  <VerifiedRow key={f.id} fix={f} />
                ) : i === 0 && tab === 'open' ? (
                  <FixCard key={f.id} fix={f} locale={locale} onStatusChange={changeStatus} />
                ) : (
                  <FixRow key={f.id} fix={f} />
                ),
              )}
              {tab === 'open' ? verifiedRecent.map((f) => <VerifiedRow key={f.id} fix={f} />) : null}
            </TabPanel>
          ))}

          <aside className="grid gap-4 xl:sticky xl:top-6">
            <Panel title={t('today.sites')} id="today-sites">
              <ul className="-my-2 grid">
                {sites.map((s) => (
                  <SiteRow key={s.id} site={s} locale={locale} />
                ))}
              </ul>
              {sites.some((s) => s.lastEventAt) ? (
                <p className="text-[0.8125rem] text-text-muted">
                  {t('today.lastVisit', {
                    time: formatRelative(
                      sites
                        .map((s) => s.lastEventAt)
                        .filter((x): x is string => !!x)
                        .sort()
                        .at(-1)!,
                      locale,
                    ),
                  })}
                </p>
              ) : null}
            </Panel>

            {week ? (
              <Panel title={t('today.week')} action={<SamplePill />}>
                <div className="grid gap-1">
                  <span className="text-[0.8125rem] text-text-muted">{t('metric.checkout')}</span>
                  <div className="flex items-baseline gap-2.5">
                    <span className="font-display text-[1.75rem] font-bold tracking-[-0.02em] tabular-nums">
                      {formatMetric('conversion_rate', week.conversion.value, locale)}
                    </span>
                    <Delta
                      metric="conversion_rate"
                      value={week.conversion.value}
                      previous={week.conversion.previous}
                      locale={locale}
                    />
                  </div>
                  <Sparkline values={week.conversion.trend} />
                </div>
                <div className="grid gap-1">
                  <span className="text-[0.8125rem] text-text-muted">{t('metric.verifiedFixes')}</span>
                  <div className="flex items-baseline gap-2.5">
                    <span className="font-display text-[1.75rem] font-bold tracking-[-0.02em] tabular-nums">
                      {week.verifiedThisMonth.value}
                    </span>
                    <span className="text-[0.8125rem] font-semibold text-good">
                      ↑ {week.verifiedThisMonth.value - week.verifiedThisMonth.previous}
                    </span>
                  </div>
                </div>
              </Panel>
            ) : null}

            <section className="flex items-start gap-3.5 rounded-lg border border-border p-5">
              <Send size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-primary" />
              <div className="grid gap-1">
                <h2 className="text-sm font-semibold">{t('today.telegram.title')}</h2>
                <p className="text-[0.8125rem] leading-relaxed text-text-muted">{t('today.telegram.body')}</p>
              </div>
            </section>
          </aside>
        </div>
      </Tabs>
    </>
  );
}

/** Signed change vs the previous period, colored by whether the move is good (ADR-010). */
export function Delta({
  metric,
  value,
  previous,
  locale,
}: {
  metric: Parameters<typeof formatDelta>[0];
  value: number;
  previous: number;
  locale: Locale;
}) {
  const d = formatDelta(metric, value, previous, locale);
  if (!d) return null;
  return (
    <span
      className={cx(
        'text-[0.8125rem] font-semibold',
        d.sentiment === 'good' ? 'text-good' : d.sentiment === 'bad' ? 'text-bad' : 'text-text-muted',
      )}
    >
      {d.direction === 'up' ? '↑ ' : d.direction === 'down' ? '↓ ' : '→ '}
      {d.text}
    </span>
  );
}
