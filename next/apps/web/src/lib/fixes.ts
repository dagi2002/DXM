/**
 * The "what to fix" feed (slice 3). Everything comes from `GET /fixes`; a new organization sees
 * an honest empty state, never sample fixes. The API returns structured evidence and this module
 * turns it into sentences in the reader's language.
 */
import type { Fix as FixDto, FixDetail, FixEvidence, FixList } from '@pulse/contracts';
import type { FixSeverity, FixStatus } from '@pulse/contracts/constants';
import { formatRelative, type Locale } from '@pulse/i18n';
import { formatMetric } from '@pulse/metrics';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import { useFormatDate, useMe } from './queries';

export const FIX_STATUSES: FixStatus[] = ['open', 'fixing', 'fixed', 'verified', 'dismissed'];

/** The card model every fix screen renders. */
export interface FixView {
  id: string;
  number: number;
  severity: FixSeverity;
  status: FixStatus;
  site: string;
  /** Page template, or null for site-wide problems (tracking stopped). */
  page: string | null;
  kind: string;
  title: string;
  summary: string;
  firstSeen: string;
  updated: string;
  chips: string[];
  affected: number;
  impact: { visitsPerDay: number; leftPerDay: number; hours: number } | null;
  suggestion: { text: string; code: string | null } | null;
  /** Shown on verified fixes: the before/after that proved it. */
  verified: { label: string; before: string; after: string; when: string } | null;
  /** A note about the latest automatic re-check (waiting for traffic, or reopened). */
  verifyNote: string | null;
  /** Replay links arrive with slice 4. */
  replayIds: string[];
}

export const fixesQuery = (orgId: string) =>
  queryOptions({
    queryKey: ['orgs', orgId, 'fixes'],
    queryFn: ({ signal }) => api<FixList>('/fixes', { signal }).then((r) => r.fixes),
    refetchInterval: 60_000,
  });

export const fixQuery = (orgId: string, id: string) =>
  queryOptions({
    queryKey: ['orgs', orgId, 'fixes', id],
    queryFn: ({ signal }) => api<FixDetail>(`/fixes/${id}`, { signal }),
  });

/** Shortens a CSS-ish selector or message to something an owner can read in a chip. */
const short = (s: string, n = 48) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export interface ViewContext {
  t: TFunction;
  locale: Locale;
  formatDate: (d: Date | string, withTime?: boolean) => string;
  now?: Date;
}

const visitorChips = (e: Extract<FixEvidence, { devices: unknown }>, t: TFunction) => {
  const chips = [t('fix.chip.visitors', { count: e.visits })];
  const [topDevice, topCount] = Object.entries(e.devices).sort((a, b) => b[1] - a[1])[0] ?? ['mobile', 0];
  if (e.visits > 0 && topCount / e.visits >= 0.6) {
    chips.push(t('fix.chip.mostly', { device: t(`fix.device.${topDevice}`) }));
  }
  if (e.topBrowser) chips.push(`${e.topBrowser.os} · ${e.topBrowser.browser}`);
  return chips;
};

const networkName = (n: string, t: TFunction) => (n === 'unknown' ? t('fix.network.unknown') : n);

/** Title, summary and chips for one fix, per detector. */
function describe(dto: FixDto, { t, locale }: ViewContext) {
  const e = dto.evidence;
  const rate = (v: number) => formatMetric('affected_rate', v, locale);
  switch (e.type) {
    case 'click':
      return {
        page: e.path,
        title: t(`fix.title.${dto.kind}`, { target: short(e.selector), page: e.path }),
        summary: t(`fix.summary.${dto.kind}`, { visits: e.visits, hours: e.windowHours, left: e.leftOnPage }),
        chips: [...visitorChips(e, t), t('fix.chip.target', { target: short(e.selector) })],
        affected: e.visits,
      };
    case 'form':
      return {
        page: e.path,
        title: t('fix.title.form_abandon', { target: short(e.form, 40), page: e.path }),
        summary: t('fix.summary.form_abandon', {
          visits: e.visits,
          hours: e.windowHours,
          rate: rate(e.abandonRate),
        }),
        chips: [
          ...visitorChips(e, t),
          t('fix.chip.form', { target: short(e.form, 40) }),
          ...e.errorFields.slice(0, 2).map((f) => t('fix.chip.errorField', { field: short(f.field, 32) })),
        ],
        affected: e.visits,
      };
    case 'slow_page': {
      const metric = e.metric === 'LCP' ? 'lcp' : 'inp';
      const worst = e.networks[0];
      return {
        page: e.path,
        title: t('fix.title.slow_page', { page: e.path, metric: e.metric }),
        summary: t('fix.summary.slow_page', {
          value: formatMetric(metric, e.p75, locale),
          limit: formatMetric(metric, e.threshold, locale),
          visits: e.visits,
          hours: e.windowHours,
        }),
        chips: [
          ...visitorChips(e, t),
          ...(worst
            ? [
                t('fix.chip.network', {
                  network: networkName(worst.network, t),
                  value: formatMetric(metric, worst.p75, locale),
                }),
              ]
            : []),
        ],
        affected: e.visits,
      };
    }
    case 'js_error':
      return {
        page: e.path,
        title: t('fix.title.js_error', { page: e.path }),
        summary: t('fix.summary.js_error', {
          message: short(e.message, 120),
          visits: e.visits,
          hours: e.windowHours,
        }),
        chips: [
          ...visitorChips(e, t),
          ...(e.source ? [t('fix.chip.source', { source: short(e.source) })] : []),
        ],
        affected: e.visits,
      };
    case 'u_turn':
      return {
        page: e.path,
        title: t('fix.title.u_turn', { page: e.path }),
        summary: t('fix.summary.u_turn', { visits: e.visits, hours: e.windowHours, rate: rate(e.rate) }),
        chips: [...visitorChips(e, t), ...(e.from[0] ? [t('fix.chip.from', { page: e.from[0].path })] : [])],
        affected: e.visits,
      };
    case 'tracking':
      return {
        page: null,
        title: t('fix.title.tracking_broken', { site: dto.siteDomain }),
        summary: t('fix.summary.tracking_broken', {
          hours: Math.round(e.silentHours),
          daily: formatMetric('visitors', Math.round(e.typicalDailyVisits), locale),
        }),
        chips: [],
        affected: 0,
      };
    default:
      return e satisfies never;
  }
}

