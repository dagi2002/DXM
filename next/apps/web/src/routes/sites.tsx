import { canManage, PLATFORMS, type Platform } from '@pulse/contracts/constants';
import type { Site, Today } from '@pulse/contracts';
import {
  Banner,
  Button,
  EmptyState,
  Modal,
  PageHeader,
  Select,
  Skeleton,
  StatusBadge,
  cx,
  TextField,
  type Tone,
} from '@pulse/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { ChevronRight, Globe, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Tab, TabList, TabPanel, Tabs } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { api, ApiError, fieldError } from '../lib/api';
import { sitesQuery, siteQuery, todayQuery, useFormatDate, useMe } from '../lib/queries';
import { InstallPanel } from './install';
import { Delta } from './today';
import { ReplayList } from './replays';
import {
  HealthRing,
  Panel,
  SamplePill,
  Sparkline,
  healthTone,
  statusTabClass,
  scrollRegionClass,
  tabPanelClass,
} from '../components/pulse';
import { sampleInsightsQuery, sampleReplaysQuery } from '../lib/sample';
import type { Locale } from '@pulse/i18n';
import { formatMetric } from '@pulse/metrics';

const statusTone: Record<Site['status'], Tone> = { install: 'info', live: 'good', paused: 'warn' };

export function SiteStatus({ status }: { status: Site['status'] }) {
  const { t } = useTranslation();
  return <StatusBadge tone={statusTone[status]}>{t(`sites.status.${status}`)}</StatusBadge>;
}

/* ── Site form ───────────────────────────────────────────────────────────── */
function useSiteErrors() {
  const { t } = useTranslation();
  return (err: unknown) => {
    if (!(err instanceof ApiError)) return { banner: t('errors.generic.body') };
    if (err.code === 'plan_limit_reached') {
      const limit = (err.details as { limit?: number } | undefined)?.limit ?? 1;
      return { banner: t('sites.error.limit', { limit }) };
    }
    if (err.code === 'conflict') return { domain: t('sites.error.duplicate') };
    if (err.code === 'forbidden') return { banner: t('errors.forbidden') };
    if (err.code === 'validation_failed') {
      return {
        domain: fieldError(err, 'domain') ? t('sites.error.invalidDomain') : undefined,
        name: fieldError(err, 'name') ? t('sites.error.nameRequired') : undefined,
      };
    }
    return { banner: t('errors.generic.body') };
  };
}

function SiteForm({
  initial,
  submitLabel,
  onSubmit,
  pending,
  errors,
}: {
  initial?: Partial<Pick<Site, 'name' | 'domain' | 'platform'>>;
  submitLabel: string;
  onSubmit: (v: { name: string; domain: string; platform: Platform }) => void;
  pending: boolean;
  errors: { banner?: string; name?: string; domain?: string };
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? '');
  const [domain, setDomain] = useState(initial?.domain ?? '');
  const [platform, setPlatform] = useState<Platform>(initial?.platform ?? 'html');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({ name, domain, platform });
  };
  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      {errors.banner ? <Banner tone="bad" title={errors.banner} /> : null}
      <TextField
        label={t('sites.name')}
        placeholder={t('sites.name.placeholder')}
        value={name}
        onChange={setName}
        isRequired
        autoFocus
        errorMessage={errors.name}
      />
      <TextField
        label={t('sites.domain')}
        placeholder={t('sites.domain.placeholder')}
        description={t('sites.domain.hint')}
        value={domain}
        onChange={setDomain}
        isRequired
        inputMode="url"
        lang="en"
        errorMessage={errors.domain}
      />
      <Select
        label={t('sites.platform')}
        selectedKey={platform}
        onSelectionChange={(k) => setPlatform(k as Platform)}
        options={PLATFORMS.map((p) => ({ id: p, label: t(`sites.platform.${p}`) }))}
      />
      <Button
        type="submit"
        isPending={pending}
        pendingLabel={t('common.saving')}
        isDisabled={!name.trim() || !domain.trim()}
      >
        {submitLabel}
      </Button>
    </form>
  );
}

