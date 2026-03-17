import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { Metric } from '../../types';

interface MetricCardProps {
  metric: Metric;
}

const getStatusColor = (metric: Metric) => {
  const name = metric.name.toLowerCase();

  // Bounce rate — lower is better
  if (name.includes('bounce')) {
    const val = typeof metric.value === 'string' ? parseFloat(metric.value) : metric.value;
    if (val <= 40) return 'border-l-primary-500';
    if (val <= 60) return 'border-l-accent-500';
    return 'border-l-red-500';
  }

  // Conversion — higher is better
  if (name.includes('conversion')) {
    const val = typeof metric.value === 'string' ? parseFloat(metric.value) : metric.value;
    if (val >= 3) return 'border-l-primary-500';
    if (val >= 1) return 'border-l-accent-500';
    return 'border-l-red-500';
  }

  // Default — use trend
  if (metric.trend === 'up') return 'border-l-primary-500';
  if (metric.trend === 'down') return 'border-l-red-500';
  return 'border-l-surface-300';
};

export const MetricCard: React.FC<MetricCardProps> = ({ metric }) => {
  const getTrendIcon = () => {
    switch (metric.trend) {
      case 'up':
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'down':
        return <TrendingDown className="h-4 w-4 text-red-500" />;
      default:
        return <Minus className="h-4 w-4 text-surface-400" />;
    }
  };

  const getTrendColor = () => {
    switch (metric.trend) {
      case 'up':
        return 'text-green-600';
      case 'down':
        return 'text-red-600';
      default:
        return 'text-surface-500';
    }
  };

  return (
    <div className={`bg-white rounded-xl border border-surface-200 border-l-4 ${getStatusColor(metric)} p-5 hover:shadow-md transition-shadow duration-200`}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-surface-500">{metric.name}</h3>
        {getTrendIcon()}
      </div>

      <div className="flex items-end space-x-2">
        <p className="text-2xl font-bold text-surface-900">{metric.value}</p>
        <div className={`flex items-center text-sm ${getTrendColor()}`}>
          <span>{Math.abs(metric.change)}%</span>
        </div>
      </div>

      <p className="text-xs text-surface-400 mt-1">
        {metric.trend === 'up' ? '↑' : metric.trend === 'down' ? '↓' : '—'} vs last period
      </p>
    </div>
  );
};
