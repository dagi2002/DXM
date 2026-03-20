import React, { useEffect, useMemo, useState } from 'react';
import { Eye, MousePointer, Move } from 'lucide-react';
import type { HeatmapReadModel, SessionHeatmapPoint, SessionRecording } from '../../../types';
import { fetchJson } from '../../../lib/api';
import { HeatmapCanvas } from './HeatmapCanvas';
import { HeatmapStats } from './HeatmapStats';

const FALLBACK_SCREEN_WIDTH = 1280;
const FALLBACK_SCREEN_HEIGHT = 720;

interface NormalisedClickEvent {
  x: number;
  y: number;
  weight?: number;
}

interface NormalisedScrollEvent {
  depth: number;
  weight?: number;
}

interface NormalisedHoverEvent {
  x: number;
  y: number;
  weight?: number;
}

const EMPTY_HEATMAP: HeatmapReadModel = {
  sessions: [],
  points: [],
};

const normaliseClick = (
  point: Pick<SessionHeatmapPoint, 'x' | 'y' | 'weight'>,
  width: number,
  height: number,
): NormalisedClickEvent | null => {
  if (typeof point.x !== 'number' || typeof point.y !== 'number' || width === 0 || height === 0) {
    return null;
  }

  return {
    x: point.x / width,
    y: point.y / height,
    weight: point.weight,
  };
};

const normaliseHover = (
  point: Pick<SessionHeatmapPoint, 'x' | 'y' | 'weight' | 'phase'>,
  width: number,
  height: number,
): NormalisedHoverEvent | null => {
  if (typeof point.x !== 'number' || typeof point.y !== 'number' || width === 0 || height === 0) {
    return null;
  }

  return {
    x: point.x / width,
    y: point.y / height,
    weight: point.phase === 'leave' ? 0.6 : point.weight,
  };
};

