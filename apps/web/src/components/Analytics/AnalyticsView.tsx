import React, { useState } from 'react';
import { HeatmapView } from './HeatmapPage/HeatmapView.tsx';
import { FunnelAnalysis } from './Funnels/FunnelAnalysis.tsx';
import { UserFlowView } from './UserFlow/UserFlowView';
import PerformanceMetrics from './Performance/PerformanceMetrics';
import { UpgradeGate } from '../UpgradeGate';
import { useAuth } from '../../context/AuthContext';
import { BILLING_FEATURES, workspaceHasFeature } from '../../lib/billing';

export const AnalyticsView: React.FC = () => {
  const { workspace } = useAuth();
  const [activeTab, setActiveTab] = useState('heatmaps');
  const canUseFunnels = workspaceHasFeature(workspace?.plan || 'free', BILLING_FEATURES.funnels);
  const canUseUserFlow = workspaceHasFeature(workspace?.plan || 'free', BILLING_FEATURES.userFlow);

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
          <p className="text-gray-600">Behavior, funnels, flows, and performance in a format your agency can act on.</p>
        </div>
        <span className="rounded-full bg-surface-100 px-3 py-1 text-xs font-medium text-surface-600">
          Live portfolio telemetry
        </span>
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
                  ? 'border-primary-500 text-primary-600'
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
        {activeTab === 'funnels' &&
          (canUseFunnels ? (
            <FunnelAnalysis />
          ) : (
            <UpgradeGate
              source="funnels"
              title="Unlock funnels to explain where conversions break."
              description="Heatmaps and performance stay free. Funnel analysis moves into the paid bundle because that is where agencies start turning telemetry into actionable client stories."
              bullets={[
                'Keep heatmaps and performance on Free',
                'Unlock funnels, replay, alerts, user flow, and reports together',
              ]}
            />
          ))}
        {activeTab === 'flows' &&
          (canUseUserFlow ? (
            <UserFlowView />
          ) : (
            <UpgradeGate
              source="user_flow"
              title="Unlock user flow to see where visitors go next."
              description="User flow is part of the paid DXM bundle for agencies that need more than page-level behavior and want navigation patterns across the portfolio."
              bullets={[
                'Keep basic analytics available for evaluation',
                'Unlock user flow with the rest of the paid ops features',
              ]}
            />
          ))}
        {activeTab === 'performance' && <PerformanceMetrics />}
      </div>
    </div>
  );
};
