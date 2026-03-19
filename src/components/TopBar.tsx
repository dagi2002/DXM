import React from 'react';
import { Bell, MoreHorizontal, ChevronDown } from 'lucide-react';

interface TopBarProps {
  currentView: string;
  user: { name: string; avatar?: string; role: string };
}

const viewLabels: Record<string, string> = {
  dashboard: 'Dashboard',
  sessions: 'Sessions',
  heatmaps: 'Heatmaps',
  userflows: 'User Flows',
  alerts: 'Alerts',
  insights: 'Insights',
  reports: 'Reports',
  settings: 'Settings',
};

export const TopBar: React.FC<TopBarProps> = ({ currentView, user }) => {
  const label = viewLabels[currentView] || 'Dashboard';

  return (
    <header className="bg-white border-b border-gray-200 shadow-sm h-14 flex items-center justify-between px-6 flex-shrink-0">
      {/* Left side */}
      <div className="flex items-center gap-4">
        <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
          <button className="px-3 py-1 text-sm font-medium text-gray-900 bg-white rounded-md shadow-sm">
            Dashboard
          </button>
          <button className="px-3 py-1 text-sm text-gray-500 rounded-md hover:text-gray-700">
            Preview
          </button>
        </div>
        <button className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900">
          <span>/{label}</span>
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        <button className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
          <Bell className="w-5 h-5" />
        </button>
        <button className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
          <MoreHorizontal className="w-5 h-5" />
        </button>
        <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden flex-shrink-0">
          {user.avatar ? (
            <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-sm font-medium text-gray-600">
              {user.name.charAt(0)}
            </div>
          )}
        </div>
        <button className="text-orange-500 border border-orange-200 rounded-lg px-3 py-1.5 text-sm hover:bg-orange-50 transition-colors">
          Upgrade
        </button>
        <button className="bg-indigo-600 text-white rounded-lg px-4 py-1.5 text-sm font-medium hover:bg-indigo-700 transition-colors">
          Publish
        </button>
      </div>
    </header>
  );
};
