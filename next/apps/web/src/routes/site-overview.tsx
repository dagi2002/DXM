import {
  FUNNEL_TEMPLATE_DEFS,
  INSIGHTS_MIN_VISITS,
  type FunnelConfig,
  type InsightsRange,
  type SiteInsights,
  type Today,
  type VitalSummary,
} from '@pulse/contracts';
import { formatRelative, type Locale } from '@pulse/i18n';
import { formatMetric, rateMetric, type Rating } from '@pulse/metrics';
import { Banner, Button, Segmented, Select, Skeleton, StatusBadge, cx } from '@pulse/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HealthRing, Panel, Sparkline, healthTone, scrollRegionClass } from '../components/pulse';
import { api } from '../lib/api';
import { siteInsightsQuery } from '../lib/queries';
import { Delta } from './today';

const ratingTone: Record<Rating, 'good' | 'warn' | 'bad'> = {
  good: 'good',
  'needs-work': 'warn',
  poor: 'bad',
};
const toneText = { good: 'text-good', warn: 'text-warn', bad: 'text-bad' } as const;
const toneBg = { good: 'bg-good', warn: 'bg-warn', bad: 'bg-bad' } as const;
const lcpTone = (ms: number) => ratingTone[rateMetric('lcp', ms) ?? 'good'];

const tileClass = 'grid content-start gap-1 rounded-lg border border-border bg-surface p-5';
const bigNumberClass = 'font-display text-[1.875rem] leading-tight font-bold tracking-[-0.02em] tabular-nums';

/** Builds a funnel from an Ethiopian template, with step labels in the owner's language. */
export function useTemplateConfig() {
  const { t } = useTranslation();
  return (id: string): FunnelConfig | null => {
    const def = FUNNEL_TEMPLATE_DEFS.find((d) => d.id === id);
    if (!def) return null;
    return {
      name: t(def.nameKey),
      template: def.id,
      steps: def.steps.map((s) => ({ label: t(s.labelKey), match: s.match })),
    };
  };
}

function NotEnough({ children }: { children: string }) {
  return <span className="text-[0.9375rem] font-medium text-text-muted">{children}</span>;
}

function headlineOf(ins: SiteInsights, t: (k: string, o?: Record<string, unknown>) => string) {
  if (!ins.enoughData || ins.health.score === null) {
    return {
      headline: t('insights.headline.collecting'),
      summary: t('insights.notEnough', { visits: ins.visits.value, min: INSIGHTS_MIN_VISITS }),
    };
  }
  const tone = healthTone(ins.health.score);
  const top = ins.pages.find((p) => p.need > 0 || p.openFixes.critical > 0);
  return {
    headline: t(`insights.headline.${tone}`),
    summary: top ? t('insights.summary.page', { path: top.path }) : t('insights.summary.none'),
  };
}

