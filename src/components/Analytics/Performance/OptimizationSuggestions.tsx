import React from 'react';
import { mockPerformanceData } from '../../../data/mockData';

type PerformanceData = typeof mockPerformanceData;

type Suggestion = {
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
};

const impactStyles: Record<Suggestion['impact'], string> = {
  high: 'text-red-600 bg-red-50',
  medium: 'text-amber-600 bg-amber-50',
  low: 'text-emerald-600 bg-emerald-50'
};

const impactCopy: Record<Suggestion['impact'], string> = {
  high: 'High impact',
  medium: 'Medium impact',
  low: 'Quick win'
};

const buildSuggestions = (data: PerformanceData): Suggestion[] => {
  const suggestions: Suggestion[] = [];
  const { coreWebVitals, resourceUsage, errorRate, apiLatency } = data;

  if (coreWebVitals.lcp.value > 2.5) {
    suggestions.push({
      title: 'Optimize hero and largest content elements',
      description:
        'Serve hero images in modern formats, defer non-critical scripts, and prioritize above-the-fold content to reduce LCP.',
      impact: 'high'
    });
  }

  if (coreWebVitals.inp.value > 200) {
    suggestions.push({
      title: 'Reduce interaction latency',
      description:
        'Break up long tasks, leverage requestIdleCallback, and avoid heavy synchronous work on user input handlers.',
      impact: 'high'
    });
  }

  if (coreWebVitals.cls.value > 0.1) {
    suggestions.push({
      title: 'Stabilize layout shifts',
      description:
        'Reserve space for media, avoid inserting UI above existing content, and preload critical fonts.',
      impact: 'medium'
    });
  }

  const heaviestResource = resourceUsage.reduce((max, current) =>
    current.size > max.size ? current : max
  );

  if (heaviestResource.type === 'image' && heaviestResource.size > 1500) {
    suggestions.push({
      title: 'Compress and lazy-load imagery',
      description:
        'Adopt responsive image srcsets, deliver AVIF/WebP assets, and defer off-screen media to decrease payload size.',
      impact: 'medium'
    });
  }

  if (errorRate > 0.5) {
    suggestions.push({
      title: 'Investigate rising error rate',
      description:
        'Review recent deployments, capture stack traces, and implement guardrails for unstable APIs to improve reliability.',
      impact: 'high'
    });
  }

  if (apiLatency > 300) {
    suggestions.push({
      title: 'Accelerate API responses',
      description:
        'Introduce caching, batch network calls, and profile slow endpoints to ensure sub-300ms server responses.',
      impact: 'medium'
    });
  }

  if (suggestions.length === 0) {
    suggestions.push({
      title: 'All systems healthy',
      description: 'Keep monitoring trends to catch regressions early. No immediate optimizations detected from mock data.',
      impact: 'low'
    });
  }

  return suggestions;
};

interface OptimizationSuggestionsProps {
  performanceData: PerformanceData;
}

export const OptimizationSuggestions: React.FC<OptimizationSuggestionsProps> = ({ performanceData }) => {
  const suggestions = buildSuggestions(performanceData);

  return (
    <section className="bg-white rounded-xl border border-gray-100 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Optimization Suggestions</h3>
          <p className="text-sm text-gray-600">
            Actionable recommendations generated from mock thresholds to simulate PageSpeed-style insights.
          </p>
        </div>
      </div>
      <div className="space-y-4">
        {suggestions.map((suggestion) => (
          <div key={suggestion.title} className="border border-gray-100 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-gray-900">{suggestion.title}</h4>
              <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${impactStyles[suggestion.impact]}`}>
                {impactCopy[suggestion.impact]}
              </span>
            </div>
            <p className="text-sm text-gray-600">{suggestion.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
};

export default OptimizationSuggestions;