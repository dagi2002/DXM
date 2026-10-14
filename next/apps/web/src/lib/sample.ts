/**
 * Sample dataset for screens whose backend hasn't shipped yet (replay = slice 4, insights =
 * slice 5, reports = slice 6). Fixes are real (slice 3, lib/fixes.ts) and have no sample.
 * Everything here is flagged `sample: true` and every screen that shows it carries a
 * "Sample data" pill. When a slice lands, replace the matching
 * `queryFn` with an `api()` call — the shapes are meant to become the real contracts.
 */
import { queryOptions } from '@tanstack/react-query';

export interface ReplayEvent {
  at: string;
  label: string;
  friction?: boolean;
}

export interface Replay {
  id: string;
  fixId?: string;
  title: string;
  site: string;
  device: string;
  network: string;
  duration: string;
  durationSec: number;
  pages: number;
  page: string;
  frictionAt: number[];
  pageMarks: number[];
  recap: { headline: string; story: string };
  events: ReplayEvent[];
}

export interface SiteInsights {
  site: string;
  headline: string;
  summary: string;
  health: { score: number; previous: number };
  visits: { value: number; previous: number; trend: number[] };
  conversion: { value: number; previous: number; trend: number[] };
  lcp: { value: number; previous: number };
  /** `focus` = the step a fix is linked to (highlighted), not simply the biggest drop. */
  funnel: { name: string; template: string; focus?: number; steps: { label: string; count: number }[] };
  speed: { network: string; lcp: number }[];
  inp: number;
  cls: number;
  pages: {
    path: string;
    visits: number;
    bounce: number;
    lcp: number;
    fixes: string | null;
    tone?: 'bad' | 'warn';
  }[];
}

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

const REPLAYS: Replay[] = [
  {
    id: 'rep_1406',
    title: 'Visit from Addis Ababa, 14:06',
    site: 'demostore.et',
    device: 'Tecno Spark 20 · Chrome',
    network: 'Ethio telecom 4G',
    duration: '1 min 32 s',
    durationSec: 92,
    pages: 4,
    page: '/checkout',
    frictionAt: [0.87, 0.92],
    pageMarks: [0.14, 0.48, 0.75],
    recap: {
      headline: 'Ready to buy, blocked at payment.',
      story:
        'They found a kemis in under a minute, added it to the cart and reached checkout. The pay button didn’t react to 6 taps, and they left.',
    },
    events: [
      { at: '0:00', label: 'Arrived on / from Telegram' },
      { at: '0:19', label: 'Opened Habesha kemis' },
      { at: '0:44', label: 'Added to cart' },
      { at: '1:09', label: 'Started checkout' },
      { at: '1:21', label: 'Tapped “Pay with telebirr” 6× — nothing happened', friction: true },
      { at: '1:32', label: 'Left the site' },
    ],
  },
  {
    id: 'rep_1351',
    title: 'Visit from Bahir Dar, 13:51',
    site: 'demostore.et',
    device: 'Samsung A14 · Chrome',
    network: 'Ethio telecom 3G',
    duration: '2 min 05 s',
    durationSec: 125,
    pages: 5,
    page: '/checkout',
    frictionAt: [0.9],
    pageMarks: [0.2, 0.45, 0.7],
    recap: {
      headline: 'Four taps, then gone.',
      story: 'Browsed two products, checked out, tapped pay four times and left.',
    },
    events: [
      { at: '0:00', label: 'Arrived on /products from Facebook' },
      { at: '1:28', label: 'Started checkout' },
      { at: '1:52', label: 'Tapped “Pay with telebirr” 4×', friction: true },
      { at: '2:05', label: 'Left the site' },
    ],
  },
  {
    id: 'rep_1247',
    title: 'Visit from Adama, 12:47',
    site: 'demostore.et',
    device: 'Samsung A05 · Chrome',
    network: 'Wi-Fi',
    duration: '58 s',
    durationSec: 58,
    pages: 3,
    page: '/checkout',
    frictionAt: [0.8],
    pageMarks: [0.3, 0.6],
    recap: {
      headline: 'Went straight to pay — blocked.',
      story: 'Came back to finish an earlier cart, tapped pay five times and gave up.',
    },
    events: [
      { at: '0:00', label: 'Arrived on /cart' },
      { at: '0:31', label: 'Started checkout' },
      { at: '0:46', label: 'Tapped “Pay with telebirr” 5×', friction: true },
      { at: '0:58', label: 'Left the site' },
    ],
  },
];

const INSIGHTS: SiteInsights = {
  site: 'demostore.et',
  headline: 'Visits are steady, but fewer people finish paying.',
  summary:
    'Checkout completion fell from 44% to 38% this week. The drop is on Android and starts at the telebirr step.',
  health: { score: 62, previous: 79 },
  visits: { value: 8412, previous: 8167, trend: [20, 18, 22, 16, 17, 14, 15] },
  conversion: { value: 0.382, previous: 0.443, trend: [44, 43.5, 44, 42.8, 40.5, 38.9, 38.2] },
  lcp: { value: 3100, previous: 3100 },
  funnel: {
    name: 'telebirr checkout',
    template: 'Ethiopian checkout template · last 7 days',
    focus: 4,
    steps: [
      { label: 'Viewed a product', count: 1204 },
      { label: 'Added to cart', count: 412 },
      { label: 'Started checkout', count: 236 },
      { label: 'Chose telebirr', count: 168 },
      { label: 'Paid', count: 64 },
    ],
  },
  speed: [
    { network: 'Wi-Fi', lcp: 1900 },
    { network: '4G', lcp: 3100 },
    { network: '3G', lcp: 5400 },
  ],
  inp: 180,
  cls: 0.04,
  pages: [
    { path: '/checkout', visits: 236, bounce: 0.12, lcp: 2400, fixes: '1 critical', tone: 'bad' },
    { path: '/signup', visits: 498, bounce: 0.31, lcp: 2000, fixes: '1 to watch', tone: 'warn' },
    { path: '/products/habesha-kemis', visits: 1033, bounce: 0.48, lcp: 3600, fixes: null },
    { path: '/', visits: 3920, bounce: 0.22, lcp: 2800, fixes: null },
  ],
};

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

const WEEK = {
  conversion: { value: 0.382, previous: 0.443, trend: [44, 43.5, 44, 42.8, 40.5, 38.9, 38.2] },
  verifiedThisMonth: { value: 4, previous: 2 },
};

const later = <T>(value: T) => Promise.resolve(structuredClone(value));

export const sampleReplaysQuery = queryOptions({
  queryKey: ['sample', 'replays'],
  queryFn: () => later(REPLAYS),
  staleTime: Infinity,
});
export const sampleInsightsQuery = queryOptions({
  queryKey: ['sample', 'insights'],
  queryFn: () => later(INSIGHTS),
  staleTime: Infinity,
});
export const sampleReportsQuery = queryOptions({
  queryKey: ['sample', 'reports'],
  queryFn: () => later(REPORTS),
  staleTime: Infinity,
});
export const sampleWeekQuery = queryOptions({
  queryKey: ['sample', 'week'],
  queryFn: () => later(WEEK),
  staleTime: Infinity,
});
