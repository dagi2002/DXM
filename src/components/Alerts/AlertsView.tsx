import React, { useState } from 'react';
import { Flame, BarChart3, TrendingDown, Code, CheckCircle2, Clock, FileText, Users, Tag, Calendar } from 'lucide-react';
import { mockAlerts } from '../../data/mockData';
import type { Alert } from '../../types';

const getTypeIcon = (type: string) => {
  switch (type) {
    case 'frustration':
      return { icon: Flame, color: 'text-orange-500', bg: 'bg-orange-50' };
    case 'performance':
      return { icon: BarChart3, color: 'text-red-500', bg: 'bg-red-50' };
    case 'conversion':
      return { icon: TrendingDown, color: 'text-indigo-500', bg: 'bg-indigo-50' };
    case 'error':
      return { icon: Code, color: 'text-amber-500', bg: 'bg-amber-50' };
    default:
      return { icon: Flame, color: 'text-gray-500', bg: 'bg-gray-50' };
  }
};

const getSeverityBadge = (severity: string) => {
  switch (severity) {
    case 'critical':
      return 'bg-red-100 text-red-700';
    case 'high':
      return 'bg-orange-100 text-orange-700';
    case 'medium':
      return 'bg-yellow-100 text-yellow-700';
    case 'low':
      return 'bg-blue-100 text-blue-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'new':
      return 'bg-blue-100 text-blue-700';
    case 'acknowledged':
      return 'bg-purple-100 text-purple-700';
    case 'resolved':
      return 'bg-green-100 text-green-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
};

export const AlertsView: React.FC = () => {
  const [alerts, setAlerts] = useState<Alert[]>(mockAlerts);

  const handleAcknowledge = (id: string) => {
    setAlerts(prev =>
      prev.map(a => a.id === id ? { ...a, status: 'acknowledged' as const } : a)
    );
  };

  const handleResolve = (id: string) => {
    setAlerts(prev =>
      prev.map(a => a.id === id ? { ...a, status: 'resolved' as const, resolved: true } : a)
    );
  };

  const totalAlerts = alerts.length;
  const criticalCount = alerts.filter(a => a.severity === 'critical').length;
  const unresolvedCount = alerts.filter(a => !a.resolved).length;
  const resolvedCount = alerts.filter(a => a.resolved).length;
  const newCount = alerts.filter(a => a.status === 'new').length;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Behavior Alerts</h1>
          <p className="text-gray-500">Unusual patterns detected on your site</p>
        </div>
        <span className="bg-orange-100 text-orange-700 rounded-full px-3 py-1 text-sm font-medium">
          {newCount} new alert{newCount !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="text-3xl font-bold text-indigo-600">{totalAlerts}</div>
          <div className="text-sm text-gray-500 mt-1">Total Alerts</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="text-3xl font-bold text-red-500">{criticalCount}</div>
          <div className="text-sm text-gray-500 mt-1">Critical</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="text-3xl font-bold text-orange-500">{unresolvedCount}</div>
          <div className="text-sm text-gray-500 mt-1">Unresolved</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="text-3xl font-bold text-emerald-600">{resolvedCount}</div>
          <div className="text-sm text-gray-500 mt-1">Resolved</div>
        </div>
      </div>

      {/* Alert list */}
      <div className="space-y-3">
        {alerts.map((alert) => {
          const typeInfo = getTypeIcon(alert.type);
          const IconComponent = typeInfo.icon;

          return (
            <div
              key={alert.id}
              className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm"
            >
              <div className="flex items-start gap-4">
                {/* Icon */}
                <div className={`p-2.5 rounded-lg ${typeInfo.bg} flex-shrink-0`}>
                  <IconComponent className={`h-5 w-5 ${typeInfo.color}`} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="font-medium text-gray-900">{alert.title}</h3>
                    <span className={`text-xs rounded-full px-2 py-0.5 font-medium capitalize ${getSeverityBadge(alert.severity)}`}>
                      {alert.severity}
                    </span>
                    <span className={`text-xs rounded-full px-2 py-0.5 font-medium capitalize ${getStatusBadge(alert.status)}`}>
                      {alert.status}
                    </span>
                  </div>

                  <p className="text-gray-600 text-sm mt-1">{alert.description}</p>

                  <div className="flex items-center gap-4 mt-3 flex-wrap">
                    {alert.page && (
                      <span className="flex items-center gap-1 text-gray-500 text-xs">
                        <FileText className="h-3.5 w-3.5" />
                        {alert.page}
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-gray-500 text-xs">
                      <Calendar className="h-3.5 w-3.5" />
                      {new Date(alert.timestamp).toLocaleString()}
                    </span>
                    <span className="flex items-center gap-1 text-gray-500 text-xs">
                      <Users className="h-3.5 w-3.5" />
                      {alert.affectedSessions} sessions
                    </span>
                    <span className="flex items-center gap-1 text-gray-500 text-xs">
                      <Tag className="h-3.5 w-3.5" />
                      {alert.type} Alert
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {alert.resolved ? (
                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                  ) : (
                    <>
                      {alert.status !== 'acknowledged' && (
                        <button
                          onClick={() => handleAcknowledge(alert.id)}
                          className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                        >
                          Acknowledge
                        </button>
                      )}
                      <button
                        onClick={() => handleResolve(alert.id)}
                        className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition-colors"
                      >
                        Resolve
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {alerts.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-12 text-center shadow-sm">
          <CheckCircle2 className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No alerts</h3>
          <p className="text-gray-500">
            No behavior alerts have been detected.
          </p>
        </div>
      )}
    </div>
  );
};