/* ── Sites list ──────────────────────────────────────────────────────────── */
export function SitesPage() {
  const { t } = useTranslation();
  const { orgId, role } = useMe();
  const formatDate = useFormatDate();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { new?: boolean };
  const { data: sites, isLoading, isError, refetch } = useQuery(sitesQuery(orgId));
  const isOpen = search.new === true;
  const setOpen = (open: boolean) =>
    navigate({ to: '/sites', search: open ? { new: true } : {}, replace: true });
  const toErrors = useSiteErrors();

  const create = useMutation({
    mutationFn: (body: { name: string; domain: string; platform: Platform }) =>
      api<{ site: Site }>('/sites', { body }),
    onSuccess: async ({ site }) => {
      await qc.invalidateQueries({ queryKey: ['orgs', orgId, 'sites'] });
      await navigate({ to: '/sites/$siteId', params: { siteId: site.id } });
    },
  });

  const manage = canManage(role);
  const addButton = manage ? (
    <Button onPress={() => setOpen(true)}>
      <Plus size={18} aria-hidden="true" />
      {t('sites.add')}
    </Button>
  ) : null;

  return (
    <>
      <PageHeader
        title={t('sites.title')}
        summary={t('sites.subtitle')}
        actions={sites?.length ? addButton : null}
      />
      {isLoading ? (
        <div className="grid gap-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : isError ? (
        <Banner tone="bad" title={t('errors.generic.title')}>
          <Button variant="secondary" size="sm" className="mt-2" onPress={() => refetch()}>
            {t('common.retry')}
          </Button>
        </Banner>
      ) : !sites?.length ? (
        <EmptyState
          icon={<Globe size={22} aria-hidden="true" />}
          title={t('sites.empty.title')}
          body={t('sites.empty.body')}
          action={addButton}
        />
      ) : (
        <ul className="grid gap-3" aria-label={t('sites.title')}>
          {sites.map((s) => (
            <li key={s.id}>
              <Link
                to="/sites/$siteId"
                params={{ siteId: s.id }}
                className="group flex items-center gap-4 rounded-lg border border-border bg-surface p-4 outline-none transition-colors hover:border-border-strong focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary sm:p-5"
              >
                <span
                  className="grid size-10 shrink-0 place-items-center rounded-md bg-surface-sunken text-text-muted"
                  aria-hidden="true"
                >
                  <Globe size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-text">{s.name}</span>
                  <span className="block truncate text-sm text-text-muted" lang="en">
                    {s.domain}
                  </span>
                  <span className="mt-0.5 block text-xs text-text-faint">
                    {t(`sites.platform.${s.platform}`)} ·{' '}
                    {t('sites.created', { date: formatDate(s.createdAt) })}
                  </span>
                </span>
                <span className="hidden sm:block">
                  <SiteStatus status={s.status} />
                </span>
                <ChevronRight
                  size={18}
                  aria-hidden="true"
                  className="shrink-0 text-text-faint transition-transform group-hover:translate-x-0.5"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Modal
        isOpen={isOpen}
        onOpenChange={setOpen}
        title={t('sites.create.title')}
        closeLabel={t('common.close')}
      >
        <SiteForm
          submitLabel={t('sites.create.submit')}
          pending={create.isPending}
          errors={create.error ? toErrors(create.error) : {}}
          onSubmit={(v) => create.mutate(v)}
        />
      </Modal>
    </>
  );
}

/* ── Site overview (sample insights until rollups ship) ───────────────────── */
const SITE_TABS = ['overview', 'replays', 'install'] as const;
type SiteTab = (typeof SITE_TABS)[number];

const lcpTone = (ms: number) => (ms <= 2500 ? 'good' : ms <= 4000 ? 'warn' : 'bad');
const toneText = { good: 'text-good', warn: 'text-warn', bad: 'text-bad' } as const;
const toneBg = { good: 'bg-good', warn: 'bg-warn', bad: 'bg-bad' } as const;

function SiteOverview({ stats, locale }: { stats?: Today['sites'][number]; locale: Locale }) {
  const { t } = useTranslation();
  const { data: ins } = useQuery(sampleInsightsQuery);
  if (!ins) return <Skeleton className="h-96" />;
  const pct = new Intl.NumberFormat(locale === 'am' ? 'am-ET' : 'en', {
    style: 'percent',
    maximumFractionDigits: 0,
  });
  const first = ins.funnel.steps[0]?.count ?? 1;
  const steps = ins.funnel.steps.map((st, i) => {
    const prev = ins.funnel.steps[i - 1]?.count;
    return { ...st, ratio: st.count / first, drop: prev ? 1 - st.count / prev : 0 };
  });
  const worst = ins.funnel.focus ?? steps.reduce((w, st, i) => (st.drop > (steps[w]?.drop ?? 0) ? i : w), 0);
  const slowest = Math.max(...ins.speed.map((x) => x.lcp));
  const health = healthTone(ins.health.score);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid max-w-3xl gap-1.5">
          <h2 className="font-display text-2xl leading-tight font-bold tracking-[-0.02em] text-balance">
            {ins.headline}
          </h2>
          <p className="text-[0.9375rem] leading-relaxed text-text-muted">{ins.summary}</p>
        </div>
        <SamplePill />
      </div>

      {stats ? (
        <p className="text-sm text-text-muted">
          {t('site.realToday', {
            visits: formatMetric('visitors', stats.visits24h, locale),
            pageviews: formatMetric('pageviews', stats.pageviews24h, locale),
          })}
        </p>
      ) : null}

      <section aria-label={t('site.keyNumbers')} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="grid content-start gap-2.5 rounded-lg border border-border bg-surface p-5">
          <span className="text-[0.8125rem] font-medium text-text-muted">{t('metric.health')}</span>
          <div className="flex items-center gap-3.5">
            <HealthRing score={ins.health.score} label={t('metric.healthOf', { score: ins.health.score })} />
            <div className="grid gap-0.5">
              <span className={cx('font-semibold', toneText[health])}>{t(`health.${health}`)}</span>
              <Delta
                metric="health_score"
                value={ins.health.score}
                previous={ins.health.previous}
                locale={locale}
                suffix={t('delta.sinceLastWeek')}
              />
            </div>
          </div>
        </div>
        <div className="grid content-start gap-1 rounded-lg border border-border bg-surface p-5">
          <span className="text-[0.8125rem] font-medium text-text-muted">{t('today.totals.visits')}</span>
          <div className="flex items-baseline gap-2.5">
            <span className="font-display text-[1.875rem] leading-tight font-bold tracking-[-0.02em] tabular-nums">
              {formatMetric('visitors', ins.visits.value, locale)}
            </span>
            <Delta
              metric="visitors"
              value={ins.visits.value}
              previous={ins.visits.previous}
              locale={locale}
            />
          </div>
          <Sparkline values={ins.visits.trend} />
        </div>
        <div className="grid content-start gap-1 rounded-lg border border-border bg-surface p-5">
          <span className="text-[0.8125rem] font-medium text-text-muted">{t('metric.checkout')}</span>
          <div className="flex items-baseline gap-2.5">
            <span className="font-display text-[1.875rem] leading-tight font-bold tracking-[-0.02em] tabular-nums">
              {formatMetric('conversion_rate', ins.conversion.value, locale)}
            </span>
            <Delta
              metric="conversion_rate"
              value={ins.conversion.value}
              previous={ins.conversion.previous}
              locale={locale}
            />
          </div>
          <Sparkline values={ins.conversion.trend} />
        </div>
        <div className="grid content-start gap-1 rounded-lg border border-border bg-surface p-5">
          <span className="text-[0.8125rem] font-medium text-text-muted">{t('metric.lcpPhones')}</span>
          <div className="flex items-baseline gap-2.5">
            <span className="font-display text-[1.875rem] leading-tight font-bold tracking-[-0.02em] tabular-nums">
              {formatMetric('lcp', ins.lcp.value, locale)}
            </span>
            <Delta metric="lcp" value={ins.lcp.value} previous={ins.lcp.previous} locale={locale} />
          </div>
          <span className={cx('text-[0.8125rem]', toneText[lcpTone(ins.lcp.value)])}>
            {t(`speed.${lcpTone(ins.lcp.value)}`)}
          </span>
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel
          id="funnel"
          title={ins.funnel.name}
          note={ins.funnel.template}
          action={
            steps[worst] ? (
              <StatusBadge tone="bad">
                {t('funnel.lostAt', { share: pct.format(steps[worst].drop), step: steps[worst].label })}
              </StatusBadge>
            ) : null
          }
        >
          <ol className="grid gap-3.5">
            {steps.map((st, i) => (
              <li key={st.label} className="grid gap-1.5">
                <div className="flex justify-between gap-3 text-sm">
                  <span className={cx(i === steps.length - 1 && 'font-semibold')}>{st.label}</span>
                  <span className="tabular-nums">
                    {i > 0 ? (
                      <span className={cx(i === worst ? 'font-semibold text-bad' : 'text-text-muted')}>
                        −{pct.format(st.drop)} ·{' '}
                      </span>
                    ) : null}
                    <b className="font-semibold">{formatMetric('visitors', st.count, locale)}</b>
                  </span>
                </div>
                <div aria-hidden="true" className="h-3.5 rounded-full bg-surface-sunken">
                  <div
                    className={cx('h-3.5 min-w-3.5 rounded-full', i === worst ? 'bg-bad' : 'bg-primary')}
                    style={{ width: `calc(${st.ratio} * 100%)` }}
                  />
                </div>
              </li>
            ))}
          </ol>
        </Panel>

        <Panel id="speed" title={t('speed.title')} note={t('speed.note')}>
          <div className="grid gap-3.5">
            {ins.speed.map((x) => (
              <div key={x.network} className="grid grid-cols-[4rem_1fr_3.5rem] items-center gap-3 text-sm">
                <span>{x.network}</span>
                <div aria-hidden="true" className="h-2.5 rounded-full bg-surface-sunken">
                  <div
                    className={cx('h-2.5 rounded-full', toneBg[lcpTone(x.lcp)])}
                    style={{ width: `calc(${x.lcp / slowest} * 100%)` }}
                  />
                </div>
                <span className="text-right font-semibold tabular-nums">
                  {formatMetric('lcp', x.lcp, locale)}
                  {/* The bar's color carries the verdict; say it in words too. */}
                  <span className="sr-only">, {t(`speed.${lcpTone(x.lcp)}`)}</span>
                </span>
              </div>
            ))}
          </div>
          <dl className="grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
            <div className="grid gap-0.5">
              <dt className="text-[0.8125rem] text-text-muted">{t('speed.inp')}</dt>
              <dd className="font-semibold">
                {formatMetric('inp', ins.inp, locale)}{' '}
                <span className="font-medium text-good">{t('speed.goodShort')}</span>
              </dd>
            </div>
            <div className="grid gap-0.5">
              <dt className="text-[0.8125rem] text-text-muted">{t('speed.cls')}</dt>
              <dd className="font-semibold">
                {formatMetric('cls', ins.cls, locale)}{' '}
                <span className="font-medium text-good">{t('speed.goodShort')}</span>
              </dd>
            </div>
          </dl>
        </Panel>
      </div>

      <section
        aria-labelledby="pages-h"
        className="overflow-hidden rounded-lg border border-border bg-surface"
      >
        <h2 id="pages-h" className="border-b border-border px-6 py-4 text-[1.0625rem] font-semibold">
          {t('pages.title')}
        </h2>
        <div className={scrollRegionClass} tabIndex={0} role="region" aria-labelledby="pages-h">
          <table className="w-full min-w-[40rem] border-collapse text-sm">
            <thead>
              <tr className="text-left text-[0.8125rem] text-text-muted">
                <th scope="col" className="px-6 py-2.5 font-medium">
                  {t('pages.col.page')}
                </th>
                <th scope="col" className="px-2.5 py-2.5 font-medium">
                  {t('today.totals.visits')}
                </th>
                <th scope="col" className="px-2.5 py-2.5 font-medium">
                  {t('pages.col.bounce')}
                </th>
                <th scope="col" className="px-2.5 py-2.5 font-medium">
                  {t('pages.col.load')}
                </th>
                <th scope="col" className="px-6 py-2.5 font-medium">
                  {t('pages.col.fixes')}
                </th>
              </tr>
            </thead>
            <tbody>
              {ins.pages.map((pg) => (
                <tr key={pg.path} className="border-t border-border">
                  <td className="px-6 py-3 font-mono text-[0.8125rem]" lang="en">
                    {pg.path}
                  </td>
                  <td className="px-2.5 py-3 tabular-nums">{formatMetric('visitors', pg.visits, locale)}</td>
                  <td className="px-2.5 py-3 tabular-nums">
                    {formatMetric('bounce_rate', pg.bounce, locale)}
                  </td>
                  <td className="px-2.5 py-3 tabular-nums">{formatMetric('lcp', pg.lcp, locale)}</td>
                  <td
                    className={cx(
                      'px-6 py-3',
                      pg.tone ? `font-semibold ${toneText[pg.tone]}` : 'text-text-muted',
                    )}
                  >
                    {pg.fixes ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SiteReplays() {
  const { t } = useTranslation();
  const { data: replays } = useQuery(sampleReplaysQuery);
  if (!replays) return <Skeleton className="h-64" />;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[0.9375rem] text-text-muted">{t('replays.intro')}</p>
        <SamplePill />
      </div>
      <ReplayList replays={replays} />
    </div>
  );
}

/* ── Site detail ─────────────────────────────────────────────────────────── */
export function SiteDetailPage() {
  const { t, i18n } = useTranslation();
  const { orgId, role } = useMe();
  const { siteId } = useParams({ strict: false }) as { siteId: string };
  const formatDate = useFormatDate();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const {
    data: site,
    isLoading,
    error,
  } = useQuery({
    ...siteQuery(orgId, siteId),
    retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 2,
  });
  const { data: today } = useQuery(todayQuery(orgId));
  const stats = today?.sites.find((x) => x.id === siteId);
  const locale = i18n.language as Locale;
  const [chosenTab, setTab] = useState<SiteTab | null>(null);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirm, setConfirm] = useState('');
  const toErrors = useSiteErrors();

  const update = useMutation({
    mutationFn: (body: { name: string; domain: string; platform: Platform }) =>
      api<{ site: Site }>(`/sites/${siteId}`, { method: 'PATCH', body }),
    onSuccess: async ({ site: updated }) => {
      qc.setQueryData(siteQuery(orgId, siteId).queryKey, updated);
      await qc.invalidateQueries({ queryKey: ['orgs', orgId, 'sites'], exact: true });
      setEditing(false);
    },
  });
  const remove = useMutation({
    mutationFn: () => api(`/sites/${siteId}`, { method: 'DELETE', body: { confirmDomain: confirm } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['orgs', orgId, 'sites'] });
      await navigate({ to: '/sites' });
    },
  });

  if (isLoading) return <Skeleton className="h-64" />;
  if (error || !site) {
    return (
      <EmptyState
        title={t('errors.notFound.title')}
        body={t('errors.notFound.body')}
        action={
          <Button variant="secondary" onPress={() => navigate({ to: '/sites' })}>
            {t('sites.title')}
          </Button>
        }
      />
    );
  }

  const manage = canManage(role);
  // Not installed yet: land on the install steps. Live: land on the overview.
  const tab: SiteTab = chosenTab ?? (site.status === 'live' ? 'overview' : 'install');
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 text-sm">
        <Link to="/sites" className="font-medium text-text-muted underline-offset-4 hover:underline">
          {t('sites.title')}
        </Link>
      </nav>
      <PageHeader
        title={site.name}
        summary={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span lang="en">{site.domain}</span>
            <SiteStatus status={site.status} />
          </span>
        }
        actions={
          manage ? (
            <>
              <Button variant="secondary" onPress={() => setEditing(true)}>
                {t('common.edit')}
              </Button>
              <Button variant="danger-ghost" onPress={() => setDeleting(true)}>
                {t('common.delete')}
              </Button>
            </>
          ) : null
        }
      />
      <Tabs selectedKey={tab} onSelectionChange={(k) => setTab(k as SiteTab)}>
        <TabList
          aria-label={t('site.sections')}
          className="mb-6 flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none]"
        >
          {SITE_TABS.map((id) => (
            <Tab key={id} id={id} className={statusTabClass}>
              {t(`site.tab.${id}`)}
            </Tab>
          ))}
        </TabList>
        <TabPanel id="overview" className={tabPanelClass}>
          <SiteOverview stats={stats} locale={locale} />
        </TabPanel>
        <TabPanel id="replays" className={tabPanelClass}>
          <SiteReplays />
        </TabPanel>
        <TabPanel id="install" className={tabPanelClass}>
          <InstallPanel site={site} />
        </TabPanel>
      </Tabs>
      <p className="mt-8 text-sm text-text-muted">
        {t(`sites.platform.${site.platform}`)} · {t('sites.created', { date: formatDate(site.createdAt) })}
      </p>

      <Modal
        isOpen={editing}
        onOpenChange={setEditing}
        title={t('sites.edit.title')}
        closeLabel={t('common.close')}
      >
        <SiteForm
          initial={site}
          submitLabel={t('common.save')}
          pending={update.isPending}
          errors={update.error ? toErrors(update.error) : {}}
          onSubmit={(v) => update.mutate(v)}
        />
      </Modal>

      <Modal
        isOpen={deleting}
        onOpenChange={setDeleting}
        title={t('sites.delete.title', { name: site.name })}
        closeLabel={t('common.close')}
      >
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            remove.mutate();
          }}
        >
          <p className="text-text-muted">{t('sites.delete.body')}</p>
          {remove.error ? <Banner tone="bad" title={t('errors.generic.body')} /> : null}
          <TextField
            label={t('sites.delete.confirmLabel', { domain: site.domain })}
            value={confirm}
            onChange={setConfirm}
            autoFocus
            lang="en"
          />
          <Button
            type="submit"
            variant="danger"
            isDisabled={confirm.trim().toLowerCase() !== site.domain}
            isPending={remove.isPending}
            pendingLabel={t('common.saving')}
          >
            {t('sites.delete.submit')}
          </Button>
        </form>
      </Modal>
    </>
  );
}
