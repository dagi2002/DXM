import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Navigation } from './Navigation';
import { useAuth } from '../context/useAuth';

// Each authenticated page loads as its own chunk so the initial bundle stays
// small; the shell (nav + auth) renders immediately while a page streams in.
const SessionReplaysView = lazy(() => import('./SessionReplays/SessionReplaysView').then(m => ({ default: m.SessionReplaysView })));
const AnalyticsView = lazy(() => import('./Analytics/AnalyticsView').then(m => ({ default: m.AnalyticsView })));
const AlertsView = lazy(() => import('./Alerts/AlertsView').then(m => ({ default: m.AlertsView })));
const SettingsPage = lazy(() => import('../pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const BillingPage = lazy(() => import('../pages/BillingPage').then(m => ({ default: m.BillingPage })));
const OverviewPage = lazy(() => import('../pages/OverviewPage').then(m => ({ default: m.OverviewPage })));
const ClientsPage = lazy(() => import('../pages/ClientsPage').then(m => ({ default: m.ClientsPage })));
const ClientDetailPage = lazy(() => import('../pages/ClientDetailPage').then(m => ({ default: m.ClientDetailPage })));
const ReportsPage = lazy(() => import('../pages/ReportsPage').then(m => ({ default: m.ReportsPage })));
const DashboardPage = lazy(() => import('../pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage').then(m => ({ default: m.NotFoundPage })));

// In-shell loader — keeps the sidebar mounted while a page chunk loads.
const PagePending: React.FC = () => (
  <div className="flex h-full min-h-[40vh] items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
  </div>
);

export const AppShell: React.FC = () => {
  const { user, workspace } = useAuth();
  const location = useLocation();

  // Derive active nav item from current route
  const activeView = location.pathname.startsWith('/dashboard')
    ? 'dashboard'
    : location.pathname.startsWith('/overview')
    ? 'overview'
    : location.pathname.startsWith('/clients')
    ? 'clients'
    : location.pathname.startsWith('/analytics') ? 'analytics'
    : location.pathname.startsWith('/sessions') ? 'sessions'
    : location.pathname.startsWith('/alerts') ? 'alerts'
    : location.pathname.startsWith('/reports') ? 'reports'
    : location.pathname.startsWith('/settings') ? 'settings'
    : 'overview';

  return (
    <div className="flex h-screen overflow-hidden bg-surface-50">
      {/* Sidebar Navigation */}
      <Navigation currentView={activeView} user={user} workspace={workspace} />

      {/* Main content */}
      <main className="flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top,_rgba(22,101,52,0.05),_transparent_42%),linear-gradient(to_bottom,_#f8faf8,_#f5f5f4)] pb-16 md:pb-0">
          <Suspense fallback={<PagePending />}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/overview" element={<OverviewPage />} />
            <Route path="/clients" element={<ClientsPage />} />
            <Route path="/clients/:id" element={<ClientDetailPage />} />
            <Route path="/sessions/*" element={<SessionReplaysView />} />
            <Route path="/analytics/*" element={<AnalyticsView />} />
            <Route path="/users" element={<Navigate to="/settings" replace />} />
            <Route path="/alerts" element={<AlertsView />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/settings/billing" element={<BillingPage />} />
            <Route path="/billing" element={<BillingPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
          </Suspense>
        </div>
      </main>
    </div>
  );
};
