/**
 * Client reports (slice 6). Reports are frozen snapshots from the API; this file turns their
 * structured data into sentences in the reader's language, so the same report reads in English
 * or Amharic without being regenerated.
 */
import type {
  PublicReport,
  ReportDetail,
  ReportFix,
  ReportList,
  ReportOpenFix,
  ReportSnapshot,
} from '@pulse/contracts';
import { formatDate, type Locale } from '@pulse/i18n';
import { queryOptions } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from './api';

export const reportsQuery = (orgId: string) =>
  queryOptions({
    queryKey: ['orgs', orgId, 'reports'],
    queryFn: ({ signal }) => api<ReportList>('/reports', { signal }).then((r) => r.reports),
  });

export const reportQuery = (orgId: string, id: string) =>
  queryOptions({
    queryKey: ['orgs', orgId, 'reports', id],
    queryFn: ({ signal }) => api<ReportDetail>(`/reports/${id}`, { signal }),
  });

/** The share link's report, or null when the link is unknown, expired or turned off. */
export const publicReportQuery = (token: string) =>
  queryOptions({
    queryKey: ['public-report', token],
    queryFn: async ({ signal }): Promise<PublicReport['report'] | null> => {
      try {
        return (await api<PublicReport>(`/public/reports/${encodeURIComponent(token)}`, { signal })).report;
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
    retry: (count, err) => !(err instanceof ApiError && err.status === 429) && count < 2,
    staleTime: 60_000,
  });

const intlLocale = (locale: Locale) => (locale === 'am' ? 'am-ET' : 'en-US');

/** "2026-09" → "September 2026" / "ሴፕቴምበር 2026". Report months are Gregorian calendar months. */
export function formatPeriod(period: string, locale: Locale): string {
  const [y, m] = period.split('-').map(Number);
  return new Intl.DateTimeFormat(intlLocale(locale), {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y!, m! - 1, 1)));
}

/** Short day label for chart axes: "Sep 8". */
export function formatDay(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(iso));
}

/** The last 12 months, newest first (the current month makes a partial report). */
export function recentPeriods(now = new Date(), count = 12): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

/** Shortens a CSS-ish selector to something an owner can recognise. */
const target = (selector: string) => (selector.length > 48 ? `${selector.slice(0, 47)}…` : selector);

/** Sentences for a report, in the reader's language. */
export function useReportText() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const nf = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 1 });

  const fixTitle = (f: Pick<ReportFix | ReportOpenFix, 'kind' | 'path' | 'selector' | 'number'>) =>
    f.path && f.selector
      ? t(`fix.title.${f.kind}`, { target: target(f.selector), page: f.path })
      : t('report.fixNumber', { kind: t(`fix.kind.${f.kind}`), number: f.number });

  return {
    locale,
    period: (s: ReportSnapshot) => formatPeriod(s.period, locale),
    headline(s: ReportSnapshot) {
      const period = formatPeriod(s.period, locale);
      if (s.fixed.length) return t('report.headline.fixed', { count: s.fixed.length, period });
      if (!s.enoughData) return t('report.headline.thin', { period });
      return t('report.headline.visits', { count: s.kpis.visits.value, period });
    },
    summary(s: ReportSnapshot) {
      const parts = [s.fixed.length ? t('report.summary.measured') : t('report.summary.noFixes')];
      if (s.open.length) parts.push(t('report.summary.open', { count: s.open.length }));
      return parts.join(' ');
    },
    /** "Month in progress — numbers up to Oct 14." */
    partial: (s: ReportSnapshot) => t('report.partial', { date: formatDate(s.generatedAt, { locale }) }),
    fixTitle,
    measure: (f: ReportFix) => t(`report.measure.${f.kind}`),
    perDay: (n: number | null) =>
      n === null ? t('report.tooEarly') : t('report.perDay', { value: nf.format(n) }),
    date: (iso: string) => formatDate(iso, { locale }),
  };
}
