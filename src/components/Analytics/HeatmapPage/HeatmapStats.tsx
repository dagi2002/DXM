import React from 'react';

interface ClickedElementStat {
  selector: string;
  count: number;
}

interface HeatmapStatsProps {
  totalClicks: number;
  averageScrollDepth: number;
  totalHovers: number;
  mostClickedElements: ClickedElementStat[];
  sessionsCount: number;
  selectedUrlLabel: string;
  selectedSessionLabel: string;
  isLoading: boolean;
  activeType: 'click' | 'scroll' | 'hover';
}

export const HeatmapStats: React.FC<HeatmapStatsProps> = ({
  totalClicks,
  totalHovers,
  averageScrollDepth,
  mostClickedElements,
  sessionsCount,
  selectedUrlLabel,
  selectedSessionLabel,
  isLoading,
  activeType,
}) => {
    const primaryLabel = activeType === 'hover' ? 'Total Hovers' : 'Total Clicks';
  const primaryValue = isLoading
    ? '—'
    : activeType === 'hover'
      ? totalHovers
      : totalClicks;

  return (
    <aside className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Intensity Legend</h3>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-600">High</span>
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-orange-500" />
              <span className="text-xs text-gray-400">80%+</span>

            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Medium</span>
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-orange-300" />
              <span className="text-xs text-gray-400">40-80%</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Low</span>
            <div className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full bg-orange-200" />
              <span className="text-xs text-gray-400">0-40%</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">Summary</h3>
            <p className="text-xs text-gray-500">{isLoading ? 'Loading session data…' : `${sessionsCount} session${sessionsCount === 1 ? '' : 's'} analysed`}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">URL Filter</p>
            <p className="text-sm font-medium text-gray-900 truncate max-w-[160px]">{selectedUrlLabel}</p>
            <p className="mt-1 text-xs text-gray-500">Session Filter</p>
            <p className="text-sm font-medium text-gray-900 truncate max-w-[160px]">{selectedSessionLabel}</p>
          
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-4">
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
            <dt className="text-xs font-medium text-blue-600 uppercase tracking-wide">{primaryLabel}</dt>
            <dd className="text-2xl font-semibold text-blue-700">{primaryValue}</dd>
          </div>
          <div className="bg-orange-50 border border-orange-100 rounded-lg p-4">
            <dt className="text-xs font-medium text-orange-600 uppercase tracking-wide">Avg. Scroll Depth</dt>
            <dd className="text-2xl font-semibold text-orange-700">{isLoading ? '—' : `${Math.round(averageScrollDepth)}px`}</dd>
          </div>
        </dl>

        {activeType === 'hover' && (
          <div className="mt-4 rounded-lg bg-slate-50 border border-dashed border-slate-200 px-4 py-3 text-sm text-gray-600">
            Hover hotspots highlight areas where visitors linger their cursor. Combine with click data to understand intent and friction.
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-1">Most Clicked Elements</h3>
        <p className="text-xs text-gray-500 mb-3">Top selectors ranked by interaction volume</p>
        {isLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
          
        ) : mostClickedElements.length ? (
          <ul className="space-y-3">
            {mostClickedElements.map((item) => (
              <li key={item.selector} className="flex items-center justify-between">
                <span className="text-sm text-gray-700 truncate pr-2" title={item.selector}>
                  {item.selector}
                </span>
                <span className="text-sm font-semibold text-gray-900">{item.count}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-sm text-gray-500">
            No click targets recorded for the current selection.
          </div>
        )}
      </div>
    </aside>
  );
};
