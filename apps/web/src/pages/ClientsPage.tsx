import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Building2, Plus, Search } from 'lucide-react';
import { fetchJson } from '../lib/api';
import { UpgradeGate } from '../components/UpgradeGate';
import { useAuth } from '../context/AuthContext';
import { getPlanMeta, getRecommendedUpgradePlan } from '../lib/billing';
import type { ClientSiteSummary } from '../types';

const statusStyles = {
  live: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  attention: 'bg-amber-50 text-amber-700 border-amber-200',
  install: 'bg-surface-100 text-surface-700 border-surface-200',
} as const;

const formatLastActivity = (value: string | null) => {
  if (!value) return 'Waiting for first tracked session';
  return new Date(value).toLocaleString();
};

const formatDuration = (seconds: number) => {
  if (!seconds) return '0s';
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${seconds}s`;
};

export const ClientsPage: React.FC = () => {
  const { workspace } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [clients, setClients] = useState<ClientSiteSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [flashMessage, setFlashMessage] = useState<string | null>(null);
  const [showSiteLimitGate, setShowSiteLimitGate] = useState(false);

  useEffect(() => {
    const message = (location.state as { flashMessage?: string } | null)?.flashMessage;
    if (!message) return;
    setFlashMessage(message);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    let isMounted = true;

    const loadClients = async () => {
      setIsLoading(true);
      try {
        const data = await fetchJson<ClientSiteSummary[]>('/sites');
        if (!isMounted) return;
        setClients(data);
        setError(null);
      } catch (loadError) {
        if (!isMounted) return;
        setError(loadError instanceof Error ? loadError.message : 'Failed to load client sites');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void loadClients();
    return () => {
      isMounted = false;
    };
  }, []);

  const filteredClients = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return clients;
    return clients.filter((client) =>
      `${client.name} ${client.domain} ${client.trackingStatus}`.toLowerCase().includes(normalized)
    );
  }, [clients, search]);

  const stats = {
    total: clients.length,
    live: clients.filter((client) => client.trackingStatus === 'live').length,
    atRisk: clients.filter((client) => client.healthScore < 55 || client.openAlerts > 0).length,
    avgHealth:
      clients.length > 0
        ? Math.round(clients.reduce((total, client) => total + client.healthScore, 0) / clients.length)
        : 0,
  };
  const siteLimit = getPlanMeta(workspace?.plan || 'free').siteLimit;
  const hasReachedSiteLimit = clients.length >= siteLimit;
  const nextPlanId = getRecommendedUpgradePlan(workspace?.plan || 'free');

  return (
    <div className="mx-auto max-w-7xl p-6 md:p-8">
      <div className="flex flex-col gap-4 rounded-[32px] border border-primary-200 bg-white p-6 shadow-sm md:flex-row md:items-end md:justify-between">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-700">Client Sites</p>
          <h1 className="mt-3 text-3xl font-bold text-surface-900">Keep every client website in one operating view.</h1>
          <p className="mt-3 text-sm leading-6 text-surface-600">
            Track install status, spot underperforming sites, and jump from portfolio management into the details that matter.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (hasReachedSiteLimit) {
              setShowSiteLimitGate(true);
              return;
            }

            navigate('/onboarding');
          }}
          className="inline-flex items-center gap-2 rounded-2xl bg-primary-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-primary-700"
        >
          <Plus className="h-4 w-4" />
          Add client site
        </button>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-4">
        {[
          { label: 'Total clients', value: stats.total },
          { label: 'Live', value: stats.live },
          { label: 'At risk', value: stats.atRisk },
          { label: 'Avg. health', value: `${stats.avgHealth}/100` },
        ].map((stat) => (
          <div key={stat.label} className="rounded-3xl border border-surface-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-surface-500">{stat.label}</p>
            <p className="mt-3 text-2xl font-bold text-surface-900">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-[28px] border border-surface-200 bg-white p-5 shadow-sm">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by client name or domain"
            className="w-full rounded-2xl border border-surface-200 py-3 pl-11 pr-4 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
          />
        </div>
      </div>

      {error && (
        <div className="mt-6 rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {flashMessage && (
        <div className="mt-6 rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-700">
          {flashMessage}
        </div>
      )}

      {isLoading ? (
        <div className="mt-6 rounded-[28px] border border-surface-200 bg-white p-12 text-center shadow-sm">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
          <p className="mt-4 text-sm text-surface-500">Loading client sites…</p>
        </div>
      ) : filteredClients.length === 0 ? (
        <div className="mt-6 rounded-[28px] border border-dashed border-surface-200 bg-white p-12 text-center shadow-sm">
          <Building2 className="mx-auto h-10 w-10 text-surface-300" />
          <h2 className="mt-4 text-xl font-semibold text-surface-900">No client sites match that search.</h2>
          <p className="mt-2 text-sm text-surface-500">Try a different domain or add a fresh client site.</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-5 xl:grid-cols-2">
          {filteredClients.map((client) => (
            <Link
              key={client.id}
              to={`/clients/${client.id}`}
              className="group rounded-[28px] border border-surface-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-md"
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-xl font-semibold text-surface-900">{client.name}</h2>
                      <span className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${statusStyles[client.trackingStatus]}`}>
                        {client.trackingStatus === 'install'
                          ? 'Needs install'
                          : client.trackingStatus === 'attention'
                          ? 'Needs attention'
                          : 'Live'}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-surface-500">{client.domain}</p>
                  </div>
                </div>
                <div className="inline-flex items-center gap-2 text-sm font-medium text-primary-600">
                  Open detail <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: 'Health', value: `${client.healthScore}/100` },
                  { label: 'Sessions (7d)', value: client.sessionCount7d.toLocaleString() },
                  { label: 'Open alerts', value: client.openAlerts },
                  { label: 'Avg. duration', value: formatDuration(client.avgDurationSeconds) },
                ].map((metric) => (
                  <div key={metric.label} className="rounded-2xl bg-surface-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-surface-500">{metric.label}</p>
                    <p className="mt-2 text-lg font-semibold text-surface-900">{metric.value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-surface-600">
                <span>Last activity: {formatLastActivity(client.lastActivityAt)}</span>
                <span>Bounce rate: {client.bounceRate}%</span>
                <span>Conversion: {client.conversionRate}%</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {showSiteLimitGate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-900/45 p-6">
          <div className="w-full max-w-2xl">
            <UpgradeGate
              source="site_limit"
              planId={nextPlanId}
              eyebrow="Tracked-site limit reached"
              title={`You are already using ${clients.length}/${siteLimit} tracked site${siteLimit === 1 ? '' : 's'}.`}
              description="DXM enforces the tracked-site limit at site creation. Upgrade before adding another client site so the workspace stays consistent."
              bullets={[
                'Keep the current portfolio in one workspace',
                'Unlock the full paid agency bundle at the same time',
              ]}
            />
            <button
              type="button"
              onClick={() => setShowSiteLimitGate(false)}
              className="mt-4 inline-flex w-full items-center justify-center rounded-2xl border border-white/25 bg-white/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/20"
            >
              Not now
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
