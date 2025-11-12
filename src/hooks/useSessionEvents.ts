import { useEffect, useMemo, useState } from 'react';
import type { HeatmapData, SessionRecording, SessionRecordingEvent } from '../types';

const DEFAULT_API_BASE = 'http://localhost:4000';
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 800;
const FALLBACK_SCREEN_WIDTH = 1280;
const FALLBACK_SCREEN_HEIGHT = 720;
const BUCKET_SIZE = 40;

type HeatmapType = 'click' | 'scroll' | 'hover';

type UseSessionEventsResult = {
  events: HeatmapData[];
  isLoading: boolean;
  error: string | null;
};

const clamp = (value: number, min: number, max: number) => {
  if (Number.isNaN(value)) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
};

const normaliseCoordinate = (value: number, dimension: number | undefined, canvasDimension: number, fallbackDimension: number) => {
  const base = typeof dimension === 'number' && dimension > 0 ? dimension : fallbackDimension;
  if (base <= 0) {
    return 0;
  }
  const ratio = value / base;
  return clamp(ratio * canvasDimension, 0, canvasDimension);
};

const getLocalSessions = (): SessionRecording[] => {
  if (typeof window === 'undefined') {
    return [];
  }

  const storageKeys = ['dxm:sessions', 'sessions'];

  for (const key of storageKeys) {
    const raw = window.localStorage.getItem(key);
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed as SessionRecording[];
      }

      if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { sessions?: unknown[] }).sessions)) {
        return (parsed as { sessions: SessionRecording[] }).sessions;
      }
    } catch (error) {
      console.warn('Failed to parse session events from localStorage', error);
    }
  }

  return [];
};

const getMaximumScroll = (session: SessionRecording): number => {
  const statsMax = typeof session.stats?.scrollDepth === 'number' ? session.stats.scrollDepth : 0;

  const eventMax = session.events.reduce((max, event) => {
    if (event.type !== 'scroll') {
      return max;
    }

    const value = typeof event.scrollY === 'number' ? event.scrollY : 0;
    return Math.max(max, value);
  }, 0);

  return Math.max(statsMax, eventMax, FALLBACK_SCREEN_HEIGHT);
};

const normaliseEventToPoint = (
  event: SessionRecordingEvent,
  session: SessionRecording,
  type: HeatmapType
): { x: number; y: number } | null => {
  const screenWidth = session.metadata?.screen?.width ?? FALLBACK_SCREEN_WIDTH;
  const screenHeight = session.metadata?.screen?.height ?? FALLBACK_SCREEN_HEIGHT;

  if (type === 'click' && event.type === 'click') {
    if (typeof event.x !== 'number' || typeof event.y !== 'number') {
      return null;
    }

    return {
      x: normaliseCoordinate(event.x, screenWidth, CANVAS_WIDTH, FALLBACK_SCREEN_WIDTH),
      y: normaliseCoordinate(event.y, screenHeight, CANVAS_HEIGHT, FALLBACK_SCREEN_HEIGHT),
    };
  }

  if (type === 'hover' && (event.type === 'mousemove' || event.type === 'hover')) {
    if (typeof event.x !== 'number' || typeof event.y !== 'number') {
      return null;
    }

    return {
      x: normaliseCoordinate(event.x, screenWidth, CANVAS_WIDTH, FALLBACK_SCREEN_WIDTH),
      y: normaliseCoordinate(event.y, screenHeight, CANVAS_HEIGHT, FALLBACK_SCREEN_HEIGHT),
    };
  }

  if (type === 'scroll' && event.type === 'scroll') {
    const maxScroll = getMaximumScroll(session);
    const scrollY = typeof event.scrollY === 'number' ? Math.max(0, event.scrollY) : 0;
    const x = CANVAS_WIDTH / 2;
    const y = maxScroll > 0 ? clamp((scrollY / maxScroll) * CANVAS_HEIGHT, 0, CANVAS_HEIGHT) : CANVAS_HEIGHT / 2;

    return { x, y };
  }

  return null;
};

const aggregateEvents = (sessions: SessionRecording[], type: HeatmapType): HeatmapData[] => {
  if (!sessions.length) {
    return [];
  }

  const buckets = new Map<string, { count: number; sumX: number; sumY: number }>();
  let maxCount = 0;

  sessions.forEach((session) => {
    session.events.forEach((event) => {
      const point = normaliseEventToPoint(event, session, type);
      if (!point) {
        return;
      }

      const bucketX = Math.round(point.x / BUCKET_SIZE);
      const bucketY = Math.round(point.y / BUCKET_SIZE);
      const key = `${bucketX}:${bucketY}`;

      const existing = buckets.get(key);
      if (existing) {
        existing.count += 1;
        existing.sumX += point.x;
        existing.sumY += point.y;
        maxCount = Math.max(maxCount, existing.count);
      } else {
        buckets.set(key, { count: 1, sumX: point.x, sumY: point.y });
        maxCount = Math.max(maxCount, 1);
      }
    });
  });

  if (buckets.size === 0 || maxCount === 0) {
    return [];
  }

  const denominator = maxCount === 0 ? 1 : maxCount;

  return Array.from(buckets.values()).map(({ count, sumX, sumY }) => ({
    x: sumX / count,
    y: sumY / count,
    intensity: clamp(count / denominator, 0, 1),
    type,
  }));
};

export const useSessionEvents = (heatmapType: HeatmapType): UseSessionEventsResult => {
  const [sessions, setSessions] = useState<SessionRecording[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apiBaseUrl = useMemo(() => {
    const configured = import.meta.env.VITE_API_URL as string | undefined;
    return configured && configured.trim().length > 0 ? configured : DEFAULT_API_BASE;
  }, []);

  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    const loadSessions = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/sessions`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error('Failed to fetch session events');
        }

        const data = await response.json() as SessionRecording[];
        if (!isMounted) return;

        setSessions(data);
        setError(null);
      } catch (err) {
        if (!isMounted) return;

        console.error('Failed to load session events', err);
        const fallbackSessions = getLocalSessions();
        if (fallbackSessions.length) {
          setSessions(fallbackSessions);
        }
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadSessions();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [apiBaseUrl]);

  const events = useMemo(() => aggregateEvents(sessions, heatmapType), [sessions, heatmapType]);

  return { events, isLoading, error };
};