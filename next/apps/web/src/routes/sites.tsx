import { canManage, PLATFORMS, type Platform } from '@pulse/contracts/constants';
import type { Site } from '@pulse/contracts';
import {
  Banner,
  Button,
  Card,
  EmptyState,
  Modal,
  PageHeader,
  Select,
  Skeleton,
  StatTile,
  StatusBadge,
  TextField,
  type Tone,
} from '@pulse/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router';
import { Activity, ChevronRight, Globe, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api, ApiError, fieldError } from '../lib/api';
import { sitesQuery, siteQuery, todayQuery, useFormatDate, useMe } from '../lib/queries';
import { InstallPanel } from './install';
import { formatRelative, type Locale } from '@pulse/i18n';

const statusTone: Record<Site['status'], Tone> = { install: 'info', live: 'good', paused: 'warn' };

export function SiteStatus({ status }: { status: Site['status'] }) {
  const { t } = useTranslation();
  return <StatusBadge tone={statusTone[status]}>{t(`sites.status.${status}`)}</StatusBadge>;
}

/* ── Today ───────────────────────────────────────────────────────────────── */
export function TodayPage() {
  const { t, i18n } = useTranslation();
  const { orgId, role } = useMe();
  const formatDate = useFormatDate();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery(todayQuery(orgId));
  const sites = data?.sites ?? [];
  const anyLive = sites.some((s) => s.status === 'live');
  const locale = i18n.language as Locale;

  return (
    <>
      <PageHeader
        title={t('today.title')}
        summary={
          isLoading ? '\u00a0' : t('today.summary', { sites: sites.length, date: formatDate(new Date()) })
        }
      />
      {isLoading ? (
        <Skeleton className="h-56" />
      ) : sites.length === 0 ? (
        <EmptyState
          icon={<Activity size={22} aria-hidden="true" />}
          title={t('today.empty.title')}
          body={t('today.empty.noSites')}
          action={
            canManage(role) ? (
              <Button onPress={() => navigate({ to: '/sites', search: { new: true } })}>
                <Plus size={18} aria-hidden="true" />
                {t('today.empty.addSite')}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-5">
          {anyLive ? <Banner tone="info" title={t('today.collecting')} /> : null}
          <h2 className="font-display text-lg font-bold">{t('today.sites')}</h2>
          <ul className="grid gap-4" aria-label={t('today.sites')}>
            {sites.map((s) => (
              <li key={s.id}>
                <Card as="article" className="grid gap-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        to="/sites/$siteId"
                        params={{ siteId: s.id }}
                        className="font-semibold text-text underline-offset-4 hover:underline"
                      >
                        {s.name}
                      </Link>
                      <p className="text-sm text-text-muted" lang="en">
                        {s.domain}
                      </p>
                    </div>
                    <SiteStatus status={s.status} />
                  </div>
                  {s.status === 'live' ? (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <StatTile
                          label={t('today.visits24h')}
                          metric="visitors"
                          value={s.visits24h}
                          locale={locale}
                        />
                        <StatTile
                          label={t('today.pageviews24h')}
                          metric="pageviews"
                          value={s.pageviews24h}
                          locale={locale}
                        />
                      </div>
                      <p className="text-sm text-text-muted">
                        {t('today.lastVisit', {
                          time: s.lastEventAt ? formatRelative(s.lastEventAt, locale) : t('time.never'),
                        })}
                      </p>
                    </>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-text-muted">{t('today.waitingFor')}</p>
                      <Button
                        size="sm"
                        variant="secondary"
                        onPress={() => navigate({ to: '/sites/$siteId', params: { siteId: s.id } })}
                      >
                        {t('today.finishInstall')}
                      </Button>
                    </div>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
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

/* ── Site detail ─────────────────────────────────────────────────────────── */
export function SiteDetailPage() {
  const { t } = useTranslation();
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
      <div className="grid items-start gap-4 lg:grid-cols-[2fr_1fr]">
        <InstallPanel site={site} />
        <Card as="section">
          <dl className="grid gap-3 text-sm">
            <div>
              <dt className="text-text-muted">{t('sites.platform')}</dt>
              <dd className="font-semibold">{t(`sites.platform.${site.platform}`)}</dd>
            </div>
            <div>
              <dt className="text-text-muted">{t('sites.createdLabel')}</dt>
              <dd className="font-semibold">{formatDate(site.createdAt)}</dd>
            </div>
          </dl>
        </Card>
      </div>

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
