import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Check, CreditCard, MessageCircle, Sparkles, Zap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { fetchJson } from '../lib/api';
import {
  PLAN_CATALOG,
  type BillingUpgradeRequest,
  getPlanLabel,
  getPlanMeta,
  getRecommendedUpgradePlan,
  getUpgradeSourceLabel,
  type BillingCurrentResponse,
  type UpgradeSource,
} from '../lib/billing';

const isUpgradeSource = (value: string | null): value is UpgradeSource =>
  value === 'site_limit' ||
  value === 'replay' ||
  value === 'funnels' ||
  value === 'user_flow' ||
  value === 'alerts' ||
  value === 'reports' ||
  value === 'telegram' ||
  value === 'digest' ||
  value === 'direct_billing';

const formatPrice = (priceEtb: number) => {
  if (priceEtb === 0) {
    return 'Free';
  }

  return `${priceEtb.toLocaleString()} ETB`;
};

export const BillingPage: React.FC = () => {
  const location = useLocation();
  const { user, workspace } = useAuth();
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const source = isUpgradeSource(searchParams.get('source')) ? searchParams.get('source') : null;
  const requestedPlanParam = searchParams.get('plan');

  const [billing, setBilling] = useState<BillingCurrentResponse>({
    plan: workspace?.plan || 'free',
    billing_status: workspace?.billingStatus || 'active',
    siteCount: 0,
    siteLimit: getPlanMeta(workspace?.plan || 'free').siteLimit,
  });
  const [selectedPlanId, setSelectedPlanId] = useState<'free' | 'starter' | 'pro'>(
    requestedPlanParam === 'starter' || requestedPlanParam === 'pro'
      ? requestedPlanParam
      : getRecommendedUpgradePlan(workspace?.plan || 'free'),
  );
  const [upgradeRequests, setUpgradeRequests] = useState<BillingUpgradeRequest[]>([]);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);

  useEffect(() => {
    void Promise.all([
      fetchJson<BillingCurrentResponse>('/billing/current'),
      fetchJson<BillingUpgradeRequest[]>('/billing/upgrade-requests'),
    ])
      .then(([billingData, requestData]) => {
        setBilling(billingData);
        setUpgradeRequests(requestData);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (requestedPlanParam === 'starter' || requestedPlanParam === 'pro') {
      setSelectedPlanId(requestedPlanParam);
      return;
    }

    setSelectedPlanId(getRecommendedUpgradePlan(billing.plan));
  }, [billing.plan, requestedPlanParam]);

  const currentPlanMeta = getPlanMeta(billing.plan);
  const selectedPlanMeta = getPlanMeta(selectedPlanId);
  const effectiveSource = source ?? 'direct_billing';
  const sourceLabel = getUpgradeSourceLabel(effectiveSource);
  const statusTone =
    billing.billing_status === 'active'
      ? 'text-emerald-700 bg-emerald-50'
      : billing.billing_status === 'past_due'
      ? 'text-amber-700 bg-amber-50'
      : 'text-red-700 bg-red-50';

  const telegramMessage = [
    'DXM Pulse manual upgrade request',
    `Workspace: ${workspace?.name || 'Unknown workspace'} (${workspace?.id || 'unknown'})`,
    `User: ${user?.email || 'unknown'}`,
    `Current plan: ${getPlanLabel(billing.plan)}`,
    `Requested plan: ${selectedPlanMeta.name}`,
    `Tracked sites: ${billing.siteCount}/${billing.siteLimit}`,
    source ? `Upgrade trigger: ${source}` : null,
  ]
    .filter(Boolean)
    .join('\n');
  const telegramHref = `https://t.me/dxmpulse?text=${encodeURIComponent(telegramMessage)}`;
  const hasPaidSelection = selectedPlanMeta.priceEtb > 0 && selectedPlanId !== billing.plan;
  const latestUpgradeRequest = upgradeRequests[0] ?? null;
  const latestUpgradeRequestMatchesCurrentPlan =
    latestUpgradeRequest?.status === 'activated' && latestUpgradeRequest.requestedPlan === billing.plan;

  const handleContinueToTelegram = async () => {
    if (!hasPaidSelection || isSubmittingRequest) {
      return;
    }

    setIsSubmittingRequest(true);
    setRequestError(null);

    try {
      const requestRecord = await fetchJson<BillingUpgradeRequest>('/billing/upgrade-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestedPlan: selectedPlanId,
          source: effectiveSource,
        }),
      });
      setUpgradeRequests((current) => {
        const next = [requestRecord, ...current.filter((item) => item.id !== requestRecord.id)];
        return next;
      });
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'Could not log the upgrade request.');
    } finally {
      setIsSubmittingRequest(false);
      window.open(telegramHref, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="mx-auto max-w-6xl p-6 md:p-8">
      <div className="flex items-center gap-3">
        <Link to="/settings" className="text-surface-400 transition hover:text-surface-700">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Billing & Plan</h1>
          <p className="mt-1 text-sm text-surface-500">
            Manual upgrades are live now. Automated payments can wait until a few agency workspaces are paying reliably.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-[28px] border border-primary-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50">
                <Zap className="h-5 w-5 text-primary-600" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-surface-500">Current workspace plan</p>
                <h2 className="mt-1 text-2xl font-semibold text-surface-900">{currentPlanMeta.name}</h2>
              </div>
            </div>
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${statusTone}`}>
              {billing.billing_status}
            </span>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl bg-surface-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-surface-500">Tracked sites used</p>
              <p className="mt-2 text-3xl font-bold text-surface-900">
                {billing.siteCount}/{billing.siteLimit}
              </p>
              <p className="mt-2 text-sm text-surface-600">This milestone enforces tracked-site limits directly at site creation.</p>
            </div>
            <div className="rounded-3xl bg-surface-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-surface-500">Recommended next step</p>
              <p className="mt-2 text-2xl font-semibold text-surface-900">{selectedPlanMeta.name}</p>
              <p className="mt-2 text-sm text-surface-600">
                {selectedPlanMeta.priceEtb === 0
                  ? 'Free is active by default.'
                  : `${selectedPlanMeta.siteLimitLabel} and the full paid agency bundle.`}
              </p>
            </div>
          </div>

          {sourceLabel && (
            <div className="mt-6 rounded-3xl border border-primary-200 bg-primary-50 px-5 py-4 text-sm text-primary-800">
              {sourceLabel}
            </div>
          )}

          {latestUpgradeRequest && (
            <div className="mt-6 rounded-3xl border border-surface-200 bg-surface-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-surface-500">Latest upgrade request</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <span className="text-lg font-semibold text-surface-900">
                  {getPlanLabel(latestUpgradeRequest.requestedPlan)}
                </span>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${
                    latestUpgradeRequest.status === 'activated'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {latestUpgradeRequest.status === 'activated' ? 'Plan active' : 'Request received'}
                </span>
              </div>
              <p className="mt-2 text-sm text-surface-600">
                Requested on {new Date(latestUpgradeRequest.createdAt).toLocaleString()} from the {latestUpgradeRequest.source.replace(/_/g, ' ')} trigger.
              </p>
              {latestUpgradeRequest.status === 'activated' && latestUpgradeRequest.activatedAt && (
                <p className="mt-2 text-sm text-emerald-700">
                  Activated on {new Date(latestUpgradeRequest.activatedAt).toLocaleString()}.
                </p>
              )}
            </div>
          )}
        </section>

        <section className="rounded-[28px] border border-surface-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <CreditCard className="h-5 w-5 text-primary-600" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-surface-500">Manual upgrade flow</p>
              <h2 className="mt-1 text-xl font-semibold text-surface-900">Choose a plan, then continue on Telegram</h2>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {[
              'Pick the paid plan you want below.',
              'Open Telegram with the prefilled upgrade request.',
              'Send payment proof or transfer reference in the same thread.',
              'DXM activates the workspace manually and the plan unlocks on refresh.',
            ].map((step, index) => (
              <div key={step} className="flex items-start gap-3 rounded-3xl border border-surface-200 bg-surface-50 px-4 py-4">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs font-semibold text-primary-700 shadow-sm">
                  {index + 1}
                </div>
                <p className="text-sm text-surface-700">{step}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-3xl border border-primary-200 bg-primary-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-700">Selected plan</p>
            <div className="mt-3 flex items-end gap-2">
              <span className="text-3xl font-bold text-surface-900">{selectedPlanMeta.name}</span>
              {selectedPlanMeta.priceEtb > 0 && (
                <span className="pb-1 text-sm text-surface-500">{formatPrice(selectedPlanMeta.priceEtb)} / month</span>
              )}
            </div>
            <p className="mt-3 text-sm text-surface-600">{selectedPlanMeta.description}</p>

            <a
              href={hasPaidSelection ? telegramHref : '#'}
              className={`mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold transition ${
                hasPaidSelection
                  ? 'bg-primary-600 text-white hover:bg-primary-700'
                  : 'cursor-not-allowed bg-surface-200 text-surface-500'
              }`}
              aria-disabled={!hasPaidSelection}
              onClick={(event) => {
                event.preventDefault();
                void handleContinueToTelegram();
              }}
            >
              <MessageCircle className="h-4 w-4" />
              {hasPaidSelection
                ? isSubmittingRequest
                  ? 'Logging request and opening Telegram…'
                  : `Continue on Telegram for ${selectedPlanMeta.name}`
                : 'Select a paid plan to continue'}
            </a>

            <p className="mt-3 text-xs text-surface-500">
              The request includes your workspace, current plan, selected plan, and upgrade trigger so activation stays fast and traceable.
            </p>
            {requestError && (
              <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                {requestError} Telegram still opened so the manual upgrade flow is not blocked.
              </p>
            )}
            {latestUpgradeRequestMatchesCurrentPlan && (
              <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
                This workspace is already active on the requested plan. Refreshing the rest of the app will show the unlocked features.
              </p>
            )}
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-3">
        {PLAN_CATALOG.map((plan) => {
          const isCurrent = plan.id === billing.plan;
          const isSelected = plan.id === selectedPlanId;

          return (
            <article
              key={plan.id}
              className={`rounded-[28px] border p-6 shadow-sm transition ${
                isSelected
                  ? 'border-primary-300 bg-white ring-2 ring-primary-300'
                  : isCurrent
                  ? 'border-emerald-300 bg-emerald-50/30'
                  : 'border-surface-200 bg-white'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-2xl font-semibold text-surface-900">{plan.name}</h3>
                  <p className="mt-3 text-sm leading-6 text-surface-600">{plan.description}</p>
                </div>
                {plan.highlight && (
                  <div className="rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary-700">
                    Recommended
                  </div>
                )}
              </div>

              <div className="mt-6 flex items-end gap-2">
                <span className="text-4xl font-bold text-surface-900">{formatPrice(plan.priceEtb)}</span>
                {plan.priceEtb > 0 && <span className="pb-1 text-sm text-surface-500">/ month</span>}
              </div>

              <div className="mt-4 rounded-2xl bg-surface-50 px-4 py-3 text-sm text-surface-700">
                {plan.siteLimitLabel}
              </div>

              <div className="mt-5 space-y-3">
                {plan.features.map((feature) => (
                  <div key={feature} className="flex items-start gap-2 text-sm text-surface-700">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>

              <button
                type="button"
                disabled={isCurrent}
                onClick={() => setSelectedPlanId(plan.id)}
                className={`mt-8 inline-flex w-full items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                  isCurrent
                    ? 'cursor-not-allowed bg-emerald-100 text-emerald-700'
                    : isSelected
                    ? 'bg-primary-600 text-white hover:bg-primary-700'
                    : 'bg-surface-900 text-white hover:bg-surface-950'
                }`}
              >
                {isCurrent ? 'Current plan' : isSelected ? 'Selected for manual upgrade' : `Select ${plan.name}`}
              </button>
            </article>
          );
        })}
      </div>

      <div className="mt-6 rounded-[28px] border border-surface-200 bg-white p-6 shadow-sm">
        <div className="inline-flex items-center gap-2 rounded-full bg-surface-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-surface-600">
          <Sparkles className="h-3.5 w-3.5" />
          Keep it lean
        </div>
        <p className="mt-4 max-w-4xl text-sm leading-7 text-surface-600">
          This milestone deliberately avoids automated checkout, invoices, coupons, proration, annual plans, and dunning. The goal is to activate the first paid workspaces cleanly, learn from them, and only then invest in payment automation.
        </p>
      </div>
    </div>
  );
};
