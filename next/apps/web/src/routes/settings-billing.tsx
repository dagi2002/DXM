import type { BillingInvoice, BillingOverview } from '@pulse/contracts';
import {
  GRACE_DAYS,
  PAID_PLAN_IDS,
  TRIAL_DAYS,
  type BillingInterval,
  type PaidPlanId,
} from '@pulse/contracts/constants';
import type { Locale } from '@pulse/i18n';
import { formatMetric, formatMoney } from '@pulse/metrics';
import { Banner, Button, Segmented, Skeleton, StatusBadge, cx } from '@pulse/ui';
import { useQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { Check } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Panel, scrollRegionClass } from '../components/pulse';
import { ApiError } from '../lib/api';
import { billingQuery, useBillingActions } from '../lib/billing';
import { useFormatDate, useMe } from '../lib/queries';

const useLocale = () => useTranslation().i18n.language as Locale;
const count = (n: number, locale: Locale) => formatMetric('visitors', n, locale);

function StatusLine({ billing }: { billing: BillingOverview }) {
  const { t } = useTranslation();
  const formatDate = useFormatDate();
  const sub = billing.subscription;
  if (!sub) return <p className="text-sm text-text-muted">{t('billing.status.free')}</p>;
  const end = formatDate(sub.currentPeriodEnd);
  const tone = sub.status === 'restricted' ? 'bad' : sub.status === 'past_due' ? 'warn' : 'good';
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <StatusBadge tone={tone}>{t(`billing.status.${sub.status}`)}</StatusBadge>
      <span className="text-sm text-text-muted">
        {sub.status === 'trialing'
          ? t('billing.status.trialing.note', { date: end })
          : sub.status === 'active'
            ? t(sub.comp ? 'billing.status.comp.note' : 'billing.status.active.note', { date: end })
            : sub.status === 'past_due'
              ? t('billing.status.past_due.note', {
                  date: sub.graceEndsAt ? formatDate(sub.graceEndsAt) : end,
                })
              : t('billing.status.restricted.note')}
      </span>
    </div>
  );
}

function Usage({ billing }: { billing: BillingOverview }) {
  const { t } = useTranslation();
  const locale = useLocale();
  const formatDate = useFormatDate();
  const { usage, entitlements } = billing;
  const rows: [string, string][] = [
    [
      t('billing.usage.sites'),
      t('billing.usage.of', { used: count(usage.sites, locale), limit: count(usage.siteLimit, locale) }),
    ],
    [t('billing.usage.retention'), t('billing.usage.days', { count: entitlements.retentionDays })],
    [
      t('billing.usage.replay'),
      t(entitlements.replay ? 'billing.usage.replay.on' : 'billing.usage.replay.off'),
    ],
  ];
  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span id="billing-sessions" className="text-sm font-semibold">
            {t('billing.usage.sessions')}
          </span>
          <span className="text-sm text-text-muted" data-testid="billing-sessions">
            {t('billing.usage.of', {
              used: count(usage.sessions, locale),
              limit: count(usage.sessionLimit, locale),
            })}
          </span>
        </div>
        <progress
          aria-labelledby="billing-sessions"
          value={Math.min(usage.sessions, usage.sessionLimit)}
          max={Math.max(usage.sessionLimit, 1)}
          className={cx(
            'h-2 w-full overflow-hidden rounded-full [&::-moz-progress-bar]:bg-current [&::-webkit-progress-bar]:bg-surface-sunken [&::-webkit-progress-value]:bg-current',
            usage.blocked ? 'text-bad' : 'text-primary',
          )}
        />
        <p className="text-[0.8125rem] text-text-muted">
          {t('billing.usage.since', { date: formatDate(usage.periodStart) })}
        </p>
      </div>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt className="text-text-muted">{label}</dt>
            <dd className="font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function InvoiceStatus({ invoice }: { invoice: BillingInvoice }) {
  const { t } = useTranslation();
  const tone = invoice.status === 'paid' ? 'good' : invoice.status === 'open' ? 'warn' : 'info';
  return <StatusBadge tone={tone}>{t(`billing.invoice.status.${invoice.status}`)}</StatusBadge>;
}

