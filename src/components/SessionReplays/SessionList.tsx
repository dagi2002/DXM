import React, { useMemo, useState } from 'react';
import { Search, Monitor, Smartphone, Tablet, Timer, MousePointer, Activity, Play } from 'lucide-react';
import type { SessionRecording } from '../../types';

interface SessionListProps {
  sessions: SessionRecording[];
  selectedSession: SessionRecording | null;
  onSessionSelect: (session: SessionRecording) => void;
  isLoading: boolean;
  error?: string | null;
}

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const getDeviceIcon = (device?: string) => {
  switch (device) {
    case 'mobile':
      return <Smartphone className="h-4 w-4" />;
    case 'tablet':
      return <Tablet className="h-4 w-4" />;
    default:
      return <Monitor className="h-4 w-4" />;
  }
};


export const SessionList: React.FC<SessionListProps> = ({
  sessions,
  selectedSession,
  onSessionSelect,
  isLoading,
  error,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [deviceFilter, setDeviceFilter] = useState<'all' | 'desktop' | 'mobile' | 'tablet'>('all');

  const sortedSessions = useMemo(
    () => [...sessions].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()),
    [sessions]
  );

  const filteredSessions = useMemo(() => {
    return sortedSessions.filter(session => {
      const url = session.metadata.url ?? '';
      const searchText = `${url} ${session.metadata.userAgent ?? ''}`.toLowerCase();
      const matchesSearch = searchText.includes(searchTerm.toLowerCase());
      const device = (session.metadata.device ?? 'desktop') as 'desktop' | 'mobile' | 'tablet';
      const matchesDevice = deviceFilter === 'all' || device === deviceFilter;
      return matchesSearch && matchesDevice;
    });
  }, [sortedSessions, searchTerm, deviceFilter]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm h-full flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center space-x-4 mb-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by URL or user agent"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 placeholder:text-gray-400 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
            />
          </div>
          </div>

        <div className="flex space-x-2">
          {(['all', 'desktop', 'mobile', 'tablet'] as const).map(filter => (
            <button
              key={filter}
              onClick={() => setDeviceFilter(filter)}
              className={`px-3 py-1 text-sm rounded-full transition-colors capitalize ${
                deviceFilter === filter
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white border border-gray-300 text-gray-500 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-2 space-y-2">
          {isLoading && (
            <div className="px-3 py-4 text-sm text-gray-500">Loading sessions…</div>
          )}

          {!isLoading && error && (
            <div className="px-3 py-4 text-sm text-red-600">{error}</div>
          )}

          {!isLoading && !error && filteredSessions.length === 0 && (
            <div className="px-3 py-4 text-sm text-gray-500">No sessions found. Interact with the app to record a session.</div>
          )}

          {filteredSessions.map(session => {
            const extendedMetadata = session.metadata as SessionRecording['metadata'] & {
              userId?: string;
            };
            const displayUrl = extendedMetadata.url ?? 'Unknown URL';
            const displayUser = extendedMetadata.userId ?? 'Anonymous';
            const deviceIcon = getDeviceIcon(session.metadata.device);
            const isSelected = selectedSession?.id === session.id;
            const statusLabel = session.completed ? 'Completed' : 'Recording';
            const frustrationEvents = session.stats.clicks > 10 ? session.stats.clicks - 10 : 0;
            const progressPercent = session.duration > 0 ? Math.min((session.stats.totalEvents / Math.max(session.duration, 1)) * 100, 100) : 0;

            return (
              <div
                key={session.id}
                onClick={() => onSessionSelect(session)}
                className={`w-full text-left p-4 rounded-lg border transition-colors cursor-pointer ${
                  isSelected ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 bg-white hover:border-indigo-300'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2 text-sm font-medium text-gray-900">
                    <span className="text-gray-400">{deviceIcon}</span>
                    <span className="truncate max-w-[180px]">{displayUrl}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className={`text-xs rounded-full px-2 py-0.5 ${
                      session.completed ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                    }`}>{statusLabel}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); onSessionSelect(session); }}
                      className="bg-indigo-600 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-indigo-700 transition-colors"
                    >
                      <Play className="h-3.5 w-3.5 ml-0.5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                  <div className="flex items-center space-x-2">
                    <span className="truncate max-w-[120px] font-medium text-gray-900">{displayUser}</span>
                    <span className="bg-indigo-100 text-indigo-700 text-xs rounded-full px-2 py-0.5">Returning</span>
                    {frustrationEvents > 0 && (
                      <span className="bg-red-100 text-red-700 text-xs rounded-full px-2 py-0.5">Rage clicks</span>
                    )}
                  </div>
                  <span>{new Date(session.startedAt).toLocaleString()}</span>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-gray-100 rounded-full h-1 mb-2">
                  <div className="bg-indigo-500 h-1 rounded-full" style={{ width: `${progressPercent}%` }} />
                </div>

                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span className="flex items-center space-x-1">
                    <Timer className="h-3 w-3" />
                    <span>{formatDuration(session.duration)}</span>
                  </span>
                  <span className="flex items-center space-x-1">
                    <MousePointer className="h-3 w-3" />
                    <span>{session.stats.clicks} clicks</span>
                  </span>
                  <span className="flex items-center space-x-1">
                    <Activity className="h-3 w-3" />
                    <span>{session.stats.totalEvents} events</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
