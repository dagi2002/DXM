import React from 'react';
import { ShieldCheck, ShieldAlert, Activity } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Alert, Metric } from '../../types';

interface SiteHealthScoreProps {
  metrics: Metric[];
  alerts: Alert[];
}

function computeScore(metrics: Metric[], alerts: Alert[]): number {
  let score = 100;

  // Penalize for unresolved alerts
  const unresolvedAlerts = alerts.filter(a => !a.resolved);
  score -= unresolvedAlerts.length * 8;

  // Penalize for high bounce rate
  const bounce = metrics.find(m => m.name.toLowerCase().includes('bounce'));
  if (bounce) {
    const val = typeof bounce.value === 'string' ? parseFloat(bounce.value) : bounce.value;
    if (val > 60) score -= 20;
    else if (val > 40) score -= 10;
  }

  // Penalize for low conversion
  const conversion = metrics.find(m => m.name.toLowerCase().includes('conversion'));
  if (conversion) {
    const val = typeof conversion.value === 'string' ? parseFloat(conversion.value) : conversion.value;
    if (val < 1) score -= 15;
    else if (val < 3) score -= 5;
  }

  return Math.max(0, Math.min(100, score));
}

export const SiteHealthScore: React.FC<SiteHealthScoreProps> = ({ metrics, alerts }) => {
  const { t } = useTranslation();
  const score = computeScore(metrics, alerts);
  const unresolvedCount = alerts.filter(a => !a.resolved).length;

  const getStatus = () => {
    if (score >= 70) return { label: t('health.healthy'), color: 'text-primary-600', bg: 'bg-primary-50', ring: 'ring-primary-200', Icon: ShieldCheck };
    if (score >= 40) return { label: t('health.issues'), color: 'text-accent-600', bg: 'bg-accent-50', ring: 'ring-accent-200', Icon: ShieldAlert };
    return { label: t('health.critical'), color: 'text-red-600', bg: 'bg-red-50', ring: 'ring-red-200', Icon: ShieldAlert };
  };

  const status = getStatus();
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (score / 100) * circumference;
  const strokeColor = score >= 70 ? '#166534' : score >= 40 ? '#d97706' : '#dc2626';

  return (
    <div className={`rounded-2xl border ${status.ring} ${status.bg} p-6`}>
      <div className="flex items-center gap-6">
        {/* Circular gauge */}
        <div className="relative flex-shrink-0">
          <svg width="128" height="128" viewBox="0 0 128 128">
            <circle cx="64" cy="64" r="54" fill="none" stroke="#e5e7eb" strokeWidth="8" />
            <circle
              cx="64" cy="64" r="54" fill="none"
              stroke={strokeColor} strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              transform="rotate(-90 64 64)"
              className="transition-all duration-1000 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-3xl font-bold ${status.color}`}>{score}</span>
            <span className="text-xs text-surface-500">/100</span>
          </div>
        </div>

        {/* Status text */}
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <status.Icon className={`h-5 w-5 ${status.color}`} />
            <h2 className={`text-lg font-bold ${status.color}`}>{status.label}</h2>
          </div>
          <p className="text-sm text-surface-600 mb-3">
            {score >= 70
              ? t('health.healthyDesc')
              : score >= 40
              ? t('health.issuesDesc')
              : t('health.criticalDesc')}
          </p>
          <div className="flex gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <Activity className="h-4 w-4 text-surface-400" />
              <span className="text-surface-600">
                {unresolvedCount === 0
                  ? t('health.noProblems')
                  : `${unresolvedCount} ${t('health.problemsFound')}`}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
