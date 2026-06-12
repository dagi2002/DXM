import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  Brain,
  Building2,
  Radar,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { fetchJson } from '../lib/api';
import { AskPulseBubble } from '../components/AskPulse/AskPulseBubble';
import type { PortfolioOverview } from '../types';

const formatRelative = (value: string | null) => {
  if (!value) return 'No activity yet';
  const diff = Date.now() - new Date(value).getTime();
  if (diff < 60_000) return 'just now';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(value).toLocaleDateString();
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

const evidenceToneClasses = {
  positive: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  neutral: 'border-surface-200 bg-surface-50 text-surface-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
} as const;

const evidenceIconClasses = {
  positive: 'text-emerald-500',
  neutral: 'text-surface-400',
  warning: 'text-amber-500',
} as const;

function HealthBar({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-surface-100 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs font-semibold text-surface-700 tabular-nums">{score}</span>
    </div>
  );
}

export const OverviewPage: React.FC = () => {
  const { workspace } = useAuth();
  const [overview, setOverview] = useState<PortfolioOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const loadOverview = async () => {
    setIsLoading(true);
    try {
      const data = await fetchJson<PortfolioOverview>('/overview');
      setOverview(data);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load overview');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadOverview();
  }, []);

  const handleRegenerateBrief = async () => {
    setIsRegenerating(true);
    try {
      // Bust the artifact cache by adding a cache-buster query param
      const data = await fetchJson<PortfolioOverview>(`/overview?refresh=1&t=${Date.now()}`);
      setOverview(data);
    } catch {
      // Silently fail on regenerate — original brief stays
    } finally {
      setIsRegenerating(false);
    }
  };

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
        <div className="rounded-[28px] border border-surface-200 bg-white p-16 text-center shadow-sm">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
          <p className="mt-4 text-sm font-medium text-surface-500">Building your agency overview…</p>
          <p className="mt-1 text-xs text-surface-400">Analyzing portfolio health, alerts, and sessions</p>
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
      <div className="mx-auto max-w-7xl p-6 md:p-8 space-y-6">
        <div className="rounded-[32px] border border-primary-200 bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 p-8 text-white shadow-xl md:p-12">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-primary-200">
              <Zap className="h-3.5 w-3.5" />
              Agency Overview
            </div>
            <h1 className="mt-4 text-3xl font-bold md:text-5xl">
              Start with one client site and the whole portfolio narrative unlocks.
            </h1>
            <p className="mt-4 text-base text-primary-100 md:text-lg">
              Add your first client, install the snippet, and DXM Pulse turns empty dashboards into live operational insight — powered by AI.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/onboarding"
                className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-primary-900 transition hover:bg-primary-50"
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
    { label: 'Client sites', value: overview.summary.totalClients, icon: Building2, tone: 'text-primary-700 bg-primary-50 border-primary-200' },
    { label: 'Live today', value: overview.summary.liveClients, icon: Activity, tone: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    { label: 'At risk', value: overview.summary.atRiskClients, icon: TrendingDown, tone: 'text-amber-700 bg-amber-50 border-amber-200' },
    { label: 'Open alerts', value: overview.summary.unresolvedAlerts, icon: Radar, tone: 'text-red-700 bg-red-50 border-red-200' },
    { label: 'Sessions (7d)', value: overview.summary.sessions7d.toLocaleString(), icon: Activity, tone: 'text-surface-700 bg-surface-100 border-surface-200' },
    { label: 'Portfolio health', value: `${overview.summary.averageHealthScore}/100`, icon: TrendingUp, tone: 'text-primary-700 bg-primary-50 border-primary-200' },
  ];

  return (
    <div className="mx-auto max-w-7xl p-6 md:p-8 space-y-6">
      {/* Hero banner */}
      <div className="rounded-[32px] border border-primary-200 bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 p-6 text-white shadow-xl md:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary-100">
              <Sparkles className="h-3.5 w-3.5" />
              Agency Command Center
            </div>
            <h1 className="mt-4 text-3xl font-bold md:text-4xl">
              {workspace?.name || 'Your agency'} — monitoring {overview.summary.liveClients} client {overview.summary.liveClients === 1 ? 'site' : 'sites'} live.
            </h1>
            <p className="mt-3 text-base text-primary-100">
              Stay ahead of client issues, keep the strongest sites healthy, and turn raw website behavior into weekly proof of value.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[300px]">
            <div className="rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="h-3 w-3 text-emerald-300" />
                <p className="text-xs uppercase tracking-[0.18em] text-primary-100">Top performer</p>
              </div>
              <p className="mt-2 text-lg font-semibold">{bestSite?.name || 'No live site yet'}</p>
              <p className="mt-1 text-xs text-primary-200">
                {bestSite ? `${bestSite.healthScore}/100 health` : 'Connect a site to benchmark'}
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/10 p-4 backdrop-blur">
              <div className="flex items-center gap-1.5">
                <TrendingDown className="h-3 w-3 text-amber-300" />
                <p className="text-xs uppercase tracking-[0.18em] text-primary-100">Needs attention</p>
              </div>
              <p className="mt-2 text-lg font-semibold">{riskSite && riskSite.id !== bestSite?.id ? riskSite.name : 'Nothing risky right now'}</p>
              <p className="mt-1 text-xs text-primary-200">
                {riskSite && riskSite.id !== bestSite?.id ? `${riskSite.openAlerts} alerts · ${riskSite.healthScore}/100` : 'Portfolio looks stable'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        {stats.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className={`rounded-2xl border p-4 shadow-sm ${tone}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em]">{label}</p>
              <Icon className="h-3.5 w-3.5 opacity-60" />
            </div>
            <p className="mt-3 text-2xl font-bold text-surface-900">{value}</p>
          </div>
        ))}
      </div>

      {/* AI Brief */}
      {overview.ai && (
        <section className="rounded-[28px] border border-primary-200 bg-white overflow-hidden shadow-sm">
          <div className="border-b border-primary-100 bg-gradient-to-r from-primary-50 to-white px-6 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-600 shadow-sm shadow-primary-900/20">
                  <Brain className="h-4 w-4 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-surface-900">AI Portfolio Brief</h2>
                    <span className="rounded-full bg-primary-100 px-2 py-0.5 text-[10px] font-bold text-primary-700">LIVE</span>
                    {(overview.ai as { mode?: string }).mode === 'llm' ? (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">AI</span>
                    ) : (
                      <span className="rounded-full bg-surface-100 px-2 py-0.5 text-[10px] font-bold text-surface-500">AUTO</span>
                    )}
                  </div>
                  <p className="text-[11px] text-surface-500">Generated {new Date(overview.ai.generatedAt).toLocaleString()}</p>
                </div>
              </div>
              <button
                onClick={() => void handleRegenerateBrief()}
                disabled={isRegenerating}
                className="inline-flex items-center gap-1.5 rounded-xl border border-surface-200 bg-white px-3 py-2 text-xs font-semibold text-surface-600 transition hover:border-primary-300 hover:text-primary-700 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRegenerating ? 'animate-spin' : ''}`} />
                {isRegenerating ? 'Regenerating…' : 'Regenerate'}
              </button>
            </div>
          </div>

          <div className="p-6">
            <h3 className="text-xl font-bold text-surface-900">{overview.ai.headline}</h3>
            <p className="mt-3 text-sm leading-7 text-surface-600 max-w-3xl">{overview.ai.summary}</p>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {overview.ai.topRisk && (
                <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700">Top risk</p>
                    <p className="mt-1.5 text-sm leading-6 text-amber-900">{overview.ai.topRisk}</p>
                  </div>
                </div>
              )}
              {overview.ai.topOpportunity && (
                <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">Top opportunity</p>
                    <p className="mt-1.5 text-sm leading-6 text-emerald-900">{overview.ai.topOpportunity}</p>
                  </div>
                </div>
              )}
            </div>

            {overview.ai.evidence.length > 0 && (
              <div className="mt-5 grid gap-3 grid-cols-2 md:grid-cols-3">
                {overview.ai.evidence.slice(0, 6).map((item) => (
                  <div key={item.id} className={`rounded-2xl border p-4 ${evidenceToneClasses[item.tone]}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.15em]">{item.label}</p>
                      {item.tone === 'positive' ? (
                        <TrendingUp className={`h-3.5 w-3.5 ${evidenceIconClasses[item.tone]}`} />
                      ) : item.tone === 'warning' ? (
                        <TrendingDown className={`h-3.5 w-3.5 ${evidenceIconClasses[item.tone]}`} />
                      ) : null}
                    </div>
                    <p className="mt-2 text-base font-bold text-surface-900">{item.value}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Actions + Alert hotspots */}
      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-[28px] border border-surface-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-surface-500">Recommended actions</p>
              <h2 className="mt-1.5 text-xl font-bold text-surface-900">What should the agency do next?</h2>
            </div>
            <Link to="/reports" className="text-sm font-medium text-primary-600 hover:text-primary-700 whitespace-nowrap">
              Open reports →
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            {overview.recommendedActions.length === 0 && (
              <div className="rounded-2xl border border-dashed border-surface-200 bg-surface-50 p-6 text-center text-sm text-surface-500">
                No urgent actions — portfolio is in good shape.
              </div>
            )}
            {overview.recommendedActions.map((action) => (
              <Link
                key={action.id}
                to={action.href}
                className="flex items-start justify-between gap-4 rounded-2xl border border-surface-200 p-4 transition hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-md"
              >
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-surface-900">{action.title}</h3>
                  <p className="mt-1.5 text-sm leading-5 text-surface-500">{action.detail}</p>
                </div>
                <span className={`shrink-0 self-start rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] ${priorityClasses[action.priority]}`}>
                  {action.priority}
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-[28px] border border-surface-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-5">
            <Radar className="h-4 w-4 text-primary-600" />
            <h2 className="text-xl font-bold text-surface-900">Alert hotspots</h2>
          </div>
          <div className="space-y-3">
            {overview.alertHotspots.length === 0 && (
              <div className="rounded-2xl border border-dashed border-surface-200 bg-surface-50 p-6 text-center text-sm text-surface-500">
                No unresolved alerts. Portfolio is quiet.
              </div>
            )}
            {overview.alertHotspots.slice(0, 4).map((alert) => (
              <div key={alert.id} className="rounded-2xl border border-surface-200 bg-surface-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-surface-900">{alert.siteName}</p>
                  <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] ${
                    priorityClasses[alert.severity === 'critical' || alert.severity === 'high' ? 'high' : alert.severity === 'medium' ? 'medium' : 'low']
                  }`}>
                    {alert.severity}
                  </span>
                </div>
                <p className="mt-2 text-sm font-medium text-surface-800">{alert.title}</p>
                {alert.description && (
                  <p className="mt-1 text-xs leading-5 text-surface-500">{alert.description}</p>
                )}
                <p className="mt-2 text-[11px] text-surface-400">{formatRelative(alert.createdAt)}</p>
              </div>
            ))}
          </div>
          {overview.alertHotspots.length > 4 && (
            <Link to="/alerts" className="mt-4 block text-center text-sm font-medium text-primary-600 hover:text-primary-700">
              View all {overview.alertHotspots.length} alerts →
            </Link>
          )}
        </section>
      </div>

      {/* Client portfolio */}
      <section className="rounded-[28px] border border-surface-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-surface-500">Client portfolio</p>
            <h2 className="mt-1.5 text-xl font-bold text-surface-900">All monitored client sites</h2>
          </div>
          <Link to="/clients" className="text-sm font-medium text-primary-600 hover:text-primary-700 whitespace-nowrap">
            View all clients →
          </Link>
        </div>

        <div className="space-y-3">
          {overview.siteRollups.slice(0, 6).map((site) => (
            <Link
              key={site.id}
              to={`/clients/${site.id}`}
              className="flex flex-col gap-4 rounded-2xl border border-surface-200 p-4 transition hover:border-primary-300 hover:shadow-md md:flex-row md:items-center md:justify-between"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
                  <Building2 className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-surface-900">{site.name}</p>
                  <p className="text-sm text-surface-400">{site.domain}</p>
                  <div className="mt-2 w-48 max-w-full">
                    <HealthBar score={site.healthScore} />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 md:min-w-[220px]">
                <div className="rounded-xl bg-surface-50 border border-surface-200 px-3 py-2 text-center min-w-[80px]">
                  <p className="text-[10px] uppercase tracking-[0.15em] text-surface-400">Sessions</p>
                  <p className="mt-1 text-base font-bold text-surface-900">{site.sessionCount7d.toLocaleString()}</p>
                </div>
                <div className="rounded-xl bg-surface-50 border border-surface-200 px-3 py-2 text-center min-w-[80px]">
                  <p className="text-[10px] uppercase tracking-[0.15em] text-surface-400">Alerts</p>
                  <p className={`mt-1 text-base font-bold ${site.openAlerts > 0 ? 'text-red-600' : 'text-surface-900'}`}>{site.openAlerts}</p>
                </div>
                <div className="hidden rounded-xl bg-surface-50 border border-surface-200 px-3 py-2 text-center min-w-[100px] sm:block">
                  <p className="text-[10px] uppercase tracking-[0.15em] text-surface-400">Last seen</p>
                  <p className="mt-1 text-xs font-medium text-surface-700">{formatRelative(site.lastActivityAt)}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Recent activity + Report CTA */}
      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <section className="rounded-[28px] border border-surface-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-5">
            <Activity className="h-4 w-4 text-primary-600" />
            <h2 className="text-xl font-bold text-surface-900">Recent activity</h2>
          </div>
          <div className="space-y-3">
            {overview.recentActivity.map((session) => (
              <div key={session.id} className="rounded-2xl border border-surface-200 bg-surface-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-surface-900">{session.siteName}</p>
                    <p className="mt-0.5 text-xs text-surface-400 truncate max-w-[200px]">{session.entryUrl}</p>
                  </div>
                  <span className="rounded-full bg-white border border-surface-200 px-2.5 py-0.5 text-xs font-semibold capitalize text-surface-600">
                    {session.device}
                  </span>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-surface-500">
                  <span>{formatDuration(session.duration)}</span>
                  <span>{formatRelative(session.startedAt)}</span>
                </div>
              </div>
            ))}
            {overview.recentActivity.length === 0 && (
              <div className="rounded-2xl border border-dashed border-surface-200 bg-surface-50 p-6 text-center text-sm text-surface-500">
                No recent sessions yet.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-[28px] border border-primary-200 bg-white p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary-700">
              <ShieldCheck className="h-3.5 w-3.5" />
              Ready-to-share
            </div>
            <h2 className="mt-3 text-xl font-bold text-surface-900">
              {overview.reports[0]?.title || 'Weekly portfolio summary'}
            </h2>
            <p className="mt-2 text-sm leading-6 text-surface-600">
              {overview.reports[0]?.summary || 'Generate a client-ready summary of this week\'s portfolio performance.'}
            </p>
          </div>
          <Link
            to="/reports"
            className="mt-6 inline-flex items-center gap-2 self-start rounded-2xl bg-primary-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-primary-700"
          >
            Open reports <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      </div>
      <AskPulseBubble />
    </div>
  );
};
