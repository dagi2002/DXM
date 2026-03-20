import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowRight, Building2, Radar, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { fetchJson } from '../lib/api';
import type { PortfolioOverview } from '../types';

const formatRelative = (value: string | null) => {
  if (!value) return 'No activity yet';
  return new Date(value).toLocaleString();
};

const formatDuration = (seconds: number) => {
  if (!seconds) return '0s';
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${seconds}s`;
};

const priorityClasses = {
  high: 'border-red-200 bg-red-50 text-red-700',
  medium: 'border-amber-200 bg-amber-50 text-amber-700',
  low: 'border-primary-200 bg-primary-50 text-primary-700',
} as const;

export const OverviewPage: React.FC = () => {
  const { workspace } = useAuth();
  const [overview, setOverview] = useState<PortfolioOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadOverview = async () => {
      setIsLoading(true);
      try {
        const data = await fetchJson<PortfolioOverview>('/overview');
        if (!isMounted) return;
        setOverview(data);
        setError(null);
      } catch (loadError) {
        if (!isMounted) return;
        setError(loadError instanceof Error ? loadError.message : 'Failed to load overview');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void loadOverview();
    return () => {
      isMounted = false;
    };
  }, []);

  const bestSite = useMemo(
    () => overview?.siteRollups.slice().sort((a, b) => b.healthScore - a.healthScore)[0] || null,
    [overview]
  );
  const riskSite = useMemo(
    () => overview?.siteRollups.slice().sort((a, b) => a.healthScore - b.healthScore)[0] || null,
    [overview]
  );

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl p-6 md:p-8">
        <div className="rounded-[28px] border border-surface-200 bg-white p-12 text-center shadow-sm">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
          <p className="mt-4 text-sm text-surface-500">Building your agency overview…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-7xl p-6 md:p-8">
        <div className="rounded-[28px] border border-red-200 bg-red-50 p-10 text-center text-red-700">
          {error}
        </div>
      </div>
    );
  }

  if (!overview) return null;

  if (overview.summary.totalClients === 0) {
    return (
      <div className="mx-auto max-w-7xl p-6 md:p-8">
        <div className="rounded-[32px] border border-primary-200 bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 p-8 text-white shadow-xl md:p-12">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary-200">
              Agency Overview
            </p>
            <h1 className="mt-4 text-3xl font-bold md:text-5xl">
              Start with one client site and the whole portfolio narrative unlocks.
            </h1>
            <p className="mt-4 text-base text-primary-100 md:text-lg">
              Add your first client, install the snippet, and DXM Pulse will turn empty dashboards into live operational insight.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/onboarding"
                className="inline-flex items-center gap-2 rounded-2xl bg-accent-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-600"
              >
                Add first client site <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/demo"
                className="inline-flex items-center gap-2 rounded-2xl border border-white/20 px-5 py-3 text-sm font-semibold text-white/90 transition hover:bg-white/10"
              >
                View the sales demo
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const stats = [
    { label: 'Client sites', value: overview.summary.totalClients, tone: 'text-primary-700 bg-primary-50 border-primary-200' },
    { label: 'Live today', value: overview.summary.liveClients, tone: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    { label: 'At risk', value: overview.summary.atRiskClients, tone: 'text-amber-700 bg-amber-50 border-amber-200' },
    { label: 'Open alerts', value: overview.summary.unresolvedAlerts, tone: 'text-red-700 bg-red-50 border-red-200' },
    { label: 'Sessions (7d)', value: overview.summary.sessions7d.toLocaleString(), tone: 'text-surface-700 bg-surface-100 border-surface-200' },
    { label: 'Portfolio health', value: `${overview.summary.averageHealthScore}/100`, tone: 'text-primary-700 bg-primary-50 border-primary-200' },
  ];

  return (
    <div className="mx-auto max-w-7xl p-6 md:p-8">
      <div className="rounded-[32px] border border-primary-200 bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 p-6 text-white shadow-xl md:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary-100">
              <Sparkles className="h-3.5 w-3.5" />
              Agency Command Center
            </div>
            <h1 className="mt-4 text-3xl font-bold md:text-5xl">
              {workspace?.name || 'Your agency'} is monitoring the portfolio like an operator, not a spectator.
            </h1>
            <p className="mt-4 text-base text-primary-100 md:text-lg">
              Stay ahead of client issues, keep the strongest sites healthy, and turn raw website behavior into weekly proof of value.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.18em] text-primary-100">Top performer</p>
              <p className="mt-2 text-xl font-semibold">{bestSite?.name || 'No live site yet'}</p>
              <p className="mt-1 text-sm text-primary-100">
                {bestSite ? `${bestSite.healthScore}/100 health score` : 'Connect a site to start benchmarking.'}
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.18em] text-primary-100">Needs attention</p>
              <p className="mt-2 text-xl font-semibold">{riskSite?.name || 'Nothing risky right now'}</p>
              <p className="mt-1 text-sm text-primary-100">
                {riskSite ? `${riskSite.openAlerts} open alerts and ${riskSite.healthScore}/100 health` : 'Portfolio looks stable.'}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {stats.map((stat) => (
          <div key={stat.label} className={`rounded-3xl border bg-white p-5 shadow-sm ${stat.tone}`}>
            <p className="text-xs font-semibold uppercase tracking-[0.18em]">{stat.label}</p>
            <p className="mt-3 text-2xl font-bold text-surface-900">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-[28px] border border-surface-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-surface-500">
                Portfolio Actions
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-surface-900">
                What should the agency do next?
              </h2>
            </div>
            <Link to="/reports" className="text-sm font-medium text-primary-600 hover:text-primary-700">
              Open reports
            </Link>
          </div>

          <div className="mt-6 space-y-4">
            {overview.recommendedActions.map((action) => (
              <Link
                key={action.id}
                to={action.href}
                className="block rounded-3xl border border-surface-200 p-5 transition hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-surface-900">{action.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-surface-600">{action.detail}</p>
                  </div>
                  <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${priorityClasses[action.priority]}`}>
                    {action.priority}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-[28px] border border-surface-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-surface-900">
            <Radar className="h-5 w-5 text-primary-600" />
            <h2 className="text-xl font-semibold">Alert hotspots</h2>
          </div>
          <div className="mt-5 space-y-4">
            {overview.alertHotspots.length === 0 && (
              <div className="rounded-3xl border border-dashed border-surface-200 bg-surface-50 p-6 text-sm text-surface-500">
                No unresolved alerts. The portfolio is quiet right now.
              </div>
            )}
            {overview.alertHotspots.map((alert) => (
              <div key={alert.id} className="rounded-3xl border border-surface-200 bg-surface-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-surface-900">{alert.siteName}</p>
                  <span className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${priorityClasses[alert.severity === 'critical' || alert.severity === 'high' ? 'high' : alert.severity === 'medium' ? 'medium' : 'low']}`}>
                    {alert.severity}
                  </span>
                </div>
                <p className="mt-3 text-sm font-medium text-surface-900">{alert.title}</p>
                <p className="mt-1 text-sm text-surface-600">{alert.description || 'No extra detail provided.'}</p>
                <p className="mt-3 text-xs text-surface-500">{new Date(alert.createdAt).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[28px] border border-surface-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-surface-500">Client Portfolio</p>
              <h2 className="mt-2 text-2xl font-semibold text-surface-900">Strongest and weakest client sites</h2>
            </div>
            <Link to="/clients" className="text-sm font-medium text-primary-600 hover:text-primary-700">
              View all clients
            </Link>
          </div>

          <div className="mt-6 space-y-4">
            {overview.siteRollups.slice(0, 5).map((site) => (
              <Link
                key={site.id}
                to={`/clients/${site.id}`}
                className="flex flex-col gap-4 rounded-3xl border border-surface-200 p-5 transition hover:border-primary-300 hover:shadow-md md:flex-row md:items-center md:justify-between"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-surface-900">{site.name}</p>
                    <p className="text-sm text-surface-500">{site.domain}</p>
                    <p className="mt-2 text-sm text-surface-600">
                      {site.sessionCount7d.toLocaleString()} sessions this week, {site.openAlerts} open alerts
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 md:min-w-[260px]">
                  <div className="rounded-2xl bg-surface-50 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-surface-500">Health</p>
                    <p className="mt-2 text-lg font-semibold text-surface-900">{site.healthScore}/100</p>
                  </div>
                  <div className="rounded-2xl bg-surface-50 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-surface-500">Last activity</p>
                    <p className="mt-2 text-sm font-medium text-surface-900">{formatRelative(site.lastActivityAt)}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-[28px] border border-surface-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-surface-900">
            <Activity className="h-5 w-5 text-primary-600" />
            <h2 className="text-xl font-semibold">Recent activity</h2>
          </div>
          <div className="mt-5 space-y-4">
            {overview.recentActivity.map((session) => (
              <div key={session.id} className="rounded-3xl border border-surface-200 bg-surface-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-surface-900">{session.siteName}</p>
                    <p className="mt-1 text-sm text-surface-500">{session.entryUrl}</p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold capitalize text-surface-600">
                    {session.device}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between text-sm text-surface-600">
                  <span>{formatDuration(session.duration)}</span>
                  <span>{formatRelative(session.startedAt)}</span>
                </div>
              </div>
            ))}
            {overview.recentActivity.length === 0 && (
              <div className="rounded-3xl border border-dashed border-surface-200 bg-surface-50 p-6 text-sm text-surface-500">
                No recent sessions yet.
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="mt-6 rounded-[28px] border border-primary-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary-700">
              <ShieldCheck className="h-3.5 w-3.5" />
              Ready-to-share summary
            </div>
            <h2 className="mt-3 text-2xl font-semibold text-surface-900">{overview.reports[0]?.title}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-surface-600">{overview.reports[0]?.summary}</p>
          </div>
          <Link to="/reports" className="inline-flex items-center gap-2 rounded-2xl bg-primary-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-primary-700">
            Open reports <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  );
};
