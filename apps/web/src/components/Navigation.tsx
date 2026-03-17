import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BarChart3, Play, Users, AlertTriangle, Settings,
  LogOut, LayoutDashboard, Globe, Zap,
} from 'lucide-react';
import { useAuth, type WorkspaceUser } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';

interface NavigationProps {
  currentView: string;
  user: WorkspaceUser | null;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard',  label: 'nav.dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { id: 'sessions',   label: 'nav.sessions',  icon: Play,             path: '/sessions'  },
  { id: 'analytics',  label: 'nav.analytics', icon: BarChart3,        path: '/analytics' },
  { id: 'users',      label: 'nav.users',     icon: Users,            path: '/users'     },
  { id: 'alerts',     label: 'nav.alerts',    icon: AlertTriangle,    path: '/alerts'    },
];

export const Navigation: React.FC<NavigationProps> = ({ currentView, user }) => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await logout();
    navigate('/login');
  };

  const toggleLanguage = () => {
    i18n.changeLanguage(i18n.language === 'en' ? 'am' : 'en');
  };

  return (
    <>
      {/* ── Desktop sidebar ─────────────────────────────────────────────── */}
      <nav className="hidden md:flex flex-col w-64 h-screen bg-white border-r border-gray-100 shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-100">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-base font-bold text-gray-900 leading-none">DXM Pulse</p>
            <p className="text-xs text-gray-400 mt-0.5">Experience Analytics</p>
          </div>
        </div>

        {/* Nav links */}
        <div className="flex-1 py-3 space-y-0.5 px-3">
          {NAV_ITEMS.map(({ id, label, icon: Icon, path }) => {
            const active = currentView === id;
            return (
              <Link
                key={id}
                to={path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-blue-600' : 'text-gray-400'}`} />
                {t(label)}
              </Link>
            );
          })}
        </div>

        {/* Bottom section */}
        <div className="border-t border-gray-100 p-3 space-y-1">
          {/* Language toggle */}
          <button
            onClick={toggleLanguage}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-800 transition-colors"
          >
            <Globe className="h-4 w-4 text-gray-400" />
            {t('lang.toggle')}
          </button>

          {/* Settings */}
          <Link
            to="/settings"
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentView === 'settings'
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Settings className={`h-4 w-4 ${currentView === 'settings' ? 'text-blue-600' : 'text-gray-400'}`} />
            {t('nav.settings')}
          </Link>

          {/* User + logout */}
          {user && (
            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
              {user.avatar ? (
                <img src={user.avatar} alt={user.name}
                  className="h-7 w-7 rounded-full object-cover shrink-0" />
              ) : (
                <div className="h-7 w-7 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                  <span className="text-xs font-semibold text-blue-700">
                    {user.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-900 truncate">{user.name}</p>
                <p className="text-xs text-gray-400 capitalize">{user.role}</p>
              </div>
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                title="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* ── Mobile bottom tab bar ────────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-100 flex items-center justify-around px-2 py-1 safe-area-inset-bottom">
        {NAV_ITEMS.map(({ id, icon: Icon, path, label }) => {
          const active = currentView === id;
          return (
            <Link
              key={id}
              to={path}
              className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg min-w-[44px] min-h-[44px] justify-center transition-colors ${
                active ? 'text-blue-600' : 'text-gray-400'
              }`}
            >
              <Icon className="h-5 w-5" />
              {active && (
                <span className="text-[10px] font-medium leading-none">{t(label)}</span>
              )}
            </Link>
          );
        })}
        {/* Settings */}
        <Link
          to="/settings"
          className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg min-w-[44px] min-h-[44px] justify-center transition-colors ${
            currentView === 'settings' ? 'text-blue-600' : 'text-gray-400'
          }`}
        >
          <Settings className="h-5 w-5" />
          {currentView === 'settings' && (
            <span className="text-[10px] font-medium leading-none">{t('nav.settings')}</span>
          )}
        </Link>
      </nav>
    </>
  );
};
