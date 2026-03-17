import React from 'react';

interface Thresholds {
  good: number;
  warning: number;
  isLowerBetter: boolean;
}

interface PerformanceGaugeProps {
  value: number;
  label: string;
  unit: string;
  description: string;
  thresholds: Thresholds;
}

const getStatus = (value: number, thresholds: Thresholds) => {
  const { good, warning, isLowerBetter } = thresholds;
  if (isLowerBetter) {
    if (value <= good) return { label: 'Good', color: '#22c55e', track: 'bg-green-100', fill: 'bg-green-500' };
    if (value <= warning) return { label: 'Needs Improvement', color: '#eab308', track: 'bg-yellow-100', fill: 'bg-yellow-500' };
    return { label: 'Poor', color: '#ef4444', track: 'bg-red-100', fill: 'bg-red-500' };
  }
  if (value >= good) return { label: 'Good', color: '#22c55e', track: 'bg-green-100', fill: 'bg-green-500' };
  if (value >= warning) return { label: 'Needs Improvement', color: '#eab308', track: 'bg-yellow-100', fill: 'bg-yellow-500' };
  return { label: 'Poor', color: '#ef4444', track: 'bg-red-100', fill: 'bg-red-500' };
};

// Maps value to a 0–100% fill against a max reference (4× the "good" threshold).
const toPercent = (value: number, good: number) =>
  Math.min(Math.round((value / (good * 4)) * 100), 100);

export const PerformanceGauge: React.FC<PerformanceGaugeProps> = ({
  value,
  label,
  unit,
  description,
  thresholds,
}) => {
  const status = getStatus(value, thresholds);
  const fillPercent = toPercent(value, thresholds.good);

  // SVG arc gauge parameters
  const radius = 80;
  const cx = 110;
  const cy = 110;
  const circumference = Math.PI * radius; // half circle
  const strokeDashoffset = circumference - (fillPercent / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-gray-100 bg-white p-6 shadow-sm h-full">
      <h3 className="mb-1 text-base font-semibold text-gray-900">{label}</h3>
      <p className="mb-4 text-xs text-gray-500 text-center">{description}</p>

      <div className="relative flex items-center justify-center" style={{ width: 220, height: 120 }}>
        <svg width="220" height="120" viewBox="0 0 220 120" fill="none">
          {/* Background track */}
          <path
            d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
            stroke="#e5e7eb"
            strokeWidth="16"
            strokeLinecap="round"
            fill="none"
          />
          {/* Value arc */}
          <path
            d={`M ${cx - radius} ${cy} A ${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`}
            stroke={status.color}
            strokeWidth="16"
            strokeLinecap="round"
            strokeDasharray={`${circumference}`}
            strokeDashoffset={strokeDashoffset}
            fill="none"
            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          />
        </svg>
        <div className="absolute bottom-0 flex flex-col items-center">
          <span className="text-3xl font-bold text-gray-900">
            {value.toFixed(unit === 's' ? 1 : 0)}
            <span className="text-base font-medium text-gray-500 ml-1">{unit}</span>
          </span>
          <span
            className="mt-1 rounded-full px-3 py-0.5 text-xs font-semibold"
            style={{ background: `${status.color}20`, color: status.color }}
          >
            {status.label}
          </span>
        </div>
      </div>

      {/* Threshold legend */}
      <div className="mt-4 flex items-center gap-6 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
          Good ≤ {thresholds.good}{unit}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-yellow-500" />
          Warning ≤ {thresholds.warning}{unit}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
          Poor
        </span>
      </div>
    </div>
  );
};
