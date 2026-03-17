import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Zap, Gauge, TrendingDown, CheckCircle2, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Alert } from '../../types';

interface ProblemsSectionProps {
  alerts: Alert[];
  isLoading: boolean;
}

const getAlertIcon = (type: string) => {
  switch (type) {
    case 'frustration': return Zap;
    case 'performance': return Gauge;
    case 'conversion': return TrendingDown;
    default: return AlertTriangle;
  }
};

const getSeverityStyle = (severity: string) => {
  switch (severity) {
    case 'critical': return 'border-red-200 bg-red-50';
    case 'high': return 'border-orange-200 bg-orange-50';
    case 'medium': return 'border-accent-200 bg-accent-50';
    default: return 'border-surface-200 bg-surface-50';
  }
};

const getSeverityBadge = (severity: string) => {
  switch (severity) {
    case 'critical': return 'bg-red-100 text-red-700';
    case 'high': return 'bg-orange-100 text-orange-700';
    case 'medium': return 'bg-accent-100 text-accent-700';
    default: return 'bg-surface-100 text-surface-600';
  }
};

export const ProblemsSection: React.FC<ProblemsSectionProps> = ({ alerts, isLoading }) => {
  const { t } = useTranslation();
  const unresolvedAlerts = alerts
    .filter(a => !a.resolved)
    .sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      return (order[a.severity as keyof typeof order] ?? 3) - (order[b.severity as keyof typeof order] ?? 3);
    })
    .slice(0, 5);

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-surface-200 bg-white p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-5 bg-surface-100 rounded w-48" />
          <div className="h-16 bg-surface-50 rounded-xl" />
        </div>
      </div>
    );
  }

  // No problems — success state
  if (unresolvedAlerts.length === 0) {
    return (
      <div className="rounded-2xl border border-primary-200 bg-primary-50 p-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100">
            <CheckCircle2 className="h-5 w-5 text-primary-600" />
          </div>
          <div>
            <h3 className="font-semibold text-primary-700">{t('problems.noneTitle')}</h3>
            <p className="text-sm text-primary-600">{t('problems.noneDesc')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-surface-200 bg-white p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-accent-600" />
          <h3 className="font-semibold text-surface-900">
            {t('problems.title', { count: unresolvedAlerts.length })}
          </h3>
        </div>
        <Link to="/alerts" className="text-sm text-primary-600 hover:text-primary-700 font-medium">
          {t('problems.viewAll')} →
        </Link>
      </div>

      <div className="space-y-3">
        {unresolvedAlerts.map(alert => {
          const Icon = getAlertIcon(alert.type);
          return (
            <div key={alert.id} className={`flex items-start gap-3 p-3 rounded-xl border ${getSeverityStyle(alert.severity)}`}>
              <Icon className="h-4 w-4 mt-0.5 text-surface-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium text-surface-900 truncate">{alert.title}</span>
                  <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${getSeverityBadge(alert.severity)}`}>
                    {alert.severity}
                  </span>
                </div>
                {alert.description && (
                  <p className="text-xs text-surface-500 line-clamp-1">{alert.description}</p>
                )}
                <div className="flex items-center gap-3 mt-1 text-xs text-surface-400">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(alert.timestamp).toLocaleDateString()}
                  </span>
                  <span>{alert.affectedSessions} {t('problems.sessionsAffected')}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
