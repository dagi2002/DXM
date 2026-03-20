import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle, ChevronDown, ChevronUp, Clock, Sparkles } from 'lucide-react';
import type { Alert, AlertDetail } from '../../types';
import { fetchJson } from '../../lib/api';

const evidenceToneClasses = {
  positive: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  neutral: 'border-surface-200 bg-surface-50 text-surface-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
} as const;

export const AlertsView: React.FC = () => {
  const [filter, setFilter] = useState('all');
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertDetails, setAlertDetails] = useState<Record<string, AlertDetail>>({});
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({});
  const [expandedAlertId, setExpandedAlertId] = useState<string | null>(null);
  const [loadingAlertId, setLoadingAlertId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadAlerts = async () => {
      setIsLoading(true);
      try {
        const data = await fetchJson<Alert[]>('/alerts');
        if (!isMounted) {
          return;
        }

        setAlerts(Array.isArray(data) ? data : []);
        setError(null);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        setError(loadError instanceof Error ? loadError.message : 'Failed to load alerts');
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadAlerts();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredAlerts = alerts.filter(alert => {
    if (filter === 'active') return !alert.resolved;
    if (filter === 'resolved') return alert.resolved;
    return true;
  });

  const toggleAlertDetail = async (alertId: string) => {
    if (expandedAlertId === alertId) {
      setExpandedAlertId(null);
      return;
    }

    setExpandedAlertId(alertId);
    if (alertDetails[alertId] || loadingAlertId === alertId) {
      return;
    }

    setLoadingAlertId(alertId);
    setDetailErrors((current) => {
      const next = { ...current };
      delete next[alertId];
      return next;
    });

    try {
      const detail = await fetchJson<AlertDetail>(`/alerts/${alertId}`);
      setAlertDetails((current) => ({ ...current, [alertId]: detail }));
    } catch (loadError) {
      setDetailErrors((current) => ({
        ...current,
        [alertId]: loadError instanceof Error ? loadError.message : 'Failed to load alert explanation',
      }));
    } finally {
      setLoadingAlertId((current) => (current === alertId ? null : current));
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'high':
        return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'medium':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      default:
        return 'text-primary-600 bg-primary-50 border-primary-200';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'error':
        return <AlertTriangle className="h-5 w-5" />;
      case 'performance':
        return <Clock className="h-5 w-5" />;
      default:
        return <AlertTriangle className="h-5 w-5" />;
    }
  };

  return (
    <div className="p-6">
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

      {/* Alert Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Alerts', value: alerts.length, color: 'blue' },
          { label: 'Active', value: alerts.filter(a => !a.resolved).length, color: 'orange' },
          { label: 'Critical', value: alerts.filter(a => a.severity === 'critical').length, color: 'red' },
          { label: 'Resolved', value: alerts.filter(a => a.resolved).length, color: 'green' }
        ].map((stat, index) => (
          <div key={index} className="bg-white border border-gray-200 rounded-lg p-4 text-center">
            <div className={`text-2xl font-bold ${
              stat.color === 'blue' ? 'text-primary-600' :
              stat.color === 'orange' ? 'text-orange-600' :
              stat.color === 'red' ? 'text-red-600' : 'text-green-600'
            }`}>
              {stat.value}
            </div>
            <div className="text-sm text-gray-600">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div className="bg-white border border-gray-200 rounded-lg mb-6">
        <div className="flex border-b border-gray-200">
          {[
            { id: 'all', label: 'All Alerts', count: alerts.length },
            { id: 'active', label: 'Active', count: alerts.filter(a => !a.resolved).length },
            { id: 'resolved', label: 'Resolved', count: alerts.filter(a => a.resolved).length }
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
              <span className={`px-2 py-1 rounded-full text-xs ${
                filter === tab.id 
                  ? 'bg-primary-100 text-primary-800' 
                  : 'bg-gray-100 text-gray-600'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Alerts List */}
      <div className="space-y-4">
        {isLoading && (
          <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">
            Loading alerts…
          </div>
        )}

        {filteredAlerts.map((alert) => (
          <div
            key={alert.id}
            className={`bg-white border rounded-lg p-6 transition-all hover:shadow-md ${
              alert.resolved ? 'opacity-75' : ''
            } ${getSeverityColor(alert.severity)}`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-4">
                <div className={`p-2 rounded-lg ${getSeverityColor(alert.severity)}`}>
                  {getTypeIcon(alert.type)}
                </div>
                
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <h3 className="text-lg font-semibold text-gray-900">{alert.title}</h3>
                    {alert.resolved && (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    )}
                  </div>
                  
                  <p className="text-gray-700 mb-3">{alert.description}</p>
                  
                  <div className="flex items-center space-x-6 text-sm text-gray-600">
                    <span className="flex items-center space-x-1">
                      <Clock className="h-4 w-4" />
                      <span>{new Date(alert.timestamp).toLocaleString()}</span>
                    </span>
                    <span>{alert.affectedSessions} sessions affected</span>
                    <span className="capitalize">{alert.type} alert</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-end gap-3">
                {!alert.resolved && <span className="px-3 py-2 text-xs font-medium text-gray-500">Read-only</span>}
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

            {expandedAlertId === alert.id && (
              <div className="mt-5 rounded-3xl border border-surface-200 bg-surface-50 p-5">
                {loadingAlertId === alert.id && !alertDetails[alert.id] && (
                  <div className="text-sm text-surface-500">Loading alert explanation…</div>
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

      {!isLoading && filteredAlerts.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <AlertTriangle className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No alerts found</h3>
          <p className="text-gray-600">
            {filter === 'active' 
              ? "There are no active alerts at the moment." 
              : "No alerts match your current filter criteria."}
          </p>
        </div>
      )}
    </div>
  );
};
