import React from 'react';
import { TrendingUp, TrendingDown, Users, Clock, MousePointer2, Eye } from 'lucide-react';

interface MetricCardProps {
  name: string;
  value: string;
  change: number;
  trend: 'up' | 'down' | 'stable';
  icon: string;
}

const iconMap: Record<string, React.FC<{ className?: string }>> = {
  Users,
  Clock,
  MousePointer: MousePointer2,
  Eye,
};

export const MetricCard: React.FC<MetricCardProps> = ({ name, value, change, trend, icon }) => {
  const IconComponent = iconMap[icon] || Users;
  const isPositive = change >= 0;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <div className="bg-orange-50 p-2 rounded-full">
          <IconComponent className="w-5 h-5 text-orange-500" />
        </div>
        <div className={`flex items-center gap-1 text-sm ${isPositive ? 'text-emerald-600' : 'text-red-500'}`}>
          {isPositive ? (
            <TrendingUp className="w-4 h-4" />
          ) : (
            <TrendingDown className="w-4 h-4" />
          )}
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <div className="flex items-center gap-1.5 mt-1">
        <span className={`text-sm font-medium ${isPositive ? 'text-emerald-600' : 'text-red-500'}`}>
          {isPositive ? '+' : ''}{change}%
        </span>
        <span className="text-sm text-gray-400">vs last week</span>
      </div>
      <p className="text-sm text-gray-500 mt-1">{name}</p>
    </div>
  );
};
