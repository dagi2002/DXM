import React from 'react';
import { BarChart3, Play, Users, AlertTriangle, Settings, LogOut } from 'lucide-react';
import { User } from '../types';

interface NavigationProps {
  currentView: string;
  onViewChange: (view: string) => void;
  user: User;
}

interface NavigationChildItem {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
}

interface NavigationItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: NavigationChildItem[];
}

export const Navigation: React.FC<NavigationProps> = ({ currentView, onViewChange, user }) => {
  const navItems: NavigationItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
    { id: 'sessions', label: 'Session Replays', icon: Play },
    {
      id: 'analytics',
      label: 'Analytics',
      icon: BarChart3,
    },
    { id: 'users', label: 'Users', icon: Users },
    { id: 'alerts', label: 'Alerts', icon: AlertTriangle }
  ];

  return (
    <nav className="bg-white border-r border-gray-200 w-64 flex flex-col h-screen">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <BarChart3 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">DXM Pulse</h1>
            <p className="text-sm text-gray-500">Experience Analytics</p>
          </div>
        </div>
      </div>

      <div className="flex-1 py-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const hasChildren = Array.isArray(item.children) && item.children.length > 0;
          const isChildActive = hasChildren
            ? item.children?.some((child) => child.id === currentView)
            : false;
          const isActive = currentView === item.id || Boolean(isChildActive);

          return (
            <div key={item.id}>
              <button
                onClick={() => onViewChange(item.id)}
                className={`w-full flex items-center space-x-3 px-6 py-3 text-left transition-all duration-200 hover:bg-gray-50 ${
                  isActive
                    ? 'bg-blue-50 border-r-2 border-blue-600 text-blue-600'
                    : 'text-gray-700 hover:text-gray-900'
                }`}
              >
                <Icon className={`h-5 w-5 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
                <span className="font-medium">{item.label}</span>
              </button>

              {hasChildren && (
                <div className="mt-1 space-y-1">
                  {item.children?.map((child) => {
                    const ChildIcon = child.icon;
                    const childActive = currentView === child.id;

                    return (
                      <button
                        key={child.id}
                        onClick={() => onViewChange(child.id)}
                        className={`w-full flex items-center space-x-3 pl-14 pr-4 py-2 text-left text-sm transition-all duration-200 ${
                          childActive
                            ? 'text-blue-600 bg-blue-50 border-r-2 border-blue-600'
                            : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                        }`}
                      >
                        {ChildIcon ? (
                          <ChildIcon className={`h-4 w-4 ${childActive ? 'text-blue-600' : 'text-gray-400'}`} />
                        ) : (
                          <span className="h-2 w-2 rounded-full bg-gray-300" aria-hidden />
                        )}
                        <span className="font-medium">{child.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
          })}
      </div>

      <div className="border-t border-gray-200 p-4">
        <div className="flex items-center space-x-3 mb-3">
          <img
            src={user.avatar}
            alt={user.name}
            className="w-8 h-8 rounded-full object-cover"
          />
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900">{user.name}</p>
            <p className="text-xs text-gray-500 capitalize">{user.role}</p>
          </div>
        </div>
        
        <div className="flex space-x-2">
          <button className="flex-1 flex items-center justify-center space-x-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors">
            <Settings className="h-4 w-4" />
            <span>Settings</span>
          </button>
          <button className="flex items-center justify-center px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-lg transition-colors">
            <LogOut className="h-4 w-4" />
          </button>
         </div>
      </div>
    </nav>
  );
};