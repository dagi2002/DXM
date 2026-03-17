import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Navigation } from './Navigation';
import { DashboardView } from './Dashboard/DashboardView';
import { SessionReplaysView } from './SessionReplays/SessionReplaysView';
import { AnalyticsView } from './Analytics/AnalyticsView';
import { UsersView } from './Users/UsersView';
import { AlertsView } from './Alerts/AlertsView';
import { SettingsPage } from '../pages/SettingsPage';
import { BillingPage } from '../pages/BillingPage';
import { useRealTimeData } from '../hooks/useRealTimeData';
import { useAuth } from '../context/AuthContext';
import type { Alert } from '../types';
import { fetchJson } from '../lib/api';

export const AppShell: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const { sessions, metrics, lastUpdate, error, isLoading } = useRealTimeData();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertsError, setAlertsError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      try {
        const data = await fetchJson<Alert[]>('/alerts');
        if (isMounted) { setAlerts(Array.isArray(data) ? data : []); setAlertsError(null); }
      } catch (e) {
        if (isMounted) setAlertsError(e instanceof Error ? e.message : 'Failed to load alerts');
      }
    };
    void load();
    const id = setInterval(load, 5000);
    return () => { isMounted = false; clearInterval(id); };
  }, []);

  // Derive active nav item from current route
  const activeView = location.pathname.startsWith('/analytics') ? 'analytics'
    : location.pathname.startsWith('/sessions') ? 'sessions'
    : location.pathname.startsWith('/users') ? 'users'
    : location.pathname.startsWith('/alerts') ? 'alerts'
    : location.pathname.startsWith('/settings') ? 'settings'
    : 'dashboard';

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Sidebar Navigation */}
      <Navigation currentView={activeView} user={user} />

      {/* Main content */}
      <main className="flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto pb-16 md:pb-0">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={
              <DashboardView
                sessions={sessions}
                metrics={metrics}
                alerts={alerts}
                isLoading={isLoading}
                error={error ?? alertsError}
              />
            } />
            <Route path="/sessions/*" element={<SessionReplaysView />} />
            <Route path="/analytics/*" element={<AnalyticsView />} />
            <Route path="/users" element={<UsersView />} />
            <Route path="/alerts" element={<AlertsView />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/settings/billing" element={<BillingPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </div>

        {/* Status bar */}
        <div className="hidden md:flex fixed bottom-4 right-4 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-500 shadow-sm">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
          Updated {lastUpdate.toLocaleTimeString()}
        </div>
      </main>
    </div>
  );
};
