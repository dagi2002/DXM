import React, { useState } from 'react';
import { HeatmapView } from './HeatmapPage/HeatmapView';
import { FunnelAnalysis } from './Funnels/FunnelAnalysis.tsx';
import { UserFlowView } from './UserFlow/UserFlowView';
import PerformanceMetrics from './Performance/PerformanceMetrics';

export const AnalyticsView: React.FC = () => {
  const [activeTab, setActiveTab] = useState('heatmaps');

  const tabs = [
    { id: 'heatmaps', label: 'Heatmaps', description: 'Click and scroll patterns' },
    { id: 'funnels', label: 'Funnels', description: 'Conversion analysis' },
    { id: 'flows', label: 'User Flow', description: 'Navigation patterns' },
    { id: 'performance', label: 'Performance', description: 'Speed and errors' }
  ];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-gray-600">Deep insights into user behavior and experience</p>
        </div>
        
        <div className="flex items-center space-x-2">
          <select className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none">
            <option>Last 7 days</option>
            <option>Last 30 days</option>
            <option>Last 90 days</option>
          </select>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div>
                <div>{tab.label}</div>
                <div className="text-xs opacity-75">{tab.description}</div>
              </div>
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="space-y-6">
        {activeTab === 'heatmaps' && <HeatmapView />}
        {activeTab === 'funnels' && <FunnelAnalysis />}
        {activeTab === 'flows' && <UserFlowView />}
        {activeTab === 'performance' && <PerformanceMetrics />}
      </div>
    </div>
  );
};