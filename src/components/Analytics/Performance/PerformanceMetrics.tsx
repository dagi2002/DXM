import React from 'react';
import {
  AlertTriangle,
  Activity,
  Clock,
  Filter,
  Globe,
  Monitor,
  RefreshCw,
  Server,
  Smartphone,
  Tablet,
  TrendingDown,
  TrendingUp,
  Zap
} from 'lucide-react';

type VitalStatus = 'good' | 'needs-improvement' | 'poor' | 'stable';
type TrendDirection = 'up' | 'down' | 'stable';
type DeviceType = 'Desktop' | 'Mobile' | 'Tablet';
type SeverityLevel = 'critical' | 'high' | 'medium' | 'low';
type OptimizationLevel = 'good' | 'medium' | 'poor';

interface CoreWebVital {
  metric: string;
  value: string;
  status: VitalStatus;
  benchmark: string;
  trend: TrendDirection;
  change: number;
  p75: string;
  p90: string;
  description: string;
}

interface ErrorMetric {
  type: string;
  count: number;
  change: number;
  trend: 'up' | 'down';
  severity: SeverityLevel;
  affectedUsers: number;
}

interface DeviceMetric {
  device: DeviceType;
  fcp: string;
  lcp: string;
  cls: string;
  fid: string;
  score: number;
}

interface GeoMetric {
  region: string;
  avgLoadTime: string;
  score: number;
  users: string;
}

interface ResourceMetric {
  resource: string;
  size: string;
  requests: number;
  loadTime: string;
  optimization: OptimizationLevel;
}

