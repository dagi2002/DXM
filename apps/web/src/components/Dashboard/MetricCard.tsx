import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { Metric } from '../../types';

interface MetricCardProps {
  metric: Metric;
}

const getTone = (metric: Metric): 'positive' | 'negative' | 'neutral' => {
  const name = metric.name.toLowerCase();

  if (name.includes('bounce')) {
    const val = typeof metric.value === 'string' ? parseFloat(metric.value) : metric.value;
    if (val <= 40) return 'positive';
    if (val <= 60) return 'neutral';
    return 'negative';
  }

  if (name.includes('conversion')) {
    const val = typeof metric.value === 'string' ? parseFloat(metric.value) : metric.value;
    if (val >= 3) return 'positive';
    if (val >= 1) return 'neutral';
    return 'negative';
  }

  if (metric.trend === 'up') return 'positive';
  if (metric.trend === 'down') return 'negative';
  return 'neutral';
};

const toneConfig = {
  positive: {
    bar: 'bg-emerald-500',
    badge: 'bg-emerald-50 text-emerald-700',
    icon: <TrendingUp className="h-3.5 w-3.5" />,
  },
  negative: {
    bar: 'bg-red-500',
    badge: 'bg-red-50 text-red-700',
    icon: <TrendingDown className="h-3.5 w-3.5" />,
  },
  neutral: {
    bar: 'bg-surface-300',
    badge: 'bg-surface-100 text-surface-600',
    icon: <Minus className="h-3.5 w-3.5" />,
  },
};

export const MetricCard: React.FC<MetricCardProps> = ({ metric }) => {
  const tone = getTone(metric);
  const config = toneConfig[tone];

  return (
    <div className="group relative overflow-hidden rounded-[22px] border border-surface-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className={`absolute left-0 top-0 h-1 w-full ${config.bar}`} />
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-surface-500">{metric.name}</h3>
        <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${config.badge}`}>
          {config.icon}
          {Math.abs(metric.change)}%
        </span>
      </div>
      <p className="mt-3 text-3xl font-bold text-surface-900">{metric.value}</p>
      <p className="mt-1.5 text-xs text-surface-400">
        {metric.trend === 'up' ? '+' : metric.trend === 'down' ? '−' : ''}
        {Math.abs(metric.change)}% vs last period
      </p>
    </div>
  );
};
