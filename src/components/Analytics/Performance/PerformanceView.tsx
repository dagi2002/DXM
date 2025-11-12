import React from 'react';
import { mockPerformanceData } from '../../../data/mockData';
import { PerformanceCard } from './PerformanceCard';
import { PerformanceGauge } from './PerformanceGauge';
import { OptimizationSuggestions } from './OptimizationSuggestions';

const formatMilliseconds = (value: number) => `${value.toFixed(0)} ms`;
const formatSeconds = (value: number) => `${value.toFixed(1)} s`;
const formatPercentage = (value: number) => `${value.toFixed(1)}%`;

const metricUnits: Record<string, 'ms' | 's' | ''> = {
  lcp: 's',
  fcp: 's',
  fid: 'ms',
  inp: 'ms',
  cls: '',
  ttfb: 's'
};

export const PerformanceView: React.FC = () => {
  const { coreWebVitals, errorRate, apiLatency, deviceBreakdown, geoPerformance, resourceUsage } = mockPerformanceData;

  const percentileMetrics = Object.entries(coreWebVitals).map(([key, metric]) => ({
    key,
    label:
      key === 'lcp'
        ? 'Largest Contentful Paint'
        : key === 'fid'
        ? 'First Input Delay'
        : key === 'cls'
        ? 'Cumulative Layout Shift'
        : key === 'inp'
        ? 'Interaction to Next Paint'
        : key === 'fcp'
        ? 'First Contentful Paint'
        : 'Time to First Byte',
    ...metric
  }));

  const kpiCards = [
    {
      title: 'First Input Delay',
      format: formatMilliseconds,
      thresholds: { good: 100, warning: 300, isLowerBetter: true },
      metric: coreWebVitals.fid
    },
    {
      title: 'Cumulative Layout Shift',
      format: (value: number) => value.toFixed(2),
      thresholds: { good: 0.1, warning: 0.25, isLowerBetter: true },
      metric: coreWebVitals.cls
    },
    {
      title: 'Interaction to Next Paint',
      format: formatMilliseconds,
      thresholds: { good: 200, warning: 500, isLowerBetter: true },
      metric: coreWebVitals.inp
    },
    {
      title: 'First Contentful Paint',
      format: formatSeconds,
      thresholds: { good: 1.8, warning: 3, isLowerBetter: true },
      metric: coreWebVitals.fcp
    },
    {
      title: 'Time to First Byte',
      format: formatSeconds,
      thresholds: { good: 0.8, warning: 1.5, isLowerBetter: true },
      metric: coreWebVitals.ttfb
    },
    {
      title: 'Error Rate',
      format: formatPercentage,
      thresholds: { good: 1, warning: 2, isLowerBetter: true },
      metric: { value: errorRate }
    },
    {
      title: 'API Latency',
      format: formatMilliseconds,
      thresholds: { good: 250, warning: 400, isLowerBetter: true },
      metric: { value: apiLatency }
    }
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Performance Monitoring</h2>
          <p className="text-sm text-gray-600">
            Monitor Core Web Vitals, reliability signals, and latency to ensure a smooth experience.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <PerformanceGauge
            value={coreWebVitals.lcp.value}
            label="Largest Contentful Paint"
            unit="s"
            description="How quickly the main content of a page loads."
            thresholds={{ good: 2.5, warning: 4, isLowerBetter: true }}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {kpiCards.map((card) => (
            <PerformanceCard
              key={card.title}
              title={card.title}
              value={card.format(card.metric.value)}
              thresholds={card.thresholds}
              valueNumber={card.metric.value}
              subtext={
                card.title === 'Error Rate'
                  ? 'Application errors impacting sessions'
                  : card.title === 'API Latency'
                  ? 'Average server response time'
                  : 'User experience signal'
              }
            />
          ))}
        </div>
      </div>

      <section className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Core Web Vitals Distribution</h3>
            <p className="text-sm text-gray-600">Percentile breakdowns help identify long-tail performance issues.</p>
          </div>
          <span className="inline-flex items-center px-3 py-1 text-xs font-medium text-blue-600 bg-blue-50 rounded-full">
            Percentile charts coming soon
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {percentileMetrics.map(({ key, label, value, percentiles }) => (
            <div key={key} className="border border-dashed border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="text-sm font-semibold text-gray-800">{label}</h4>
                  <p className="text-xs text-gray-500">Median value {metricUnits[key] === 'ms' ? 'in milliseconds' : metricUnits[key] === 's' ? 'in seconds' : ''}</p>
                </div>
                <span className="text-sm font-semibold text-gray-900">
                  {metricUnits[key] === 'ms'
                    ? formatMilliseconds(value)
                    : metricUnits[key] === 's'
                    ? formatSeconds(value)
                    : value.toFixed(2)}
                </span>
              </div>
              <div className="space-y-2 text-xs text-gray-600">
                <div className="flex justify-between">
                  <span>P50</span>
                  <span>
                    {metricUnits[key] === 'ms'
                      ? formatMilliseconds(percentiles.p50)
                      : metricUnits[key] === 's'
                      ? formatSeconds(percentiles.p50)
                      : percentiles.p50.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>P75</span>
                  <span>
                    {metricUnits[key] === 'ms'
                      ? formatMilliseconds(percentiles.p75)
                      : metricUnits[key] === 's'
                      ? formatSeconds(percentiles.p75)
                      : percentiles.p75.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>P95</span>
                  <span>
                    {metricUnits[key] === 'ms'
                      ? formatMilliseconds(percentiles.p95)
                      : metricUnits[key] === 's'
                      ? formatSeconds(percentiles.p95)
                      : percentiles.p95.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Device Performance Breakdown</h3>
              <p className="text-sm text-gray-600">Understand how different device classes impact load performance.</p>
            </div>
            <span className="inline-flex items-center px-3 py-1 text-xs font-medium text-indigo-600 bg-indigo-50 rounded-full">
              Pie chart placeholder
            </span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-6">
            <div className="relative w-40 h-40 mx-auto sm:mx-0">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-green-400 via-yellow-300 to-red-400 opacity-90 animate-pulse" />
              <div className="absolute inset-6 rounded-full bg-white flex items-center justify-center">
                <span className="text-sm font-semibold text-gray-700">Device mix</span>
              </div>
            </div>
            <div className="flex-1 space-y-3">
              {Object.entries(deviceBreakdown).map(([device, share]) => (
                <div key={device} className="flex items-center justify-between text-sm text-gray-700">
                  <span className="font-medium capitalize">{device}</span>
                  <span>{share}% of traffic</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Resource Usage</h3>
              <p className="text-sm text-gray-600">Track where page weight is concentrated.</p>
            </div>
            <span className="inline-flex items-center px-3 py-1 text-xs font-medium text-amber-600 bg-amber-50 rounded-full">
              Bar chart placeholder
            </span>
          </div>
          <div className="space-y-4">
            {resourceUsage.map((resource) => (
              <div key={resource.type} className="space-y-2">
                <div className="flex justify-between text-sm text-gray-700">
                  <span className="font-medium uppercase">{resource.type}</span>
                  <span>{resource.size} KB</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-400 to-blue-600 animate-pulse"
                    style={{ width: `${Math.min((resource.size / 2500) * 100, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Geo Performance Overview</h3>
            <p className="text-sm text-gray-600">Regional performance insights for prioritizing optimizations.</p>
          </div>
          <span className="inline-flex items-center px-3 py-1 text-xs font-medium text-emerald-600 bg-emerald-50 rounded-full">
            Map visualization placeholder
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-4 py-2 text-left font-medium text-gray-600 uppercase tracking-wider">
                  Region
                </th>
                <th scope="col" className="px-4 py-2 text-left font-medium text-gray-600 uppercase tracking-wider">
                  Avg LCP
                </th>
                <th scope="col" className="px-4 py-2 text-left font-medium text-gray-600 uppercase tracking-wider">
                  Error rate
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {geoPerformance.map((region) => (
                <tr key={region.region} className="bg-white">
                  <td className="px-4 py-2 whitespace-nowrap text-gray-800">{region.region}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-gray-700">{formatSeconds(region.avgLcp)}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-gray-700">{formatPercentage(region.errorRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <OptimizationSuggestions performanceData={mockPerformanceData} />
    </div>
  );
};