import { useEffect, useMemo, useRef } from 'react';

type SessionEventType = 'mousemove' | 'click' | 'scroll' | 'hover';

type RecordedEvent = {
  type: SessionEventType;
  timestamp: number;
  x?: number;
  y?: number;
  scrollX?: number;
  scrollY?: number;
  button?: number;
  target?: string;
  phase?: 'enter' | 'leave';
};

interface UseSessionRecorderOptions {
  enabled?: boolean;
  flushInterval?: number;
  endpoint?: string;
}

const DEFAULT_FLUSH_INTERVAL = 3000;
const DEFAULT_API_BASE = 'http://localhost:4000';

const toRelativeTimestamp = (start: number) => Math.max(0, Math.round(performance.now() - start));

export const useSessionRecorder = (options: UseSessionRecorderOptions = {}) => {
  const { enabled = true, flushInterval = DEFAULT_FLUSH_INTERVAL, endpoint } = options;

  const hasWindow = typeof window !== 'undefined';
  const sessionIdRef = useRef<string | null>(null);
  const bufferRef = useRef<RecordedEvent[]>([]);
  const hasSentInitialRef = useRef(false);
  const startRef = useRef<number>(0);
  const absoluteStartRef = useRef<string>('');
  const metadataRef = useRef<Record<string, unknown>>({});

  const apiBase = useMemo(() => {
    if (!hasWindow) return '';
    const configured = import.meta.env.VITE_API_URL as string | undefined;
    return (endpoint ?? '').startsWith('http')
      ? ''
      : (configured && configured.trim().length > 0 ? configured : DEFAULT_API_BASE);
  }, [endpoint, hasWindow]);

  const endpointUrl = useMemo(() => {
    if (endpoint) {
      return endpoint;
    }

    if (!apiBase) return '';
    return `${apiBase.replace(/\/$/, '')}/sessions`;
  }, [apiBase, endpoint]);

  useEffect(() => {
    if (!enabled || !hasWindow || !endpointUrl) {
      return;
    }

    sessionIdRef.current = sessionIdRef.current ?? (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2));
    startRef.current = performance.now();
    absoluteStartRef.current = new Date().toISOString();

    metadataRef.current = {
      startedAt: absoluteStartRef.current,
      userAgent: navigator.userAgent,
      url: window.location.href,
      referrer: document.referrer,
      language: navigator.language,
      screen: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      devicePixelRatio: window.devicePixelRatio,
    };

    const recordEvent = (event: RecordedEvent) => {
      bufferRef.current.push(event);
    };

    const lastMouseMove = { timestamp: 0 };
    const lastScroll = { timestamp: 0 };

    const handleMouseMove = (event: MouseEvent) => {
      const now = performance.now();
      if (now - lastMouseMove.timestamp < 50) return;
      lastMouseMove.timestamp = now;

      recordEvent({
        type: 'mousemove',
        timestamp: toRelativeTimestamp(startRef.current),
        x: event.clientX,
        y: event.clientY,
      });
    };

     const resolveTargetLabel = (element: EventTarget | null) => {
      const target = (element as HTMLElement | null)?.closest('[data-recorder-label], a, button, input, textarea');
      return target?.getAttribute('data-recorder-label')
        ?? (target instanceof HTMLElement ? `${target.tagName.toLowerCase()}${target.id ? `#${target.id}` : ''}` : undefined);
        };

    const handleClick = (event: MouseEvent) => {
      const targetLabel = resolveTargetLabel(event.target);

      recordEvent({
        type: 'click',
        timestamp: toRelativeTimestamp(startRef.current),
        x: event.clientX,
        y: event.clientY,
        button: event.button,
        target: targetLabel,
      });
    };

    const handleMouseEnter = (event: MouseEvent) => {
      recordEvent({
        type: 'hover',
        timestamp: toRelativeTimestamp(startRef.current),
        x: event.clientX,
        y: event.clientY,
        target: resolveTargetLabel(event.target),
        phase: 'enter',
      });
    };

    const handleMouseLeave = (event: MouseEvent) => {
      recordEvent({
        type: 'hover',
        timestamp: toRelativeTimestamp(startRef.current),
        x: event.clientX,
        y: event.clientY,
        target: resolveTargetLabel(event.target),
        phase: 'leave',
      });
    };

    
    const handleScroll = () => {
      const now = performance.now();
      if (now - lastScroll.timestamp < 100) return;
      lastScroll.timestamp = now;

      recordEvent({
        type: 'scroll',
        timestamp: toRelativeTimestamp(startRef.current),
        scrollX: window.scrollX,
        scrollY: window.scrollY,
      });
    };

    const flushEvents = async (completed = false) => {
      if (!sessionIdRef.current || (!bufferRef.current.length && !completed)) {
        return;
      }

      const events = bufferRef.current.splice(0, bufferRef.current.length);
      const payload: Record<string, unknown> = {
        sessionId: sessionIdRef.current,
        startedAt: absoluteStartRef.current,
        events,
      };

      if (!hasSentInitialRef.current) {
        payload.metadata = metadataRef.current;
      }

      if (completed) {
        payload.completed = true;
        payload.endedAt = new Date().toISOString();
      }

      const body = JSON.stringify(payload);

      const send = async () => {
        try {
          await fetch(endpointUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
          });
          hasSentInitialRef.current = true;
        } catch (error) {
          console.error('Failed to send session events', error);
          bufferRef.current.unshift(...events);
        }
      };

      if (completed && navigator.sendBeacon) {
        const blob = new Blob([body], { type: 'application/json' });
        const success = navigator.sendBeacon(endpointUrl, blob);
        if (!success) {
          await send();
        } else {
          hasSentInitialRef.current = true;
        }
      } else {
        await send();
      }
    };

    const scheduleFlush = () => {
      void flushEvents();
    };

    const intervalId = window.setInterval(scheduleFlush, flushInterval);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        void flushEvents();
      }
    };

    const handleBeforeUnload = () => {
      void flushEvents(true);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('click', handleClick);
    window.addEventListener('scroll', handleScroll, { passive: true });
    document.body?.addEventListener('mouseenter', handleMouseEnter, true);
    document.body?.addEventListener('mouseleave', handleMouseLeave, true);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    scheduleFlush();

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('click', handleClick);
      window.removeEventListener('scroll', handleScroll);
      document.body?.removeEventListener('mouseenter', handleMouseEnter, true);
      document.body?.removeEventListener('mouseleave', handleMouseLeave, true);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.clearInterval(intervalId);
      void flushEvents(true);
    };
  }, [enabled, endpointUrl, flushInterval, hasWindow]);

  return sessionIdRef.current;
};