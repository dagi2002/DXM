import React from 'react';

interface DataPoint {
  total: number;
  engaged: number;
  index: number;
  day: string;
}

interface ActivityChartProps {
  title: string;
  data: DataPoint[];
  height?: number;
}

export const ActivityChart: React.FC<ActivityChartProps> = ({
  title,
  data,
  height = 280,
}) => {
  const maxValue = Math.max(...data.map((d) => d.total));
  const yStep = Math.ceil(maxValue / 4 / 50) * 50;
  const yMax = yStep * 4;
  const yLabels = [0, yStep, yStep * 2, yStep * 3, yStep * 4];

  const padding = { top: 10, right: 10, bottom: 30, left: 40 };
  const chartWidth = 600;
  const chartHeight = height;
  const innerW = chartWidth - padding.left - padding.right;
  const innerH = chartHeight - padding.top - padding.bottom;

  const xScale = (i: number) => padding.left + (i / (data.length - 1)) * innerW;
  const yScale = (v: number) => padding.top + innerH - (v / yMax) * innerH;

  const toPolyline = (key: 'total' | 'engaged') =>
    data.map((d, i) => `${xScale(i)},${yScale(d[key])}`).join(' ');

  const toAreaPath = (key: 'total' | 'engaged') => {
    const points = data.map((d, i) => `${xScale(i)},${yScale(d[key])}`);
    const first = `${xScale(0)},${yScale(0)}`;
    const last = `${xScale(data.length - 1)},${yScale(0)}`;
    return `M${first} L${points.join(' L')} L${last} Z`;
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <div>
          <h3 className="text-base font-semibold text-gray-900">{title}</h3>
          <p className="text-sm text-gray-500">Last 28 days</p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
            Total Sessions
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-300" />
            Engaged
          </span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        className="w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Horizontal grid lines */}
        {yLabels.map((v) => (
          <line
            key={v}
            x1={padding.left}
            y1={yScale(v)}
            x2={chartWidth - padding.right}
            y2={yScale(v)}
            stroke="#e5e7eb"
            strokeWidth="1"
          />
        ))}

        {/* Y-axis labels */}
        {yLabels.map((v) => (
          <text
            key={v}
            x={padding.left - 6}
            y={yScale(v) + 4}
            textAnchor="end"
            className="fill-gray-400"
            fontSize="11"
          >
            {v}
          </text>
        ))}

        {/* X-axis labels */}
        {data.map((d, i) => {
          if (!d.day) return null;
          return (
            <text
              key={i}
              x={xScale(i)}
              y={chartHeight - 4}
              textAnchor="middle"
              className="fill-gray-400"
              fontSize="10"
            >
              {d.day}
            </text>
          );
        })}

        {/* Area fills */}
        <path d={toAreaPath('total')} fill="#4f46e5" opacity="0.08" />
        <path d={toAreaPath('engaged')} fill="#818cf8" opacity="0.08" />

        {/* Lines */}
        <polyline
          points={toPolyline('total')}
          fill="none"
          stroke="#4f46e5"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <polyline
          points={toPolyline('engaged')}
          fill="none"
          stroke="#a5b4fc"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};
