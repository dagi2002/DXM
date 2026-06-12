import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, ArrowRight } from 'lucide-react';
import { fetchJson } from '../lib/api';
import { DashboardView } from '../components/Dashboard/DashboardView';
import type { Insight } from '../components/Dashboard/InsightsPanel';
import { AskPulseBubble } from '../components/AskPulse/AskPulseBubble';
import type { Metric, Alert, SessionRecording } from '../types';

const SESSIONS_POLL_MS = 15_000;
const METRICS_POLL_MS = 30_000;

export const DashboardPage: React.FC = () => {
  const [sessions, setSessions] = useState<SessionRecording[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const mountedRef = useRef(true);

  const fetchSessions = useCallback(async () => {
    try {
      const data = await fetchJson<SessionRecording[]>('/sessions');
      if (mountedRef.current) {
        setSessions(data);
        setLastUpdated(new Date());
      }
    } catch {
      // Silent fail on poll — initial error is already shown
    }
  }, []);

  const fetchMetrics = useCallback(async () => {
    try {
      const data = await fetchJson<Metric[]>('/analytics/metrics');
      if (mountedRef.current) {
        setMetrics(data);
        setLastUpdated(new Date());
      }
    } catch {
      // Silent fail on poll
    }
  }, []);

  // Initial load — all 3 endpoints
  useEffect(() => {
    mountedRef.current = true;

    const loadAll = async () => {
      setIsLoading(true);
      try {
        const [sessionsData, metricsData, alertsData, insightsData] = await Promise.all([
          fetchJson<SessionRecording[]>('/sessions'),
          fetchJson<Metric[]>('/analytics/metrics'),
          fetchJson<Alert[]>('/alerts'),
          fetchJson<Insight[]>('/insights').catch(() => [] as Insight[]),
        ]);
        if (!mountedRef.current) return;
        setSessions(sessionsData);
        setMetrics(metricsData);
        setAlerts(alertsData);
        setInsights(insightsData);
        setLastUpdated(new Date());
        setError(null);
      } catch (err) {
        if (!mountedRef.current) return;
        setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
      } finally {
        if (mountedRef.current) setIsLoading(false);
      }
    };

    void loadAll();

    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Poll sessions every 15s
  useEffect(() => {
    if (isLoading) return;
    const id = setInterval(fetchSessions, SESSIONS_POLL_MS);
    return () => clearInterval(id);
  }, [isLoading, fetchSessions]);

  // Poll metrics every 30s
  useEffect(() => {
    if (isLoading) return;
    const id = setInterval(fetchMetrics, METRICS_POLL_MS);
    return () => clearInterval(id);
  }, [isLoading, fetchMetrics]);

  // Empty state — triggered by sessions (per user requirement)
  if (!isLoading && !error && sessions.length === 0) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="mx-auto max-w-md rounded-3xl border-2 border-dashed border-surface-200 bg-white p-10 text-center shadow-sm">
          <BarChart3 className="mx-auto h-10 w-10 text-surface-300" />
          <h2 className="mt-4 text-xl font-semibold text-surface-900">No activity yet</h2>
          <p className="mt-2 text-sm text-surface-500">
            Sessions appear here when visitors interact with your site.
          </p>
          <p className="mt-1 text-xs text-surface-400">
            Install your tracking script and visit your site to start seeing data.
          </p>
          <Link
            to="/onboarding"
            className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-primary-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-primary-700"
          >
            Go to onboarding <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Last updated timestamp */}
      {lastUpdated && !isLoading && (
        <div className="flex justify-end px-4 pt-3 md:px-6">
          <p className="text-xs text-surface-400">
            Last updated: {lastUpdated.toLocaleTimeString()}
          </p>
        </div>
      )}

      <DashboardView
        sessions={sessions}
        metrics={metrics}
        alerts={alerts}
        insights={insights}
        isLoading={isLoading}
        error={error}
      />
      <AskPulseBubble />
    </div>
  );
};