export const PerformanceMetrics: React.FC = () => {
  const performanceData: CoreWebVital[] = [
    {
      metric: 'First Contentful Paint',
      value: '1.2s',
      status: 'good',
      benchmark: '< 1.8s',
      trend: 'down',
      change: -8,
      p75: '1.4s',
      p90: '1.8s',
      description: 'Time until first text or image is painted'
    },
    {
      metric: 'Largest Contentful Paint',
      value: '2.1s',
      status: 'needs-improvement',
      benchmark: '< 2.5s',
      trend: 'up',
      change: 12,
      p75: '2.8s',
      p90: '3.2s',
      description: 'Time until largest content element is painted'
    },
    {
      metric: 'Cumulative Layout Shift',
      value: '0.08',
      status: 'good',
      benchmark: '< 0.1',
      trend: 'down',
      change: -15,
      p75: '0.12',
      p90: '0.18',
      description: 'Visual stability of page during loading'
    },
    {
      metric: 'First Input Delay',
      value: '45ms',
      status: 'good',
      benchmark: '< 100ms',
      trend: 'down',
      change: -22,
      p75: '68ms',
      p90: '95ms',
      description: 'Time from first user interaction to browser response'
    },
    {
      metric: 'Interaction to Next Paint',
      value: '180ms',
      status: 'good',
      benchmark: '< 200ms',
      trend: 'stable',
      change: 2,
      p75: '220ms',
      p90: '280ms',
      description: 'Responsiveness of page to user interactions'
    },
    {
      metric: 'Time to First Byte',
      value: '320ms',
      status: 'good',
      benchmark: '< 600ms',
      trend: 'down',
      change: -18,
      p75: '450ms',
      p90: '680ms',
      description: 'Server response time for initial request'
    }
  ];

  const errorData: ErrorMetric[] = [
    { type: 'JavaScript Errors', count: 23, change: -12, trend: 'down', severity: 'high', affectedUsers: 156 },
    { type: 'Network Failures', count: 8, change: 25, trend: 'up', severity: 'critical', affectedUsers: 89 },
    { type: '404 Errors', count: 156, change: -8, trend: 'down', severity: 'medium', affectedUsers: 234 },
    { type: 'Timeout Errors', count: 5, change: -40, trend: 'down', severity: 'high', affectedUsers: 45 },
    { type: 'CORS Errors', count: 12, change: 15, trend: 'up', severity: 'medium', affectedUsers: 67 },
    { type: 'Memory Leaks', count: 3, change: -25, trend: 'down', severity: 'critical', affectedUsers: 23 }
  ];

  const devicePerformance: DeviceMetric[] = [
    { device: 'Desktop', fcp: '0.9s', lcp: '1.8s', cls: '0.05', fid: '35ms', score: 92 },
    { device: 'Mobile', fcp: '1.8s', lcp: '3.2s', cls: '0.12', fid: '85ms', score: 76 },
    { device: 'Tablet', fcp: '1.3s', lcp: '2.4s', cls: '0.08', fid: '52ms', score: 85 }
  ];

  const geoPerformance: GeoMetric[] = [
    { region: 'North America', avgLoadTime: '1.8s', score: 89, users: '45%' },
    { region: 'Europe', avgLoadTime: '2.1s', score: 85, users: '32%' },
    { region: 'Asia Pacific', avgLoadTime: '2.8s', score: 78, users: '18%' },
    { region: 'Other', avgLoadTime: '3.2s', score: 72, users: '5%' }
  ];

  const resourceMetrics: ResourceMetric[] = [
    { resource: 'Images', size: '2.3MB', requests: 45, loadTime: '1.2s', optimization: 'medium' },
    { resource: 'JavaScript', size: '890KB', requests: 12, loadTime: '0.8s', optimization: 'good' },
    { resource: 'CSS', size: '245KB', requests: 8, loadTime: '0.3s', optimization: 'good' },
    { resource: 'Fonts', size: '180KB', requests: 4, loadTime: '0.5s', optimization: 'poor' },
    { resource: 'API Calls', size: '125KB', requests: 23, loadTime: '0.6s', optimization: 'good' }
  ];

  const getStatusColor = (status: VitalStatus) => {
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

  const getTrendIcon = (trend: TrendDirection) => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="h-4 w-4 text-red-500" />;
      case 'down':
        return <TrendingDown className="h-4 w-4 text-green-500" />;
      default:
        return <Activity className="h-4 w-4 text-gray-400" />;
    }
  };

  const getDeviceIcon = (device: DeviceType) => {
    switch (device) {
      case 'Desktop':
        return <Monitor className="h-5 w-5" />;
      case 'Mobile':
        return <Smartphone className="h-5 w-5" />;
      case 'Tablet':
        return <Tablet className="h-5 w-5" />;
      default:
        return <Monitor className="h-5 w-5" />;
    }
  };

  const getSeverityColor = (severity: SeverityLevel) => {
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

  const getOptimizationColor = (optimization: OptimizationLevel) => {
    switch (optimization) {
      case 'good':
        return 'text-green-600 bg-green-50';
      case 'medium':
        return 'text-yellow-600 bg-yellow-50';
      case 'poor':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Advanced Performance Analytics</h2>
          <p className="text-gray-600">Comprehensive performance monitoring with Core Web Vitals</p>
        </div>

        <div className="flex items-center space-x-3">
          <select className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm">
            <option>Last 24 hours</option>
            <option>Last 7 days</option>
            <option>Last 30 days</option>
          </select>

          <button className="flex items-center space-x-2 px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-sm">
            <Filter className="h-4 w-4" />
            <span>Filter</span>
          </button>

          <button className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm">
            <RefreshCw className="h-4 w-4" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-6 text-center">
          <div className="text-4xl font-bold text-green-600 mb-2">85</div>
          <div className="text-sm text-gray-600 mb-1">Performance Score</div>
          <div className="text-xs text-green-600">+3 from last week</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-6 text-center">
          <div className="text-4xl font-bold text-blue-600 mb-2">2.1s</div>
          <div className="text-sm text-gray-600 mb-1">Avg. Load Time</div>
          <div className="text-xs text-green-600">-0.3s from last week</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-6 text-center">
          <div className="text-4xl font-bold text-orange-600 mb-2">204</div>
          <div className="text-sm text-gray-600 mb-1">Total Errors</div>
          <div className="text-xs text-red-600">+12 from last week</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-6 text-center">
          <div className="text-4xl font-bold text-purple-600 mb-2">98.2%</div>
          <div className="text-sm text-gray-600 mb-1">Uptime</div>
          <div className="text-xs text-green-600">+0.1% from last week</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center space-x-2 mb-4">
            <Zap className="h-5 w-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900">Core Web Vitals</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {performanceData.map((item) => (
              <div key={item.metric} className="p-4 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium text-gray-900">{item.metric}</div>
                    {getTrendIcon(item.trend)}
                  </div>
                  <div className="text-2xl font-bold text-gray-900 mb-1">{item.value}</div>
                  <div className="text-sm text-gray-600 mb-2">{item.description}</div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Target: {item.benchmark}</span>
                    <span
                      className={
                        item.trend === 'down'
                          ? 'text-green-600'
                          : item.trend === 'up'
                          ? 'text-red-600'
                          : 'text-gray-600'
                      }
                    >
                      {item.change > 0 ? '+' : ''}
                      {item.change}%
                    </span>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  <div className={`text-xs px-3 py-1 rounded-full border ${getStatusColor(item.status)}`}>
                    {item.status.replace('-', ' ')}
                  </div>
                  <div className="text-xs text-gray-500">
                    <div>P75: {item.p75}</div>
                    <div>P90: {item.p90}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center space-x-2 mb-4">
            <Clock className="h-5 w-5 text-orange-600" />
            <h3 className="text-lg font-semibold text-gray-900">24h Timeline</h3>
          </div>

          <div className="relative h-40 mb-4">
            <div className="absolute inset-0 flex items-end justify-between space-x-1">
              {Array.from({ length: 24 }, (_, index) => {
                const height = Math.random() * 80 + 20;
                const color = height > 70 ? '#EF4444' : height > 50 ? '#F59E0B' : '#10B981';

                return (
                  <div key={index} className="flex-1 flex flex-col items-center">
                    <div
                      className="w-full rounded-t-sm transition-all duration-300 hover:opacity-80"
                      style={{
                        height: `${height}%`,
                        backgroundColor: color
                      }}
                      title={`${index}:00 - Load time: ${Math.round(height * 20)}ms`}
                    />
                    <span className="text-xs text-gray-500 mt-1">{index % 6 === 0 ? `${index}:00` : ''}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-center space-x-4 text-xs">
            <div className="flex items-center space-x-1">
              <div className="w-3 h-3 bg-green-500 rounded-full" />
              <span className="text-gray-600">Good (&lt;1s)</span>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-3 h-3 bg-yellow-500 rounded-full" />
              <span className="text-gray-600">Needs Improvement</span>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-3 h-3 bg-red-500 rounded-full" />
              <span className="text-gray-600">Poor (&gt;2.5s)</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center space-x-2 mb-4">
          <Monitor className="h-5 w-5 text-purple-600" />
          <h3 className="text-lg font-semibold text-gray-900">Device Performance Breakdown</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {devicePerformance.map((device) => (
            <div key={device.device} className="p-4 border border-gray-200 rounded-lg">
              <div className="flex items-center space-x-2 mb-3">
                {getDeviceIcon(device.device)}
                <h4 className="font-medium text-gray-900">{device.device}</h4>
                <div
                  className={`ml-auto px-2 py-1 rounded-full text-xs font-medium ${
                    device.score >= 90
                      ? 'bg-green-100 text-green-800'
                      : device.score >= 75
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {device.score}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-gray-500">FCP</div>
                  <div className="font-medium">{device.fcp}</div>
                </div>
                <div>
                  <div className="text-gray-500">LCP</div>
                  <div className="font-medium">{device.lcp}</div>
                </div>
                <div>
                  <div className="text-gray-500">CLS</div>
                  <div className="font-medium">{device.cls}</div>
                </div>
                <div>
                  <div className="text-gray-500">FID</div>
                  <div className="font-medium">{device.fid}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center space-x-2 mb-4">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <h3 className="text-lg font-semibold text-gray-900">Error Analysis</h3>
          </div>

          <div className="space-y-3">
            {errorData.map((error) => (
              <div key={error.type} className={`p-3 rounded-lg border ${getSeverityColor(error.severity)}`}>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <div className="font-medium">{error.type}</div>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getSeverityColor(error.severity)}`}>
                      {error.severity}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <div>
                      <span className="font-semibold">{error.count}</span> errors
                    </div>
                    <div
                      className={`flex items-center space-x-1 ${
                        error.trend === 'down' ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {getTrendIcon(error.trend)}
                      <span>{Math.abs(error.change)}%</span>
                    </div>
                  </div>
                  <div className="text-xs text-gray-600 mt-1">{error.affectedUsers} users affected</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center space-x-2 mb-4">
            <Globe className="h-5 w-5 text-green-600" />
            <h3 className="text-lg font-semibold text-gray-900">Geographic Performance</h3>
          </div>

          <div className="space-y-4">
            {geoPerformance.map((geo) => (
              <div key={geo.region} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <div className="font-medium text-gray-900">{geo.region}</div>
                  <div className="text-sm text-gray-600">{geo.users} of traffic</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-gray-900">{geo.avgLoadTime}</div>
                  <div
                    className={`text-sm px-2 py-1 rounded-full ${
                      geo.score >= 85
                        ? 'bg-green-100 text-green-800'
                        : geo.score >= 75
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    Score: {geo.score}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center space-x-2 mb-4">
          <Server className="h-5 w-5 text-indigo-600" />
          <h3 className="text-lg font-semibold text-gray-900">Resource Performance Analysis</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 font-medium text-gray-900">Resource Type</th>
                <th className="text-center py-3 px-4 font-medium text-gray-900">Size</th>
                <th className="text-center py-3 px-4 font-medium text-gray-900">Requests</th>
                <th className="text-center py-3 px-4 font-medium text-gray-900">Load Time</th>
                <th className="text-center py-3 px-4 font-medium text-gray-900">Optimization</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {resourceMetrics.map((resource) => (
                <tr key={resource.resource} className="hover:bg-gray-50">
                  <td className="py-3 px-4 font-medium text-gray-900">{resource.resource}</td>
                  <td className="py-3 px-4 text-center text-gray-700">{resource.size}</td>
                  <td className="py-3 px-4 text-center text-gray-700">{resource.requests}</td>
                  <td className="py-3 px-4 text-center text-gray-700">{resource.loadTime}</td>
                  <td className="py-3 px-4 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getOptimizationColor(resource.optimization)}`}>
                      {resource.optimization}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center space-x-2 mb-4">
          <Zap className="h-5 w-5 text-yellow-600" />
          <h3 className="text-lg font-semibold text-gray-900">Performance Optimization Recommendations</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900">Critical Issues</h4>
            <div className="space-y-3">
              <div className="flex items-start space-x-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="w-2 h-2 bg-red-500 rounded-full mt-2" />
                <div>
                  <p className="text-sm font-medium text-red-800">Optimize Image Loading</p>
                  <p className="text-xs text-red-600">Images account for 2.3MB. Consider WebP format and lazy loading.</p>
                </div>
              </div>
              <div className="flex items-start space-x-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <div className="w-2 h-2 bg-orange-500 rounded-full mt-2" />
                <div>
                  <p className="text-sm font-medium text-orange-800">Font Loading Strategy</p>
                  <p className="text-xs text-orange-600">Font loading causing layout shifts. Implement font-display: swap.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="font-medium text-gray-900">Optimization Opportunities</h4>
            <div className="space-y-3">
              <div className="flex items-start space-x-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="w-2 h-2 bg-green-500 rounded-full mt-2" />
                <div>
                  <p className="text-sm font-medium text-green-800">Enable Compression</p>
                  <p className="text-xs text-green-600">Gzip compression can reduce transfer size by 60-80%.</p>
                </div>
              </div>
              <div className="flex items-start space-x-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="w-2 h-2 bg-blue-500 rounded-full mt-2" />
                <div>
                  <p className="text-sm font-medium text-blue-800">Implement CDN</p>
                  <p className="text-xs text-blue-600">CDN can improve load times by 30-50% globally.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PerformanceMetrics;