import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Play,
  AlertTriangle,
  Settings,
  LogOut,
  LayoutDashboard,
  Globe,
  Zap,
  Building2,
  FileText,
} from 'lucide-react';
import { useAuth, type WorkspaceUser, type Workspace } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';
import { getPlanLabel } from '../lib/billing';

interface NavigationProps {
  currentView: string;
  user: WorkspaceUser | null;
  workspace: Workspace | null;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'overview',  label: 'Overview',  icon: LayoutDashboard, path: '/overview'  },
  { id: 'clients',   label: 'Clients',   icon: Building2,       path: '/clients'   },
  { id: 'sessions',  label: 'Sessions',  icon: Play,            path: '/sessions'  },
  { id: 'analytics', label: 'Analytics', icon: BarChart3,       path: '/analytics' },
  { id: 'alerts',    label: 'Alerts',    icon: AlertTriangle,   path: '/alerts'    },
  { id: 'reports',   label: 'Reports',   icon: FileText,        path: '/reports'   },
];

export const Navigation: React.FC<NavigationProps> = ({ currentView, user, workspace }) => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { i18n } = useTranslation();
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
      <nav className="hidden h-screen w-72 shrink-0 border-r border-surface-200 bg-white/90 backdrop-blur md:flex md:flex-col">
        {/* Logo */}
        <div className="border-b border-surface-200 px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-600 to-primary-800 shadow-lg">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-base font-bold text-surface-900 leading-none">DXM Pulse</p>
              <p className="mt-1 text-xs uppercase tracking-[0.18em] text-surface-500">
                Agency Suite
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-primary-200 bg-gradient-to-br from-primary-50 to-accent-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-700">
              Active Workspace
            </p>
            <p className="mt-2 text-sm font-semibold text-surface-900">
              {workspace?.name || 'Agency workspace'}
            </p>
            <p className="mt-1 text-sm text-surface-600">
              Monitor client websites, catch issues first, and show the value of your work.
            </p>
            <Link
              to="/settings/billing"
              className="mt-3 inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold text-primary-700 shadow-sm transition hover:bg-primary-50"
            >
              {getPlanLabel(workspace?.plan || 'free')} plan
            </Link>
          </div>
        </div>

        {/* Nav links */}
        <div className="flex-1 space-y-1 px-4 py-5">
          {NAV_ITEMS.map(({ id, label, icon: Icon, path }) => {
            const active = currentView === id;
            return (
              <Link
                key={id}
                to={path}
                className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-primary-600 text-white shadow-lg shadow-primary-900/10'
                    : 'text-surface-600 hover:bg-surface-100 hover:text-surface-900'
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-white' : 'text-surface-400'}`} />
                {label}
              </Link>
            );
          })}
        </div>

        {/* Bottom section */}
        <div className="space-y-2 border-t border-surface-200 p-4">
          {/* Language toggle */}
          <button
            onClick={toggleLanguage}
            className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm text-surface-500 transition-colors hover:bg-surface-100 hover:text-surface-800"
          >
            <Globe className="h-4 w-4 text-surface-400" />
            {i18n.language === 'en' ? 'Switch to Amharic' : 'Switch to English'}
          </button>

          {/* Settings */}
          <Link
            to="/settings"
            className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-colors ${
              currentView === 'settings'
                ? 'bg-surface-900 text-white'
                : 'text-surface-600 hover:bg-surface-100 hover:text-surface-900'
            }`}
          >
            <Settings className={`h-4 w-4 ${currentView === 'settings' ? 'text-white' : 'text-surface-400'}`} />
            Settings
          </Link>

          {/* User + logout */}
          {user && (
            <div className="mt-2 flex items-center gap-3 rounded-2xl border border-surface-200 bg-surface-50 px-3 py-3">
              {user.avatar ? (
                <img src={user.avatar} alt={user.name}
                  className="h-7 w-7 rounded-full object-cover shrink-0" />
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100">
                  <span className="text-xs font-semibold text-primary-700">
                    {user.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-medium text-surface-900">{user.name}</p>
                <p className="text-xs capitalize text-surface-500">{user.role}</p>
              </div>
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="rounded-xl p-2 text-surface-400 transition-colors hover:bg-white hover:text-surface-700"
                title="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* ── Mobile bottom tab bar ────────────────────────────────────────── */}
      <nav className="safe-area-inset-bottom fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-surface-200 bg-white/95 px-2 py-1 backdrop-blur md:hidden">
        {NAV_ITEMS.map(({ id, icon: Icon, path, label }) => {
          const active = currentView === id;
          return (
            <Link
              key={id}
              to={path}
              className={`flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 rounded-lg px-3 py-2 transition-colors ${
                active ? 'text-primary-600' : 'text-surface-400'
              }`}
            >
              <Icon className="h-5 w-5" />
              {active && (
                <span className="text-[10px] font-medium leading-none">{label}</span>
              )}
            </Link>
          );
        })}
        {/* Settings */}
        <Link
          to="/settings"
          className={`flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 rounded-lg px-3 py-2 transition-colors ${
            currentView === 'settings' ? 'text-primary-600' : 'text-surface-400'
          }`}
        >
          <Settings className="h-5 w-5" />
          {currentView === 'settings' && (
            <span className="text-[10px] font-medium leading-none">Settings</span>
          )}
        </Link>
      </nav>
    </>
  );
};
