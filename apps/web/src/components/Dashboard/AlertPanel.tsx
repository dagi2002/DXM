import React from 'react';
import { AlertTriangle, X, Clock } from 'lucide-react';
import type { Alert } from '../../types';

interface AlertPanelProps {
  alerts: Alert[];
  isLoading: boolean;
}

export const AlertPanel: React.FC<AlertPanelProps> = ({ alerts, isLoading }) => {
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'high':
        return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'medium':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      default:
        return 'text-primary-600 bg-primary-50 border-primary-200';
    }
  };

  const activeAlerts = alerts.filter(alert => !alert.resolved);
  const visibleAlerts = [...alerts]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 5);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Recent Alerts</h3>
        <span className="text-sm text-gray-500">{activeAlerts.length} active</span>
      </div>

      <div className="space-y-3 max-h-64 overflow-y-auto">
        {isLoading && (
          <div className="rounded-lg bg-gray-50 px-3 py-4 text-sm text-gray-500">Loading alerts…</div>
        )}

        {!isLoading && !visibleAlerts.length && (
          <div className="rounded-lg bg-gray-50 px-3 py-4 text-sm text-gray-500">No alerts available.</div>
        )}

        {visibleAlerts.map((alert) => (
          <div
            key={alert.id}
            className={`p-3 rounded-lg border ${getSeverityColor(alert.severity)} ${
              alert.resolved ? 'opacity-50' : ''
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-2">
                <AlertTriangle className="h-4 w-4 mt-0.5" />
                <div className="flex-1">
                  <h4 className="text-sm font-medium">{alert.title}</h4>
                  <p className="text-xs mt-1 opacity-80">{alert.description}</p>
                  <div className="flex items-center space-x-4 mt-2 text-xs opacity-70">
                    <span className="flex items-center space-x-1">
                      <Clock className="h-3 w-3" />
                      <span>{new Date(alert.timestamp).toLocaleTimeString()}</span>
                    </span>
                    <span>{alert.affectedSessions} sessions affected</span>
                  </div>
                </div>
              </div>
              
              {!alert.resolved && (
                <button className="text-gray-400 hover:text-gray-600 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-100">
        <button className="text-sm text-primary-600 hover:text-primary-800 font-medium transition-colors">
          View all alerts →
        </button>
      </div>
    </div>
  );
};
