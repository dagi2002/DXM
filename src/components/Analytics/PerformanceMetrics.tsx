import React from 'react';
import { Zap, AlertTriangle, Clock, Wifi } from 'lucide-react';

export const PerformanceMetrics: React.FC = () => {
  const performanceData = [
    { metric: 'First Contentful Paint', value: '1.2s', status: 'good', benchmark: '< 1.8s' },
    { metric: 'Largest Contentful Paint', value: '2.1s', status: 'needs-improvement', benchmark: '< 2.5s' },
    { metric: 'Cumulative Layout Shift', value: '0.08', status: 'good', benchmark: '< 0.1' },
    { metric: 'First Input Delay', value: '45ms', status: 'good', benchmark: '< 100ms' }
  ];

  const errorData = [
    { type: 'JavaScript Errors', count: 23, change: -12, trend: 'down' },
    { type: 'Network Failures', count: 8, change: 25, trend: 'up' },
    { type: '404 Errors', count: 156, change: -8, trend: 'down' },
    { type: 'Timeout Errors', count: 5, change: -40, trend: 'down' }
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'good':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'needs-improvement':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'poor':
        return 'text-red-600 bg-red-50 border-red-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900">Performance Metrics</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Core Web Vitals */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center space-x-2 mb-4">
            <Zap className="h-5 w-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900">Core Web Vitals</h3>
          </div>
          
          <div className="space-y-4">
            {performanceData.map((item, index) => (
              <div key={index} className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <div className="font-medium text-gray-900">{item.metric}</div>
                  <div className="text-sm text-gray-600">Benchmark: {item.benchmark}</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-gray-900">{item.value}</div>
                  <div className={`text-xs px-2 py-1 rounded-full border ${getStatusColor(item.status)}`}>
                    {item.status.replace('-', ' ')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Error Tracking */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center space-x-2 mb-4">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <h3 className="text-lg font-semibold text-gray-900">Error Tracking</h3>
          </div>
          
          <div className="space-y-3">
            {errorData.map((error, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <div className="font-medium text-gray-900">{error.type}</div>
                  <div className={`text-sm flex items-center space-x-1 ${
                    error.trend === 'down' ? 'text-green-600' : 'text-red-600'
                  }`}>
                    <span>{Math.abs(error.change)}% {error.trend === 'down' ? 'decrease' : 'increase'}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-gray-900">{error.count}</div>
                  <div className="text-sm text-gray-600">last 24h</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Performance Timeline */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center space-x-2 mb-4">
          <Clock className="h-5 w-5 text-orange-600" />
          <h3 className="text-lg font-semibold text-gray-900">Performance Timeline</h3>
        </div>

        <div className="relative h-32">
          <div className="absolute inset-0 flex items-end justify-between space-x-1">
            {Array.from({ length: 24 }, (_, i) => {
              const height = Math.random() * 80 + 20;
              const color = height > 70 ? '#EF4444' : height > 50 ? '#F59E0B' : '#10B981';
              
              return (
                <div key={i} className="flex-1 flex flex-col items-center">
                  <div
                    className="w-full rounded-t-sm transition-all duration-300 hover:opacity-80"
                    style={{
                      height: `${height}%`,
                      backgroundColor: color
                    }}
                    title={`${i}:00 - Response time: ${Math.round(height * 20)}ms`}
                  />
                  <span className="text-xs text-gray-500 mt-1">
                    {i % 4 === 0 ? `${i}:00` : ''}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-center space-x-6 mt-4 text-sm">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            <span className="text-gray-600">Good (&lt; 1s)</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
            <span className="text-gray-600">Needs Improvement (1-2.5s)</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-red-500 rounded-full"></div>
            <span className="text-gray-600">Poor (&gt; 2.5s)</span>
          </div>
        </div>
      </div>
    </div>
  );
};