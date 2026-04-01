import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  Activity,
  MousePointerClick,
  Timer,
  SkipBack,
  SkipForward,
  Maximize2,
  ArrowDownUp,
  Navigation,
  Globe,
  FastForward,
} from "lucide-react";

import type { SessionRecordingDetail, SessionRecordingEvent } from "../../types";

interface SessionPlayerProps {
  session: SessionRecordingDetail;
}

/* ── Helpers ─────────────────────────────────────────────────────── */

/** Format as M:SS */
const formatTime = (milliseconds: number) => {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

/** Format as +M:SS (relative offset) */
const formatRelativeTime = (milliseconds: number) => `+${formatTime(milliseconds)}`;

const getTimelineDuration = (events: SessionRecordingEvent[], fallbackSeconds: number) => {
  if (!events.length) return fallbackSeconds * 1000;
  return Math.max(events[events.length - 1].timestamp, fallbackSeconds * 1000);
};

type TimelineMarker = {
  timestamp: number;
  position: number;
  type: SessionRecordingEvent["type"];
};

/** Event types shown in the event log sidebar */
const LOG_EVENT_TYPES = new Set<string>(["click", "scroll", "navigation", "pageview"]);

/** Throttle scroll events: keep only one per 2-second window */
function deduplicateScrolls(events: SessionRecordingEvent[]): SessionRecordingEvent[] {
  const result: SessionRecordingEvent[] = [];
  let lastScrollTs = -Infinity;
  for (const evt of events) {
    if (evt.type === "scroll") {
      if (evt.timestamp - lastScrollTs < 2000) continue;
      lastScrollTs = evt.timestamp;
    }
    result.push(evt);
  }
  return result;
}

/** Config for each event type in the log */
const eventLogConfig: Record<string, {
  icon: React.ReactNode;
  label: string;
  color: string;
  dotColor: string;
}> = {
  click: {
    icon: <MousePointerClick className="h-3.5 w-3.5" />,
    label: "Click",
    color: "text-blue-600",
    dotColor: "bg-blue-500",
  },
  scroll: {
    icon: <ArrowDownUp className="h-3.5 w-3.5" />,
    label: "Scroll",
    color: "text-amber-600",
    dotColor: "bg-amber-400",
  },
  navigation: {
    icon: <Navigation className="h-3.5 w-3.5" />,
    label: "Navigation",
    color: "text-purple-600",
    dotColor: "bg-purple-500",
  },
  pageview: {
    icon: <Globe className="h-3.5 w-3.5" />,
    label: "Page View",
    color: "text-emerald-600",
    dotColor: "bg-emerald-500",
  },
};

/** Describe what the event acted on — target for clicks, URL for nav/pageview, depth for scroll */
function eventDetail(evt: SessionRecordingEvent): string | null {
  if (evt.type === "click" && evt.target) {
    return evt.target.length > 35 ? evt.target.slice(0, 32) + "..." : evt.target;
  }
  if ((evt.type === "navigation" || evt.type === "pageview") && evt.url) {
    try {
      return new URL(evt.url).pathname;
    } catch {
      return evt.url.length > 35 ? evt.url.slice(0, 32) + "..." : evt.url;
    }
  }
  if (evt.type === "scroll" && evt.depth != null) {
    return `${evt.depth}% depth`;
  }
  return null;
}

/* ── Component ───────────────────────────────────────────────────── */

export const SessionPlayer: React.FC<SessionPlayerProps> = ({ session }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [skipIdle, setSkipIdle] = useState(false);

  const playbackContainerRef = useRef<HTMLDivElement>(null);
  const eventLogRef = useRef<HTMLDivElement>(null);
  const activeRowRef = useRef<HTMLButtonElement>(null);
  const skipIdleRef = useRef(false);
  const logEventsRef = useRef<SessionRecordingEvent[]>([]);

  const screenWidth = session.metadata.screen?.width ?? 1;
  const screenHeight = session.metadata.screen?.height ?? 1;

  const metadataDetails = useMemo(() => {
    return {
      url: session.metadata.url ?? "Unknown URL",
      userId: session.metadata.userId ?? "Anonymous",
      device: session.metadata.device ?? "desktop",
      browser: session.metadata.browser ?? "Unknown browser",
      language: session.metadata.language ?? "Unknown locale",
    };
  }, [session.metadata]);

  const durationMs = useMemo(
    () => getTimelineDuration(session.events, session.duration),
    [session.events, session.duration]
  );

  /* ── Event log: filtered + deduplicated ───────────────────────── */

  const logEvents = useMemo(() => {
    const filtered = session.events.filter((e) => LOG_EVENT_TYPES.has(e.type));
    return deduplicateScrolls(filtered);
  }, [session.events]);

  /** Index of the active (most-recent-reached) event in logEvents */
  const activeLogIndex = useMemo(() => {
    let idx = -1;
    for (let i = 0; i < logEvents.length; i++) {
      if (logEvents[i].timestamp <= currentTime) idx = i;
      else break;
    }
    return idx;
  }, [logEvents, currentTime]);

  /** Which event types actually exist — drives the legend */
  const presentEventTypes = useMemo(() => {
    const types = new Set<string>();
    for (const e of logEvents) types.add(e.type);
    return types;
  }, [logEvents]);

  // Keep refs in sync so the rAF loop can read current values without stale closures
  skipIdleRef.current = skipIdle;
  logEventsRef.current = logEvents;

  /* ── Reset on session change ──────────────────────────────────── */

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setPlaybackSpeed(1);
  }, [session.id]);

  /* ── Playback loop ────────────────────────────────────────────── */

  useEffect(() => {
    if (!isPlaying) return;

    let animationFrame: number;
    let start: number | null = null;

    const IDLE_THRESHOLD_MS = 2000;

    const step = (timestamp: number) => {
      if (start === null) start = timestamp;

      const elapsed = (timestamp - start) * playbackSpeed;

      setCurrentTime((prev) => {
        let next = prev + elapsed;

        // Skip idle: jump over gaps > 2s to the next event
        if (skipIdleRef.current) {
          const nextEvt = logEventsRef.current.find((e) => e.timestamp > next);
          if (nextEvt && nextEvt.timestamp - next > IDLE_THRESHOLD_MS) {
            next = nextEvt.timestamp;
          }
        }

        if (next >= durationMs) {
          setIsPlaying(false);
          return durationMs;
        }
        return next;
      });

      start = timestamp;
      animationFrame = window.requestAnimationFrame(step);
    };

    animationFrame = window.requestAnimationFrame(step);

    return () => {
      window.cancelAnimationFrame(animationFrame);
    };
  }, [isPlaying, playbackSpeed, durationMs]);

  /* ── Auto-scroll event log to keep active row visible ─────────── */

  useEffect(() => {
    if (activeRowRef.current && eventLogRef.current) {
      const container = eventLogRef.current;
      const row = activeRowRef.current;
      const rowTop = row.offsetTop;
      const rowBottom = rowTop + row.offsetHeight;
      const scrollTop = container.scrollTop;
      const visibleBottom = scrollTop + container.clientHeight;

      // Only scroll if the active row is out of view
      if (rowTop < scrollTop || rowBottom > visibleBottom) {
        row.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [activeLogIndex]);

  /* ── Pointer + click computations (unchanged logic) ───────────── */

  const normalisedPointerPosition = useMemo(() => {
    const width = screenWidth;
    const height = screenHeight;

    const event = [...session.events]
      .reverse()
      .find(
        (event) =>
          event.timestamp <= currentTime &&
          (event.type === "mousemove" || event.type === "click")
      );

    if (!event) return { x: 50, y: 50 };

    const x = event.x ?? width / 2;
    const y = event.y ?? height / 2;

    return {
      x: (x / width) * 100,
      y: (y / height) * 100,
    };
  }, [session.events, screenWidth, screenHeight, currentTime]);

  const recentClick = useMemo(() => {
    const clickEvent = [...session.events]
      .reverse()
      .find((event) => event.type === "click" && event.timestamp <= currentTime);

    return clickEvent ? clickEvent.timestamp : null;
  }, [session.events, currentTime]);

  /* ── Handlers ──────────────────────────────────────────────────── */

  const handleSeek = (event: React.ChangeEvent<HTMLInputElement>) =>
    setCurrentTime(Number(event.target.value));

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleSkip = (deltaMs: number) => {
    setCurrentTime((previous) => {
      const next = Math.min(Math.max(previous + deltaMs, 0), durationMs);
      return next;
    });
  };

  const handleFullscreen = () => {
    const element = playbackContainerRef.current?.closest<HTMLElement>(".session-player-root");
    if (!element) return;

    if (!document.fullscreenElement) {
      element.requestFullscreen?.().catch(() => null);
    } else {
      document.exitFullscreen?.().catch(() => null);
    }
  };

  const handlePlayPause = () => {
    if (currentTime >= durationMs) setCurrentTime(0);
    setIsPlaying((prev) => !prev);
  };

  const handleSeekToEvent = useCallback((timestamp: number) => {
    setCurrentTime(timestamp);
  }, []);

  /* ── Derived values for rendering ──────────────────────────────── */

  const displayedEvents = useMemo(
    () => session.events.filter((event) => event.timestamp <= currentTime),
    [session.events, currentTime]
  );

  const timelineMarkers = useMemo<TimelineMarker[]>(() => {
    return session.events
      .filter((event) => event.type === "click" || event.type === "scroll" || event.type === "navigation")
      .map((event) => ({
        timestamp: event.timestamp,
        position: Math.max(0, Math.min(100, (event.timestamp / durationMs) * 100)),
        type: event.type,
      }));
  }, [session.events, durationMs]);

  const progressPercent = durationMs ? (Math.min(currentTime, durationMs) / durationMs) * 100 : 0;

  /* ── Render ────────────────────────────────────────────────────── */

  return (
    <div className="session-player-root flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Header — streamlined, no duplicate metadata badges */}
      <div className="flex items-start justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-slate-900">Event Timeline</h3>
          <p className="truncate text-sm text-slate-500">{metadataDetails.url}</p>
        </div>
        <div className="flex-shrink-0 text-right text-xs text-slate-500">
          <div>{new Date(session.startedAt).toLocaleString()}</div>
          {session.endedAt && (
            <div>Ended {new Date(session.endedAt).toLocaleTimeString()}</div>
          )}
        </div>
      </div>

      {/* Playback area: canvas + event log sidebar */}
      <div className="flex flex-col lg:flex-row bg-slate-950">
        {/* Left: Canvas */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Browser chrome bar — metadata lives here */}
          <div className="border-b border-slate-800 bg-slate-900 px-5 py-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
              </div>
              <div className="flex-1 truncate rounded-md bg-slate-800/70 px-3 py-1 text-xs text-slate-300">
                {metadataDetails.url}
              </div>
              <div className="hidden items-center gap-2 text-xs text-slate-400 sm:flex">
                <span className="capitalize">{metadataDetails.device}</span>
                <span className="text-slate-600">|</span>
                <span>{metadataDetails.browser}</span>
                <span className="text-slate-600">|</span>
                <span>{metadataDetails.language}</span>
              </div>
            </div>
          </div>

          {/* Canvas viewport */}
          <div ref={playbackContainerRef} className="px-5 py-5">
            <div className="relative mx-auto flex h-[420px] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-950 shadow-[0_40px_120px_-40px_rgba(15,23,42,0.8)]">
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-900/40 via-slate-900/70 to-slate-900/90" />
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.15),_transparent_60%)]" />

              <div className="relative h-full w-full">
                <div className="absolute inset-0">
                  {displayedEvents.map((event, index) => {
                    if (event.type === "scroll") return null;

                    if (event.type === "mousemove") {
                      return (
                        <div
                          key={`move-${index}`}
                          className="absolute h-1 w-1 rounded-full bg-primary-400/40"
                          style={{
                            left: `${((event.x ?? 0) / screenWidth) * 100}%`,
                            top: `${((event.y ?? 0) / screenHeight) * 100}%`,
                          }}
                        />
                      );
                    }

                    if (event.type === "click") {
                      return (
                        <div
                          key={`click-${index}`}
                          className="absolute -translate-x-1/2 -translate-y-1/2"
                          style={{
                            left: `${((event.x ?? 0) / screenWidth) * 100}%`,
                            top: `${((event.y ?? 0) / screenHeight) * 100}%`,
                          }}
                        >
                          <div className="h-6 w-6 rounded-full border-2 border-primary-400/80" />
                        </div>
                      );
                    }
                  })}

                  {/* Pointer Indicator */}
                  <div
                    className={`absolute h-4 w-4 rounded-full border-2 border-white/80 ${
                      isPlaying ? "bg-primary-500" : "bg-primary-500/70"
                    }`}
                    style={{
                      left: `${normalisedPointerPosition.x}%`,
                      top: `${normalisedPointerPosition.y}%`,
                    }}
                  />

                  {/* Click pulse animation */}
                  {recentClick !== null && currentTime - recentClick < 400 && (
                    <div
                      className="pointer-events-none absolute h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary-500/70 animate-ping"
                      style={{
                        left: `${normalisedPointerPosition.x}%`,
                        top: `${normalisedPointerPosition.y}%`,
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Event Log sidebar */}
        <div className="w-full lg:w-[280px] xl:w-[320px] flex-shrink-0 border-t lg:border-t-0 lg:border-l border-slate-800 bg-slate-900 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Event Log
            </span>
            <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
              {logEvents.length}
            </span>
          </div>
          <div
            ref={eventLogRef}
            className="flex-1 overflow-y-auto overscroll-contain"
            style={{ maxHeight: "calc(420px + 2.5rem)" }}
          >
            {logEvents.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-slate-500">
                No events recorded
              </div>
            ) : (
              logEvents.map((evt, idx) => {
                const config = eventLogConfig[evt.type];
                if (!config) return null;
                const isActive = idx === activeLogIndex;
                const isPast = idx < activeLogIndex;
                const detail = eventDetail(evt);

                return (
                  <button
                    key={`${evt.type}-${evt.timestamp}-${idx}`}
                    ref={isActive ? activeRowRef : undefined}
                    onClick={() => handleSeekToEvent(evt.timestamp)}
                    className={`
                      group flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors
                      border-l-2
                      ${isActive
                        ? "border-l-blue-400 bg-blue-500/10"
                        : isPast
                          ? "border-l-transparent bg-transparent hover:bg-slate-800/50"
                          : "border-l-transparent bg-transparent opacity-50 hover:bg-slate-800/30 hover:opacity-80"
                      }
                    `}
                  >
                    {/* Icon */}
                    <span
                      className={`mt-0.5 flex-shrink-0 ${
                        isActive ? config.color : isPast ? "text-slate-400" : "text-slate-500"
                      }`}
                    >
                      {config.icon}
                    </span>

                    {/* Label + detail */}
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block text-xs font-medium ${
                          isActive ? "text-slate-100" : "text-slate-300"
                        }`}
                      >
                        {config.label}
                      </span>
                      {detail && (
                        <span className="block truncate text-[11px] text-slate-500 leading-tight mt-0.5">
                          {detail}
                        </span>
                      )}
                    </span>

                    {/* Timestamp */}
                    <span
                      className={`flex-shrink-0 font-mono text-[11px] mt-0.5 ${
                        isActive ? "text-blue-300" : "text-slate-500"
                      }`}
                    >
                      {formatRelativeTime(evt.timestamp)}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Controls — single compact row */}
      <div className="border-t border-slate-200 bg-white px-5 py-4 text-slate-900">
        <div className="flex flex-wrap items-center gap-3">
          {/* Play group */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleReset}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:text-slate-700 hover:border-slate-300"
              title="Reset"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>

            <button
              onClick={() => handleSkip(-10000)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:text-slate-700 hover:border-slate-300"
              title="Back 10s"
            >
              <SkipBack className="h-3.5 w-3.5" />
            </button>

            <button
              onClick={handlePlayPause}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-600 text-white shadow-sm transition hover:bg-primary-700"
            >
              {isPlaying ? <Pause className="h-4.5 w-4.5" /> : <Play className="h-4.5 w-4.5" />}
            </button>

            <button
              onClick={() => handleSkip(10000)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:text-slate-700 hover:border-slate-300"
              title="Forward 10s"
            >
              <SkipForward className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Timeline seek bar */}
          <div className="flex min-w-[160px] flex-1 items-center gap-2">
            <span className="w-10 text-right font-mono text-xs text-slate-500">{formatTime(currentTime)}</span>

            <div className="relative flex-1">
              <div className="pointer-events-none absolute inset-0 flex items-center">
                <div className="h-1 w-full rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-primary-500 transition-[width] duration-75"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              {timelineMarkers.map((marker, index) => {
                const color =
                  marker.type === "click"
                    ? "bg-blue-500"
                    : marker.type === "scroll"
                    ? "bg-amber-400"
                    : "bg-purple-500";

                return (
                  <div
                    key={`${marker.type}-${marker.timestamp}-${index}`}
                    className={`pointer-events-none absolute top-1/2 h-2.5 w-[2px] -translate-y-1/2 rounded-full ${color}`}
                    style={{ left: `${marker.position}%` }}
                  />
                );
              })}

              <div
                className="pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary-600 shadow ring-2 ring-primary-500/30"
                style={{ left: `${progressPercent}%` }}
              />

              <input
                type="range"
                min={0}
                max={durationMs}
                step={100}
                value={Math.min(currentTime, durationMs)}
                onChange={handleSeek}
                className="relative z-10 h-7 w-full cursor-pointer appearance-none bg-transparent"
              />
            </div>

            <span className="w-10 font-mono text-xs text-slate-500">{formatTime(durationMs)}</span>
          </div>

          {/* Speed + skip idle + fullscreen */}
          <div className="flex items-center gap-2">
            <select
              value={playbackSpeed}
              onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium shadow-sm"
            >
              <option value={0.5}>0.5x</option>
              <option value={1}>1x</option>
              <option value={1.5}>1.5x</option>
              <option value={2}>2x</option>
            </select>

            <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={skipIdle}
                onChange={(e) => setSkipIdle(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              <FastForward className="h-3 w-3" />
              Skip idle
            </label>

            <button
              onClick={handleFullscreen}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:text-slate-700 hover:border-slate-300"
              title="Fullscreen"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Footer: legend (dynamic) + stats — merged into one row */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
          {/* Legend — only shows types that actually exist */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
            {presentEventTypes.has("click") && (
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                Click
              </span>
            )}
            {presentEventTypes.has("scroll") && (
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                Scroll
              </span>
            )}
            {(presentEventTypes.has("navigation") || presentEventTypes.has("pageview")) && (
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-purple-500" />
                Navigation
              </span>
            )}
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <Timer className="h-3.5 w-3.5" />
              {formatTime(durationMs)}
            </span>
            <span className="flex items-center gap-1.5">
              <MousePointerClick className="h-3.5 w-3.5" />
              {session.stats.clicks} clicks
            </span>
            <span className="flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5" />
              {session.stats.totalEvents} events
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
