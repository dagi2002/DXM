import React from 'react';
import { Eye, MapPin, Smartphone, Monitor, Tablet } from 'lucide-react';
import { mockSessions } from '../../data/mockData';

export const LiveSessions: React.FC = () => {
  const activeSessions = mockSessions.filter(session => !session.endTime).slice(0, 8);

  const getDeviceIcon = (device: string) => {
    switch (device.toLowerCase()) {
      case 'mobile':
        return <Smartphone className="h-4 w-4" />;
      case 'tablet':
        return <Tablet className="h-4 w-4" />;
      default:
        return <Monitor className="h-4 w-4" />;
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Live Sessions</h3>
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-sm text-gray-600">{activeSessions.length} active</span>
        </div>
      </div>

      <div className="space-y-3 max-h-64 overflow-y-auto">
        {activeSessions.map((session) => (
          <div
            key={session.id}
            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer group"
          >
            <div className="flex items-center space-x-3">
              <div className="text-gray-600">{getDeviceIcon(session.device)}</div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium text-gray-900">
                    {session.userId ? `User ${session.userId.slice(-3)}` : 'Anonymous'}
                  </span>
                  <span className="text-xs text-gray-500 flex items-center space-x-1">
                    <MapPin className="h-3 w-3" />
                    <span>{session.country}</span>
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  {session.pageViews} pages • {formatDuration(session.duration)}
                </p>
              </div>
            </div>
            
            <button className="opacity-0 group-hover:opacity-100 flex items-center space-x-1 text-blue-600 hover:text-blue-800 transition-all">
              <Eye className="h-4 w-4" />
              <span className="text-sm">Watch</span>
            </button>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-100">
        <button className="text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors">
          View all sessions →
        </button>
      </div>
    </div>
  );
};