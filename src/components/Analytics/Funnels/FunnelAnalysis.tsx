import React, { useMemo, useState } from 'react';
import type { FunnelStep } from '../../../types';
import {
  AlertTriangle,
  Calendar,
  Clock,
  DollarSign,
  Download,
  Filter,
  Percent,
  RefreshCw,
  Target,
  TrendingDown,
  Users,
} from 'lucide-react';
import { mockFunnelData } from "../../../data/mockData";

const timeframeOptions = [
  { value: '1d', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
];

const segmentOptions = [
  { value: 'all', label: 'All Users' },
  { value: 'new', label: 'New Users' },
  { value: 'returning', label: 'Returning Users' },
  { value: 'mobile', label: 'Mobile Users' },
  { value: 'desktop', label: 'Desktop Users' },
];

const segmentDescriptions: Record<string, string> = {
  all: 'Full audience visibility for holistic benchmarking.',
  new: 'First-time visitors exploring DXM Pulse experiences.',
  returning: 'Loyal adopters evaluating long-term engagement.',
  mobile: 'Mobile-first journeys across key touchpoints.',
  desktop: 'Desktop-focused researchers and decision makers.',
};

const roadmapHighlights = [
  {
    title: 'Multi-Dimensional Analysis',
    caption:
      'Period-over-period comparisons, audience segmentation, traffic source attribution, and cohort conversion tracking.',
    icon: Percent,
  },
  {
    title: 'Actionable Insights Engine',
    caption:
      'Automatically surfaces critical drop-offs, exit drivers, device friction, and optimisation opportunities.',
    icon: AlertTriangle,
  },
  {
    title: 'Enhanced Visualisation',
    caption:
      'Gradient funnel overlays, severity coding, contextual step cards, and adaptive controls for deep dives.',
    icon: Target,
  },
  {
    title: 'Business Intelligence',
    caption:
      'Revenue projections, time-to-conversion metrics, benchmarking, and export-ready reporting.',
    icon: DollarSign,
  },
];

const deviceKeys = ['desktop', 'mobile', 'tablet'] as const;
const trafficKeys = ['organic', 'paid', 'social', 'direct'] as const;

type EnhancedFunnelStep = FunnelStep & {
  avgTimeToNext: number;
  exitReasons: { reason: string; percentage: number }[];
  deviceBreakdown: Record<(typeof deviceKeys)[number], number>;
  conversionBySource: Record<(typeof trafficKeys)[number], number>;
};

export const FunnelAnalysis: React.FC = () => {
  const [selectedTimeframe, setSelectedTimeframe] = useState('7d');
  const [selectedSegment, setSelectedSegment] = useState('all');
  const [comparisonMode, setComparisonMode] = useState(false);

  const enhancedFunnelData = useMemo<EnhancedFunnelStep[]>(
    () =>
      mockFunnelData.map<EnhancedFunnelStep>((step) => ({
        ...step,
        avgTimeToNext: Math.floor(Math.random() * 300) + 30,
        exitReasons: [
          { reason: 'Page Load Timeout', percentage: 25 },
          { reason: 'Form Errors', percentage: 35 },
          { reason: 'Pricing Concerns', percentage: 20 },
          { reason: 'Technical Issues', percentage: 20 },
        ],
        deviceBreakdown: {
          desktop: Math.floor(Math.random() * 40) + 40,
          mobile: Math.floor(Math.random() * 35) + 25,
          tablet: Math.floor(Math.random() * 20) + 10,
        },
        conversionBySource: {
          organic: Math.floor(Math.random() * 30) + 20,
          paid: Math.floor(Math.random() * 25) + 15,
          social: Math.floor(Math.random() * 20) + 10,
          direct: Math.floor(Math.random() * 25) + 15,
        },
      })),
    [selectedTimeframe, selectedSegment, comparisonMode]
  );

  const totalEntries = enhancedFunnelData[0]?.users ?? 0;
  const overallConversion = enhancedFunnelData[enhancedFunnelData.length - 1]?.conversionRate ?? 0;
  const stepWithBestRetention = enhancedFunnelData.reduce<{
    name: string;
    conversionRate: number;
  } | null>((best, step) => {
    if (!best || step.conversionRate > best.conversionRate) {
      return { name: step.name, conversionRate: step.conversionRate };
    }
    return best;
  }, null);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getDropoffSeverity = (dropoffRate: number) => {
    if (dropoffRate > 50) return { color: 'text-red-600 bg-red-50', severity: 'Critical' };
    if (dropoffRate > 30) return { color: 'text-orange-600 bg-orange-50', severity: 'High' };
    if (dropoffRate > 15) return { color: 'text-yellow-600 bg-yellow-50', severity: 'Medium' };
    return { color: 'text-green-600 bg-green-50', severity: 'Low' };
  };

  const selectedSegmentCopy = segmentDescriptions[selectedSegment] ?? segmentDescriptions.all;

  const averageDropOff = enhancedFunnelData.length
    ? Math.round(
        enhancedFunnelData
          .slice(1)
          .reduce((sum, step) => sum + step.dropoffRate, 0) /
          (enhancedFunnelData.length - 1 || 1)
      )
    : 0;

  const averageTimeToConvert = enhancedFunnelData.length
    ? Math.round(
        enhancedFunnelData.reduce((total, step) => total + step.avgTimeToNext, 0) /
          enhancedFunnelData.length
      )
    : 0;

  const projectedRevenue = Math.round((totalEntries * overallConversion) / 100 * 35);
  const timeframeLabel = timeframeOptions.find((option) => option.value === selectedTimeframe)?.label ?? timeframeOptions[1].label;
  const segmentLabel = segmentOptions.find((option) => option.value === selectedSegment)?.label ?? segmentOptions[0].label;

  return (
    <div className="space-y-6">
      {/* Header with Controls */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-blue-600">
            <Calendar className="h-4 w-4" />
            <span>
              {timeframeLabel} · {segmentLabel}
            </span>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Advanced Funnel Analysis</h2>
            <p className="text-gray-600">Multi-dimensional conversion analysis with actionable insights.</p>
          </div>
          <p className="text-xs text-gray-500">{selectedSegmentCopy}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
            <Calendar className="h-4 w-4 text-gray-500" />
            <select
              value={selectedTimeframe}
              onChange={(e) => setSelectedTimeframe(e.target.value)}
              className="bg-transparent outline-none focus:ring-0"
            >
              {timeframeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
            <Filter className="h-4 w-4 text-gray-500" />
            <select
              value={selectedSegment}
              onChange={(e) => setSelectedSegment(e.target.value)}
              className="bg-transparent outline-none focus:ring-0"
            >
              {segmentOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setComparisonMode(!comparisonMode)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              comparisonMode
                ? 'bg-blue-600 text-white shadow-sm'
                : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Percent className="h-4 w-4" />
            {comparisonMode ? 'Comparing Periods' : 'Compare Periods'}
          </button>

          <button className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>

          <button className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50">
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
      </div>

      {/* Key Metrics Overview */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 pb-2">
            <Users className="h-5 w-5 text-blue-600" />
            <span className="text-sm font-medium text-gray-600">Total Entries</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{totalEntries.toLocaleString()}</div>
          <div className="text-sm text-green-600">{comparisonMode ? '+4.1% vs previous period' : '+12% vs last period'}</div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 pb-2">
            <Target className="h-5 w-5 text-green-600" />
            <span className="text-sm font-medium text-gray-600">Completion Rate</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{overallConversion.toFixed(1)}%</div>
          <div className={`text-sm ${comparisonMode ? 'text-red-600' : 'text-green-600'}`}>
            {comparisonMode ? '-2.3% vs previous period' : '+1.8% vs baseline'}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 pb-2">
            <Clock className="h-5 w-5 text-orange-600" />
            <span className="text-sm font-medium text-gray-600">Avg. Time to Convert</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{formatTime(averageTimeToConvert)}</div>
          <div className="text-sm text-green-600">{comparisonMode ? '-5% vs previous period' : '-8% vs last period'}</div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 pb-2">
            <DollarSign className="h-5 w-5 text-purple-600" />
            <span className="text-sm font-medium text-gray-600">Revenue Impact</span>
          </div>
          <div className="text-2xl font-bold text-gray-900">{`$${projectedRevenue.toLocaleString()}`}</div>
          <div className="text-sm text-green-600">{comparisonMode ? '+15% vs previous period' : '+18% vs last period'}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 pb-2">
            <TrendingDown className="h-5 w-5 text-rose-600" />
            <span className="text-sm font-medium text-gray-600">Average Drop-off</span>
          </div>
          <div className="text-2xl font-bold text-rose-600">{averageDropOff}%</div>
          <p className="text-xs text-gray-500">Monitoring combined attrition across steps to prioritise optimisation.</p>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 pb-2">
            <Target className="h-5 w-5 text-blue-600" />
            <span className="text-sm font-medium text-gray-600">Best Performing Step</span>
          </div>
          {stepWithBestRetention ? (
            <div>
              <p className="text-lg font-semibold text-gray-900">{stepWithBestRetention.name}</p>
              <p className="text-sm text-green-600">{stepWithBestRetention.conversionRate.toFixed(1)}% retention</p>
            </div>
          ) : (
            <p className="text-sm text-gray-500">Add at least two funnel steps to evaluate step performance.</p>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 pb-2">
            <Users className="h-5 w-5 text-indigo-600" />
            <span className="text-sm font-medium text-gray-600">Analysis Mode</span>
          </div>
          <p className="text-lg font-semibold text-gray-900">{comparisonMode ? 'Comparative Review' : 'Single Period Deep Dive'}</p>
          <p className="text-xs text-gray-500">
            {comparisonMode
              ? 'Overlaying historical period to highlight variance across the funnel.'
              : 'Focused exploration of the current timeframe with advanced segmentation.'}
          </p>
        </div>
      </div>

      {/* Enhanced Funnel Visualization */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">Conversion Funnel</h3>
          <div className="flex items-center space-x-4 text-sm text-gray-600">
            <div className="flex items-center space-x-1">
              <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
              <span>Current Period</span>
            </div>
            {comparisonMode && (
              <div className="flex items-center space-x-1">
                <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
                <span>Previous Period</span>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {enhancedFunnelData.map((step, index) => {
            const isLast = index === enhancedFunnelData.length - 1;
            const dropoffSeverity = getDropoffSeverity(step.dropoffRate);
            
            return (
              <div key={step.name} className="relative">
                {/* Main Funnel Step */}
                <div className="flex items-center space-x-6">
                  {/* Step Number and Info */}
                  <div className="flex-shrink-0 w-64">
                    <div className="flex items-center space-x-4 p-4 bg-gray-50 rounded-lg">
                      <div className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-semibold">
                        {index + 1}
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900">{step.name}</h4>
                        <p className="text-sm text-gray-600">{step.users.toLocaleString()} users</p>
                      </div>
                    </div>
                  </div>

                  {/* Funnel Bar Visualization */}
                  <div className="flex-1">
                    <div className="relative">
                      <div className="h-12 bg-gray-100 rounded-lg overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500"
                          style={{ width: `${step.conversionRate}%` }}
                        />
                        {comparisonMode && (
                          <div
                            className="absolute top-0 h-6 bg-gray-400 opacity-60"
                            style={{ width: `${step.conversionRate * 0.9}%` }}
                          />
                        )}
                      </div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-white font-semibold text-sm">
                          {step.conversionRate}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Metrics */}
                  <div className="flex-shrink-0 w-48 text-right">
                    <div className="text-lg font-semibold text-gray-900">
                      {step.conversionRate}%
                    </div>
                    {step.dropoffRate > 0 && (
                      <div className={`text-sm px-2 py-1 rounded-full inline-flex items-center space-x-1 ${dropoffSeverity.color}`}>
                        <TrendingDown className="h-3 w-3" />
                        <span>{step.dropoffRate}% drop-off</span>
                      </div>
                    )}
                    <div className="text-xs text-gray-500 mt-1">
                      Avg. time: {formatTime(step.avgTimeToNext)}
                    </div>
                  </div>
                </div>

                {/* Detailed Breakdown */}
                <div className="mt-4 ml-80 grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Exit Reasons */}
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                    <h5 className="text-sm font-medium text-red-800 mb-2">Top Exit Reasons</h5>
                    <div className="space-y-1">
                      {step.exitReasons.slice(0, 2).map((reason, idx) => (
                        <div key={idx} className="flex justify-between text-xs">
                          <span className="text-red-700">{reason.reason}</span>
                          <span className="text-red-600 font-medium">{reason.percentage}%</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Device Breakdown */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <h5 className="text-sm font-medium text-blue-800 mb-2">Device Performance</h5>
                    <div className="space-y-1">
                      {deviceKeys.map((device) => (
                        <div key={device} className="flex justify-between text-xs">
                          <span className="text-blue-700 capitalize">{device}</span>
                          <span className="text-blue-600 font-medium">{step.deviceBreakdown[device]}%</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Traffic Source Performance */}
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <h5 className="text-sm font-medium text-green-800 mb-2">Best Sources</h5>
                    <div className="space-y-1">
                      {trafficKeys.map((source) => (
                        <div key={source} className="flex justify-between text-xs">
                          <span className="text-green-700 capitalize">{source}</span>
                          <span className="text-green-600 font-medium">{step.conversionBySource[source]}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Connection Arrow */}
                {!isLast && (
                  <div className="flex items-center justify-center my-4">
                    <div className="w-px h-8 bg-gray-300"></div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Actionable Insights Panel */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center space-x-2 mb-4">
          <AlertTriangle className="h-5 w-5 text-orange-600" />
          <h3 className="text-lg font-semibold text-gray-900">Actionable Insights</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900">Critical Issues</h4>
            <div className="space-y-3">
              <div className="flex items-start space-x-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="w-2 h-2 bg-red-500 rounded-full mt-2"></div>
                <div>
                  <p className="text-sm font-medium text-red-800">High Drop-off at Checkout</p>
                  <p className="text-xs text-red-600">40% of users abandon at payment step. Consider simplifying form fields.</p>
                </div>
              </div>
              <div className="flex items-start space-x-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <div className="w-2 h-2 bg-orange-500 rounded-full mt-2"></div>
                <div>
                  <p className="text-sm font-medium text-orange-800">Mobile Conversion Gap</p>
                  <p className="text-xs text-orange-600">Mobile users convert 25% less. Optimize mobile checkout flow.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="font-medium text-gray-900">Optimization Opportunities</h4>
            <div className="space-y-3">
              <div className="flex items-start space-x-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="w-2 h-2 bg-green-500 rounded-full mt-2"></div>
                <div>
                  <p className="text-sm font-medium text-green-800">Strong Organic Performance</p>
                  <p className="text-xs text-green-600">Organic traffic converts 30% better. Increase SEO investment.</p>
                </div>
              </div>
              <div className="flex items-start space-x-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                <div>
                  <p className="text-sm font-medium text-blue-800">Desktop Optimization Success</p>
                  <p className="text-xs text-blue-600">Desktop flow performs well. Apply similar patterns to mobile.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Cohort Analysis */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Funnel Performance by Cohort</h3>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 font-medium text-gray-900">Cohort</th>
                <th className="text-center py-3 px-4 font-medium text-gray-900">Users</th>
                <th className="text-center py-3 px-4 font-medium text-gray-900">Step 1→2</th>
                <th className="text-center py-3 px-4 font-medium text-gray-900">Step 2→3</th>
                <th className="text-center py-3 px-4 font-medium text-gray-900">Step 3→4</th>
                <th className="text-center py-3 px-4 font-medium text-gray-900">Overall</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[
                { cohort: 'This Week', users: 2500, rates: [75, 60, 45, 13.5] },
                { cohort: 'Last Week', users: 2800, rates: [72, 58, 42, 12.8] },
                { cohort: 'Mobile Users', users: 1200, rates: [68, 52, 38, 10.2] },
                { cohort: 'Desktop Users', users: 1800, rates: [82, 68, 52, 16.8] }
              ].map((row, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="py-3 px-4 font-medium text-gray-900">{row.cohort}</td>
                  <td className="py-3 px-4 text-center text-gray-700">{row.users.toLocaleString()}</td>
                  {row.rates.map((rate, rateIndex) => (
                    <td key={rateIndex} className="py-3 px-4 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        rate > 15 ? 'bg-green-100 text-green-800' :
                        rate > 10 ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {rate}%
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      
    </div>
  );
};