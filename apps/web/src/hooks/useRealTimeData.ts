import { useState, useEffect } from 'react';
import type { SessionRecording, Metric } from '../types';
import { fetchJson } from '../lib/api';

type ApiMetric = Metric;

export const useRealTimeData = () => {
  const [sessions, setSessions] = useState<SessionRecording[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      if (isMounted) {
        setIsLoading(true);
      }

      try {
        const [sessionsData, metricsData] = await Promise.all([
          fetchJson<SessionRecording[]>('/sessions'),
          fetchJson<ApiMetric[]>('/metrics'),
        ]);

        if (!isMounted) return;

        setSessions(sessionsData);
        setMetrics(metricsData);
        setLastUpdate(new Date());
        setError(null);
      } catch (err) {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void fetchData();
    const interval = setInterval(fetchData, 5000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return { sessions, metrics, lastUpdate, error, isLoading };
};