function Invoices({
  billing,
  onPay,
  paying,
}: {
  billing: BillingOverview;
  onPay: (id: string) => void;
  paying: boolean;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  const formatDate = useFormatDate();
  if (billing.invoices.length === 0) {
    return <p className="text-sm text-text-muted">{t('billing.invoices.empty')}</p>;
  }
  return (
    <div className={scrollRegionClass} tabIndex={0} role="region" aria-label={t('billing.invoices.title')}>
      <table className="w-full min-w-[36rem] text-left text-sm">
        <thead className="text-[0.8125rem] text-text-muted">
          <tr>
            <th scope="col" className="py-2 pr-4 font-semibold">
              {t('billing.invoices.number')}
            </th>
            <th scope="col" className="py-2 pr-4 font-semibold">
              {t('billing.invoices.for')}
            </th>
            <th scope="col" className="py-2 pr-4 font-semibold">
              {t('billing.invoices.amount')}
            </th>
            <th scope="col" className="py-2 pr-4 font-semibold">
              {t('billing.invoices.status')}
            </th>
            <th scope="col" className="py-2 font-semibold">
              {t('billing.invoices.receipt')}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {billing.invoices.map((inv) => (
            <tr key={inv.id} data-testid="billing-invoice">
              <td className="py-3 pr-4 font-semibold">
                {t('billing.invoices.numberValue', { number: inv.number })}
              </td>
              <td className="py-3 pr-4">
                {t(`billing.plan.${inv.plan}`)} · {t(`billing.interval.${inv.interval}`)}
                <span className="block text-[0.8125rem] text-text-muted">
                  {t('billing.invoices.period', {
                    from: formatDate(inv.periodStart),
                    to: formatDate(inv.periodEnd),
                  })}
                </span>
              </td>
              <td className="py-3 pr-4 whitespace-nowrap">{formatMoney(inv.amountSantim, locale)}</td>
              <td className="py-3 pr-4">
                <InvoiceStatus invoice={inv} />
              </td>
              <td className="py-3">
                {inv.status === 'paid' && inv.paidAt ? (
                  <span className="text-[0.8125rem] text-text-muted">
                    {t('billing.invoices.paidOn', { date: formatDate(inv.paidAt) })}
                    {inv.paymentMethod || inv.paymentReference ? (
                      <span className="block" lang="en">
                        {[inv.paymentMethod, inv.paymentReference].filter(Boolean).join(' · ')}
                      </span>
                    ) : null}
                  </span>
                ) : inv.status === 'open' ? (
                  <span className="grid gap-1">
                    <span className="text-[0.8125rem] text-text-muted">
                      {t('billing.invoices.due', { date: formatDate(inv.dueAt) })}
                    </span>
                    {billing.configured ? (
                      <Button size="sm" className="w-fit" onPress={() => onPay(inv.id)} isDisabled={paying}>
                        {t('billing.pay')}
                      </Button>
                    ) : null}
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Plans({
  billing,
  interval,
  onChoose,
  busy,
}: {
  billing: BillingOverview;
  interval: BillingInterval;
  onChoose: (plan: PaidPlanId) => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const locale = useLocale();
  const sub = billing.subscription;
  return (
    <ul className="grid gap-4 lg:grid-cols-3">
      {PAID_PLAN_IDS.map((id) => {
        const plan = billing.plans.find((p) => p.id === id)!;
        const current = billing.plan === id && sub?.interval === interval && sub.status !== 'restricted';
        const price = interval === 'year' ? plan.yearSantim : plan.monthSantim;
        const includes = [
          t('billing.plan.sites', { count: plan.sites }),
          t('billing.plan.sessions', { sessions: count(plan.sessions, locale) }),
          t('billing.plan.retention', { count: plan.retentionDays }),
          t('billing.plan.replay'),
        ];
        return (
          <li
            key={id}
            data-testid={`billing-plan-${id}`}
            className={cx(
              'grid content-start gap-3 rounded-lg border p-4',
              current ? 'border-primary bg-primary-soft' : 'border-border',
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold">{t(`billing.plan.${id}`)}</h3>
              {billing.plan === id && sub ? (
                <StatusBadge tone="info">{t('billing.plan.current')}</StatusBadge>
              ) : null}
            </div>
            <p>
              <span className="text-xl font-bold">{formatMoney(price, locale)}</span>{' '}
              <span className="text-sm text-text-muted">{t(`billing.per.${interval}`)}</span>
            </p>
            <ul className="grid gap-1.5 text-sm">
              {includes.map((line) => (
                <li key={line} className="flex items-start gap-2">
                  <Check size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-good" />
                  {line}
                </li>
              ))}
            </ul>
            <Button
              variant={current ? 'secondary' : 'primary'}
              className="mt-1 w-fit"
              isDisabled={busy}
              onPress={() => onChoose(id)}
            >
              {billing.trialAvailable
                ? t('billing.choose.trial', { days: TRIAL_DAYS })
                : current
                  ? t('billing.choose.invoice')
                  : t('billing.choose.switch')}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

/** Settings → Billing (owner only): plan, usage against the quota, invoices with pay links, upgrade. */
export function BillingSection() {
  const { t } = useTranslation();
  const locale = useLocale();
  const { orgId } = useMe();
  const search = useSearch({ strict: false }) as { paid?: string };
  const actions = useBillingActions(orgId);
  const [interval, setInterval] = useState<BillingInterval>('month');
  // Back from Chapa: the invoice turns paid when Chapa's confirmation reaches the server.
  const { data: billing, isError } = useQuery(billingQuery(orgId, search.paid));
  const returned = billing?.invoices.find((i) => i.id === search.paid);
  const waiting = returned?.status === 'open';

  if (isError) return <Banner tone="bad" title={t('errors.generic.body')} />;
  if (!billing) return <Skeleton className="h-64" />;

  const payError = actions.pay.error;
  const usage = billing.usage;
  return (
    <div className="grid gap-6">
      {!billing.configured ? (
        <Banner tone="info" title={t('billing.notConfigured.title')}>
          {t('billing.notConfigured.body')}
        </Banner>
      ) : billing.mode === 'test' ? (
        <Banner tone="info" title={t('billing.testMode.title')}>
          {t('billing.testMode.body')}
        </Banner>
      ) : null}
      {returned?.status === 'paid' ? (
        <Banner tone="good" title={t('billing.paid.title', { number: returned.number })} />
      ) : waiting ? (
        <Banner tone="info" title={t('billing.waiting.title')}>
          {t('billing.waiting.body')}
        </Banner>
      ) : null}
      {billing.subscription?.status === 'restricted' ? (
        <Banner tone="bad" title={t('billing.notice.restricted.title')}>
          {t('billing.notice.restricted.body')}
        </Banner>
      ) : usage.blocked ? (
        <Banner tone="warn" title={t('billing.notice.quota.title')}>
          {t('billing.notice.quota.body', { limit: count(usage.sessionLimit, locale) })}
        </Banner>
      ) : null}
      {payError ? (
        <Banner
          tone="bad"
          title={t(
            payError instanceof ApiError && payError.code === 'billing_not_configured'
              ? 'billing.notConfigured.title'
              : 'billing.pay.error',
          )}
        />
      ) : null}
      {actions.subscribe.isError ? <Banner tone="bad" title={t('errors.generic.body')} /> : null}

      <Panel
        id="settings-billing"
        title={t('billing.current.title', { plan: t(`billing.plan.${billing.plan}`) })}
        note={t('billing.current.note', { days: GRACE_DAYS })}
      >
        <StatusLine billing={billing} />
        <Usage billing={billing} />
      </Panel>

      <Panel
        id="settings-billing-invoices"
        title={t('billing.invoices.title')}
        note={t('billing.invoices.note')}
      >
        <Invoices billing={billing} onPay={(id) => actions.pay.mutate(id)} paying={actions.pay.isPending} />
      </Panel>

      <Panel
        id="settings-billing-plans"
        title={t('billing.plans.title')}
        note={t(billing.trialAvailable ? 'billing.plans.note.trial' : 'billing.plans.note', {
          days: TRIAL_DAYS,
        })}
        action={
          <Segmented
            label={t('billing.interval')}
            hideLabel
            value={interval}
            onChange={(v) => setInterval(v as BillingInterval)}
            options={[
              { id: 'month', label: t('billing.interval.month') },
              { id: 'year', label: t('billing.interval.year') },
            ]}
          />
        }
      >
        <Plans
          billing={billing}
          interval={interval}
          busy={actions.subscribe.isPending}
          onChoose={(plan) => actions.subscribe.mutate({ plan, interval })}
        />
      </Panel>
    </div>
  );
}