export const HeatmapView: React.FC = () => {
  const [heatmapData, setHeatmapData] = useState<HeatmapReadModel>(EMPTY_HEATMAP);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<'click' | 'scroll' | 'hover'>('click');
  const [selectedUrl, setSelectedUrl] = useState<string>('all');
  const [selectedSessionId, setSelectedSessionId] = useState<string>('all');

  const sessions = heatmapData.sessions;
  const points = heatmapData.points;

  const selectedSessionLabel = useMemo(() => {
    if (selectedSessionId === 'all' || !sessions.length) return '';
    const session = sessions.find((item) => item.id === selectedSessionId);
    return session ? `"${session.id}"` : 'Selected Session';
  }, [selectedSessionId, sessions]);

  useEffect(() => {
    let isMounted = true;
    let refreshTimer: number | undefined;

    const loadHeatmap = async () => {
      try {
        const data = await fetchJson<HeatmapReadModel>('/analytics/heatmap');
        if (!isMounted) return;
        setHeatmapData(data);
        setIsLoading(false);
        setError(null);
      } catch (err) {
        if (!isMounted) return;
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
        setIsLoading(false);
      }
    };

    void loadHeatmap();
    refreshTimer = window.setInterval(loadHeatmap, 15000);

    return () => {
      isMounted = false;
      if (refreshTimer) {
        window.clearInterval(refreshTimer);
      }
    };
  }, []);

  const availableUrls = useMemo(() => {
    const unique = new Set<string>();
    sessions.forEach((session) => {
      const url = session.metadata.url;
      if (url) unique.add(url);
    });
    return Array.from(unique).sort();
  }, [sessions]);

  const urlFilteredSessions = useMemo(() => {
    return selectedUrl === 'all'
      ? sessions
      : sessions.filter((session) => session.metadata.url === selectedUrl);
  }, [selectedUrl, sessions]);

  const availableSessionOptions = useMemo(() => {
    return urlFilteredSessions.map((session) => ({
      id: session.id,
      label: session.metadata.url
        ? `${session.id.slice(0, 8)} • ${session.metadata.url}`
        : session.id,
    }));
  }, [urlFilteredSessions]);

  useEffect(() => {
    if (selectedSessionId === 'all') return;
    const stillExists = availableSessionOptions.some((option) => option.id === selectedSessionId);
    if (!stillExists) {
      setSelectedSessionId('all');
    }
  }, [availableSessionOptions, selectedSessionId]);

  const filteredSessions = useMemo(() => {
    if (selectedSessionId === 'all') {
      return urlFilteredSessions;
    }

    return urlFilteredSessions.filter((session) => session.id === selectedSessionId);
  }, [selectedSessionId, urlFilteredSessions]);

  const filteredSessionIds = useMemo(() => new Set(filteredSessions.map((session) => session.id)), [filteredSessions]);

  const filteredPoints = useMemo(() => {
    return points.filter((point) => {
      const matchesUrl = selectedUrl === 'all' || point.url === selectedUrl;
      const matchesSession = selectedSessionId === 'all' || filteredSessionIds.has(point.sessionId);
      return matchesUrl && matchesSession;
    });
  }, [filteredSessionIds, points, selectedSessionId, selectedUrl]);

  const sessionMap = useMemo(() => {
    return new Map(sessions.map((session) => [session.id, session] satisfies [string, SessionRecording]));
  }, [sessions]);

  const { clickEvents, hoverEvents, scrollEvents, totalClicks, totalHovers, averageScrollDepth, mostClickedElements } =
    useMemo(() => {
      const clickPoints: NormalisedClickEvent[] = [];
      const hoverPoints: NormalisedHoverEvent[] = [];
      const scrollValues: number[] = [];
      const clickTargetMap = new Map<string, number>();
      let scrollDepthTotal = 0;
      let scrollSessionCount = 0;
      let maximumScrollDepth = 0;

      filteredSessions.forEach((session) => {
        const sessionScrollDepth = session.stats.scrollDepth ?? 0;
        maximumScrollDepth = Math.max(maximumScrollDepth, sessionScrollDepth);
        scrollDepthTotal += sessionScrollDepth;
        scrollSessionCount += 1;
      });

      filteredPoints.forEach((point) => {
        const session = sessionMap.get(point.sessionId);
        const screenWidth = session?.metadata.screen?.width ?? FALLBACK_SCREEN_WIDTH;
        const screenHeight = session?.metadata.screen?.height ?? FALLBACK_SCREEN_HEIGHT;

        if (point.type === 'click') {
          const normalisedPoint = normaliseClick(point, screenWidth, screenHeight);
          if (normalisedPoint) {
            clickPoints.push(normalisedPoint);
          }
          if (point.target?.trim()) {
            clickTargetMap.set(point.target, (clickTargetMap.get(point.target) ?? 0) + 1);
          }
          return;
        }

        if (point.type === 'hover') {
          const normalisedPoint = normaliseHover(point, screenWidth, screenHeight);
          if (normalisedPoint) {
            hoverPoints.push(normalisedPoint);
          }
          return;
        }

        if (point.type === 'scroll' && typeof point.depth === 'number') {
          const scrollAmount = Math.max(0, point.depth);
          scrollValues.push(scrollAmount);
          maximumScrollDepth = Math.max(maximumScrollDepth, scrollAmount);
        }
      });

      const topTargets = Array.from(clickTargetMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([selector, count]) => ({ selector, count }));

      const averageDepth = scrollSessionCount ? scrollDepthTotal / scrollSessionCount : 0;
      const maxScroll = maximumScrollDepth || FALLBACK_SCREEN_HEIGHT * 3;
      const scrollPoints: NormalisedScrollEvent[] = scrollValues.map((value) => ({
        depth: maxScroll > 0 ? Math.min(value / maxScroll, 1) : 0,
        weight: 1,
      }));

      return {
        clickEvents: clickPoints,
        hoverEvents: hoverPoints,
        scrollEvents: scrollPoints,
        totalClicks: clickPoints.length,
        totalHovers: hoverPoints.length,
        averageScrollDepth: averageDepth,
        mostClickedElements: topTargets,
      };
    }, [filteredPoints, filteredSessions, sessionMap]);

  const selectedUrlLabel = selectedUrl === 'all' ? 'All URLs' : selectedUrl;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Heatmap Analysis</h2>
          <p className="text-gray-600">Explore how visitors click, scroll, and hover across your experiences.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-white border border-gray-200 rounded-lg px-3 py-2">
            <label htmlFor="url-filter" className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Page URL
            </label>
            <select
              id="url-filter"
              value={selectedUrl}
              onChange={(event) => setSelectedUrl(event.target.value)}
              className="mt-1 block w-56 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">All URLs</option>
              {availableUrls.map((url) => (
                <option key={url} value={url}>
                  {url}
                </option>
              ))}
            </select>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg px-3 py-2">
            <label htmlFor="session-filter" className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Session
            </label>
            <select
              id="session-filter"
              value={selectedSessionId}
              onChange={(event) => setSelectedSessionId(event.target.value)}
              className="mt-1 block w-48 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">All Sessions</option>
              {availableSessionOptions.map((sessionOption) => (
                <option key={sessionOption.id} value={sessionOption.id}>
                  {sessionOption.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex bg-gray-100 rounded-lg p-1 w-full lg:w-auto">
          {(
            [
              { type: 'click' as const, label: 'Clicks', icon: MousePointer },
              { type: 'scroll' as const, label: 'Scrolls', icon: Move },
              { type: 'hover' as const, label: 'Hovers', icon: Eye },
            ]
          ).map(({ type, label, icon: Icon }) => (
            <button
              key={type}
              type="button"
              onClick={() => setActiveType(type)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                activeType === type ? 'bg-white text-primary-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        <div className="text-sm text-gray-500">
          {isLoading
            ? 'Loading recent session recordings…'
            : filteredSessions.length
            ? `${filteredSessions.length} session${filteredSessions.length === 1 ? '' : 's'} loaded`
            : 'No sessions available for this filter'}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        <div className="xl:col-span-3">
          <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{selectedUrlLabel}</h3>
              <p className="text-sm text-gray-600">
                Showing {activeType === 'click' ? 'click' : activeType === 'scroll' ? 'scroll' : 'hover'} interactions
                {selectedSessionId !== 'all' ? ` for session ${selectedSessionLabel}` : ''}
              </p>
            </div>
            <div className="relative rounded-lg bg-slate-50 overflow-hidden border border-dashed border-slate-200" style={{ minHeight: '520px' }}>
              <div className="absolute inset-0 opacity-80">
                <div className="absolute inset-6 rounded-lg bg-white shadow-sm p-6 space-y-6 overflow-y-auto pointer-events-none">
                  <div className="h-6 w-1/3 rounded bg-slate-100" />
                  <div className="space-y-3">
                    <div className="h-4 rounded bg-slate-100" />
                    <div className="h-4 rounded bg-slate-100 w-3/4" />
                    <div className="h-4 rounded bg-slate-100 w-1/2" />
                  </div>
                  <div className="h-10 w-36 rounded bg-primary-100" />
                  <div className="grid grid-cols-2 gap-4">
                    <div className="h-32 rounded bg-slate-100" />
                    <div className="h-32 rounded bg-slate-100" />
                    <div className="h-32 rounded bg-slate-100" />
                    <div className="h-32 rounded bg-slate-100" />
                  </div>
                  <div className="h-24 rounded bg-slate-100" />
                </div>
              </div>
              <HeatmapCanvas
                clickEvents={clickEvents}
                scrollEvents={scrollEvents}
                hoverEvents={hoverEvents}
                activeType={activeType}
              />
            </div>
          </div>
        </div>
        <HeatmapStats
          totalClicks={totalClicks}
          totalHovers={totalHovers}
          averageScrollDepth={averageScrollDepth}
          mostClickedElements={mostClickedElements}
          sessionsCount={filteredSessions.length}
          selectedUrlLabel={selectedUrlLabel}
          isLoading={isLoading}
          activeType={activeType}
          selectedSessionLabel={selectedSessionLabel}
        />
      </div>
    </div>
  );
};
