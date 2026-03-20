import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Navigation } from './Navigation';
import { SessionReplaysView } from './SessionReplays/SessionReplaysView';
import { AnalyticsView } from './Analytics/AnalyticsView';
import { AlertsView } from './Alerts/AlertsView';
import { SettingsPage } from '../pages/SettingsPage';
import { BillingPage } from '../pages/BillingPage';
import { OverviewPage } from '../pages/OverviewPage';
import { ClientsPage } from '../pages/ClientsPage';
import { ClientDetailPage } from '../pages/ClientDetailPage';
import { ReportsPage } from '../pages/ReportsPage';
import { useAuth } from '../context/AuthContext';

export const AppShell: React.FC = () => {
  const { user, workspace } = useAuth();
  const location = useLocation();

  // Derive active nav item from current route
  const activeView = location.pathname.startsWith('/overview') || location.pathname.startsWith('/dashboard')
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
          <Routes>
            <Route path="/" element={<Navigate to="/overview" replace />} />
            <Route path="/dashboard" element={<Navigate to="/overview" replace />} />
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
            <Route path="*" element={<Navigate to="/overview" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
};
