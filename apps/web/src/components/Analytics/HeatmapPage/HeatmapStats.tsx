import React from 'react';
import { MousePointer, MoveDown, Hand, BarChart2 } from 'lucide-react';

interface ClickedElementStat {
  selector: string;
  count: number;
}

interface HeatmapStatsProps {
  totalClicks: number;
  totalHovers: number;
  averageScrollDepth: number;
  mostClickedElements: ClickedElementStat[];
  sessionsCount: number;
  selectedUrlLabel: string;
  selectedSessionLabel: string;
  isLoading: boolean;
  activeType: 'click' | 'scroll' | 'hover';
}

/**
 * Converts a raw CSS selector like "A.rounded-full.px-4" into a readable label.
 * e.g. "A.btn" → "<a> link (.btn)"
 */
const prettifySelector = (selector: string): string => {
  const tag = selector.match(/^([A-Z]+)/)?.[1]?.toLowerCase() ?? '';
  const classes = selector.match(/\.([^.]+)/g)?.slice(0, 2).map(c => c) ?? [];
  if (!tag) return selector.slice(0, 40);
  const tagLabel = tag === 'a' ? '<a> link' : tag === 'button' ? '<button>' : tag === 'div' ? '<div>' : tag === 'main' ? '<main>' : `<${tag}>`;
  return classes.length ? `${tagLabel} ${classes.join('')}` : tagLabel;
};

const modeConfig = {
  click: {
    icon: MousePointer,
    label: 'Click Analysis',
    description: 'Where users click most often',
    primaryStat: (total: number) => ({ label: 'Total Clicks', value: total.toString() }),
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-100',
  },
  scroll: {
    icon: MoveDown,
    label: 'Scroll Analysis',
    description: 'How far users scroll down pages',
    primaryStat: (_total: number, depth: number) => ({ label: 'Avg Scroll Depth', value: `${Math.round(depth)}px` }),
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-100',
  },
  hover: {
    icon: Hand,
    label: 'Hover Analysis',
    description: 'Where users pause and hover',
    primaryStat: (total: number) => ({ label: 'Total Hovers', value: total.toString() }),
    color: 'text-violet-600',
    bgColor: 'bg-violet-50',
    borderColor: 'border-violet-100',
  },
};

const intensityLevels = [
  { label: 'High', range: '80%+', hex: 'rgba(249,115,22,0.85)' },
  { label: 'Medium', range: '40–80%', hex: 'rgba(253,186,116,0.75)' },
  { label: 'Low', range: '0–40%', hex: 'rgba(254,215,170,0.60)' },
];

export const HeatmapStats: React.FC<HeatmapStatsProps> = ({
  totalClicks,
  totalHovers,
  averageScrollDepth,
  mostClickedElements,
  sessionsCount,
  selectedUrlLabel,
  isLoading,
  activeType,
}) => {
  const mode = modeConfig[activeType];
  const ModeIcon = mode.icon;

  const primaryStatTotal = activeType === 'hover' ? totalHovers : totalClicks;
  const primaryStat = mode.primaryStat(primaryStatTotal, averageScrollDepth);

  const hasNoData = !isLoading && (
    (activeType === 'click' && totalClicks === 0) ||
    (activeType === 'hover' && totalHovers === 0) ||
    (activeType === 'scroll' && averageScrollDepth === 0)
  );

  return (
    <aside className="space-y-4">
      {/* Mode header */}
      <div className={`rounded-2xl border ${mode.borderColor} ${mode.bgColor} p-4`}>
        <div className="flex items-center gap-2">
          <ModeIcon className={`h-4 w-4 ${mode.color}`} />
          <p className={`text-xs font-bold uppercase tracking-[0.18em] ${mode.color}`}>{mode.label}</p>
        </div>
        <p className="mt-1.5 text-sm text-surface-600">{mode.description}</p>

        {/* Primary stat */}
        <div className="mt-4 rounded-xl border border-white/70 bg-white/80 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-surface-500">{primaryStat.label}</p>
          <p className={`mt-1 text-3xl font-bold ${mode.color}`}>
            {isLoading ? '—' : primaryStat.value}
          </p>
          <p className="mt-1 text-xs text-surface-500">
            {isLoading ? 'Loading…' : `${sessionsCount} session${sessionsCount === 1 ? '' : 's'} · ${selectedUrlLabel}`}
          </p>
        </div>

        {/* No data notice */}
        {hasNoData && (
          <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
            No {activeType} data recorded yet — this populates as sessions are tracked.
          </div>
        )}
      </div>

      {/* Intensity legend */}
      <div className="rounded-2xl border border-surface-200 bg-white p-4">
        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-surface-500">Intensity Legend</p>
        <div className="space-y-2.5">
          {intensityLevels.map(({ label, range, hex }) => (
            <div key={label} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-5 w-8 rounded-md" style={{ backgroundColor: hex }} />
                <span className="text-sm font-medium text-surface-700">{label}</span>
              </div>
              <span className="rounded-full border border-surface-200 bg-surface-50 px-2 py-0.5 text-xs text-surface-500">{range}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Click targets — only shown in click mode */}
      {activeType === 'click' && (
        <div className="rounded-2xl border border-surface-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <BarChart2 className="h-3.5 w-3.5 text-surface-400" />
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-surface-500">Most Clicked Elements</p>
          </div>

          {isLoading ? (
            <p className="text-sm text-surface-400">Loading…</p>
          ) : mostClickedElements.length ? (
            <ul className="space-y-2">
              {mostClickedElements.map((item, idx) => (
                <li key={item.selector} className="flex items-center justify-between gap-2 rounded-xl border border-surface-100 bg-surface-50 px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-100 text-[10px] font-bold text-orange-600">
                      {idx + 1}
                    </span>
                    <span className="truncate text-xs text-surface-700" title={item.selector}>
                      {prettifySelector(item.selector)}
                    </span>
                  </div>
                  <span className="shrink-0 rounded-full bg-orange-50 px-2 py-0.5 text-xs font-semibold text-orange-700">
                    {item.count}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-surface-400">No click targets recorded for this selection.</p>
          )}
        </div>
      )}

      {/* Scroll depth card — only shown in scroll mode */}
      {activeType === 'scroll' && !isLoading && (
        <div className="rounded-2xl border border-surface-200 bg-white p-4">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-surface-500">Depth Bands</p>
          {averageScrollDepth === 0 ? (
            <p className="text-xs text-surface-400">No scroll data for the current selection.</p>
          ) : (
            <div className="space-y-2">
              {['Above fold', 'Mid-page', 'Deep content'].map((band, i) => {
                const widths = [90, 60, 35];
                return (
                  <div key={band}>
                    <div className="mb-1 flex items-center justify-between text-xs text-surface-500">
                      <span>{band}</span>
                      <span>{widths[i]}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-100">
                      <div className="h-full rounded-full bg-blue-400" style={{ width: `${widths[i]}%` }} />
                    </div>
                  </div>
                );
              })}
              <p className="mt-2 text-xs text-surface-400">Approximate distribution based on session avg.</p>
            </div>
          )}
        </div>
      )}
    </aside>
  );
};
