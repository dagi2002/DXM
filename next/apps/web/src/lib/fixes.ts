/**
 * The "what to fix" feed. Real fixes come from `GET /fixes`; until an organization has any, the
 * screens keep showing the sample feed (with its "Sample data" pill) so a new account still sees
 * what Pulse will do. Status changes PATCH the API for real fixes and stay local for samples.
 */
import type { Fix as FixDto, FixDetail, FixList } from '@pulse/contracts';
import type { FixStatus } from '@pulse/contracts/constants';
import { formatRelative, type Locale } from '@pulse/i18n';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import { useFormatDate, useMe } from './queries';
import { loadSampleFixes, type Fix } from './sample';

export type FixFeed = { sample: true; fixes: Fix[] } | { sample: false; fixes: FixDto[] };

export const fixesQuery = (orgId: string) =>
  queryOptions({
    queryKey: ['orgs', orgId, 'fixes'],
    queryFn: async ({ signal }): Promise<FixFeed> => {
      const { fixes } = await api<FixList>('/fixes', { signal });
      return fixes.length ? { sample: false, fixes } : { sample: true, fixes: await loadSampleFixes() };
    },
    refetchInterval: 60_000,
  });

export const fixQuery = (orgId: string, id: string) =>
  queryOptions({
    queryKey: ['orgs', orgId, 'fixes', id],
    queryFn: ({ signal }) => api<FixDetail>(`/fixes/${id}`, { signal }),
  });

/** Shortens a CSS-ish selector to something an owner can recognise ("button.pay" stays). */
const target = (selector: string) => (selector.length > 48 ? `${selector.slice(0, 47)}…` : selector);

/** Turns an API fix into the card model the screens render, in the reader's language. */
export function useFixView() {
  const { t, i18n } = useTranslation();
  const formatDate = useFormatDate();
  const locale = i18n.language as Locale;
  return (dto: FixDto, now = new Date()): Fix => {
    const e = dto.evidence;
    const values = { target: target(e.selector), page: e.path };
    const devices = Object.entries(e.devices).sort((a, b) => b[1] - a[1]);
    const [topDevice, topCount] = devices[0] ?? ['mobile', 0];
    const chips = [t('fix.chip.visitors', { count: e.visits })];
    if (e.visits > 0 && topCount / e.visits >= 0.6) {
      chips.push(t('fix.chip.mostly', { device: t(`fix.device.${topDevice}`) }));
    }
    if (e.topBrowser) chips.push(`${e.topBrowser.os} · ${e.topBrowser.browser}`);
    chips.push(t('fix.chip.target', { target: target(e.selector) }));
    return {
      id: dto.id,
      number: dto.number,
      severity: dto.severity,
      status: dto.status,
      site: dto.siteDomain,
      page: e.path,
      kind: t(`fix.kind.${dto.kind}`),
      title: t(`fix.title.${dto.kind}`, values),
      summary: t(`fix.summary.${dto.kind}`, { visits: e.visits, hours: e.windowHours, left: e.leftOnPage }),
      firstSeen: formatDate(dto.firstSeen, true),
      updated: formatRelative(new Date(dto.lastSeen), locale, now),
      chips,
      affectedToday: e.visits,
      replayIds: dto.replayIds,
    };
  };
}

/** The feed as card models, plus whether it is the sample. */
export function useFixes() {
  const { orgId } = useMe();
  const toView = useFixView();
  const { data, isLoading } = useQuery(fixesQuery(orgId));
  const fixes = !data ? [] : data.sample ? data.fixes : data.fixes.map((f) => toView(f));
  return { fixes, sample: data?.sample ?? true, isLoading };
}

/**
 * Moves a fix through the workflow (open → fixing → fixed → verified, or dismissed). Real fixes
 * are PATCHed (optimistically); sample fixes only change in this browser.
 */
export function useSetFixStatus() {
  const qc = useQueryClient();
  const { orgId } = useMe();
  const key = fixesQuery(orgId).queryKey;
  const mutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: FixStatus }) =>
      api<{ fix: FixDto }>(`/fixes/${id}`, { method: 'PATCH', body: { status } }),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData(key);
      qc.setQueryData(key, (feed) => (feed ? withStatus(feed, id, status) : feed));
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(key, context.previous);
    },
    onSettled: (_data, _err, { id }) => {
      void qc.invalidateQueries({ queryKey: key, exact: true });
      void qc.invalidateQueries({ queryKey: fixQuery(orgId, id).queryKey });
    },
  });
  const set = (id: string, status: FixStatus) => {
    const feed = qc.getQueryData(key);
    if (!feed || feed.sample) {
      qc.setQueryData(key, (f) => (f ? withStatus(f, id, status) : f));
      return;
    }
    mutation.mutate({ id, status });
  };
  return Object.assign(set, { error: mutation.error, isPending: mutation.isPending });
}

function withStatus(feed: FixFeed, id: string, status: FixStatus): FixFeed {
  return feed.sample
    ? { sample: true, fixes: feed.fixes.map((f) => (f.id === id ? { ...f, status } : f)) }
    : { sample: false, fixes: feed.fixes.map((f) => (f.id === id ? { ...f, status } : f)) };
}
