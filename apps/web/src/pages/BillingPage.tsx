import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  CheckCircle,
  CreditCard,
  Loader2,
  MessageCircle,
  Sparkles,
  XCircle,
  Zap,
} from 'lucide-react';
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

/* ── Helpers ─────────────────────────────────────────────────────── */

const PENDING_PLAN_KEY = 'dxm_pending_plan';

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
  if (priceEtb === 0) return 'Free';
  return `${priceEtb.toLocaleString()} ETB`;
};

type PaymentStatus = 'idle' | 'initiating' | 'processing' | 'activating' | 'complete' | 'failed' | 'cancelled' | 'timeout';

/* ── Component ───────────────────────────────────────────────────── */

export const BillingPage: React.FC = () => {
  const location = useLocation();
  const { user, workspace, refreshUser } = useAuth();
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const source = isUpgradeSource(searchParams.get('source')) ? searchParams.get('source') : null;
  const requestedPlanParam = searchParams.get('plan');
  const returnStatus = searchParams.get('status'); // from Chapa redirect

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
  const [chapaAvailable, setChapaAvailable] = useState(true);

  // Payment flow state
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('idle');
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [txRef, setTxRef] = useState<string | null>(() => {
    try { return localStorage.getItem('dxm_tx_ref'); } catch { return null; }
  });
  const pollRef = useRef<number>();
  const pollCountRef = useRef(0);

  /* ── Resolve pending plan from localStorage on mount ───────────── */

  const pendingPlan = useMemo(() => {
    try { return localStorage.getItem(PENDING_PLAN_KEY) as 'starter' | 'pro' | null; } catch { return null; }
  }, []);

  /* ── Early derived values (needed by effects) ────────────────── */

  const latestUpgradeRequest = upgradeRequests[0] ?? null;

  /* ── Initial data load ─────────────────────────────────────────── */

  useEffect(() => {
    void Promise.all([
      fetchJson<BillingCurrentResponse>('/billing/current'),
      fetchJson<BillingUpgradeRequest[]>('/billing/upgrade-requests'),
    ])
      .then(([billingData, requestData]) => {
        setBilling(billingData);
        setUpgradeRequests(requestData);

        // If we already have the target plan (webhook fired before redirect), clear pending
        const pending = pendingPlan;
        if (pending && billingData.plan === pending) {
          try { localStorage.removeItem(PENDING_PLAN_KEY); } catch {}
          if (returnStatus === 'success') {
            console.info('[billing] payment_success', { plan: pending, txRef, source: 'fast_activation' });
            setPaymentStatus('complete');
            void refreshUser();
          }
        }
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Telegram manual-activation polling ───────────────────────── */

  useEffect(() => {
    // If latest upgrade request is 'requested' (awaiting manual activation),
    // poll billing/current to detect when admin activates it
    if (!latestUpgradeRequest || latestUpgradeRequest.status !== 'requested') return;
    if (paymentStatus !== 'idle') return; // don't interfere with Chapa flow

    const telegramPollInterval = window.setInterval(async () => {
      try {
        const data = await fetchJson<BillingCurrentResponse>('/billing/current');
        setBilling(data);

        if (data.plan === latestUpgradeRequest.requestedPlan) {
          clearInterval(telegramPollInterval);
          console.info('[billing] payment_success', { plan: data.plan, source: 'telegram_manual' });
          await refreshUser();
          setPaymentStatus('complete');
        }
      } catch {
        // Silently retry
      }
    }, 5000);

    return () => clearInterval(telegramPollInterval);
  }, [latestUpgradeRequest?.status, latestUpgradeRequest?.requestedPlan, paymentStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Handle Chapa return URL status ────────────────────────────── */

  useEffect(() => {
    if (!returnStatus) return;

    if (returnStatus === 'failed') {
      setPaymentStatus('failed');
      setPaymentError('Your payment was not completed. Please try again.');
      try { localStorage.removeItem(PENDING_PLAN_KEY); } catch {}
      console.info('[billing] payment_failed', { reason: 'chapa_redirect_failed' });
    } else if (returnStatus === 'cancelled') {
      setPaymentStatus('cancelled');
      try { localStorage.removeItem(PENDING_PLAN_KEY); } catch {}
      console.info('[billing] payment_failed', { reason: 'user_cancelled' });
    } else if (returnStatus === 'success') {
      // Check if already resolved (plan already active from initial load)
      if (paymentStatus !== 'complete') {
        const targetPlan = pendingPlan;
        setPaymentStatus('processing');
        if (targetPlan) setSelectedPlanId(targetPlan);
      }
    }

    // Clear URL params to prevent stale state on refresh/bookmark
    window.history.replaceState({}, document.title, window.location.pathname);
  }, [returnStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Activation polling ────────────────────────────────────────── */

  const startPolling = useCallback((targetPlan: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollCountRef.current = 0;
    setPaymentStatus('processing');

    pollRef.current = window.setInterval(async () => {
      pollCountRef.current += 1;

      // Max 20 attempts = 60s
      if (pollCountRef.current > 20) {
        clearInterval(pollRef.current);
        setPaymentStatus('timeout');
        return;
      }

      try {
        const data = await fetchJson<BillingCurrentResponse>('/billing/current');
        setBilling(data);

        if (data.plan === targetPlan) {
          clearInterval(pollRef.current);
          try { localStorage.removeItem(PENDING_PLAN_KEY); } catch {}
          setPaymentStatus('activating');

          // Analytics: payment success
          console.info('[billing] payment_success', { plan: targetPlan, txRef: txRef });

          // Refresh auth context so feature gates unlock globally
          await refreshUser();
          setPaymentStatus('complete');
        }
      } catch {
        // Silently retry on poll failure
      }
    }, 3000);
  }, [refreshUser]);

  // Start polling when payment status becomes 'processing'
  useEffect(() => {
    if (paymentStatus === 'processing') {
      const target = pendingPlan || selectedPlanId;
      if (target && target !== 'free') {
        startPolling(target);
      }
    }

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [paymentStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Plan selection sync ───────────────────────────────────────── */

  useEffect(() => {
    if (requestedPlanParam === 'starter' || requestedPlanParam === 'pro') {
      setSelectedPlanId(requestedPlanParam);
      return;
    }
    setSelectedPlanId(getRecommendedUpgradePlan(billing.plan));
  }, [billing.plan, requestedPlanParam]);

  /* ── Derived values ────────────────────────────────────────────── */

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
  const latestUpgradeRequestMatchesCurrentPlan =
    latestUpgradeRequest?.status === 'activated' && latestUpgradeRequest.requestedPlan === billing.plan;

  const isPaymentInProgress = paymentStatus === 'initiating' || paymentStatus === 'processing' || paymentStatus === 'activating';

  /* ── Chapa payment initiation ──────────────────────────────────── */

  const handlePayWithChapa = async () => {
    if (!hasPaidSelection || isPaymentInProgress) return;

    setPaymentStatus('initiating');
    setPaymentError(null);

    // Persist pending plan before redirect
    try { localStorage.setItem(PENDING_PLAN_KEY, selectedPlanId); } catch {}

    try {
      const result = await fetchJson<{ checkoutUrl: string; txRef: string }>(
        '/billing/chapa/initiate',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ requestedPlan: selectedPlanId }),
        },
      );

      // Store txRef for confirmation screen
      try { localStorage.setItem('dxm_tx_ref', result.txRef); } catch {}
      setTxRef(result.txRef);

      // Analytics: payment started
      console.info('[billing] payment_started', { plan: selectedPlanId, txRef: result.txRef });

      // Redirect to Chapa checkout
      window.location.href = result.checkoutUrl;
    } catch (err: unknown) {
      try { localStorage.removeItem(PENDING_PLAN_KEY); } catch {}

      const status = (err as { status?: number })?.status;
      const message = err instanceof Error ? err.message : 'Payment initiation failed';

      // Analytics: payment failed
      console.info('[billing] payment_failed', { plan: selectedPlanId, error: message, httpStatus: status });

      if (status === 503) {
        // Chapa not configured on this server
        setChapaAvailable(false);
        setPaymentStatus('idle');
        setPaymentError('Online payment is not available on this server. Use the manual Telegram flow below.');
      } else if (status === 502) {
        setPaymentStatus('failed');
        setPaymentError('Payment provider is temporarily unavailable. Try again in a moment, or use the manual Telegram flow.');
      } else {
        setPaymentStatus('failed');
        setPaymentError(message);
      }
    }
  };

  /* ── Telegram fallback ─────────────────────────────────────────── */

  const handleContinueToTelegram = async () => {
    if (!hasPaidSelection || isSubmittingRequest) return;

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

  /* ── Render ────────────────────────────────────────────────────── */

  return (
    <div className="mx-auto max-w-6xl p-6 md:p-8">
      <div className="flex items-center gap-3">
        <Link to="/settings" className="text-surface-400 transition hover:text-surface-700">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Billing & Plan</h1>
          <p className="mt-1 text-sm text-surface-500">
            Upgrade your workspace to unlock the full agency suite.
          </p>
        </div>
      </div>

      {/* ── Payment status banners ─────────────────────────────────── */}

      {paymentStatus === 'processing' && (
        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <Loader2 className="h-5 w-5 animate-spin text-amber-600" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Waiting for payment confirmation...</p>
            <p className="mt-0.5 text-xs text-amber-600">This usually takes a few seconds. Do not close this page.</p>
          </div>
        </div>
      )}

      {paymentStatus === 'activating' && (
        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-primary-200 bg-primary-50 px-5 py-4">
          <Loader2 className="h-5 w-5 animate-spin text-primary-600" />
          <div>
            <p className="text-sm font-semibold text-primary-800">Activating your plan...</p>
            <p className="mt-0.5 text-xs text-primary-600">Unlocking features across your workspace.</p>
          </div>
        </div>
      )}

      {paymentStatus === 'complete' && (
        <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-6">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-6 w-6 text-emerald-600" />
            <p className="text-lg font-semibold text-emerald-800">Payment successful</p>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl bg-white px-4 py-3">
              <p className="text-xs text-surface-500">Plan</p>
              <p className="mt-1 text-sm font-semibold text-surface-900">{getPlanLabel(billing.plan)}</p>
            </div>
            <div className="rounded-xl bg-white px-4 py-3">
              <p className="text-xs text-surface-500">Amount</p>
              <p className="mt-1 text-sm font-semibold text-surface-900">{formatPrice(getPlanMeta(billing.plan).priceEtb)}</p>
            </div>
            {txRef && (
              <div className="rounded-xl bg-white px-4 py-3">
                <p className="text-xs text-surface-500">Reference</p>
                <p className="mt-1 text-sm font-semibold text-surface-900 font-mono">#{txRef}</p>
              </div>
            )}
          </div>
          <p className="mt-3 text-xs text-emerald-600">All features are unlocked. No refresh needed.</p>
          <Link
            to="/dashboard"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            Go to Dashboard
          </Link>
        </div>
      )}

      {paymentStatus === 'failed' && (
        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4">
          <XCircle className="h-5 w-5 text-red-600" />
          <div>
            <p className="text-sm font-semibold text-red-800">Payment failed</p>
            <p className="mt-0.5 text-xs text-red-600">{paymentError || 'Your payment was not completed. Please try again.'}</p>
          </div>
        </div>
      )}

      {paymentStatus === 'cancelled' && (
        <div className="mt-6 flex items-center gap-3 rounded-2xl border border-surface-200 bg-surface-50 px-5 py-4">
          <XCircle className="h-5 w-5 text-surface-500" />
          <div>
            <p className="text-sm font-semibold text-surface-800">Payment cancelled</p>
            <p className="mt-0.5 text-xs text-surface-500">You cancelled the payment. You can try again or use the manual Telegram flow.</p>
          </div>
        </div>
      )}

      {paymentStatus === 'timeout' && (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 text-amber-600" />
            <div>
              <p className="text-sm font-semibold text-amber-800">Activation may take a few minutes</p>
              <p className="mt-0.5 text-xs text-amber-600">
                Your payment was received. The plan will activate automatically.
              </p>
              {txRef && (
                <p className="mt-1 text-xs text-amber-600 font-mono">Reference: #{txRef}</p>
              )}
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={() => {
                const target = pendingPlan || selectedPlanId;
                if (target && target !== 'free') startPolling(target);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-amber-700"
            >
              <Loader2 className="h-3 w-3" />
              Refresh status
            </button>
            <a
              href="https://t.me/dxmpulse"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 px-4 py-2 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
            >
              <MessageCircle className="h-3 w-3" />
              Contact support
            </a>
          </div>
        </div>
      )}

      {/* ── Main grid ──────────────────────────────────────────────── */}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        {/* Left: Current plan info */}
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
              <p className="mt-2 text-sm text-surface-600">Tracked-site limits are enforced at site creation.</p>
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

        {/* Right: Upgrade flow */}
        <section className="rounded-[28px] border border-surface-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <CreditCard className="h-5 w-5 text-primary-600" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-surface-500">Upgrade your plan</p>
              <h2 className="mt-1 text-xl font-semibold text-surface-900">
                {chapaAvailable ? 'Pay online or continue manually' : 'Manual upgrade via Telegram'}
              </h2>
            </div>
          </div>

          {/* Selected plan summary */}
          <div className="mt-5 rounded-3xl border border-primary-200 bg-primary-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-700">Selected plan</p>
            <div className="mt-3 flex items-end gap-2">
              <span className="text-3xl font-bold text-surface-900">{selectedPlanMeta.name}</span>
              {selectedPlanMeta.priceEtb > 0 && (
                <span className="pb-1 text-sm text-surface-500">{formatPrice(selectedPlanMeta.priceEtb)} / month</span>
              )}
            </div>
            <p className="mt-3 text-sm text-surface-600">{selectedPlanMeta.description}</p>

            {/* ── Primary CTA: Pay with Chapa ───────────────────────── */}
            {chapaAvailable && (
              <button
                type="button"
                disabled={!hasPaidSelection || isPaymentInProgress}
                onClick={() => void handlePayWithChapa()}
                className={`mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold transition ${
                  hasPaidSelection && !isPaymentInProgress
                    ? 'bg-primary-600 text-white hover:bg-primary-700'
                    : 'cursor-not-allowed bg-surface-200 text-surface-500'
                }`}
              >
                {paymentStatus === 'initiating' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Connecting to Chapa...
                  </>
                ) : (
                  <>
                    <CreditCard className="h-4 w-4" />
                    {hasPaidSelection
                      ? `Pay ${formatPrice(selectedPlanMeta.priceEtb)} with Chapa`
                      : 'Select a paid plan to continue'}
                  </>
                )}
              </button>
            )}

            {/* Payment error inline */}
            {paymentError && paymentStatus !== 'failed' && (
              <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800">
                {paymentError}
              </p>
            )}

            {/* ── Divider ───────────────────────────────────────────── */}
            {chapaAvailable && hasPaidSelection && (
              <div className="mt-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-surface-200" />
                <span className="text-xs text-surface-400">or</span>
                <div className="h-px flex-1 bg-surface-200" />
              </div>
            )}

            {/* ── Secondary CTA: Telegram fallback ──────────────────── */}
            {hasPaidSelection && (
              <button
                type="button"
                disabled={isSubmittingRequest || isPaymentInProgress}
                onClick={() => void handleContinueToTelegram()}
                className={`${chapaAvailable ? 'mt-3' : 'mt-5'} inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-surface-200 px-5 py-3 text-sm font-semibold transition ${
                  isSubmittingRequest || isPaymentInProgress
                    ? 'cursor-not-allowed text-surface-400'
                    : 'text-surface-700 hover:bg-surface-50 hover:border-surface-300'
                }`}
              >
                <MessageCircle className="h-4 w-4" />
                {isSubmittingRequest
                  ? 'Opening Telegram...'
                  : chapaAvailable
                    ? 'Continue manually via Telegram'
                    : `Continue on Telegram for ${selectedPlanMeta.name}`}
              </button>
            )}

            {!hasPaidSelection && !chapaAvailable && (
              <p className="mt-5 text-sm text-surface-500 text-center">
                Select a paid plan below to continue.
              </p>
            )}

            <p className="mt-3 text-xs text-surface-500">
              {chapaAvailable
                ? 'Online payment is processed securely via Chapa. Your plan activates automatically after payment.'
                : 'Send payment proof via Telegram. Your plan is activated manually after confirmation.'}
            </p>

            {requestError && (
              <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                {requestError} Telegram still opened so the manual upgrade flow is not blocked.
              </p>
            )}
            {latestUpgradeRequestMatchesCurrentPlan && paymentStatus !== 'complete' && (
              <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
                This workspace is already active on the requested plan. All features are unlocked.
              </p>
            )}
          </div>

          {/* Steps — only when Telegram is primary (Chapa unavailable) */}
          {!chapaAvailable && (
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
          )}
        </section>
      </div>

      {/* ── Plan cards ─────────────────────────────────────────────── */}

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
                disabled={isCurrent || isPaymentInProgress}
                onClick={() => setSelectedPlanId(plan.id)}
                className={`mt-8 inline-flex w-full items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                  isCurrent
                    ? 'cursor-not-allowed bg-emerald-100 text-emerald-700'
                    : isSelected
                    ? 'bg-primary-600 text-white hover:bg-primary-700'
                    : isPaymentInProgress
                    ? 'cursor-not-allowed bg-surface-100 text-surface-400'
                    : 'bg-surface-900 text-white hover:bg-surface-950'
                }`}
              >
                {isCurrent ? 'Current plan' : isSelected ? 'Selected' : `Select ${plan.name}`}
              </button>
            </article>
          );
        })}
      </div>

      {/* ── Footer note ────────────────────────────────────────────── */}

      <div className="mt-6 rounded-[28px] border border-surface-200 bg-white p-6 shadow-sm">
        <div className="inline-flex items-center gap-2 rounded-full bg-surface-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-surface-600">
          <Sparkles className="h-3.5 w-3.5" />
          Keep it lean
        </div>
        <p className="mt-4 max-w-4xl text-sm leading-7 text-surface-600">
          Online payments are processed via Chapa. Manual Telegram upgrades remain available as a fallback. Invoices, proration, and annual plans are deferred for now.
        </p>
      </div>
    </div>
  );
};
