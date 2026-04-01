import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Settings, BarChart3, Zap } from 'lucide-react';
import { SiteHealthScore } from './SiteHealthScore';
import { ProblemsSection } from './ProblemsSection';
import { RecommendedActions } from './RecommendedActions';
import { MetricCard } from './MetricCard';
import { ActivityChart } from './ActivityChart';
import { LiveSessions } from './LiveSessions';
import { InsightsPanel, type Insight } from './InsightsPanel';
import type { Alert, Metric, SessionRecording } from '../../types';

interface DashboardViewProps {
  sessions: SessionRecording[];
  metrics: Metric[];
  alerts: Alert[];
  insights: Insight[];
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

/** Small section heading that separates dashboard zones */
const SectionLabel: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex items-center gap-3">
    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-surface-400">{label}</p>
    <div className="flex-1 h-px bg-surface-100" />
  </div>
);

export const DashboardView: React.FC<DashboardViewProps> = ({
  sessions,
  metrics,
  alerts,
  insights,
  isLoading,
  error,
}) => {
  const { t } = useTranslation();
  const activityData = useMemo(() => buildHourlyActivity(sessions), [sessions]);
  const completionData = useMemo(() => buildCompletionActivity(sessions), [sessions]);

  const todaySessions = sessions.filter((s) => {
    const d = new Date(s.startedAt);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  }).length;

  const activeAlerts = alerts.filter((a) => !a.resolved).length;

  return (
    <div className="mx-auto max-w-7xl p-4 md:p-6 space-y-5">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="rounded-[28px] border border-surface-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-100">
                <Zap className="h-4 w-4 text-primary-700" />
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Live</span>
              </div>
            </div>
            <h1 className="mt-3 text-2xl font-bold text-surface-900">{t('dashboard.title')}</h1>
            <p className="mt-1 text-sm text-surface-500">{t('dashboard.subtitle')}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-surface-200 bg-surface-50 px-4 py-2.5 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-surface-500">Today's sessions</p>
              <p className="mt-1 text-xl font-bold text-surface-900">{todaySessions}</p>
            </div>
            <div className="rounded-2xl border border-surface-200 bg-surface-50 px-4 py-2.5 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-surface-500">Active alerts</p>
              <p className={`mt-1 text-xl font-bold ${activeAlerts > 0 ? 'text-red-600' : 'text-surface-900'}`}>
                {activeAlerts}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Error ──────────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── AI Insights ────────────────────────────────────────────────── */}
      <InsightsPanel insights={insights} isLoading={isLoading} />

      {/* ── Performance Metrics ────────────────────────────────────────── */}
      <SectionLabel label="Performance metrics" />
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

      {/* ── Health & Issues ────────────────────────────────────────────── */}
      <SectionLabel label="Health & issues" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SiteHealthScore metrics={metrics} alerts={alerts} />
        <ProblemsSection alerts={alerts} isLoading={isLoading} />
      </div>

      {/* ── Recommended Actions ────────────────────────────────────────── */}
      <SectionLabel label="Recommended actions" />
      <RecommendedActions sessions={sessions} metrics={metrics} alerts={alerts} />

      {/* ── Activity ───────────────────────────────────────────────────── */}
      <SectionLabel label="Activity" />
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

      {/* ── Live Sessions ──────────────────────────────────────────────── */}
      <SectionLabel label="Live sessions" />
      <LiveSessions sessions={sessions} isLoading={isLoading} />

    </div>
  );
};
