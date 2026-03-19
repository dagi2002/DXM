import React, { useState } from 'react';
import { Navigation } from './components/Navigation';
import { TopBar } from './components/TopBar';
import { DashboardView } from './components/Dashboard/DashboardView';
import { SessionReplaysView } from './components/SessionReplays/SessionReplaysView';
import { HeatmapView } from './components/Analytics/HeatmapPage/HeatmapView';
import UserFlowView from './components/UserFlows/UserFlowView';
import { AlertsView } from './components/Alerts/AlertsView';
import InsightsView from './components/Insights/InsightsView';
import ReportsView from './components/Reports/ReportsView';
import SettingsView from './components/Settings/SettingsView';
import { mockUser } from './data/mockData';

function App() {
  const [currentView, setCurrentView] = useState('dashboard');
  const [isCollapsed, setIsCollapsed] = useState(false);

  const renderCurrentView = () => {
    switch (currentView) {
      case 'sessions':
        return <SessionReplaysView />;
      case 'heatmaps':
        return <HeatmapView />;
      case 'userflows':
        return <UserFlowView />;
      case 'alerts':
        return <AlertsView />;
      case 'insights':
        return <InsightsView />;
      case 'reports':
        return <ReportsView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <div className="min-h-screen bg-[#fafafa] flex">
      <Navigation
        currentView={currentView}
        onViewChange={setCurrentView}
        isCollapsed={isCollapsed}
        onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar
          currentView={currentView}
          user={{ name: mockUser.name, avatar: mockUser.avatar, role: mockUser.role }}
        />
        <main className="flex-1 overflow-y-auto">
          {renderCurrentView()}
        </main>
      </div>
    </div>
  );
}

export default App;
