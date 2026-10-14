/**
 * Sample dataset for screens whose backend hasn't shipped yet (reports = slice 6). Fixes
 * (slice 3), replays (slice 4) and insights (slice 5) are real and have no sample.
 * Everything here is flagged `sample: true` and every screen that shows it carries a
 * "Sample data" pill. When a slice lands, replace the matching
 * `queryFn` with an `api()` call — the shapes are meant to become the real contracts.
 */
import { queryOptions } from '@tanstack/react-query';

export interface Report {
  id: string;
  token: string;
  site: string;
  period: string;
  agency: string;
  headline: string;
  summary: string;
  expires: string;
  kpis: {
    label: string;
    metric: 'conversion_rate' | 'visitors' | 'lcp' | 'pageviews';
    value: number;
    previous: number;
  }[];
  trend: { label: string; value: number; fix?: boolean }[];
  fixed: { title: string; measure: string; before: string; after: string }[];
  next: string;
}

const REPORTS: Report[] = [
  {
    id: 'rpt_2026_09',
    token: 'demo-september',
    site: 'demostore.et',
    period: 'September 2026',
    agency: 'Demo Agency',
    headline: 'We fixed 4 problems this month. Checkout completion rose from 31% to 44%.',
    summary:
      'Every fix below was checked against the week before it shipped. One issue is still open and is first on next month’s plan.',
    expires: 'Nov 10',
    kpis: [
      { label: 'Checkout completion', metric: 'conversion_rate', value: 0.44, previous: 0.31 },
      { label: 'Paid orders', metric: 'pageviews', value: 412, previous: 298 },
      { label: 'Page load on phones', metric: 'lcp', value: 3100, previous: 4500 },
      { label: 'Visits', metric: 'visitors', value: 34180, previous: 34010 },
    ],
    trend: [
      { label: 'Sep 1', value: 0.31 },
      { label: 'Sep 8', value: 0.32, fix: true },
      { label: 'Sep 15', value: 0.36, fix: true },
      { label: 'Sep 22', value: 0.41, fix: true },
      { label: 'Sep 29', value: 0.44 },
    ],
    fixed: [
      {
        title: 'The size picker didn’t open on iPhone',
        measure: 'Repeated taps on the size picker',
        before: '46/day',
        after: '2/day',
      },
      {
        title: 'Product photos were 2–3 MB each',
        measure: 'Page load on phones',
        before: '4.5 s',
        after: '3.1 s',
      },
      {
        title: 'Delivery-address form lost typed text on error',
        measure: 'People who gave up on the form',
        before: '41%',
        after: '17%',
      },
      {
        title: 'Broken link from the Telegram channel',
        measure: 'Visits landing on a 404 page',
        before: '220',
        after: '0',
      },
    ],
    next: 'The phone field on sign-up rejects numbers starting with 09. We’ll fix the validation and report the result in October.',
  },
];

const later = <T>(value: T) => Promise.resolve(structuredClone(value));

export const sampleReportsQuery = queryOptions({
  queryKey: ['sample', 'reports'],
  queryFn: () => later(REPORTS),
  staleTime: Infinity,
});
