import { canManage, PLATFORMS, type Platform } from '@pulse/contracts/constants';
import type { Site, SiteInstall } from '@pulse/contracts';
import { formatRelative, type Locale } from '@pulse/i18n';
import { Banner, Button, Card, CopyField, Skeleton, StatusBadge, TextField, cx } from '@pulse/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Circle } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Label, Radio, RadioGroup } from 'react-aria-components';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { installQuery, useMe } from '../lib/queries';

const HEAD = '</head>';
/** Shopify and WooCommerce follow the closest general guide. */
const guideFor = (p: Platform): Platform => (p === 'woocommerce' ? 'wordpress' : p);
const GUIDE_PLATFORMS = PLATFORMS.filter((p) => p !== 'woocommerce');

/** How long we wait before showing troubleshooting tips. */
const TROUBLE_AFTER_MS = 90_000;

function Steps({ platform }: { platform: Platform }) {
  const { t } = useTranslation();
  const g = guideFor(platform);
  return (
    <ol className="grid gap-2 text-[0.9375rem]">
      {[1, 2, 3].map((n) => (
        <li key={n} className="flex gap-3">
          <span
            aria-hidden="true"
            className="grid size-6 shrink-0 place-items-center rounded-full bg-primary-soft text-xs font-bold text-primary"
          >
            {n}
          </span>
          <span>{t(`install.guide.${g}.${n}`, { tag: HEAD })}</span>
        </li>
      ))}
    </ol>
  );
}

function CheckItem({ done, children }: { done: boolean; children: ReactNode }) {
  return (
    <li className={cx('flex items-center gap-2.5 text-sm', done ? 'text-text' : 'text-text-muted')}>
      {done ? (
        <CheckCircle2 size={18} aria-hidden="true" className="shrink-0 text-good" />
      ) : (
        <Circle size={18} aria-hidden="true" className="shrink-0 text-text-faint" />
      )}
      {children}
    </li>
  );
}

/** The right-hand live check: pulses while waiting, turns green the moment a visit lands. */
function VerificationStatus({ install }: { install: SiteInstall }) {
  const { t, i18n } = useTranslation();
  const [waitingSince] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);
  const live = install.status === 'live';

  return (
    <Card as="section" className="grid gap-5">
      <h3 className="text-[0.9375rem] font-semibold">{t('install.verify.title')}</h3>
      {live ? (
        <div role="status" className="grid gap-2">
          <StatusBadge tone="good" className="w-fit">
            {t('install.status.live')}
          </StatusBadge>
          {install.lastEventAt ? (
            <span className="text-sm text-text-muted">
              {t('install.status.lastVisit', {
                time: formatRelative(install.lastEventAt, i18n.language as Locale, new Date(now)),
              })}
            </span>
          ) : null}
        </div>
      ) : (
        <div role="status" className="flex items-start gap-3.5">
          <span aria-hidden="true" className="relative mt-1.5 size-3 shrink-0">
            <span className="absolute inset-0 rounded-full bg-primary motion-safe:animate-ping" />
            <span className="absolute inset-0 rounded-full bg-primary" />
          </span>
          <div className="grid gap-0.5">
            <p className="font-semibold">{t('install.status.waiting')}</p>
            <p className="text-[0.8125rem] text-text-muted">{t('install.checking')}</p>
          </div>
        </div>
      )}
      {!live ? <p className="-mt-1 text-sm text-text-muted">{t('install.status.waitingHelp')}</p> : null}
      <ul className="grid gap-2.5 border-t border-border pt-4">
        <CheckItem done>{t('install.check.added')}</CheckItem>
        <CheckItem done={live}>{t('install.check.firstVisit')}</CheckItem>
      </ul>
      {!live && now - waitingSince > TROUBLE_AFTER_MS ? (
        <Banner tone="warn" title={t('install.trouble.title')}>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {[1, 2, 3, 4].map((n) => (
              <li key={n}>{t(`install.trouble.${n}`)}</li>
            ))}
          </ul>
        </Banner>
      ) : null}
    </Card>
  );
}

/** Platform picker as a grid of large, tappable choices. */
function PlatformPicker({ value, onChange }: { value: Platform; onChange: (p: Platform) => void }) {
  const { t } = useTranslation();
  return (
    <RadioGroup value={value} onChange={(v) => onChange(v as Platform)} className="grid gap-2.5">
      <Label className="text-sm font-semibold text-text">{t('install.platform')}</Label>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2">
        {GUIDE_PLATFORMS.map((p) => (
          <Radio
            key={p}
            value={p}
            className={cx(
              'flex min-h-12 cursor-default items-center rounded-md border border-border bg-surface px-3.5 text-sm text-text transition-colors',
              'data-[hovered]:border-border-strong',
              'data-[selected]:border-primary data-[selected]:bg-primary-soft data-[selected]:font-semibold data-[selected]:ring-1 data-[selected]:ring-primary',
              'outline-none data-[focus-visible]:outline-3 data-[focus-visible]:outline-offset-2 data-[focus-visible]:outline-primary',
            )}
          >
            {t(`sites.platform.${p}`)}
          </Radio>
        ))}
      </div>
    </RadioGroup>
  );
}

