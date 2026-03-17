import React, { useEffect, useState } from 'react';
import { Navigation } from './components/Navigation';
import { DashboardView } from './components/Dashboard/DashboardView';
import { SessionReplaysView } from './components/SessionReplays/SessionReplaysView';
import { AnalyticsView } from './components/Analytics/AnalyticsView';
import { HeatmapView } from './components/Analytics/HeatmapPage/HeatmapView';
import { UsersView } from './components/Users/UsersView';
import { AlertsView } from './components/Alerts/AlertsView';
import { mockUser } from './data/mockData';
import { useRealTimeData } from './hooks/useRealTimeData';
import { useSessionRecorder } from './hooks/useSessionRecorder';
import type { Alert } from './types';
import { fetchJson } from './lib/api';

function App() {
  const [currentView, setCurrentView] = useState('dashboard');
  const { sessions, metrics, lastUpdate, error, isLoading } = useRealTimeData();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  useSessionRecorder();

  useEffect(() => {
    let isMounted = true;

    const loadAlerts = async () => {
      try {
        const data = await fetchJson<Alert[]>('/alerts');
        if (!isMounted) {
          return;
        }

        setAlerts(Array.isArray(data) ? data : []);
        setAlertsError(null);
      } catch (loadError) {
        if (!isMounted) {
          return;
        }

        setAlertsError(loadError instanceof Error ? loadError.message : 'Failed to load alerts');
      }
    };

    void loadAlerts();
    const intervalId = window.setInterval(loadAlerts, 5000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, []);


  const renderCurrentView = () => {
    switch (currentView) {
      case 'sessions':
        return <SessionReplaysView />;
      case 'analytics':
        return <AnalyticsView />;
      case 'heatmap':
        return <HeatmapView />;
      case 'users':
        return <UsersView />;
      case 'alerts':
        return <AlertsView />;
      default:
        return (
          <DashboardView
            sessions={sessions}
            metrics={metrics}
            alerts={alerts}
            isLoading={isLoading}
            error={error ?? alertsError}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Navigation 
        currentView={currentView}
        onViewChange={setCurrentView}
        user={mockUser}
      />
      
      <main className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto">
          {renderCurrentView()}
        </div>
        
        {/* Status Bar */}
        <div className="fixed bottom-4 right-4 bg-white border border-gray-200 rounded-lg p-3 shadow-lg">
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span>Last updated: {lastUpdate.toLocaleTimeString()}</span>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
