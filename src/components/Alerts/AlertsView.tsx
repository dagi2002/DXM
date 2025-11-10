import React, { useState } from 'react';
import { AlertTriangle, CheckCircle, Clock, Filter, Bell, BellOff, MoreVertical } from 'lucide-react';
import { mockAlerts } from '../../data/mockData';

export const AlertsView: React.FC = () => {
  const [filter, setFilter] = useState('all');
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);

  const filteredAlerts = mockAlerts.filter(alert => {
    if (filter === 'active') return !alert.resolved;
    if (filter === 'resolved') return alert.resolved;
    return true;
  });

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'high':
        return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'medium':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      default:
        return 'text-blue-600 bg-blue-50 border-blue-200';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'error':
        return <AlertTriangle className="h-5 w-5" />;
      case 'performance':
        return <Clock className="h-5 w-5" />;
      default:
        return <AlertTriangle className="h-5 w-5" />;
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Alerts</h1>
          <p className="text-gray-600">Monitor critical issues and performance problems</p>
        </div>
        
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setNotificationsEnabled(!notificationsEnabled)}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
              notificationsEnabled 
                ? 'bg-blue-600 text-white hover:bg-blue-700' 
                : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {notificationsEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            <span>{notificationsEnabled ? 'Notifications On' : 'Notifications Off'}</span>
          </button>
        </div>
      </div>

      {/* Alert Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Alerts', value: mockAlerts.length, color: 'blue' },
          { label: 'Active', value: mockAlerts.filter(a => !a.resolved).length, color: 'orange' },
          { label: 'Critical', value: mockAlerts.filter(a => a.severity === 'critical').length, color: 'red' },
          { label: 'Resolved', value: mockAlerts.filter(a => a.resolved).length, color: 'green' }
        ].map((stat, index) => (
          <div key={index} className="bg-white border border-gray-200 rounded-lg p-4 text-center">
            <div className={`text-2xl font-bold ${
              stat.color === 'blue' ? 'text-blue-600' :
              stat.color === 'orange' ? 'text-orange-600' :
              stat.color === 'red' ? 'text-red-600' : 'text-green-600'
            }`}>
              {stat.value}
            </div>
            <div className="text-sm text-gray-600">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div className="bg-white border border-gray-200 rounded-lg mb-6">
        <div className="flex border-b border-gray-200">
          {[
            { id: 'all', label: 'All Alerts', count: mockAlerts.length },
            { id: 'active', label: 'Active', count: mockAlerts.filter(a => !a.resolved).length },
            { id: 'resolved', label: 'Resolved', count: mockAlerts.filter(a => a.resolved).length }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`flex items-center space-x-2 px-6 py-4 text-sm font-medium transition-colors ${
                filter === tab.id
                  ? 'text-blue-600 border-b-2 border-blue-500 bg-blue-50'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`px-2 py-1 rounded-full text-xs ${
                filter === tab.id 
                  ? 'bg-blue-100 text-blue-800' 
                  : 'bg-gray-100 text-gray-600'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Alerts List */}
      <div className="space-y-4">
        {filteredAlerts.map((alert) => (
          <div
            key={alert.id}
            className={`bg-white border rounded-lg p-6 transition-all hover:shadow-md ${
              alert.resolved ? 'opacity-75' : ''
            } ${getSeverityColor(alert.severity)}`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-4">
                <div className={`p-2 rounded-lg ${getSeverityColor(alert.severity)}`}>
                  {getTypeIcon(alert.type)}
                </div>
                
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <h3 className="text-lg font-semibold text-gray-900">{alert.title}</h3>
                    {alert.resolved && (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    )}
                  </div>
                  
                  <p className="text-gray-700 mb-3">{alert.description}</p>
                  
                  <div className="flex items-center space-x-6 text-sm text-gray-600">
                    <span className="flex items-center space-x-1">
                      <Clock className="h-4 w-4" />
                      <span>{new Date(alert.timestamp).toLocaleString()}</span>
                    </span>
                    <span>{alert.affectedSessions} sessions affected</span>
                    <span className="capitalize">{alert.type} alert</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                {!alert.resolved && (
                  <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm">
                    Mark Resolved
                  </button>
                )}
                <button className="p-2 text-gray-400 hover:text-gray-600 transition-colors">
                  <MoreVertical className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredAlerts.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <AlertTriangle className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No alerts found</h3>
          <p className="text-gray-600">
            {filter === 'active' 
              ? "There are no active alerts at the moment." 
              : "No alerts match your current filter criteria."}
          </p>
        </div>
      )}
    </div>
  );
};