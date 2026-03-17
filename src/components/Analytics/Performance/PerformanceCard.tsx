import React from 'react';

interface Thresholds {
  good: number;
  warning: number;
  isLowerBetter: boolean;
}

interface PerformanceCardProps {
  title: string;
  value: string;
  valueNumber: number;
  thresholds: Thresholds;
  subtext?: string;
}

const getStatusColor = (valueNumber: number, thresholds: Thresholds) => {
  const { good, warning, isLowerBetter } = thresholds;
  if (isLowerBetter) {
    if (valueNumber <= good) return { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', dot: 'bg-green-500', label: 'Good' };
    if (valueNumber <= warning) return { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', dot: 'bg-yellow-500', label: 'Needs Improvement' };
    return { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', dot: 'bg-red-500', label: 'Poor' };
  }
  if (valueNumber >= good) return { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', dot: 'bg-green-500', label: 'Good' };
  if (valueNumber >= warning) return { bg: 'bg-yellow-50', border: 'border-yellow-200', text: 'text-yellow-700', dot: 'bg-yellow-500', label: 'Needs Improvement' };
  return { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', dot: 'bg-red-500', label: 'Poor' };
};

export const PerformanceCard: React.FC<PerformanceCardProps> = ({
  title,
  value,
  valueNumber,
  thresholds,
  subtext,
}) => {
  const status = getStatusColor(valueNumber, thresholds);

  return (
    <div className={`rounded-xl border p-4 ${status.bg} ${status.border}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</span>
        <span className={`flex items-center gap-1 text-xs font-medium ${status.text}`}>
          <span className={`inline-block h-2 w-2 rounded-full ${status.dot}`} />
          {status.label}
        </span>
      </div>
      <div className={`text-2xl font-bold ${status.text}`}>{value}</div>
      {subtext && <p className="mt-1 text-xs text-gray-500">{subtext}</p>}
    </div>
  );
};
