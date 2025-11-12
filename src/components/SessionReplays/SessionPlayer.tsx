import React, { useEffect, useMemo, useRef, useState } from "react";
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
} from "lucide-react";

import type { SessionRecording, SessionRecordingEvent } from "../../types";

interface SessionPlayerProps {
  session: SessionRecording;
}

/* Format MM:SS */
const formatTime = (milliseconds: number) => {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const getTimelineDuration = (events: SessionRecordingEvent[], fallbackSeconds: number) => {
  if (!events.length) return fallbackSeconds * 1000;
  return Math.max(events[events.length - 1].timestamp, fallbackSeconds * 1000);
};

type TimelineMarker = {
  timestamp: number;
  position: number;
  type: SessionRecordingEvent["type"];
};

export const SessionPlayer: React.FC<SessionPlayerProps> = ({ session }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  const playbackContainerRef = useRef<HTMLDivElement>(null);

  const screenDimensions = session.metadata.screen ?? { width: 1, height: 1 };

  const metadataDetails = useMemo(() => {
    const extendedMetadata = session.metadata as SessionRecording["metadata"] & {
      userId?: string;
    };

    return {
      url: extendedMetadata.url ?? "Unknown URL",
      userId: extendedMetadata.userId ?? "Anonymous",
      device: extendedMetadata.device ?? "desktop",
      browser: extendedMetadata.browser ?? "Unknown browser",
      language: extendedMetadata.language ?? "Unknown locale",
    };
  }, [session.metadata]);

  const durationMs = useMemo(
    () => getTimelineDuration(session.events, session.duration),
    [session.events, session.duration]
  );

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setPlaybackSpeed(1);
  }, [session.id]);

  useEffect(() => {
    if (!isPlaying) return;

    let animationFrame: number;
    let start: number | null = null;

    const step = (timestamp: number) => {
      if (start === null) start = timestamp;

      const elapsed = (timestamp - start) * playbackSpeed;

      setCurrentTime((prev) => {
        const next = prev + elapsed;
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

  const normalisedPointerPosition = useMemo(() => {
    const { width, height } = screenDimensions;

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
  }, [session.events, screenDimensions.width, screenDimensions.height, currentTime]);

  const recentClick = useMemo(() => {
    const clickEvent = [...session.events]
      .reverse()
      .find((event) => event.type === "click" && event.timestamp <= currentTime);

    return clickEvent ? clickEvent.timestamp : null;
  }, [session.events, currentTime]);

  const handleSeek = (event: React.ChangeEvent<HTMLInputElement>) =>
    setCurrentTime(Number(event.target.value));

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleSkip = (deltaMs: number) => {
    setCurrentTime(previous => {
      const next = Math.min(Math.max(previous + deltaMs, 0), durationMs);
      return next;
    });
  };

  const handleFullscreen = () => {
    const element = playbackContainerRef.current;
    if (!element) {
      return;
    }

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

  const displayedEvents = useMemo(
    () => session.events.filter((event) => event.timestamp <= currentTime),
    [session.events, currentTime]
  );

  const timelineMarkers = useMemo<TimelineMarker[]>(() => {
    return session.events
      .filter((event) => event.type === "click" || event.type === "scroll" || event.type === "hover")
      .map((event) => ({
        timestamp: event.timestamp,
        position: Math.max(0, Math.min(100, (event.timestamp / durationMs) * 100)),
        type: event.type,
      }));
  }, [session.events, durationMs]);

  const progressPercent = durationMs ? (Math.min(currentTime, durationMs) / durationMs) * 100 : 0;

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="space-y-4 border-b border-slate-200 bg-white px-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-[180px]">
            <h3 className="text-lg font-semibold text-slate-900">Session Replay</h3>
            <p className="truncate text-sm text-slate-500">{metadataDetails.url}</p>
          </div>
          <div className="text-right text-xs text-slate-500">
            <div>{new Date(session.startedAt).toLocaleString()}</div>
            {session.endedAt && (
              <div>Ended {new Date(session.endedAt).toLocaleTimeString()}</div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
          <span className="rounded-full bg-slate-100 px-3 py-1 capitalize">{metadataDetails.device}</span>
          <span className="rounded-full bg-slate-100 px-3 py-1">{metadataDetails.browser}</span>
          <span className="rounded-full bg-slate-100 px-3 py-1">{metadataDetails.language}</span>
          <span className="rounded-full bg-slate-100 px-3 py-1">{metadataDetails.userId}</span>
        </div>
      </div>

      {/* Playback Window */}
      <div className="flex flex-col bg-slate-950">
        <div className="border-b border-slate-800 bg-slate-900 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-full bg-red-500" />
              <span className="h-3 w-3 rounded-full bg-yellow-400" />
              <span className="h-3 w-3 rounded-full bg-green-500" />
            </div>
            <div className="flex-1 truncate rounded-md bg-slate-800/70 px-4 py-1 text-xs text-slate-300">
              {metadataDetails.url}
            </div>
             <div className="hidden items-center gap-3 text-xs text-slate-400 sm:flex">
              <span className="capitalize">{metadataDetails.device}</span>
              <span>{metadataDetails.browser}</span>
            </div>
          </div>
        </div>
          
        <div ref={playbackContainerRef} className="px-6 py-6">
          <div className="relative mx-auto flex h-[460px] max-h-[460px] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-[0_40px_120px_-40px_rgba(15,23,42,0.8)]">
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
                        className="absolute h-1 w-1 rounded-full bg-blue-400/40"
                        style={{
                          left: `${((event.x ?? 0) / screenDimensions.width) * 100}%`,
                          top: `${((event.y ?? 0) / screenDimensions.height) * 100}%`,
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
                          left: `${((event.x ?? 0) / screenDimensions.width) * 100}%`,
                          top: `${((event.y ?? 0) / screenDimensions.height) * 100}%`,
                        }}
                      >
                        <div className="h-6 w-6 rounded-full border-2 border-blue-400/80" />
                      </div>
                    );
                  }
                })}

                {/* Pointer Indicator */}
                <div
                  className={`absolute h-4 w-4 rounded-full border-2 border-white/80 ${
                    isPlaying ? "bg-blue-500" : "bg-blue-500/70"
                  }`}
                  style={{
                    left: `${normalisedPointerPosition.x}%`,
                    top: `${normalisedPointerPosition.y}%`,
                  }}
                />

                {/* Click pulse animation */}
                {recentClick !== null && currentTime - recentClick < 400 && (
                  <div
                    className="pointer-events-none absolute h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-blue-500/70 animate-ping"
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

      {/* Controls */}
      <div className="space-y-5 border-t border-slate-800 bg-white px-6 py-6 text-slate-900">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:text-slate-700"
            >
              <RotateCcw className="h-4 w-4" />
            </button>

            <button
              onClick={handlePlayPause}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white"
            >
              {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSkip(-10000)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200"
            >
              <SkipBack className="h-4 w-4" />
            </button>
            <button
              onClick={() => handleSkip(10000)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200"
            >
              <SkipForward className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Timeline */}
        <div className="flex min-w-[200px] flex-1 items-center gap-3">
          <span className="text-sm font-medium text-slate-600">{formatTime(currentTime)}</span>

          <div className="relative flex-1">
            <div className="pointer-events-none absolute inset-0 flex items-center">
              <div className="h-1 w-full rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-blue-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {timelineMarkers.map((marker, index) => {
              const color =
                marker.type === "click"
                  ? "bg-blue-500"
                  : marker.type === "scroll"
                  ? "bg-yellow-400"
                  : "bg-pink-500";

              return (
                <div
                  key={`${marker.type}-${marker.timestamp}-${index}`}
                  className={`pointer-events-none absolute top-1/2 h-3 w-[2px] -translate-y-1/2 rounded-full ${color}`}
                  style={{ left: `${marker.position}%` }}
                />
              );
            })}

            <div
              className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-blue-600 shadow ring-2 ring-blue-500/40"
              style={{ left: `${progressPercent}%` }}
            />

            <input
              type="range"
              min={0}
              max={durationMs}
              step={100}
              value={Math.min(currentTime, durationMs)}
              onChange={handleSeek}
              className="relative z-10 h-8 w-full cursor-pointer appearance-none bg-transparent"
            />
          </div>

          <span className="text-sm font-medium text-slate-600">{formatTime(durationMs)}</span>
        </div>

        {/* Speed + fullscreen */}
        <div className="flex items-center gap-3">
          <select
            value={playbackSpeed}
            onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm"
          >
            <option value={0.5}>0.5x</option>
            <option value={1}>1x</option>
            <option value={1.5}>1.5x</option>
            <option value={2}>2x</option>
          </select>

          <button
            onClick={handleFullscreen}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            Click
          </span>
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-yellow-400" />
            Scroll
          </span>
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-pink-500" />
            Hover
          </span>
        </div>

        {/* Stats footer */}
        <div className="grid grid-cols-1 gap-4 border-t border-slate-200 pt-4 text-sm text-slate-700 md:grid-cols-3">
          <div className="flex items-center gap-2">
            <Timer className="h-4 w-4 text-slate-500" />
            <span>
              Duration
              <span className="ml-2 font-medium text-slate-900">{formatTime(durationMs)}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <MousePointerClick className="h-4 w-4 text-slate-500" />
            <span>
              Clicks
              <span className="ml-2 font-medium text-slate-900">{session.stats.clicks}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-slate-500" />
            <span>
              Total Events
              <span className="ml-2 font-medium text-slate-900">{session.stats.totalEvents}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