function FunnelPanel({
  ins,
  siteId,
  orgId,
  canEdit,
  locale,
}: {
  ins: SiteInsights;
  siteId: string;
  orgId: string;
  canEdit: boolean;
  locale: Locale;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toConfig = useTemplateConfig();
  const [template, setTemplate] = useState<string>(ins.funnel?.template ?? 'telebirr_checkout');
  const save = useMutation({
    mutationFn: (config: FunnelConfig | null) =>
      config
        ? api(`/sites/${siteId}/funnel`, { method: 'PUT', body: config })
        : api(`/sites/${siteId}/funnel`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orgs', orgId, 'sites', siteId] }),
  });
  const templates = FUNNEL_TEMPLATE_DEFS.map((d) => ({ id: d.id, label: t(d.nameKey) }));
  const picker = canEdit ? (
    <div className="flex flex-wrap items-end gap-3">
      <Select
        label={t('funnel.template.label')}
        options={templates}
        selectedKey={template}
        onSelectionChange={setTemplate}
        className="min-w-56"
      />
      <Button
        variant={ins.funnel ? 'secondary' : 'primary'}
        onPress={() => save.mutate(toConfig(template))}
        isPending={save.isPending}
        pendingLabel={t('common.saving')}
      >
        {ins.funnel ? t('funnel.useTemplate') : t('funnel.setUp')}
      </Button>
      {ins.funnel ? (
        <Button variant="danger-ghost" onPress={() => save.mutate(null)} isDisabled={save.isPending}>
          {t('funnel.remove')}
        </Button>
      ) : null}
    </div>
  ) : null;
  const error = save.error ? <Banner tone="bad" title={t('errors.generic.body')} /> : null;

  if (!ins.funnel) {
    return (
      <Panel id="funnel" title={t('funnel.title')}>
        <p className="text-sm text-text-muted">{t(canEdit ? 'funnel.empty' : 'funnel.emptyAskAdmin')}</p>
        {error}
        {picker}
      </Panel>
    );
  }

  const f = ins.funnel;
  const first = f.steps[0]?.count ?? 0;
  const steps = f.steps.map((st, i) => {
    const prev = f.steps[i - 1]?.count;
    return { ...st, ratio: first ? st.count / first : 0, drop: prev ? 1 - st.count / prev : 0 };
  });
  const worst = f.worst === null ? null : steps[f.worst];
  return (
    <Panel
      id="funnel"
      title={f.name}
      note={t(`insights.range.note.${ins.range}`)}
      action={
        worst ? (
          <StatusBadge tone="bad">
            {t('funnel.lostAt', {
              share: formatMetric('conversion_rate', worst.drop, locale),
              step: worst.label,
            })}
          </StatusBadge>
        ) : null
      }
    >
      {f.stale ? <p className="text-[0.8125rem] text-text-muted">{t('funnel.recomputing')}</p> : null}
      {first === 0 && !f.stale ? <p className="text-sm text-text-muted">{t('funnel.noEntries')}</p> : null}
      <ol className="grid gap-3.5">
        {steps.map((st, i) => (
          <li key={`${i}-${st.label}`} className="grid gap-1.5">
            <div className="flex justify-between gap-3 text-sm">
              <span className={cx(i === steps.length - 1 && 'font-semibold')}>{st.label}</span>
              <span className="tabular-nums">
                {i > 0 && st.drop > 0 ? (
                  <span className={cx(i === f.worst ? 'font-semibold text-bad' : 'text-text-muted')}>
                    −{formatMetric('conversion_rate', st.drop, locale)} ·{' '}
                  </span>
                ) : null}
                <b className="font-semibold">{formatMetric('visitors', st.count, locale)}</b>
              </span>
            </div>
            <div aria-hidden="true" className="h-3.5 rounded-full bg-surface-sunken">
              {st.count > 0 ? (
                <div
                  className={cx('h-3.5 min-w-3.5 rounded-full', i === f.worst ? 'bg-bad' : 'bg-primary')}
                  style={{ width: `calc(${st.ratio} * 100%)` }}
                />
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      {error}
      {picker}
    </Panel>
  );
}

function VitalValue({
  metric,
  v,
  locale,
}: {
  metric: 'lcp' | 'inp' | 'cls';
  v: VitalSummary;
  locale: Locale;
}) {
  const { t } = useTranslation();
  if (v.p75 === null || !v.rating) return <NotEnough>{t('insights.vitalsNotEnough')}</NotEnough>;
  const tone = ratingTone[v.rating];
  return (
    <>
      {formatMetric(metric, v.p75, locale)}{' '}
      <span className={cx('font-medium', toneText[tone])}>{t(`insights.rating.${v.rating}`)}</span>
    </>
  );
}

function SpeedPanel({ ins, locale }: { ins: SiteInsights; locale: Locale }) {
  const { t } = useTranslation();
  const rows = ins.byNetwork.filter((x) => x.lcp !== null) as (SiteInsights['byNetwork'][number] & {
    lcp: number;
  })[];
  const devices = ins.byDevice.filter((x) => x.lcp !== null) as (SiteInsights['byDevice'][number] & {
    lcp: number;
  })[];
  const slowest = Math.max(1, ...rows.map((x) => x.lcp));
  return (
    <Panel id="speed" title={t('speed.title')} note={t('speed.note')}>
      {rows.length ? (
        <div className="grid gap-3.5">
          {rows.map((x) => (
            <div key={x.network} className="grid grid-cols-[5rem_1fr_3.5rem] items-center gap-3 text-sm">
              <span>{t(`insights.network.${x.network}`)}</span>
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
      ) : (
        <p className="text-sm text-text-muted">{t('insights.speedNotEnough')}</p>
      )}
      {devices.length ? (
        <dl className="grid grid-cols-3 gap-3 text-sm">
          {devices.map((d) => (
            <div key={d.device} className="grid gap-0.5">
              <dt className="text-[0.8125rem] text-text-muted">{t(`insights.device.${d.device}`)}</dt>
              <dd className={cx('font-semibold tabular-nums', toneText[lcpTone(d.lcp)])}>
                {formatMetric('lcp', d.lcp, locale)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      <dl className="grid grid-cols-2 gap-3 border-t border-border pt-4 text-sm">
        <div className="grid gap-0.5">
          <dt className="text-[0.8125rem] text-text-muted">{t('speed.inp')}</dt>
          <dd className="font-semibold">
            <VitalValue metric="inp" v={ins.vitals.inp} locale={locale} />
          </dd>
        </div>
        <div className="grid gap-0.5">
          <dt className="text-[0.8125rem] text-text-muted">{t('speed.cls')}</dt>
          <dd className="font-semibold">
            <VitalValue metric="cls" v={ins.vitals.cls} locale={locale} />
          </dd>
        </div>
      </dl>
    </Panel>
  );
}

function PagesTable({ ins, locale }: { ins: SiteInsights; locale: Locale }) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="pages-h" className="overflow-hidden rounded-lg border border-border bg-surface">
      <h2 id="pages-h" className="border-b border-border px-6 py-4 text-[1.0625rem] font-semibold">
        {t('pages.title')}
      </h2>
      {ins.pages.length === 0 ? (
        <p className="px-6 py-5 text-sm text-text-muted">
          {t(ins.enoughData ? 'pages.empty' : 'pages.emptyCollecting')}
        </p>
      ) : (
        <div className={scrollRegionClass} tabIndex={0} role="region" aria-labelledby="pages-h">
          <table className="w-full min-w-[44rem] border-collapse text-sm">
            <thead>
              <tr className="text-left text-[0.8125rem] text-text-muted">
                <th scope="col" className="px-6 py-2.5 font-medium">
                  {t('pages.col.page')}
                </th>
                <th scope="col" className="px-2.5 py-2.5 font-medium">
                  {t('today.totals.visits')}
                </th>
                <th scope="col" className="px-2.5 py-2.5 font-medium">
                  {t('pages.col.trouble')}
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
              {ins.pages.map((pg) => {
                const fixTone = pg.openFixes.critical ? 'bad' : pg.openFixes.watch ? 'warn' : null;
                return (
                  <tr key={pg.path} className="border-t border-border">
                    <td className="px-6 py-3 font-mono text-[0.8125rem]" lang="en">
                      {pg.path}
                    </td>
                    <td className="px-2.5 py-3 tabular-nums">
                      {formatMetric('visitors', pg.visits, locale)}
                    </td>
                    <td className="px-2.5 py-3">
                      {pg.frictionVisits || pg.errorVisits
                        ? t('pages.trouble', { friction: pg.frictionVisits, errors: pg.errorVisits })
                        : '—'}
                    </td>
                    <td className="px-2.5 py-3 tabular-nums">
                      {formatMetric('bounce_rate', pg.bounce, locale)}
                    </td>
                    <td
                      className={cx('px-2.5 py-3 tabular-nums', pg.lcp !== null && toneText[lcpTone(pg.lcp)])}
                    >
                      {formatMetric('lcp', pg.lcp, locale)}
                    </td>
                    <td
                      className={cx(
                        'px-6 py-3',
                        fixTone ? `font-semibold ${toneText[fixTone]}` : 'text-text-muted',
                      )}
                    >
                      {fixTone
                        ? t('pages.fixes', { critical: pg.openFixes.critical, watch: pg.openFixes.watch })
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** The site Overview: real insights from the daily rollups, honest about thin data. */
export function SiteOverview({
  orgId,
  siteId,
  stats,
  locale,
  canEdit,
}: {
  orgId: string;
  siteId: string;
  stats?: Today['sites'][number];
  locale: Locale;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const [range, setRange] = useState<InsightsRange>('7d');
  const { data: ins, error } = useQuery({
    ...siteInsightsQuery(orgId, siteId, range),
    placeholderData: (p) => p,
  });
  if (error) return <Banner tone="bad" title={t('errors.generic.body')} />;
  if (!ins) return <Skeleton className="h-96" />;

  const { headline, summary } = headlineOf(ins, t);
  const since = t(`delta.since.${ins.range}`);
  const health = ins.health.score === null ? null : healthTone(ins.health.score);
  const conversion = ins.funnel?.conversion.value ?? null;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid max-w-3xl gap-1.5">
          <h2 className="font-display text-2xl leading-tight font-bold tracking-[-0.02em] text-balance">
            {headline}
          </h2>
          <p className="text-[0.9375rem] leading-relaxed text-text-muted">{summary}</p>
        </div>
        <Segmented
          label={t('insights.range.label')}
          hideLabel
          value={range}
          onChange={(v) => setRange(v as InsightsRange)}
          options={[
            { id: '7d', label: t('insights.range.7d') },
            { id: '30d', label: t('insights.range.30d') },
          ]}
        />
      </div>

      <p className="text-sm text-text-muted">
        {stats
          ? t('site.realToday', {
              visits: formatMetric('visitors', stats.visits24h, locale),
              pageviews: formatMetric('pageviews', stats.pageviews24h, locale),
            })
          : null}{' '}
        {ins.updatedAt
          ? t('insights.updated', { time: formatRelative(ins.updatedAt, locale) })
          : t('insights.notYetRolledUp')}
      </p>

      <section aria-label={t('site.keyNumbers')} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="grid content-start gap-2.5 rounded-lg border border-border bg-surface p-5">
          <span className="text-[0.8125rem] font-medium text-text-muted">{t('metric.health')}</span>
          {ins.health.score === null || !health ? (
            <NotEnough>{t('insights.notEnoughShort')}</NotEnough>
          ) : (
            <div className="flex items-center gap-3.5">
              <HealthRing
                score={ins.health.score}
                label={t('metric.healthOf', { score: ins.health.score })}
              />
              <div className="grid gap-0.5">
                <span className={cx('font-semibold', toneText[health])}>{t(`health.${health}`)}</span>
                {ins.health.previous !== null ? (
                  <Delta
                    metric="health_score"
                    value={ins.health.score}
                    previous={ins.health.previous}
                    locale={locale}
                    suffix={since}
                  />
                ) : null}
              </div>
            </div>
          )}
        </div>
        <div className={tileClass}>
          <span className="text-[0.8125rem] font-medium text-text-muted">
            {t(`insights.visits.${ins.range}`)}
          </span>
          <div className="flex items-baseline gap-2.5">
            <span className={bigNumberClass}>{formatMetric('visitors', ins.visits.value, locale)}</span>
            <Delta
              metric="visitors"
              value={ins.visits.value}
              previous={ins.visits.previous}
              locale={locale}
            />
          </div>
          <Sparkline values={ins.visits.trend} />
        </div>
        {ins.funnel ? (
          <div className={tileClass}>
            <span className="text-[0.8125rem] font-medium text-text-muted">
              {t('metric.funnelCompletion', { name: ins.funnel.name })}
            </span>
            {conversion === null ? (
              <NotEnough>{t('insights.notEnoughShort')}</NotEnough>
            ) : (
              <>
                <div className="flex items-baseline gap-2.5">
                  <span className={bigNumberClass}>
                    {formatMetric('conversion_rate', conversion, locale)}
                  </span>
                  {ins.funnel.conversion.previous !== null ? (
                    <Delta
                      metric="conversion_rate"
                      value={conversion}
                      previous={ins.funnel.conversion.previous}
                      locale={locale}
                    />
                  ) : null}
                </div>
                <Sparkline values={ins.funnel.trend.filter((x): x is number => x !== null)} />
              </>
            )}
          </div>
        ) : (
          <div className={tileClass}>
            <span className="text-[0.8125rem] font-medium text-text-muted">{t('metric.bounce')}</span>
            {ins.bounce.value === null ? (
              <NotEnough>{t('insights.notEnoughShort')}</NotEnough>
            ) : (
              <div className="flex items-baseline gap-2.5">
                <span className={bigNumberClass}>
                  {formatMetric('bounce_rate', ins.bounce.value, locale)}
                </span>
                {ins.bounce.previous !== null ? (
                  <Delta
                    metric="bounce_rate"
                    value={ins.bounce.value}
                    previous={ins.bounce.previous}
                    locale={locale}
                  />
                ) : null}
              </div>
            )}
          </div>
        )}
        <div className={tileClass}>
          <span className="text-[0.8125rem] font-medium text-text-muted">{t('metric.lcpPhones')}</span>
          {ins.lcpPhones.p75 === null || !ins.lcpPhones.rating ? (
            <NotEnough>{t('insights.vitalsNotEnough')}</NotEnough>
          ) : (
            <>
              <div className="flex items-baseline gap-2.5">
                <span className={bigNumberClass}>{formatMetric('lcp', ins.lcpPhones.p75, locale)}</span>
                {ins.lcpPhones.previous !== null ? (
                  <Delta
                    metric="lcp"
                    value={ins.lcpPhones.p75}
                    previous={ins.lcpPhones.previous}
                    locale={locale}
                  />
                ) : null}
              </div>
              <span className={cx('text-[0.8125rem]', toneText[ratingTone[ins.lcpPhones.rating]])}>
                {t(`speed.${ratingTone[ins.lcpPhones.rating]}`)}
              </span>
            </>
          )}
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <FunnelPanel
          key={ins.funnel?.template ?? 'none'}
          ins={ins}
          siteId={siteId}
          orgId={orgId}
          canEdit={canEdit}
          locale={locale}
        />
        <SpeedPanel ins={ins} locale={locale} />
      </div>

      <PagesTable ins={ins} locale={locale} />
    </div>
  );
}
