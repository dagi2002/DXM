import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Settings, BarChart3 } from 'lucide-react';
import { SiteHealthScore } from './SiteHealthScore';
import { ProblemsSection } from './ProblemsSection';
import { RecommendedActions } from './RecommendedActions';
import { MetricCard } from './MetricCard';
import { ActivityChart } from './ActivityChart';
import { LiveSessions } from './LiveSessions';
import type { Alert, Metric, SessionRecording } from '../../types';

interface DashboardViewProps {
  sessions: SessionRecording[];
  metrics: Metric[];
  alerts: Alert[];
  isLoading: boolean;
  error?: string | null;
}

const buildHourlyActivity = (sessions: SessionRecording[]) => {
  const now = new Date();
  const buckets = Array.from({ length: 24 }, (_, index) => {
    const bucketDate = new Date(now);
    bucketDate.setHours(now.getHours() - (23 - index), 0, 0, 0);
    return {
      time: bucketDate.toLocaleTimeString([], { hour: 'numeric' }),
      value: 0,
      bucketKey: bucketDate.getTime(),
    };
  });

  sessions.forEach((session) => {
    const startedAt = new Date(session.startedAt);
    const bucketDate = new Date(startedAt);
    bucketDate.setMinutes(0, 0, 0);
    const bucket = buckets.find((entry) => entry.bucketKey === bucketDate.getTime());
    if (bucket) bucket.value += 1;
  });

  return buckets.map(({ time, value }) => ({ time, value }));
};

const buildCompletionActivity = (sessions: SessionRecording[]) => {
  const now = new Date();
  const buckets = Array.from({ length: 7 }, (_, index) => {
    const bucketDate = new Date(now);
    bucketDate.setDate(now.getDate() - (6 - index));
    bucketDate.setHours(0, 0, 0, 0);
    return {
      time: bucketDate.toLocaleDateString([], { weekday: 'short' }),
      value: 0,
      bucketKey: bucketDate.getTime(),
    };
  });

  sessions.forEach((session) => {
    if (!session.completed) return;
    const startedAt = new Date(session.startedAt);
    const bucketDate = new Date(startedAt);
    bucketDate.setHours(0, 0, 0, 0);
    const bucket = buckets.find((entry) => entry.bucketKey === bucketDate.getTime());
    if (bucket) bucket.value += 1;
  });

  return buckets.map(({ time, value }) => ({ time, value }));
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  sessions,
  metrics,
  alerts,
  isLoading,
  error,
}) => {
  const { t } = useTranslation();
  const activityData = useMemo(() => buildHourlyActivity(sessions), [sessions]);
  const completionData = useMemo(() => buildCompletionActivity(sessions), [sessions]);

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">{t('dashboard.title')}</h1>
          <p className="text-surface-500 text-sm">{t('dashboard.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-surface-500">
            <div className="w-2.5 h-2.5 bg-primary-500 rounded-full animate-pulse" />
            <span className="hidden sm:inline">Live</span>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 1. Site Health Score */}
      <SiteHealthScore metrics={metrics} alerts={alerts} />

      {/* 2. Problems Detected (alerts hero) */}
      <ProblemsSection alerts={alerts} isLoading={isLoading} />

      {/* 3. Recommended Actions */}
      <RecommendedActions sessions={sessions} metrics={metrics} alerts={alerts} />

      {/* 4. Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {metrics.map((metric, index) => (
          <MetricCard key={index} metric={metric} />
        ))}
        {!metrics.length && !isLoading && (
          <div className="col-span-full rounded-xl border-2 border-dashed border-surface-200 bg-surface-50 p-8 text-center">
            <BarChart3 className="h-8 w-8 text-surface-300 mx-auto mb-3" />
            <p className="text-sm font-medium text-surface-600 mb-1">{t('empty.noMetricsTitle')}</p>
            <p className="text-xs text-surface-400 mb-4">{t('empty.noMetricsDesc')}</p>
            <Link to="/settings" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700">
              <Settings className="h-3.5 w-3.5" />
              {t('empty.goToSetup')}
            </Link>
          </div>
        )}
      </div>

      {/* 5. Activity Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ActivityChart
          title={t('dashboard.liveActivity')}
          data={activityData}
          color="#166534"
        />
        <ActivityChart
          title="Completed Sessions (7d)"
          data={completionData}
          color="#d97706"
        />
      </div>

      {/* 6. Live Sessions */}
      <LiveSessions sessions={sessions} isLoading={isLoading} />
    </div>
  );
};
