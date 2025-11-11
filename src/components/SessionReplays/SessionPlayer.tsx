import React, { useEffect, useMemo, useState } from 'react';
import { Play, Pause, RotateCcw, Activity, MousePointerClick, Timer } from 'lucide-react';
import type { SessionRecording, SessionRecordingEvent } from '../../types';

interface SessionPlayerProps {
  session: SessionRecording;
}

const formatTime = (milliseconds: number) => {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const getTimelineDuration = (events: SessionRecordingEvent[], fallbackSeconds: number) => {
  if (!events.length) {
    return fallbackSeconds * 1000;
  }

  const lastEvent = events[events.length - 1];
  const inferredDuration = lastEvent.timestamp;
  return Math.max(inferredDuration, fallbackSeconds * 1000);
};

export const SessionPlayer: React.FC<SessionPlayerProps> = ({ session }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  
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
    if (!isPlaying) {
      return;
    }

    let animationFrame: number;
    let start: number | null = null;

    const step = (timestamp: number) => {
      if (start === null) {
        start = timestamp;
      }
      const elapsed = (timestamp - start) * playbackSpeed;
      setCurrentTime(prev => {
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
    const metadataSize = session.metadata.screen ?? { width: 1, height: 1 };
    const { width, height } = metadataSize;
    if (!width || !height) {
      return { x: 50, y: 50 };
    }

    const relevantEvent = [...session.events]
      .reverse()
      .find(event => event.timestamp <= currentTime && (event.type === 'mousemove' || event.type === 'click'));

    if (!relevantEvent) {
      return { x: 50, y: 50 };
    }

    const x = relevantEvent.x ?? width / 2;
    const y = relevantEvent.y ?? height / 2;

    return {
      x: (x / width) * 100,
      y: (y / height) * 100,
    };
  }, [session.events, session.metadata.screen, currentTime]);

  const recentClick = useMemo(() => {
    const clickEvent = [...session.events]
      .reverse()
      .find(event => event.type === 'click' && event.timestamp <= currentTime);
    if (!clickEvent) {
      return null;
    }
    return clickEvent.timestamp;
  }, [session.events, currentTime]);

  const handleSeek = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = Number(event.target.value);
    setCurrentTime(newValue);
  };

  const handleReset = () => {
    setCurrentTime(0);
    setIsPlaying(false);
  };

  const handlePlayPause = () => {
    if (currentTime >= durationMs) {
      setCurrentTime(0);
    }
    setIsPlaying(previous => !previous);
  };

  const displayedEvents = useMemo(() => {
    return session.events.filter(event => event.timestamp <= currentTime);
  }, [session.events, currentTime]);

  return (
    <div className="bg-white rounded-lg border border-gray-200 h-full flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-2">
           <div>
            <h3 className="text-lg font-semibold text-gray-900">Session Replay</h3>
            <p className="text-sm text-gray-500">
              {session.metadata.url ?? 'Unknown URL'}
            </p>
          </div>
          <div className="text-xs text-gray-500 text-right">
            <div>{new Date(session.startedAt).toLocaleString()}</div>
            {session.endedAt && <div>Ended {new Date(session.endedAt).toLocaleTimeString()}</div>}
          </div>
        </div>
        <div className="flex items-center space-x-4 text-sm text-gray-600">
          <span className="capitalize">{session.metadata.device ?? 'desktop'}</span>
          <span>{session.metadata.browser ?? 'Unknown browser'}</span>
          <span>{session.metadata.language ?? 'Unknown locale'}</span>
        </div>
      </div>

      {/* Video Player Area */}
      <div className="flex-1 bg-gray-900 relative flex items-center justify-center">
        <div className="w-full max-w-4xl aspect-video bg-gray-800 rounded-lg relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 opacity-80"></div>
          <div className="absolute inset-0 p-6 flex flex-col justify-between">
            <div className="text-white/70 text-sm">
              <div className="font-semibold text-white mb-1">Captured Interactions</div>
              <div>{session.stats.totalEvents} events • {session.stats.clicks} clicks • Scroll depth {session.stats.scrollDepth}px</div>
            </div>
             <div className="relative flex-1 mt-6 border border-white/10 rounded-lg bg-black/30 overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.15),_transparent_55%)]"></div>
              <div className="absolute left-0 top-0 w-full h-full">
                {displayedEvents.map((event, index) => {
                  if (event.type === 'scroll') {
                    return null;
                  }
                  if (event.type === 'mousemove') {
                    return (
                      <div
                        key={`move-${index}`}
                        className="absolute w-1 h-1 bg-blue-400/30 rounded-full"
                        style={{
                          left: `${((event.x ?? 0) / (session.metadata.screen?.width ?? 1)) * 100}%`,
                          top: `${((event.y ?? 0) / (session.metadata.screen?.height ?? 1)) * 100}%`,
                        }}
                      />
                    );
                  }
                  if (event.type === 'click') {
                    return (
                      <div
                        key={`click-${index}`}
                        className="absolute -translate-x-1/2 -translate-y-1/2"
                        style={{
                          left: `${((event.x ?? 0) / (session.metadata.screen?.width ?? 1)) * 100}%`,
                          top: `${((event.y ?? 0) / (session.metadata.screen?.height ?? 1)) * 100}%`,
                        }}
                      >
                        <div className="w-6 h-6 border-2 border-blue-400/70 rounded-full animate-ping"></div>
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
              <div
                className={`absolute w-4 h-4 rounded-full border-2 border-white/80 shadow-lg transition-all duration-100 ${
                  isPlaying ? 'bg-blue-500' : 'bg-blue-500/70'
                }`}
                style={{
                 left: `${normalisedPointerPosition.x}%`,
                  top: `${normalisedPointerPosition.y}%`,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <div className="absolute inset-0 rounded-full border border-white/40"></div>
              </div>
 {recentClick !== null && currentTime - recentClick < 400 && (
                <div
                  className="absolute w-16 h-16 rounded-full border-2 border-blue-500/60 animate-ping"
                  style={{
                    left: `${normalisedPointerPosition.x}%`,
                    top: `${normalisedPointerPosition.y}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                />
                              )}
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <div className="flex items-center space-x-4 mb-4">
          <button
            onClick={handleReset}
            className="p-2 text-gray-600 hover:text-gray-900 transition-colors"
                        aria-label="Restart session"

          >
            <RotateCcw className="h-5 w-5" />
          </button>

          <button
            onClick={handlePlayPause}
            className="p-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors"
            aria-label={isPlaying ? 'Pause playback' : 'Play session'}

          >
            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </button>

          <div className="flex-1 flex items-center space-x-4">
            <span className="text-sm text-gray-600">{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={durationMs}
              step={100}
              value={Math.min(currentTime, durationMs)}
              onChange={handleSeek}
              className="flex-1 accent-blue-600"
            />
            <span className="text-sm text-gray-600">{formatTime(durationMs)}</span>
          </div>

          <select
            value={playbackSpeed}
            onChange={(event) => setPlaybackSpeed(Number(event.target.value))}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1 focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value={0.5}>0.5x</option>
            <option value={1}>1x</option>
            <option value={1.5}>1.5x</option>
            <option value={2}>2x</option>
          </select>
        </div>

       <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="flex items-center space-x-2 text-gray-700">
            <Timer className="h-4 w-4 text-gray-500" />
            <span>
              Duration
              <span className="ml-2 font-medium">{formatTime(durationMs)}</span>
            </span>
          </div>
           <div className="flex items-center space-x-2 text-gray-700">
            <MousePointerClick className="h-4 w-4 text-gray-500" />
            <span>
              Clicks
              <span className="ml-2 font-medium">{session.stats.clicks}</span>
            </span>
          </div>
          <div className="flex items-center space-x-2 text-gray-700">
            <Activity className="h-4 w-4 text-gray-500" />
            <span>
              Total Events
              <span className="ml-2 font-medium">{session.stats.totalEvents}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
