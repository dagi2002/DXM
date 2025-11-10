import React from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Metric } from '../../types';

interface MetricCardProps {
  metric: Metric;
}

export const MetricCard: React.FC<MetricCardProps> = ({ metric }) => {
  const getTrendIcon = () => {
    switch (metric.trend) {
      case 'up':
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'down':
        return <TrendingDown className="h-4 w-4 text-red-500" />;
      default:
        return <Minus className="h-4 w-4 text-gray-400" />;
    }
  };

  const getTrendColor = () => {
    switch (metric.trend) {
      case 'up':
        return 'text-green-600';
      case 'down':
        return 'text-red-600';
      default:
        return 'text-gray-500';
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow duration-200">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium text-gray-600">{metric.name}</h3>
        {getTrendIcon()}
      </div>
      
      <div className="flex items-end space-x-2">
        <p className="text-2xl font-bold text-gray-900">{metric.value}</p>
        <div className={`flex items-center text-sm ${getTrendColor()}`}>
          <span>{Math.abs(metric.change)}%</span>
        </div>
      </div>
      
      <p className="text-xs text-gray-500 mt-1">
        {metric.trend === 'up' ? 'Increase' : metric.trend === 'down' ? 'Decrease' : 'No change'} from last period
      </p>
    </div>
  );
};