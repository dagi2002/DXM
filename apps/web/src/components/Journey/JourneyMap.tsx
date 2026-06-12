/**
 * Auto journey map for a client site.
 *
 * Fetches `GET /sites/:id/journey` and renders the top 10 paths as a compact
 * Sankey flow. No external dep — the layout math + SVG rendering are in
 * `sankeyLayout.ts` (~200 LoC). Hover a link/node for a flow tooltip.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Route, Waypoints } from 'lucide-react';
import type { JourneyRange, SiteJourneyResponse } from '../../../../../packages/contracts/index';
import { fetchJson } from '../../lib/api';
import { buildSankeyLayout, linkPath } from './sankeyLayout';

interface Props {
  siteId: string;
}

const RANGES: { id: JourneyRange; label: string }[] = [
  { id: '24h', label: '24h' },
  { id: '7d', label: '7d' },
  { id: '30d', label: '30d' },
];

const NODE_LABEL_CHAR_LIMIT = 26;
const truncatePath = (url: string) =>
  url.length <= NODE_LABEL_CHAR_LIMIT ? url : `${url.slice(0, NODE_LABEL_CHAR_LIMIT - 1)}…`;

export const JourneyMap: React.FC<Props> = ({ siteId }) => {
  const [range, setRange] = useState<JourneyRange>('7d');
  const [data, setData] = useState<SiteJourneyResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hoverLink, setHoverLink] = useState<string | null>(null);

  // Responsive width — observe the container and rebuild the layout on resize.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(880);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(Math.max(560, Math.floor(entry.contentRect.width)));
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    setError(null);
    fetchJson<SiteJourneyResponse>(`/sites/${siteId}/journey?range=${range}`)
      .then((resp) => {
        if (!mounted) return;
        setData(resp);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Failed to load journey map');
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [siteId, range]);

  const layout = useMemo(() => {
    if (!data || data.paths.length === 0) return null;
    const height = Math.min(520, Math.max(260, data.paths.length * 42));
    return buildSankeyLayout(data.paths, {
      width: containerWidth,
      height,
      nodeWidth: 14,
      verticalPadding: 8,
    });
  }, [data, containerWidth]);

  const hasPaths = (data?.paths.length ?? 0) > 0;

  return (
    <section className="rounded-[28px] border border-surface-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-100">
              <Waypoints className="h-4 w-4 text-primary-700" />
            </div>
            <h2 className="text-xl font-semibold text-surface-900">Top visitor journeys</h2>
          </div>
          <p className="mt-2 text-sm text-surface-500">
            The ten most-travelled paths through this site, ranked by session volume. Wider bands
            mean more visitors follow that sequence.
          </p>
        </div>

        <div className="flex rounded-xl border border-surface-200 bg-surface-50 p-0.5 shrink-0">
          {RANGES.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setRange(id)}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                range === id
                  ? 'bg-white text-primary-700 shadow-sm'
                  : 'text-surface-500 hover:text-surface-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div ref={containerRef} className="mt-5">
        {isLoading ? (
          <div className="h-64 animate-pulse rounded-2xl border border-dashed border-surface-200 bg-surface-50" />
        ) : error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : !hasPaths || !layout ? (
          <div className="rounded-2xl border border-dashed border-surface-200 bg-surface-50 px-4 py-10 text-center">
            <Route className="mx-auto mb-2 h-6 w-6 text-surface-300" />
            <p className="text-sm font-semibold text-surface-700">No journey data yet</p>
            <p className="mt-1 text-xs text-surface-500">
              Paths appear once enough visitors move between pages on this site. Try widening the
              range if traffic is low.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <svg
                width={layout.width}
                height={layout.height + 40}
                role="img"
                aria-label="Top visitor journeys Sankey diagram"
                className="block"
              >
                {/* Links (rendered first so nodes overlay) */}
                <g>
                  {layout.links.map((link, idx) => {
                    const linkId = `${link.sourceId}-${link.targetId}`;
                    const active = hoverLink === linkId;
                    return (
                      <path
                        key={linkId + idx}
                        d={linkPath(link)}
                        stroke={link.color}
                        strokeWidth={link.width}
                        fill="none"
                        opacity={hoverLink && !active ? 0.25 : 0.75}
                        onMouseEnter={() => setHoverLink(linkId)}
                        onMouseLeave={() => setHoverLink(null)}
                      >
                        <title>{`${link.sessionCount} session${link.sessionCount === 1 ? '' : 's'}`}</title>
                      </path>
                    );
                  })}
                </g>

                {/* Nodes */}
                <g>
                  {layout.nodes.map((node) => (
                    <g key={node.id}>
                      <rect
                        x={node.x}
                        y={node.y}
                        width={node.width}
                        height={node.height}
                        rx={3}
                        fill="#166534"
                        opacity={0.9}
                      >
                        <title>{`${node.url} · ${node.totalFlow} session${node.totalFlow === 1 ? '' : 's'}`}</title>
                      </rect>
                      {/* Label to the right of the first column or left of last, else to the right. */}
                      <text
                        x={
                          node.column === layout.columns - 1
                            ? node.x - 6
                            : node.x + node.width + 6
                        }
                        y={node.y + node.height / 2}
                        dominantBaseline="middle"
                        textAnchor={node.column === layout.columns - 1 ? 'end' : 'start'}
                        fontSize={11}
                        fill="#334155"
                        className="font-mono"
                      >
                        {truncatePath(node.url)}
                      </text>
                    </g>
                  ))}
                </g>
              </svg>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px] text-surface-500">
              <span className="font-semibold text-surface-600">
                {data!.totalSessions} tracked session{data!.totalSessions === 1 ? '' : 's'} ·
              </span>
              <span>{data!.paths.length} unique path{data!.paths.length === 1 ? '' : 's'}</span>
              <span className="ml-auto">Hover a band to isolate the flow.</span>
            </div>
          </>
        )}
      </div>
    </section>
  );
};
