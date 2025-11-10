import React from 'react';
import { MetricCard } from './MetricCard';
import { ActivityChart } from './ActivityChart';
import { AlertPanel } from './AlertPanel';
import { LiveSessions } from './LiveSessions';
import { mockMetrics } from '../../data/mockData';

export const DashboardView: React.FC = () => {
  const activityData = Array.from({ length: 24 }, (_, i) => ({
    time: `${i}:00`,
    value: Math.floor(Math.random() * 500) + 100
  }));

  const conversionData = Array.from({ length: 7 }, (_, i) => ({
    time: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i],
    value: Math.floor(Math.random() * 50) + 20
  }));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600">Real-time insights into your digital experience</p>
        </div>
        
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-sm text-gray-600">Live</span>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {mockMetrics.map((metric, index) => (
          <MetricCard key={index} metric={metric} />
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ActivityChart 
          title="Session Activity (24h)"
          data={activityData}
          color="#0066CC"
        />
        <ActivityChart 
          title="Daily Conversions"
          data={conversionData}
          color="#00A896"
        />
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LiveSessions />
        <AlertPanel />
      </div>
    </div>
  );
};