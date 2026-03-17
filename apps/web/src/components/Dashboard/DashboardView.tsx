import React, { useMemo } from 'react';
import { MetricCard } from './MetricCard';
import { ActivityChart } from './ActivityChart';
import { AlertPanel } from './AlertPanel';
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
    if (bucket) {
      bucket.value += 1;
    }
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
    if (!session.completed) {
      return;
    }

    const startedAt = new Date(session.startedAt);
    const bucketDate = new Date(startedAt);
    bucketDate.setHours(0, 0, 0, 0);
    const bucket = buckets.find((entry) => entry.bucketKey === bucketDate.getTime());
    if (bucket) {
      bucket.value += 1;
    }
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
  const activityData = useMemo(() => buildHourlyActivity(sessions), [sessions]);
  const completionData = useMemo(() => buildCompletionActivity(sessions), [sessions]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600">Real-time insights into your digital experience</p>
        </div>
        
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-sm text-gray-600">Live</span>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {metrics.map((metric, index) => (
          <MetricCard key={index} metric={metric} />
        ))}
        {!metrics.length && !isLoading && (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-sm text-gray-500">
            No metrics available from the backend yet.
          </div>
        )}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ActivityChart 
          title="Session Activity (24h)"
          data={activityData}
          color="#0066CC"
        />
        <ActivityChart 
          title="Completed Sessions (7d)"
          data={completionData}
          color="#00A896"
        />
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LiveSessions sessions={sessions} isLoading={isLoading} />
        <AlertPanel alerts={alerts} isLoading={isLoading} />
      </div>
    </div>
  );
};
