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
  const hasSentMetadataRef = useRef(false);
  const startRef = useRef<number>(0);
  const metadataRef = useRef<Record<string, unknown>>({});
  const metadataPromiseRef = useRef<Promise<void> | null>(null);


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

    metadataRef.current = {
      url: window.location.href,
      userId: null,
      userAgent: navigator.userAgent,
      language: navigator.language,
      screen: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      };

    const sendMetadata = async () => {
      if (!sessionIdRef.current || hasSentMetadataRef.current || !endpointUrl) {
        return;
      }

      const payload = {
        sessionId: sessionIdRef.current,
        metadata: metadataRef.current,
        events: [],
        completed: false,
      };

      const body = JSON.stringify(payload);

      try {
        const response = await fetch(endpointUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
        });

        if (!response.ok) {
          throw new Error(`Failed to send metadata: ${response.status}`);
        }

        hasSentMetadataRef.current = true;
      } catch (error) {
        console.error('Failed to send session metadata', error);
        throw error;
      }
    };

    const ensureMetadataSent = async () => {
      if (hasSentMetadataRef.current) {
        return;
      }

      if (!metadataPromiseRef.current) {
        metadataPromiseRef.current = sendMetadata().catch(error => {
          metadataPromiseRef.current = null;
          throw error;
        });
      }

      await metadataPromiseRef.current;
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
      return (
        target?.getAttribute('data-recorder-label')
        ?? (target instanceof HTMLElement ? `${target.tagName.toLowerCase()}${target.id ? `#${target.id}` : ''}` : undefined)
      );
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
      if (!sessionIdRef.current) {
        return;
      }

      try {
        await ensureMetadataSent();
      } catch (error) {
        if (!completed) {
          return;
        }
      }

      if (!bufferRef.current.length && !completed) {
        return;
      }

      const events = bufferRef.current.splice(0, bufferRef.current.length);
      const payload: Record<string, unknown> = {
        sessionId: sessionIdRef.current,
        events,
        completed,
      };

      if (!hasSentMetadataRef.current) {
        payload.metadata = metadataRef.current;
      }

      const body = JSON.stringify(payload);

      const send = async () => {
        try {
          await fetch(endpointUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
          });
          hasSentMetadataRef.current = true;
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
          hasSentMetadataRef.current = true;
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
        void flushEvents(true);
      }
    };

    const handleBeforeUnload = () => {
      void flushEvents(true);
    };

    const handleBlur = () => {
      void flushEvents(true);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('click', handleClick);
    window.addEventListener('scroll', handleScroll, { passive: true });
    document.body?.addEventListener('mouseenter', handleMouseEnter, true);
    document.body?.addEventListener('mouseleave', handleMouseLeave, true);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('blur', handleBlur);

    void ensureMetadataSent().catch(() => undefined);

    scheduleFlush();

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('click', handleClick);
      window.removeEventListener('scroll', handleScroll);
      document.body?.removeEventListener('mouseenter', handleMouseEnter, true);
      document.body?.removeEventListener('mouseleave', handleMouseLeave, true);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('blur', handleBlur);
      window.clearInterval(intervalId);
      void flushEvents(true);
    };
  }, [enabled, endpointUrl, flushInterval, hasWindow]);

  return sessionIdRef.current;
};