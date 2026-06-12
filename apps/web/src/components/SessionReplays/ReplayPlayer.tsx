/**
 * ReplayPlayer — rrweb-based DOM session replay component.
 * Fetches serialized rrweb events from GET /sessions/:id/replay
 * and plays them back in a sandboxed iframe using rrweb's Replayer.
 *
 * Features:
 *  - Scaled iframe that fits the container (no overflow)
 *  - Timeline event markers (click, scroll, navigation) — clickable to jump
 *  - Skip inactivity toggle
 *  - Autoplay on load
 *  - Proper fullscreen with visible exit button
 *  - Insight context badge (when navigated from insights)
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  SkipBack,
  SkipForward,
  Maximize2,
  Minimize2,
  Loader2,
  AlertCircle,
  FastForward,
  MousePointerClick,
  ArrowDownUp,
  Navigation,
  Lightbulb,
} from 'lucide-react';
import { fetchJson } from '../../lib/api';
import type { SessionReplayData, SessionRecordingEvent } from '../../types';
import type { Replayer } from 'rrweb';
import type { eventWithTime } from '@rrweb/types';

// Import rrweb replay CSS — critical for mouse cursor, wrapper layout, animations
import 'rrweb/dist/replay/rrweb-replay.min.css';

export interface ReplayPlayerProps {
  sessionId: string;
  sessionMeta: {
    url: string;
    device: string;
    browser: string;
    startedAt: string;
  };
  /** Session events from the detail endpoint — used for timeline markers */
  sessionEvents?: SessionRecordingEvent[];
  /** Optional insight context when navigated from InsightsPanel */
  insightContext?: {
    title: string;
    severity: 'info' | 'warning' | 'critical';
  } | null;
}

// ─── Timeline marker types ──────────────────────────────────────────────────

interface TimelineMarker {
  type: 'click' | 'scroll' | 'navigation';
  timestampMs: number;
  label: string;
}

const markerConfig = {
  click: { color: 'bg-blue-500', hoverColor: 'hover:bg-blue-600', icon: MousePointerClick, label: 'Click' },
  scroll: { color: 'bg-amber-400', hoverColor: 'hover:bg-amber-500', icon: ArrowDownUp, label: 'Scroll' },
  navigation: { color: 'bg-emerald-500', hoverColor: 'hover:bg-emerald-600', icon: Navigation, label: 'Navigation' },
};

const insightBadgeConfig = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  warning: 'bg-amber-100 text-amber-700 border-amber-200',
  info: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const formatTime = (ms: number): string => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

function buildTimelineMarkers(
  events: SessionRecordingEvent[] | undefined,
  sessionStartedAt: string,
): TimelineMarker[] {
  if (!events?.length) return [];

  const startMs = new Date(sessionStartedAt).getTime();
  const markers: TimelineMarker[] = [];

  for (const event of events) {
    if (event.type === 'click') {
      markers.push({
        type: 'click',
        timestampMs: event.absoluteTimestamp - startMs,
        label: event.target ? `Click: ${event.target}` : 'Click',
      });
    } else if (event.type === 'scroll') {
      markers.push({
        type: 'scroll',
        timestampMs: event.absoluteTimestamp - startMs,
        label: `Scroll to ${event.scrollY ?? 0}px`,
      });
    } else if (event.type === 'navigation' || event.type === 'pageview') {
      markers.push({
        type: 'navigation',
        timestampMs: event.absoluteTimestamp - startMs,
        label: event.url ? `Navigate: ${event.url.replace(/^https?:\/\/[^/]+/i, '')}` : 'Navigation',
      });
    }
  }

  // Deduplicate scroll events that are very close together (< 500ms)
  const filtered: TimelineMarker[] = [];
  let lastScrollMs = -1000;
  for (const m of markers) {
    if (m.type === 'scroll' && m.timestampMs - lastScrollMs < 500) {
      lastScrollMs = m.timestampMs;
      continue;
    }
    if (m.type === 'scroll') lastScrollMs = m.timestampMs;
    filtered.push(m);
  }

  return filtered;
}

/**
 * Scale the .replayer-wrapper inside our container so the recorded viewport
 * fits without overflow. rrweb creates the wrapper at the original page
 * dimensions — we need to shrink it with CSS transform.
 */