function EmailDeveloper({ siteId }: { siteId: string }) {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const send = useMutation({
    mutationFn: (to: string) => api(`/sites/${siteId}/install/email`, { body: { email: to } }),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    send.mutate(email.trim());
  };
  return (
    <form onSubmit={submit} className="grid gap-3" noValidate>
      <div>
        <h3 className="font-semibold">{t('install.email.title')}</h3>
        <p className="text-sm text-text-muted">{t('install.email.body')}</p>
      </div>
      {send.isSuccess ? (
        <Banner tone="good" title={t('install.email.sent', { email: send.variables })} />
      ) : null}
      {send.isError ? (
        <Banner
          tone="bad"
          title={
            send.error instanceof ApiError && send.error.code === 'rate_limited'
              ? t('install.email.limit')
              : t('errors.generic.body')
          }
        />
      ) : null}
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
        <TextField
          label={t('install.email.label')}
          type="email"
          autoComplete="off"
          value={email}
          onChange={setEmail}
          lang="en"
        />
        <Button
          type="submit"
          variant="secondary"
          isDisabled={!email.includes('@')}
          isPending={send.isPending}
          pendingLabel={t('common.saving')}
        >
          {t('install.email.send')}
        </Button>
      </div>
    </form>
  );
}

function ExtraOrigins({ site, install }: { site: Site; install: SiteInstall }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { orgId } = useMe();
  const [text, setText] = useState(install.extraOrigins.join('\n'));
  const save = useMutation({
    mutationFn: () =>
      api(`/sites/${site.id}`, {
        method: 'PATCH',
        body: {
          extraOrigins: text
            .split(/\s+/)
            .map((s) => s.trim())
            .filter(Boolean),
        },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: installQuery(orgId, site.id).queryKey }),
  });
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <label htmlFor={`origins-${site.id}`} className="font-semibold">
        {t('install.origins.title')}
      </label>
      <p id={`origins-help-${site.id}`} className="-mt-2 text-sm text-text-muted">
        {t('install.origins.help')}
      </p>
      <textarea
        id={`origins-${site.id}`}
        aria-describedby={`origins-help-${site.id}`}
        aria-invalid={save.isError || undefined}
        lang="en"
        dir="ltr"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="https://staging.example.et"
        className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 font-mono text-sm text-text outline-none focus:border-primary focus:ring-3 focus:ring-primary-soft aria-invalid:border-bad"
      />
      {save.isError ? <p className="text-sm font-medium text-bad">{t('install.origins.invalid')}</p> : null}
      {save.isSuccess ? (
        <p role="status" className="text-sm font-medium text-good">
          {t('common.saved')}
        </p>
      ) : null}
      <div>
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          isPending={save.isPending}
          pendingLabel={t('common.saving')}
        >
          {t('install.origins.save')}
        </Button>
      </div>
    </form>
  );
}

/** Snippet, platform steps and live verification for one site. */
export function InstallPanel({ site }: { site: Site }) {
  const { t } = useTranslation();
  const { orgId, role } = useMe();
  const [platform, setPlatform] = useState<Platform>(guideFor(site.platform));
  // Poll every 3 s until the first visit arrives, then every 30 s.
  const { data: install, isLoading } = useQuery({
    ...installQuery(orgId, site.id),
    refetchInterval: (q) => (q.state.data?.status === 'live' ? 30_000 : 3000),
    refetchIntervalInBackground: false,
  });

  // The moment the first visit lands, refresh everything that shows the site's status.
  const qc = useQueryClient();
  const liveNow = install?.status === 'live';
  useEffect(() => {
    if (liveNow && site.status !== 'live') void qc.invalidateQueries({ queryKey: ['orgs', orgId] });
  }, [liveNow, site.status, qc, orgId]);

  if (isLoading || !install) {
    return (
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Skeleton className="h-80" />
        <Skeleton className="h-48" />
      </div>
    );
  }
  const manage = canManage(role);

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="grid min-w-0 gap-6">
        <Card as="section" className="grid gap-6 p-6">
          <div>
            <h2 className="font-display text-xl font-bold tracking-[-0.01em]">{t('install.title')}</h2>
            <p className="mt-1.5 max-w-2xl text-[0.9375rem] leading-relaxed text-text-muted">
              {t('install.subtitle', { tag: HEAD })}
            </p>
          </div>
          <CopyField
            value={install.snippet}
            label={t('install.title')}
            copyLabel={t('install.copy')}
            copiedLabel={t('install.copied')}
          />
          <PlatformPicker value={platform} onChange={setPlatform} />
          <div className="rounded-md bg-surface-sunken p-4">
            <Steps platform={platform} />
          </div>
          <p className="text-[0.8125rem] text-text-muted">{t('install.privacy')}</p>
        </Card>
        {manage ? (
          <Card as="section" className="grid gap-6 p-6">
            <EmailDeveloper siteId={site.id} />
            <hr className="border-border" />
            <ExtraOrigins site={site} install={install} />
          </Card>
        ) : null}
      </div>
      <aside className="order-first grid gap-4 xl:sticky xl:top-6 xl:order-last">
        <VerificationStatus install={install} />
      </aside>
    </div>
  );
}
