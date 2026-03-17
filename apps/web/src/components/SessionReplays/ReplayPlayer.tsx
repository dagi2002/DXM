/**
 * ReplayPlayer — rrweb-based DOM session replay component.
 * Fetches serialized rrweb events from GET /sessions/:id/replay
 * and plays them back in a sandboxed iframe using rrweb's Replayer.
 *
 * Falls back gracefully if replay data isn't available (shows event
 * timeline view from SessionPlayer instead).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, SkipBack, SkipForward, Maximize2, Loader2, AlertCircle } from 'lucide-react';
import { fetchJson } from '../../lib/api';

interface ReplayEvent {
  type: number;
  data: unknown;
  timestamp: number;
}

interface ReplayData {
  sessionId: string;
  events: ReplayEvent[];
  duration: number;
  startedAt: string;
}

interface ReplayPlayerProps {
  sessionId: string;
  sessionMeta: {
    url: string;
    device: string;
    browser: string;
    startedAt: string;
  };
}

const formatTime = (ms: number): string => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const ReplayPlayer: React.FC<ReplayPlayerProps> = ({ sessionId, sessionMeta }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const replayerRef = useRef<any>(null);

  const [replayData, setReplayData] = useState<ReplayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  // Fetch replay events from API
  useEffect(() => {
    setLoading(true);
    setError(null);
    setIsPlaying(false);
    setCurrentTime(0);
    replayerRef.current = null;

    fetchJson<ReplayData>(`/sessions/${sessionId}/replay`, { credentials: 'include' })
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

    // Dynamically import rrweb to avoid blocking the initial bundle
    import('rrweb').then(({ Replayer }) => {
      // Destroy any existing replayer
      replayerRef.current?.destroy?.();

      // Clear container
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }

      const replayer = new Replayer(replayData.events as any[], {
        root: containerRef.current!,
        // Speed up by skipping idle periods
        skipInactive: true,
        // Don't auto play — user controls
        speed: playbackSpeed,
        // Style the replayer container
        UNSAFE_replayCanvas: false,
      });

      replayerRef.current = replayer;

      // Listen for timer events to update current time
      replayer.on('event-cast', (_event: any) => {
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

  const handleFullscreen = () => {
    const el = containerRef.current?.parentElement;
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
    <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="border-b border-slate-200 px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Session Replay</h3>
            <p className="text-sm text-slate-500 truncate max-w-xs">{sessionMeta.url}</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap justify-end">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 capitalize">{sessionMeta.device}</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1">{sessionMeta.browser}</span>
            <span className="rounded-full bg-green-100 text-green-700 px-2.5 py-1">rrweb</span>
          </div>
        </div>
      </div>

      {/* Browser chrome */}
      <div className="bg-slate-900 border-b border-slate-700 px-4 py-2.5">
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

      {/* rrweb mount point */}
      <div className="bg-slate-950 overflow-hidden" style={{ minHeight: '400px' }}>
        <div
          ref={containerRef}
          className="w-full h-full"
          style={{ minHeight: '400px' }}
        />
      </div>

      {/* Controls */}
      <div className="border-t border-slate-200 bg-white px-6 py-5 space-y-4">
        {/* Playback buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-800 transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => handleSkip(-10000)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-800 transition-colors"
          >
            <SkipBack className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={handlePlayPause}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-600 text-white hover:bg-primary-700 transition-colors"
          >
            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </button>
          <button
            onClick={() => handleSkip(10000)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-800 transition-colors"
          >
            <SkipForward className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Timeline */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-slate-500 tabular-nums w-10">
            {formatTime(currentTime)}
          </span>
          <div className="relative flex-1">
            <div className="pointer-events-none absolute inset-0 flex items-center">
              <div className="h-1.5 w-full rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-primary-500 transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
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

        {/* Speed + fullscreen */}
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
          <button
            onClick={handleFullscreen}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:text-slate-800 transition-colors"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          <span className="text-xs text-slate-400 ml-auto">
            {replayData?.events.length.toLocaleString() ?? 0} events recorded
          </span>
        </div>
      </div>
    </div>
  );
};
