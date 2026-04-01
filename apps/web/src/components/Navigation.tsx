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
  Sparkles,
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
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'overview',  label: 'Overview',  icon: Globe,           path: '/overview'  },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
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
      <nav className="hidden h-screen w-64 shrink-0 border-r border-surface-200 bg-white md:flex md:flex-col">
        {/* Logo */}
        <div className="border-b border-surface-100 px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary-600 to-primary-800 shadow-md shadow-primary-900/20">
              <Zap className="h-4.5 w-4.5 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <p className="text-[15px] font-bold text-surface-900 leading-none">DXM Pulse</p>
              <p className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-surface-400">Agency Suite</p>
            </div>
          </div>

          {/* Workspace card */}
          <div className="mt-4 rounded-xl border border-surface-100 bg-surface-50 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-surface-700 truncate">
                {workspace?.name || 'Agency workspace'}
              </p>
              <Link
                to="/settings/billing"
                className="shrink-0 rounded-full bg-primary-100 px-2 py-0.5 text-[10px] font-semibold text-primary-700 hover:bg-primary-200 transition"
              >
                {getPlanLabel(workspace?.plan || 'free')}
              </Link>
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <p className="text-[11px] text-surface-500">Portfolio monitoring active</p>
            </div>
          </div>
        </div>

        {/* Nav links */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {NAV_ITEMS.map(({ id, label, icon: Icon, path, badge }) => {
            const active = currentView === id;
            return (
              <Link
                key={id}
                to={path}
                className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                  active
                    ? 'bg-primary-600 text-white shadow-sm shadow-primary-900/10'
                    : 'text-surface-600 hover:bg-surface-100 hover:text-surface-900'
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 transition-colors ${active ? 'text-white' : 'text-surface-400 group-hover:text-surface-600'}`} />
                <span className="flex-1">{label}</span>
                {badge && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${active ? 'bg-white/20 text-white' : 'bg-primary-100 text-primary-700'}`}>
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}

          {/* AI Insights separator + button */}
          <div className="pt-3 pb-1">
            <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-surface-400">AI Features</p>
          </div>
          <Link
            to="/overview"
            className={`group flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all ${
              false
                ? 'border-primary-300 bg-primary-50 text-primary-700'
                : 'border-transparent text-surface-600 hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700'
            }`}
          >
            <div className="flex h-4 w-4 shrink-0 items-center justify-center">
              <Sparkles className="h-4 w-4 text-primary-500" />
            </div>
            <span>AI Portfolio Brief</span>
            <span className="ml-auto rounded-full bg-primary-100 px-1.5 py-0.5 text-[10px] font-bold text-primary-700">
              NEW
            </span>
          </Link>
        </div>

        {/* Bottom section */}
        <div className="border-t border-surface-100 p-3 space-y-1">
          <button
            onClick={toggleLanguage}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-surface-500 transition-colors hover:bg-surface-100 hover:text-surface-800"
          >
            <Globe className="h-4 w-4 text-surface-400" />
            {i18n.language === 'en' ? 'Switch to Amharic' : 'Switch to English'}
          </button>

          <Link
            to="/settings"
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
              currentView === 'settings'
                ? 'bg-surface-900 text-white'
                : 'text-surface-600 hover:bg-surface-100 hover:text-surface-900'
            }`}
          >
            <Settings className={`h-4 w-4 ${currentView === 'settings' ? 'text-white' : 'text-surface-400'}`} />
            Settings
          </Link>

          {user && (
            <div className="mt-1 flex items-center gap-2.5 rounded-xl border border-surface-100 bg-surface-50 px-3 py-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100">
                <span className="text-xs font-bold text-primary-700">
                  {user.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="truncate text-sm font-semibold text-surface-900">{user.name}</p>
                <p className="text-[11px] capitalize text-surface-400">{user.role}</p>
              </div>
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="rounded-lg p-1.5 text-surface-400 transition-colors hover:bg-white hover:text-surface-700"
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* ── Mobile bottom tab bar ────────────────────────────────────────── */}
      <nav className="safe-area-inset-bottom fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-surface-200 bg-white/95 px-2 py-1 backdrop-blur md:hidden">
        {NAV_ITEMS.slice(0, 5).map(({ id, icon: Icon, path, label }) => {
          const active = currentView === id;
          return (
            <Link
              key={id}
              to={path}
              className={`flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-2 transition-colors ${
                active ? 'text-primary-600' : 'text-surface-400'
              }`}
            >
              <Icon className="h-5 w-5" />
              {active && <span className="text-[10px] font-medium leading-none">{label}</span>}
            </Link>
          );
        })}
        <Link
          to="/settings"
          className={`flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-2 transition-colors ${
            currentView === 'settings' ? 'text-primary-600' : 'text-surface-400'
          }`}
        >
          <Settings className="h-5 w-5" />
          {currentView === 'settings' && <span className="text-[10px] font-medium leading-none">Settings</span>}
        </Link>
      </nav>
    </>
  );
};