/** Formats one side of a verification for display ("12%", "6.1 s", "340"). */
function formatMeasure(dto: FixDto, value: number | null, locale: Locale): string {
  const v = dto.verification!;
  if (v.measure === 'rate') return formatMetric('affected_rate', value, locale);
  if (v.measure === 'p75') {
    const metric = dto.evidence.type === 'slow_page' && dto.evidence.metric === 'INP' ? 'inp' : 'lcp';
    return formatMetric(metric, value, locale);
  }
  return formatMetric('visitors', value, locale);
}

/** Turns an API fix into the card model, in the reader's language. Pure, for tests. */
export function toFixView(dto: FixDto, ctx: ViewContext): FixView {
  const { t, locale } = ctx;
  const d = describe(dto, ctx);
  const kind = t(`fix.kind.${dto.kind}`);
  const v = dto.verification;
  const before = v ? formatMeasure(dto, v.before.value, locale) : '';
  const after = v ? formatMeasure(dto, v.after.value, locale) : '';
  const checked = v ? formatRelative(new Date(v.checkedAt), locale, ctx.now) : '';
  return {
    id: dto.id,
    number: dto.number,
    severity: dto.severity,
    status: dto.status,
    site: dto.siteDomain,
    page: d.page,
    kind,
    title: d.title,
    summary: d.summary,
    firstSeen: ctx.formatDate(dto.firstSeen, true),
    updated: formatRelative(new Date(dto.lastSeen), locale, ctx.now),
    chips: d.chips,
    affected: d.affected,
    impact:
      dto.impact && 'windowHours' in dto.evidence ? { ...dto.impact, hours: dto.evidence.windowHours } : null,
    suggestion: dto.suggestion ? { text: dto.suggestion.text, code: dto.suggestion.code } : null,
    verified:
      dto.status === 'verified' && v?.outcome === 'verified'
        ? {
            label: t(`fix.verify.${v.measure}`, { kind }),
            before,
            after,
            when: dto.verifiedAt ? formatRelative(new Date(dto.verifiedAt), locale, ctx.now) : checked,
          }
        : null,
    verifyNote:
      v?.outcome === 'waiting' && dto.status === 'fixed'
        ? t('fix.verify.waiting', { when: checked })
        : v?.outcome === 'reopened' && dto.status === 'open'
          ? t('fix.verify.reopened', { when: checked, before, after })
          : null,
    replayIds: [],
  };
}

export function useFixView() {
  const { t, i18n } = useTranslation();
  const formatDate = useFormatDate();
  const locale = i18n.language as Locale;
  return (dto: FixDto, now = new Date()) => toFixView(dto, { t, locale, formatDate, now });
}

/** The feed as card models. */
export function useFixes() {
  const { orgId } = useMe();
  const toView = useFixView();
  const { data, isLoading, isError } = useQuery(fixesQuery(orgId));
  return { fixes: data ? data.map((f) => toView(f)) : [], isLoading, isError };
}

/** Moves a fix through the workflow (open → fixing → fixed → verified, or dismissed), optimistically. */
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
      qc.setQueryData(key, (feed) => feed?.map((f) => (f.id === id ? { ...f, status } : f)));
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
  const set = (id: string, status: FixStatus) => mutation.mutate({ id, status });
  return Object.assign(set, { error: mutation.error, isPending: mutation.isPending });
}
