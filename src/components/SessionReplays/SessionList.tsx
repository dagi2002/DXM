import React, { useState } from 'react';
import { Search, Filter, Monitor, Smartphone, Tablet, Clock, MousePointer, Eye } from 'lucide-react';
import { mockSessions } from '../../data/mockData';
import { Session } from '../../types';

interface SessionListProps {
  selectedSession: Session | null;
  onSessionSelect: (session: Session) => void;
}

export const SessionList: React.FC<SessionListProps> = ({ selectedSession, onSessionSelect }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [deviceFilter, setDeviceFilter] = useState('all');

  const filteredSessions = mockSessions.filter(session => {
    const matchesSearch = session.userId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         session.country.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDevice = deviceFilter === 'all' || session.device.toLowerCase() === deviceFilter;
    return matchesSearch && matchesDevice;
  });

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

  const getSessionStatus = (session: Session) => {
    if (!session.endTime) return { label: 'Live', color: 'bg-green-500' };
    if (session.bounced) return { label: 'Bounced', color: 'bg-red-500' };
    if (session.converted) return { label: 'Converted', color: 'bg-blue-500' };
    return { label: 'Completed', color: 'bg-gray-500' };
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 h-full flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center space-x-4 mb-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search sessions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
          <button className="flex items-center space-x-2 px-3 py-2 text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
            <Filter className="h-4 w-4" />
          </button>
        </div>

        <div className="flex space-x-2">
          {['all', 'desktop', 'mobile', 'tablet'].map((filter) => (
            <button
              key={filter}
              onClick={() => setDeviceFilter(filter)}
              className={`px-3 py-1 text-sm rounded-full transition-colors capitalize ${
                deviceFilter === filter
                  ? 'bg-blue-100 text-blue-800 border border-blue-200'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-2 space-y-1">
          {filteredSessions.map((session) => {
            const status = getSessionStatus(session);
            const isSelected = selectedSession?.id === session.id;

            return (
              <div
                key={session.id}
                onClick={() => onSessionSelect(session)}
                className={`p-3 rounded-lg cursor-pointer transition-colors group ${
                  isSelected 
                    ? 'bg-blue-50 border-l-2 border-blue-500' 
                    : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    {getDeviceIcon(session.device)}
                    <span className="text-sm font-medium text-gray-900">
                      {session.userId ? `User ${session.userId.slice(-6)}` : 'Anonymous'}
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div className={`w-2 h-2 rounded-full ${status.color}`}></div>
                    <span className="text-xs text-gray-500">{status.label}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                  <span>{session.country}</span>
                  <span>{new Date(session.startTime).toLocaleDateString()}</span>
                </div>

                <div className="flex items-center justify-between text-xs text-gray-600">
                  <div className="flex items-center space-x-3">
                    <span className="flex items-center space-x-1">
                      <Clock className="h-3 w-3" />
                      <span>{formatDuration(session.duration)}</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <Eye className="h-3 w-3" />
                      <span>{session.pageViews}</span>
                    </span>
                    <span className="flex items-center space-x-1">
                      <MousePointer className="h-3 w-3" />
                      <span>{session.clicks}</span>
                    </span>
                  </div>

                  {session.frustrationEvents > 0 && (
                    <span className="text-red-500 text-xs font-medium">
                      {session.frustrationEvents} frustration events
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};