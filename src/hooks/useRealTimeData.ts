import { useState, useEffect, useMemo } from 'react';
import type { Session, Metric } from '../types';

const DEFAULT_API_BASE = 'http://localhost:4000';

type ApiSession = Omit<Session, 'startTime' | 'endTime'> & {
  startTime: string;
  endTime?: string | null;
};

type ApiMetric = Metric;

const toSession = (session: ApiSession): Session => ({
  ...session,
  startTime: new Date(session.startTime),
  endTime: session.endTime ? new Date(session.endTime) : undefined
});

const API_ENDPOINTS = {
  sessions: '/sessions',
  metrics: '/metrics'
} as const;

export const useRealTimeData = () => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [error, setError] = useState<string | null>(null);

  const apiBaseUrl = useMemo(() => import.meta.env.VITE_API_URL ?? DEFAULT_API_BASE, []);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    const fetchData = async () => {
      try {
        const [sessionsResponse, metricsResponse] = await Promise.all([
          fetch(`${apiBaseUrl}${API_ENDPOINTS.sessions}`, { signal: controller.signal }),
          fetch(`${apiBaseUrl}${API_ENDPOINTS.metrics}`, { signal: controller.signal })
        ]);

        if (!sessionsResponse.ok || !metricsResponse.ok) {
          throw new Error('Failed to fetch dashboard data');
        }

        const [sessionsData, metricsData] = await Promise.all([
          sessionsResponse.json() as Promise<ApiSession[]>,
          metricsResponse.json() as Promise<ApiMetric[]>
        ]);

        if (!isMounted) return;

        setSessions(sessionsData.map(toSession));
        setMetrics(metricsData);
        setLastUpdate(new Date());
        setError(null);
      } catch (err) {
        if (!isMounted || err instanceof DOMException) return;
        console.error('Failed to load real-time data', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000);

    return () => {
      isMounted = false;
      controller.abort();
      clearInterval(interval);
    };
  }, [apiBaseUrl]);

  return { sessions, metrics, lastUpdate, error };
};