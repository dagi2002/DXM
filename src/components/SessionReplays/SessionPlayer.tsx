import React, { useState, useEffect } from 'react';
import { Play, Pause, SkipForward, SkipBack, Settings, Maximize } from 'lucide-react';
import { Session } from '../../types';

interface SessionPlayerProps {
  session: Session;
}

export const SessionPlayer: React.FC<SessionPlayerProps> = ({ session }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentTime(prev => {
          if (prev >= session.duration) {
            setIsPlaying(false);
            return session.duration;
          }
          return prev + playbackSpeed;
        });
      }, 1000);
    }

    return () => clearInterval(interval);
  }, [isPlaying, playbackSpeed, session.duration]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentTime(Number(e.target.value));
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 h-full flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold text-gray-900">Session Replay</h3>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">
              {session.userId ? `User ${session.userId.slice(-6)}` : 'Anonymous Session'}
            </span>
            <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
              <Maximize className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center space-x-4 text-sm text-gray-600">
          <span>{session.device} • {session.browser}</span>
          <span>{session.country}</span>
          <span>{new Date(session.startTime).toLocaleString()}</span>
        </div>
      </div>

      {/* Video Player Area */}
      <div className="flex-1 bg-gray-900 relative flex items-center justify-center">
        <div className="w-full max-w-4xl aspect-video bg-gray-800 rounded-lg flex items-center justify-center relative overflow-hidden">
          {/* Simulated Browser Window */}
          <div className="w-full h-full bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="bg-gray-100 h-8 flex items-center px-3 space-x-2">
              <div className="flex space-x-1">
                <div className="w-3 h-3 bg-red-400 rounded-full"></div>
                <div className="w-3 h-3 bg-yellow-400 rounded-full"></div>
                <div className="w-3 h-3 bg-green-400 rounded-full"></div>
              </div>
              <div className="flex-1 bg-white rounded-sm h-5 px-2 flex items-center text-xs text-gray-600">
                https://example.com/homepage
              </div>
            </div>
            
            <div className="p-8 h-full bg-gradient-to-br from-blue-50 to-white relative">
              <h1 className="text-2xl font-bold text-gray-900 mb-4">Welcome to Our Platform</h1>
              <p className="text-gray-600 mb-6">Experience the future of digital engagement.</p>
              
              {/* Simulated cursor */}
              <div 
                className={`absolute w-4 h-4 bg-blue-500 rounded-full transition-all duration-1000 ${isPlaying ? 'opacity-100' : 'opacity-30'}`}
                style={{
                  left: `${20 + (currentTime / session.duration) * 60}%`,
                  top: `${30 + Math.sin(currentTime / 10) * 20}%`,
                  transform: 'translate(-50%, -50%)'
                }}
              >
                <div className="absolute inset-0 bg-blue-400 rounded-full animate-ping opacity-75"></div>
              </div>

              {/* Simulated clicks */}
              {isPlaying && currentTime % 5 < 1 && (
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                  <div className="w-8 h-8 border-2 border-blue-500 rounded-full animate-ping"></div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <div className="flex items-center space-x-4 mb-4">
          <button
            onClick={() => setCurrentTime(Math.max(0, currentTime - 10))}
            className="p-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <SkipBack className="h-5 w-5" />
          </button>

          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="p-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors"
          >
            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </button>

          <button
            onClick={() => setCurrentTime(Math.min(session.duration, currentTime + 10))}
            className="p-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            <SkipForward className="h-5 w-5" />
          </button>

          <div className="flex-1 flex items-center space-x-4">
            <span className="text-sm text-gray-600">{formatTime(currentTime)}</span>
            <input
              type="range"
              min="0"
              max={session.duration}
              value={currentTime}
              onChange={handleSeek}
              className="flex-1 accent-blue-600"
            />
            <span className="text-sm text-gray-600">{formatTime(session.duration)}</span>
          </div>

          <select
            value={playbackSpeed}
            onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1 focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value={0.5}>0.5x</option>
            <option value={1}>1x</option>
            <option value={1.5}>1.5x</option>
            <option value={2}>2x</option>
          </select>

          <button className="p-2 text-gray-600 hover:text-gray-900 transition-colors">
            <Settings className="h-5 w-5" />
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div className="flex items-center space-x-2">
            <span className="text-gray-500">Duration:</span>
            <span className="font-medium">{formatTime(session.duration)}</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-gray-500">Page Views:</span>
            <span className="font-medium">{session.pageViews}</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-gray-500">Clicks:</span>
            <span className="font-medium">{session.clicks}</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-gray-500">Scroll Depth:</span>
            <span className="font-medium">{session.scrollDepth}%</span>
          </div>
        </div>
      </div>
    </div>
  );
};