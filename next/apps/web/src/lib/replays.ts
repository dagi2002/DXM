/**
 * Session replays (slice 4): real recordings from `GET /replays`. A replay's id is the visit id.
 * The heavy rrweb player lives in components/replay-player.tsx and is loaded lazily.
 */
import type { ReplayDetail, ReplayList, ReplayListQuery, ReplayMark, ReplaySummary } from '@pulse/contracts';
import { queryOptions } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import { useFormatDate } from './queries';

/** Replay page search params: fix = came from a fix, site = disambiguates the visit, t = start (ms). */
export interface ReplaySearch {
  fix?: string;
  site?: string;
  t?: number;
}

const shortId = (v: unknown) => (typeof v === 'string' && v ? v.slice(0, 64) : undefined);

/** The router passes search params through untyped; this is where they are checked. */
export function readReplaySearch(s: Record<string, unknown>): ReplaySearch {
  const t = s.t;
  return {
    fix: shortId(s.fix),
    site: shortId(s.site),
    t: typeof t === 'number' && Number.isFinite(t) && t >= 0 ? Math.round(t) : undefined,
  };
}

export type ReplayFilters = Pick<ReplayListQuery, 'siteId' | 'fixId' | 'page'> & { friction?: boolean };

export const replaysQuery = (orgId: string, f: ReplayFilters = {}) =>
  queryOptions({
    queryKey: ['orgs', orgId, 'replays', f],
    queryFn: ({ signal }) => {
      const q = new URLSearchParams();
      if (f.siteId) q.set('siteId', f.siteId);
      if (f.fixId) q.set('fixId', f.fixId);
      if (f.page) q.set('page', f.page);
      if (f.friction) q.set('friction', '1');
      const qs = q.toString();
      return api<ReplayList>(`/replays${qs ? `?${qs}` : ''}`, { signal }).then((r) => r.replays);
    },
    refetchInterval: 60_000,
  });

export const replayQuery = (orgId: string, id: string, siteId?: string) =>
  queryOptions({
    queryKey: ['orgs', orgId, 'replays', 'detail', id, siteId ?? null],
    queryFn: ({ signal }) =>
      api<ReplayDetail>(
        `/replays/${encodeURIComponent(id)}${siteId ? `?siteId=${encodeURIComponent(siteId)}` : ''}`,
        {
          signal,
        },
      ),
    staleTime: 5 * 60_000,
  });

/** m:ss for timeline labels. */
export const fmtClock = (ms: number) => {
  const sec = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};

/** Card/header text for a replay, in the reader's language. */
export function useReplayView() {
  const { t } = useTranslation();
  const formatDate = useFormatDate();
  return (r: ReplaySummary) => ({
    title: t('replay.title', { when: formatDate(r.startedAt, true) }),
    facts: [
      r.siteDomain,
      r.device ? t(`replay.device.${r.device}`) : null,
      [r.os, r.browser].filter(Boolean).join(' · ') || null,
      r.network ? t('replay.network', { network: r.network.toUpperCase() }) : null,
      fmtClock(r.durationMs),
      t('replay.pages', { count: r.pageviews }),
    ].filter((x): x is string => Boolean(x)),
  });
}

/** One line per timeline mark ("Tapped button.pay again and again"). */
export function useMarkLabel() {
  const { t } = useTranslation();
  return (m: ReplayMark) => t(`replay.mark.${m.type}`, { path: m.path ?? '/', detail: m.detail ?? '' });
}
