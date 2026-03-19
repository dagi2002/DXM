import React from 'react';
import {
  ChevronDown,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Smartphone,
} from 'lucide-react';
import {
  mockInsightCards,
  mockEngagementTrend,
  mockVisitorComparison,
  mockDropOffPages,
} from '../../data/mockData';

const iconMap: Record<string, React.ReactNode> = {
  TrendingUp: <TrendingUp className="w-5 h-5" />,
  AlertTriangle: <AlertTriangle className="w-5 h-5" />,
  Smartphone: <Smartphone className="w-5 h-5" />,
};

const InsightsView: React.FC = () => {
  // Engagement chart helpers
  const engScores = mockEngagementTrend.map((d) => d.score);
  const engMin = Math.min(...engScores) - 5;
  const engMax = Math.max(...engScores) + 5;
  const engRange = engMax - engMin;
  const chartW = 500;
  const chartH = 220;
  const padX = 40;
  const padY = 20;
  const innerW = chartW - padX * 2;
  const innerH = chartH - padY * 2;

  const engPoints = mockEngagementTrend.map((d, i) => {
    const x = padX + (i / (mockEngagementTrend.length - 1)) * innerW;
    const y = padY + (1 - (d.score - engMin) / engRange) * innerH;
    return `${x},${y}`;
  });
  const areaPath = [
    `M${padX},${padY + innerH}`,
    ...mockEngagementTrend.map((d, i) => {
      const x = padX + (i / (mockEngagementTrend.length - 1)) * innerW;
      const y = padY + (1 - (d.score - engMin) / engRange) * innerH;
      return `L${x},${y}`;
    }),
    `L${padX + innerW},${padY + innerH}`,
    'Z',
  ].join(' ');

  // Visitor chart helpers
  const visMax =
    Math.max(...mockVisitorComparison.map((d) => d.newVisitors + d.returning)) * 1.1;
  const barChartW = 500;
  const barChartH = 220;
  const bPadX = 50;
  const bPadY = 20;
  const bInnerW = barChartW - bPadX * 2;
  const bInnerH = barChartH - bPadY * 2;
  const groupW = bInnerW / mockVisitorComparison.length;
  const barW = groupW * 0.3;

  return (
    <div className="p-6 md:p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Insights</h1>
          <p className="text-gray-500 mt-1">
            Behavioral patterns and trends over time
          </p>
        </div>
        <button className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-700 shadow-sm hover:bg-gray-50">
          Last 30 days
          <ChevronDown className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      {/* Insight Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {mockInsightCards.map((card) => {
          const isPositive = card.trend === 'up' && card.change > 0;
          const isNegative = card.trend === 'up' && card.icon === 'AlertTriangle';
          const isStable = card.trend === 'stable';
          const iconBg = isNegative
            ? 'bg-orange-50 text-orange-500'
            : 'bg-emerald-50 text-emerald-600';
          const badgeCls = isStable
            ? 'bg-gray-100 text-gray-500'
            : isNegative
              ? 'bg-red-50 text-red-500'
              : 'bg-emerald-50 text-emerald-600';
          const changeLabel = isStable
            ? '~0%'
            : `+${card.change}%`;

          return (
            <div
              key={card.id}
              className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm flex items-start gap-4"
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${iconBg}`}
              >
                {iconMap[card.icon] || <TrendingUp className="w-5 h-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900">{card.title}</p>
                <p className="text-sm text-gray-500 mt-1">{card.description}</p>
              </div>
              <span
                className={`text-xs font-medium rounded-full px-2.5 py-1 shrink-0 ${badgeCls}`}
              >
                {changeLabel}
              </span>
            </div>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Engagement Score Trend */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-base font-semibold text-gray-900">
            Engagement Score Trend
          </h3>
          <p className="text-sm text-gray-500 mt-0.5 mb-4">
            Average engagement score by month
          </p>
          <svg
            viewBox={`0 0 ${chartW} ${chartH}`}
            className="w-full"
            preserveAspectRatio="xMidYMid meet"
          >
            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
              const y = padY + (1 - frac) * innerH;
              const label = Math.round(engMin + frac * engRange);
              return (
                <g key={frac}>
                  <line
                    x1={padX}
                    y1={y}
                    x2={padX + innerW}
                    y2={y}
                    stroke="#f3f4f6"
                    strokeWidth="1"
                  />
                  <text
                    x={padX - 8}
                    y={y + 4}
                    textAnchor="end"
                    className="text-xs"
                    fill="#9ca3af"
                    fontSize="10"
                  >
                    {label}
                  </text>
                </g>
              );
            })}
            {/* Area */}
            <path d={areaPath} fill="#e0e7ff" opacity="0.5" />
            {/* Line */}
            <polyline
              points={engPoints.join(' ')}
              fill="none"
              stroke="#4f46e5"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* X labels */}
            {mockEngagementTrend.map((d, i) => {
              const x =
                padX + (i / (mockEngagementTrend.length - 1)) * innerW;
              return (
                <text
                  key={d.month}
                  x={x}
                  y={chartH - 2}
                  textAnchor="middle"
                  fill="#9ca3af"
                  fontSize="10"
                >
                  {d.month}
                </text>
              );
            })}
          </svg>
        </div>

        {/* New vs Returning Visitors */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-base font-semibold text-gray-900">
            New vs Returning Visitors
          </h3>
          <p className="text-sm text-gray-500 mt-0.5 mb-4">
            Weekly visitor breakdown
          </p>
          <svg
            viewBox={`0 0 ${barChartW} ${barChartH}`}
            className="w-full"
            preserveAspectRatio="xMidYMid meet"
          >
            {/* Grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
              const y = bPadY + (1 - frac) * bInnerH;
              const label = Math.round(frac * visMax);
              return (
                <g key={frac}>
                  <line
                    x1={bPadX}
                    y1={y}
                    x2={bPadX + bInnerW}
                    y2={y}
                    stroke="#f3f4f6"
                    strokeWidth="1"
                  />
                  <text
                    x={bPadX - 8}
                    y={y + 4}
                    textAnchor="end"
                    fill="#9ca3af"
                    fontSize="10"
                  >
                    {label >= 1000
                      ? `${(label / 1000).toFixed(1)}k`
                      : label}
                  </text>
                </g>
              );
            })}
            {/* Bars */}
            {mockVisitorComparison.map((d, i) => {
              const gx = bPadX + i * groupW + groupW / 2;
              const newH = (d.newVisitors / visMax) * bInnerH;
              const retH = (d.returning / visMax) * bInnerH;
              return (
                <g key={d.week}>
                  <rect
                    x={gx - barW - 1}
                    y={bPadY + bInnerH - newH}
                    width={barW}
                    height={newH}
                    rx="3"
                    fill="#4f46e5"
                  />
                  <rect
                    x={gx + 1}
                    y={bPadY + bInnerH - retH}
                    width={barW}
                    height={retH}
                    rx="3"
                    fill="#a5b4fc"
                  />
                  <text
                    x={gx}
                    y={barChartH - 2}
                    textAnchor="middle"
                    fill="#9ca3af"
                    fontSize="10"
                  >
                    {d.week}
                  </text>
                </g>
              );
            })}
          </svg>
          <div className="flex items-center gap-4 mt-3">
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-3 h-3 rounded-sm bg-indigo-600" />
              New
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-3 h-3 rounded-sm bg-indigo-300" />
              Returning
            </div>
          </div>
        </div>
      </div>

      {/* Drop-off Table */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900">
          Consistent Drop-off Pages
        </h3>
        <p className="text-sm text-gray-500 mt-0.5 mb-4">
          Pages that regularly lose visitors
        </p>
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
                  #
                </th>
                <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Page
                </th>
                <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider w-48">
                  &nbsp;
                </th>
                <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                  Rate
                </th>
                <th className="px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider w-20">
                  Trend
                </th>
              </tr>
            </thead>
            <tbody>
              {mockDropOffPages.map((row, idx) => (
                <tr
                  key={row.page}
                  className="border-b border-gray-100 last:border-b-0"
                >
                  <td className="px-5 py-4 text-sm text-gray-400">{idx + 1}</td>
                  <td className="px-5 py-4 font-mono text-sm text-gray-900">
                    {row.page}
                  </td>
                  <td className="px-5 py-4">
                    <div className="h-2 bg-red-100 rounded-full overflow-hidden">
                      <div
                        className="h-2 bg-red-400 rounded-full"
                        style={{ width: `${row.rate}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm font-semibold text-gray-900">
                    {row.rate}%
                  </td>
                  <td className="px-5 py-4">
                    {row.trend === 'up' && (
                      <TrendingUp className="w-4 h-4 text-red-500" />
                    )}
                    {row.trend === 'down' && (
                      <TrendingDown className="w-4 h-4 text-emerald-600" />
                    )}
                    {row.trend === 'stable' && (
                      <Minus className="w-4 h-4 text-gray-400" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default InsightsView;
