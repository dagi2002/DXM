import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
  Loader2,
  Send,
  Sparkles,
} from 'lucide-react';
import { UpgradeGate } from '../UpgradeGate';
import { useAuth } from '../../context/AuthContext';
import type { Alert, AlertDetail } from '../../types';
import { fetchJson } from '../../lib/api';
import { BILLING_FEATURES, workspaceHasFeature } from '../../lib/billing';
import { markJourneyMilestone } from '../../lib/workspaceSignals';

/* ── Helpers ─────────────────────────────────────────────────────── */

const evidenceToneClasses = {
  positive: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  neutral: 'border-surface-200 bg-surface-50 text-surface-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
} as const;

/** Relative time — "just now", "3m ago", "2h ago", "5d ago", or date */
function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return 'just now';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Minimal site info for filter dropdown */
interface SiteSummary {
  id: string;
  domain: string;
}

/* ── Component ───────────────────────────────────────────────────── */

export const AlertsView: React.FC = () => {
  const { workspace } = useAuth();
  const [filter, setFilter] = useState('all');
  const [siteFilter, setSiteFilter] = useState<string>('all');
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [alertDetails, setAlertDetails] = useState<Record<string, AlertDetail>>({});
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
  const [expandedAlertId, setExpandedAlertId] = useState<string | null>(null);
  const [loadingAlertId, setLoadingAlertId] = useState<string | null>(null);
  const [resolvingIds, setResolvingIds] = useState<Set<string>>(new Set());
  const [resolveToast, setResolveToast] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canUseAlerts = workspaceHasFeature(workspace?.plan || 'free', BILLING_FEATURES.alerts);
  const toastTimer = useRef<number>();

  /* ── Data fetching ─────────────────────────────────────────────── */

  const fetchAlerts = useCallback(async () => {
    try {
      const data = await fetchJson<Alert[]>('/alerts');
      setAlerts(Array.isArray(data) ? data : []);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load alerts');
    }
  }, []);

  // Initial load + sites
  useEffect(() => {
    if (!canUseAlerts) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    const load = async () => {
      setIsLoading(true);
      try {
        const [alertData, siteData] = await Promise.all([
          fetchJson<Alert[]>('/alerts'),
          fetchJson<SiteSummary[]>('/sites').catch(() => [] as SiteSummary[]),
        ]);
        if (!isMounted) return;
        setAlerts(Array.isArray(alertData) ? alertData : []);
        setSites(Array.isArray(siteData) ? siteData : []);
        setError(null);
      } catch (loadError) {
        if (!isMounted) return;
        setError(loadError instanceof Error ? loadError.message : 'Failed to load alerts');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void load();
    return () => { isMounted = false; };
  }, [canUseAlerts]);

  // Polling — every 30s
  useEffect(() => {
    if (!canUseAlerts) return;
    const timer = window.setInterval(() => { void fetchAlerts(); }, 30_000);
    return () => window.clearInterval(timer);
  }, [canUseAlerts, fetchAlerts]);

  // Cleanup toast timer
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  /* ── Filtering ─────────────────────────────────────────────────── */

  const filteredAlerts = useMemo(() => {
    return alerts.filter(alert => {
      if (filter === 'active' && alert.resolved) return false;
      if (filter === 'resolved' && !alert.resolved) return false;
      if (siteFilter !== 'all' && alert.siteId !== siteFilter) return false;
      return true;
    });
  }, [alerts, filter, siteFilter]);

  // Site options — only sites that have alerts
  const siteOptions = useMemo(() => {
    const alertSiteIds = new Set(alerts.map(a => a.siteId).filter(Boolean));
    return sites.filter(s => alertSiteIds.has(s.id));
  }, [alerts, sites]);

  /* ── Stats ─────────────────────────────────────────────────────── */

  const stats = useMemo(() => {
    const active = alerts.filter(a => !a.resolved);
    return {
      total: alerts.length,
      active: active.length,
      critical: alerts.filter(a => a.severity === 'critical' && !a.resolved).length,
      high: active.filter(a => a.severity === 'high').length,
      medium: active.filter(a => a.severity === 'medium').length,
      resolved: alerts.filter(a => a.resolved).length,
    };
  }, [alerts]);

  /* ── Resolve ───────────────────────────────────────────────────── */

  const handleResolve = useCallback(async (alertId: string) => {
    // Optimistic update
    setResolvingIds(prev => new Set(prev).add(alertId));
    setAlerts(prev =>
      prev.map(a => a.id === alertId ? { ...a, resolved: true, resolvedAt: new Date().toISOString() } : a)
    );

    try {
      await fetchJson(`/alerts/${alertId}/resolve`, { method: 'PATCH' });
      setResolveToast(alertId);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = window.setTimeout(() => setResolveToast(null), 2500);
    } catch {
      // Revert on failure
      setAlerts(prev =>
        prev.map(a => a.id === alertId ? { ...a, resolved: false, resolvedAt: null } : a)
      );
    } finally {
      setResolvingIds(prev => {
        const next = new Set(prev);
        next.delete(alertId);
        return next;
      });
    }
  }, []);

  /* ── Alert detail toggle ───────────────────────────────────────── */

  const toggleAlertDetail = async (alertId: string) => {
    if (expandedAlertId === alertId) {
      setExpandedAlertId(null);
      return;
    }

    setExpandedAlertId(alertId);
    if (alertDetails[alertId] || loadingAlertId === alertId) return;

    setLoadingAlertId(alertId);
    setDetailErrors(current => {
      const next = { ...current };
      delete next[alertId];
      return next;
    });

    try {
      const detail = await fetchJson<AlertDetail>(`/alerts/${alertId}`);
      setAlertDetails(current => ({ ...current, [alertId]: detail }));
      void markJourneyMilestone('alert_reviewed').catch(() => {});
    } catch (loadError) {
      setDetailErrors(current => ({
        ...current,
        [alertId]: loadError instanceof Error ? loadError.message : 'Failed to load alert explanation',
      }));
    } finally {
      setLoadingAlertId(current => (current === alertId ? null : current));
    }
  };

  /* ── Visual helpers ────────────────────────────────────────────── */

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'text-red-600 bg-red-50 border-red-200';
      case 'high':     return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'medium':   return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      default:         return 'text-primary-600 bg-primary-50 border-primary-200';
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-700';
      case 'high':     return 'bg-orange-100 text-orange-700';
      case 'medium':   return 'bg-yellow-100 text-yellow-700';
      default:         return 'bg-primary-100 text-primary-700';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'performance': return <Clock className="h-5 w-5" />;
      default:            return <AlertTriangle className="h-5 w-5" />;
    }
  };

  /* ── Upgrade gate ──────────────────────────────────────────────── */

  if (!canUseAlerts) {
    return (
      <div className="p-6">
        <UpgradeGate
          source="alerts"
          title="Unlock alerts before client issues find you first."
          description="The alert feed is part of the paid DXM bundle because it starts acting like an operational system, not just an analytics dashboard."
          bullets={[
            'See live issues before the next client check-in',
            'Unlock replay, funnels, reports, and Telegram delivery together',
          ]}
        />
      </div>
    );
  }

  /* ── Render ────────────────────────────────────────────────────── */

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Alerts</h1>
          <p className="text-gray-600">Stay ahead of client issues before they become uncomfortable status-call surprises.</p>
        </div>
        <span className="rounded-full bg-surface-100 px-3 py-1 text-xs font-medium text-surface-600">
          Agency alert feed
        </span>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Resolve toast */}
      {resolveToast && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700 animate-in fade-in">
          <CheckCircle className="h-4 w-4" />
          Alert resolved
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-primary-600">{stats.total}</div>
          <div className="text-sm text-gray-600">Total Alerts</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-orange-600">{stats.active}</div>
          <div className="text-sm text-gray-600">Active</div>
          {stats.active > 0 && (
            <div className="mt-1 flex items-center justify-center gap-2 text-xs text-gray-500">
              {stats.critical > 0 && <span className="text-red-600 font-medium">{stats.critical} critical</span>}
              {stats.high > 0 && <span className="text-orange-600 font-medium">{stats.high} high</span>}
              {stats.medium > 0 && <span className="text-yellow-600 font-medium">{stats.medium} medium</span>}
            </div>
          )}
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-red-600">
            {alerts.filter(a => a.severity === 'critical').length}
          </div>
          <div className="text-sm text-gray-600">Critical</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-green-600">{stats.resolved}</div>
          <div className="text-sm text-gray-600">Resolved</div>
        </div>
      </div>

      {/* Filter bar: tabs + site dropdown */}
      <div className="bg-white border border-gray-200 rounded-lg mb-6">
        <div className="flex flex-wrap items-center justify-between border-b border-gray-200">
          <div className="flex">
            {[
              { id: 'all', label: 'All Alerts', count: alerts.length },
              { id: 'active', label: 'Active', count: alerts.filter(a => !a.resolved).length },
              { id: 'resolved', label: 'Resolved', count: alerts.filter(a => a.resolved).length },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilter(tab.id)}
                className={`flex items-center space-x-2 px-6 py-4 text-sm font-medium transition-colors ${
                  filter === tab.id
                    ? 'text-primary-600 border-b-2 border-primary-500 bg-primary-50'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs ${
                  filter === tab.id
                    ? 'bg-primary-100 text-primary-800'
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Site filter */}
          {siteOptions.length > 0 && (
            <div className="px-4 py-2">
              <select
                value={siteFilter}
                onChange={(e) => setSiteFilter(e.target.value)}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 shadow-sm"
              >
                <option value="all">All sites</option>
                {siteOptions.map(site => (
                  <option key={site.id} value={site.id}>{site.domain}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Alerts list */}
      <div className="space-y-4">
        {isLoading && (
          <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading alerts...
          </div>
        )}

        {filteredAlerts.map((alert) => (
          <div
            key={alert.id}
            className={`bg-white border rounded-lg p-6 transition-all hover:shadow-md ${
              alert.resolved ? 'opacity-75' : ''
            } ${getSeverityColor(alert.severity)}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start space-x-4 min-w-0 flex-1">
                <div className={`flex-shrink-0 p-2 rounded-lg ${getSeverityColor(alert.severity)}`}>
                  {getTypeIcon(alert.type)}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h3 className="text-lg font-semibold text-gray-900">{alert.title}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${getSeverityBadge(alert.severity)}`}>
                      {alert.severity}
                    </span>
                    {alert.resolved && (
                      <span className="flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle className="h-3.5 w-3.5" />
                        Resolved
                      </span>
                    )}
                  </div>

                  <p className="text-gray-700 mb-3">{alert.description}</p>

                  <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                    <span
                      className="flex items-center gap-1.5 cursor-default"
                      title={new Date(alert.timestamp).toLocaleString()}
                    >
                      <Clock className="h-3.5 w-3.5" />
                      {formatRelativeTime(alert.timestamp)}
                    </span>
                    <span>{alert.affectedSessions} sessions affected</span>
                    <span className="capitalize">{alert.type}</span>
                    {alert.telegramSent && (
                      <span className="flex items-center gap-1 text-blue-600">
                        <Send className="h-3 w-3" />
                        <span className="text-xs">Telegram sent</span>
                      </span>
                    )}
                  </div>

                  {/* Links: view sessions */}
                  {alert.affectedSessions > 0 && (
                    <Link
                      to="/sessions"
                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      View sessions
                    </Link>
                  )}

                  {/* Resolved timestamp */}
                  {alert.resolved && alert.resolvedAt && (
                    <p
                      className="mt-1 text-xs text-gray-500 cursor-default"
                      title={new Date(alert.resolvedAt).toLocaleString()}
                    >
                      Resolved {formatRelativeTime(alert.resolvedAt)}
                    </p>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                {/* Resolve button */}
                {!alert.resolved && (
                  <button
                    onClick={() => void handleResolve(alert.id)}
                    disabled={resolvingIds.has(alert.id)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 hover:border-emerald-300 disabled:opacity-50"
                  >
                    {resolvingIds.has(alert.id) ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle className="h-3.5 w-3.5" />
                    )}
                    Resolve
                  </button>
                )}

                {/* AI brief toggle */}
                <button
                  onClick={() => void toggleAlertDetail(alert.id)}
                  className="inline-flex items-center gap-2 rounded-full border border-surface-200 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-surface-600 transition hover:border-primary-300 hover:text-primary-700"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Why this matters
                  {expandedAlertId === alert.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            {/* Expanded AI brief */}
            {expandedAlertId === alert.id && (
              <div className="mt-5 rounded-3xl border border-surface-200 bg-surface-50 p-5">
                {loadingAlertId === alert.id && !alertDetails[alert.id] && (
                  <div className="flex items-center gap-2 text-sm text-surface-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading alert explanation...
                  </div>
                )}

                {detailErrors[alert.id] && (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {detailErrors[alert.id]}
                  </div>
                )}

                {alertDetails[alert.id]?.ai && (
                  <div>
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="max-w-3xl">
                        <div className="inline-flex items-center gap-2 rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary-700">
                          <Sparkles className="h-3.5 w-3.5" />
                          Alert AI brief
                        </div>
                        <h3 className="mt-3 text-xl font-semibold text-surface-900">
                          {alertDetails[alert.id]!.ai!.headline}
                        </h3>
                        <p className="mt-3 text-sm leading-6 text-surface-600">
                          {alertDetails[alert.id]!.ai!.summary}
                        </p>
                      </div>
                      <p className="text-xs font-medium uppercase tracking-[0.18em] text-surface-500">
                        {new Date(alertDetails[alert.id]!.ai!.generatedAt).toLocaleString()}
                      </p>
                    </div>

                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      <div className="rounded-3xl border border-surface-200 bg-white p-5">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-surface-500">Why it fired</p>
                        <p className="mt-2 text-sm leading-6 text-surface-700">
                          {alertDetails[alert.id]!.ai!.whyFired}
                        </p>
                      </div>
                      <div className="rounded-3xl border border-surface-200 bg-white p-5">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-surface-500">Impact</p>
                        <p className="mt-2 text-sm leading-6 text-surface-700">
                          {alertDetails[alert.id]!.ai!.impact}
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4 md:grid-cols-3">
                      {alertDetails[alert.id]!.ai!.evidence.slice(0, 3).map((item) => (
                        <div key={item.id} className={`rounded-3xl border p-5 ${evidenceToneClasses[item.tone]}`}>
                          <p className="text-xs font-semibold uppercase tracking-[0.18em]">{item.label}</p>
                          <p className="mt-3 text-lg font-semibold text-surface-900">{item.value}</p>
                        </div>
                      ))}
                    </div>

                    {alertDetails[alert.id]!.ai!.recommendations.length > 0 && (
                      <div className="mt-5 rounded-3xl border border-surface-200 bg-white p-5">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-surface-500">Recommended actions</p>
                        <div className="mt-4 space-y-4">
                          {alertDetails[alert.id]!.ai!.recommendations.slice(0, 3).map((recommendation) => (
                            <div key={recommendation.id} className="rounded-2xl border border-surface-200 bg-surface-50 p-4">
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div className="max-w-2xl">
                                  <p className="text-sm font-semibold text-surface-900">{recommendation.title}</p>
                                  <p className="mt-2 text-sm leading-6 text-surface-600">{recommendation.detail}</p>
                                </div>
                                <Link
                                  to={recommendation.href}
                                  className="inline-flex shrink-0 items-center justify-center rounded-full bg-primary-600 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white transition hover:bg-primary-700"
                                >
                                  Open
                                </Link>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {alertDetails[alert.id] && !alertDetails[alert.id].ai && !detailErrors[alert.id] && loadingAlertId !== alert.id && (
                  <div className="rounded-2xl border border-surface-200 bg-white px-4 py-3 text-sm text-surface-600">
                    AI explanation is unavailable right now, but the alert details still loaded successfully.
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Empty states */}
      {!isLoading && filteredAlerts.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          {filter === 'active' ? (
            <>
              <CheckCircle className="h-12 w-12 text-green-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No active alerts</h3>
              <p className="text-gray-600">
                Your sites are running clean. Alerts will appear here when the engine detects issues.
              </p>
            </>
          ) : filter === 'resolved' ? (
            <>
              <Clock className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No resolved alerts</h3>
              <p className="text-gray-600">
                Resolved alerts will appear here once you start resolving active alerts.
              </p>
            </>
          ) : (
            <>
              <AlertTriangle className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No alerts yet</h3>
              <p className="text-gray-600">
                Alerts will appear here when the engine detects issues like rage clicks, slow page loads, or high bounce rates on your client sites.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
};