function scaleReplayerToFit(container: HTMLDivElement, viewportEl: HTMLDivElement): void {
  const wrapper = container.querySelector('.replayer-wrapper') as HTMLElement | null;
  if (!wrapper) return;

  // rrweb sets explicit width/height on the wrapper's first child (the iframe)
  const iframe = wrapper.querySelector('iframe');
  const iframeW = iframe?.width ? Number(iframe.width) : wrapper.scrollWidth || 1440;
  const iframeH = iframe?.height ? Number(iframe.height) : wrapper.scrollHeight || 900;

  const availableW = viewportEl.clientWidth;
  if (availableW <= 0 || iframeW <= 0) return;

  const scale = Math.min(availableW / iframeW, 1); // never scale up
  const scaledH = iframeH * scale;

  wrapper.style.transform = `scale(${scale})`;
  wrapper.style.transformOrigin = 'top left';
  wrapper.style.width = `${iframeW}px`;
  wrapper.style.height = `${iframeH}px`;

  // Set the viewport container to the scaled height so it doesn't overflow
  viewportEl.style.height = `${Math.max(scaledH, 300)}px`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export const ReplayPlayer: React.FC<ReplayPlayerProps> = ({
  sessionId,
  sessionMeta,
  sessionEvents,
  insightContext,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);       // outermost card — fullscreen target
  const viewportRef = useRef<HTMLDivElement>(null);    // the dark viewport area
  const containerRef = useRef<HTMLDivElement>(null);   // rrweb mount point
  const replayerRef = useRef<Replayer | null>(null);

  const [replayData, setReplayData] = useState<SessionReplayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [skipInactive, setSkipInactive] = useState(true);
  const [hoveredMarker, setHoveredMarker] = useState<TimelineMarker | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const markers = useMemo(
    () => buildTimelineMarkers(sessionEvents, sessionMeta.startedAt),
    [sessionEvents, sessionMeta.startedAt],
  );

  // ── Rescale helper (called after mount + on resize + on fullscreen) ───────
  const rescale = useCallback(() => {
    if (containerRef.current && viewportRef.current) {
      scaleReplayerToFit(containerRef.current, viewportRef.current);
    }
  }, []);

  // ── Fullscreen state tracking ─────────────────────────────────────────────
  useEffect(() => {
    const handler = () => {
      const fs = Boolean(document.fullscreenElement);
      setIsFullscreen(fs);
      // Rescale after fullscreen transition settles
      setTimeout(rescale, 100);
    };
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, [rescale]);

  // ── ResizeObserver — rescale on container resize ──────────────────────────
  useEffect(() => {
    if (!viewportRef.current) return;
    const ro = new ResizeObserver(() => rescale());
    ro.observe(viewportRef.current);
    return () => ro.disconnect();
  }, [rescale]);

  // Fetch replay events from API
  useEffect(() => {
    setLoading(true);
    setError(null);
    setIsPlaying(false);
    setCurrentTime(0);
    replayerRef.current = null;

    fetchJson<SessionReplayData>(`/sessions/${sessionId}/replay`)
      .then(data => {
        if (!data.events?.length) {
          setError('No replay data available for this session.');
          return;
        }
        setReplayData(data);
        setDuration(data.duration);
      })
      .catch(err => {
        setError(err?.message || 'Failed to load replay data.');
      })
      .finally(() => setLoading(false));
  }, [sessionId]);

  // Initialise rrweb Replayer once data + container are ready
  useEffect(() => {
    if (!replayData || !containerRef.current) return;

    import('rrweb').then(({ Replayer }) => {
      replayerRef.current?.destroy?.();

      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }

      const replayer = new Replayer(replayData.events as unknown as eventWithTime[], {
        root: containerRef.current!,
        skipInactive,
        speed: playbackSpeed,
        UNSAFE_replayCanvas: false,
      });

      replayerRef.current = replayer;

      replayer.on('event-cast', (_event: unknown) => {
        try {
          const meta = replayer.getMetaData();
          setCurrentTime(meta.currentTime || 0);
          if (meta.currentTime >= meta.totalTime) {
            setIsPlaying(false);
          }
        } catch {}
      });

      replayer.on('finish', () => {
        setIsPlaying(false);
        setCurrentTime(duration);
      });

      setDuration(replayData.duration);

      // Scale after rrweb has mounted the iframe, then autoplay
      setTimeout(() => {
        rescale();
        try {
          replayer.play(0);
          setIsPlaying(true);
        } catch {}
      }, 300);
    }).catch(() => {
      setError('Failed to initialise rrweb replay engine.');
    });

    return () => {
      replayerRef.current?.destroy?.();
    };
  }, [replayData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Play / Pause
  useEffect(() => {
    if (!replayerRef.current) return;
    if (isPlaying) {
      replayerRef.current.play(currentTime);
    } else {
      replayerRef.current.pause();
    }
  }, [isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  // Speed change
  useEffect(() => {
    if (!replayerRef.current) return;
    replayerRef.current.setConfig({ speed: playbackSpeed });
  }, [playbackSpeed]);

  // Skip inactivity toggle
  useEffect(() => {
    if (!replayerRef.current) return;
    replayerRef.current.setConfig({ skipInactive });
  }, [skipInactive]);

  const handlePlayPause = () => {
    if (!replayerRef.current) return;
    if (currentTime >= duration) {
      replayerRef.current.play(0);
      setCurrentTime(0);
      setIsPlaying(true);
    } else {
      setIsPlaying(p => !p);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = Number(e.target.value);
    setCurrentTime(t);
    replayerRef.current?.play(t);
    if (!isPlaying) replayerRef.current?.pause();
  };

  const handleSkip = (deltaMs: number) => {
    const t = Math.min(Math.max(currentTime + deltaMs, 0), duration);
    setCurrentTime(t);
    replayerRef.current?.play(t);
    if (!isPlaying) replayerRef.current?.pause();
  };

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    replayerRef.current?.pause();
    replayerRef.current?.play(0);
    replayerRef.current?.pause();
  };

  const handleMarkerClick = (marker: TimelineMarker) => {
    const t = Math.max(marker.timestampMs - 500, 0);
    setCurrentTime(t);
    replayerRef.current?.play(t);
    if (!isPlaying) replayerRef.current?.pause();
  };

  const handleFullscreen = () => {
    const el = cardRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => null);
    } else {
      document.exitFullscreen?.().catch(() => null);
    }
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-white rounded-2xl border border-gray-200">
        <Loader2 className="h-8 w-8 text-primary-600 animate-spin mb-3" />
        <p className="text-sm text-gray-500">Loading replay…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-white rounded-2xl border border-gray-200 p-6 text-center">
        <AlertCircle className="h-8 w-8 text-gray-400 mb-3" />
        <p className="text-sm font-medium text-gray-700 mb-1">Replay unavailable</p>
        <p className="text-xs text-gray-500">{error}</p>
        <p className="text-xs text-gray-400 mt-2">
          Add <code className="bg-gray-100 px-1 rounded">dxm-replay.js</code> to your site to enable full session replay.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={cardRef}
      className={`flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${isFullscreen ? 'h-screen' : ''}`}
    >
      {/* Header */}
      <div className="border-b border-slate-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Session Replay</h3>
            <p className="text-sm text-slate-500 truncate max-w-xs">{sessionMeta.url}</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap justify-end">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 capitalize">{sessionMeta.device}</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1">{sessionMeta.browser}</span>
            <span className="rounded-full bg-green-100 text-green-700 px-2.5 py-1">rrweb</span>
            {/* Fullscreen exit button — visible in header when fullscreen */}
            {isFullscreen && (
              <button
                onClick={handleFullscreen}
                className="flex items-center gap-1.5 rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700 transition-colors"
              >
                <Minimize2 className="h-3 w-3" />
                Exit
              </button>
            )}
          </div>
        </div>

        {/* Insight context badge */}
        {insightContext && (
          <div className={`mt-3 inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium ${insightBadgeConfig[insightContext.severity]}`}>
            <Lightbulb className="h-3.5 w-3.5" />
            Insight: {insightContext.title}
          </div>
        )}
      </div>

      {/* Browser chrome */}
      <div className="bg-slate-900 border-b border-slate-700 px-4 py-2.5 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
          </div>
          <div className="flex-1 truncate rounded bg-slate-800 px-3 py-1 text-xs text-slate-400">
            {sessionMeta.url}
          </div>
        </div>
      </div>

      {/* rrweb viewport — scaled to fit */}
      <div
        ref={viewportRef}
        className={`bg-slate-950 overflow-hidden relative ${isFullscreen ? 'flex-1' : ''}`}
        style={isFullscreen ? undefined : { minHeight: '400px' }}
      >
        <div
          ref={containerRef}
          className="absolute top-0 left-0"
        />
      </div>

      {/* Controls */}
      <div className="border-t border-slate-200 bg-white px-6 py-5 space-y-4 flex-shrink-0">
        {/* Playback buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-800 transition-colors"
            title="Reset"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => handleSkip(-10000)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-800 transition-colors"
            title="Back 10s"
          >
            <SkipBack className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handlePlayPause}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-600 text-white hover:bg-primary-700 transition-colors"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </button>
          <button
            onClick={() => handleSkip(10000)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-800 transition-colors"
            title="Forward 10s"
          >
            <SkipForward className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Timeline with markers */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-slate-500 tabular-nums w-10">
            {formatTime(currentTime)}
          </span>
          <div className="relative flex-1">
            {/* Track background + progress */}
            <div className="pointer-events-none absolute inset-0 flex items-center">
              <div className="h-1.5 w-full rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-primary-500 transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Event markers overlaid on timeline */}
            {duration > 0 && markers.map((marker, idx) => {
              const leftPct = Math.min((marker.timestampMs / duration) * 100, 100);
              const config = markerConfig[marker.type];

              return (
                <button
                  key={`${marker.type}-${idx}`}
                  onClick={() => handleMarkerClick(marker)}
                  onMouseEnter={() => setHoveredMarker(marker)}
                  onMouseLeave={() => setHoveredMarker(null)}
                  className={`absolute top-1/2 -translate-y-1/2 z-20 h-3 w-3 rounded-full ${config.color} ${config.hoverColor} border border-white shadow-sm transition-transform hover:scale-150`}
                  style={{ left: `${leftPct}%`, marginLeft: '-6px' }}
                  title={marker.label}
                />
              );
            })}

            {/* Hover tooltip */}
            {hoveredMarker && duration > 0 && (
              <div
                className="absolute -top-9 z-30 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-xs text-white shadow-lg"
                style={{ left: `${Math.min((hoveredMarker.timestampMs / duration) * 100, 100)}%` }}
              >
                {hoveredMarker.label} — {formatTime(hoveredMarker.timestampMs)}
              </div>
            )}

            {/* Seek input */}
            <input
              type="range"
              min={0}
              max={Math.max(duration, 1)}
              step={100}
              value={Math.min(currentTime, duration)}
              onChange={handleSeek}
              className="relative z-10 h-6 w-full cursor-pointer appearance-none bg-transparent"
            />
          </div>
          <span className="text-xs font-medium text-slate-500 tabular-nums w-10 text-right">
            {formatTime(duration)}
          </span>
        </div>

        {/* Marker legend */}
        {markers.length > 0 && (
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              Clicks ({markers.filter(m => m.type === 'click').length})
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              Scrolls ({markers.filter(m => m.type === 'scroll').length})
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Navigation ({markers.filter(m => m.type === 'navigation').length})
            </span>
          </div>
        )}

        {/* Speed + skip inactivity + fullscreen */}
        <div className="flex items-center gap-3">
          <select
            value={playbackSpeed}
            onChange={e => setPlaybackSpeed(Number(e.target.value))}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
          >
            {[0.5, 1, 1.5, 2, 4].map(s => (
              <option key={s} value={s}>{s}x</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={skipInactive}
              onChange={e => setSkipInactive(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
            />
            <FastForward className="h-3 w-3" />
            Skip idle
          </label>
          <button
            onClick={handleFullscreen}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-800 transition-colors"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          <span className="text-xs text-slate-400 ml-auto">
            {replayData?.events.length.toLocaleString() ?? 0} events recorded
          </span>
        </div>
      </div>
    </div>
  );
};
