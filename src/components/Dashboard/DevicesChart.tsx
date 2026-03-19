import React from 'react';
import { mockDeviceBreakdown } from '../../data/mockData';

const colorClasses = ['text-indigo-600', 'text-indigo-400', 'text-indigo-200'];
const bgClasses = ['bg-indigo-600', 'bg-indigo-400', 'bg-indigo-200'];
const strokeColors = ['#4f46e5', '#818cf8', '#c7d2fe'];

export const DevicesChart: React.FC = () => {
  const total = mockDeviceBreakdown.reduce((s, d) => s + d.share, 0);
  const r = 60;
  const circumference = 2 * Math.PI * r;

  let offset = 0;
  const segments = mockDeviceBreakdown.map((d, i) => {
    const dash = (d.share / total) * circumference;
    const gap = circumference - dash;
    const seg = {
      dasharray: `${dash} ${gap}`,
      dashoffset: -offset,
      color: strokeColors[i],
    };
    offset += dash;
    return seg;
  });

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <h3 className="text-base font-semibold text-gray-900 mb-4">Devices</h3>

      <div className="flex justify-center mb-5">
        <svg width="160" height="160" viewBox="0 0 160 160">
          {segments.map((seg, i) => (
            <circle
              key={i}
              cx="80"
              cy="80"
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth="24"
              strokeDasharray={seg.dasharray}
              strokeDashoffset={seg.dashoffset}
              transform="rotate(-90 80 80)"
            />
          ))}
        </svg>
      </div>

      <div className="space-y-2">
        {mockDeviceBreakdown.map((d, i) => (
          <div key={d.device} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-sm ${bgClasses[i]}`} />
              <span className="text-gray-700">{d.device}</span>
            </span>
            <span className="text-gray-900 font-medium">{d.share}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};
