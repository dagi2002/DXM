import React from 'react';
import { ChevronDown } from 'lucide-react';
import { MetricCard } from './MetricCard';
import { ActivityChart } from './ActivityChart';
import { DevicesChart } from './DevicesChart';
import { TopPagesTable } from './TopPagesTable';
import { mockDashboardMetrics, mockSessionsOverTime } from '../../data/mockData';

export const DashboardView: React.FC = () => {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">Behavior insights at a glance</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-sm text-gray-600">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            47 active now
          </span>
          <button className="flex items-center gap-2 border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
            Last 7 days
            <ChevronDown className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {mockDashboardMetrics.map((m) => (
          <MetricCard
            key={m.name}
            name={m.name}
            value={m.value}
            change={m.change}
            trend={m.trend}
            icon={m.icon}
          />
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ActivityChart title="Sessions Over Time" data={mockSessionsOverTime} />
        </div>
        <DevicesChart />
      </div>

      {/* Top Pages */}
      <TopPagesTable />
    </div>
  );
};
