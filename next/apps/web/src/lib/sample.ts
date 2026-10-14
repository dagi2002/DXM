/**
 * Sample dataset for screens whose backend hasn't shipped yet (replay = slice 4, reports =
 * slice 6). Fix detection is live (slice 3): the sample fixes stay as the empty-state feed until an
 * org has real ones (see lib/fixes.ts). Everything here is flagged `sample: true` and every
 * screen that shows it carries a "Sample data" pill. When a slice lands, replace the matching
 * `queryFn` with an `api()` call — the shapes are meant to become the real contracts.
 */
import { queryOptions } from '@tanstack/react-query';

export type Severity = 'critical' | 'watch';
export type FixStatus = 'open' | 'fixing' | 'fixed' | 'verified' | 'dismissed';
export const FIX_STATUSES: FixStatus[] = ['open', 'fixing', 'fixed', 'verified', 'dismissed'];

export interface AffectedVisit {
  time: string;
  device: string;
  network: string;
  taps: number;
  outcome: 'left' | 'paid';
}

export interface Fix {
  id: string;
  number: number;
  severity: Severity;
  status: FixStatus;
  site: string;
  page: string;
  kind: string;
  title: string;
  summary: string;
  detail?: string;
  firstSeen: string;
  updated: string;
  chips: string[];
  /** Orders per day at risk, and the money behind it — in santim, as the revenue_at_risk metric expects. */
  impact?: { ordersPerDay: number; revenuePerDay: number; averageOrder: number; basis: string };
  suggestion?: { text: string; code?: string; basis: string };
  verified?: { label: string; before: string; after: string; when: string };
  clip?: { caption: string; story: string };
  affectedToday?: number;
  visits?: AffectedVisit[];
  replayIds: string[];
}

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

const FIXES: Fix[] = [
  {
    id: 'fix_128',
    number: 128,
    severity: 'critical',
    status: 'open',
    site: 'demostore.et',
    page: '/checkout',
    kind: 'Rage clicks',
    title: 'The “Pay with telebirr” button doesn’t respond on Android',
    summary: '31 visitors tapped it 4 or more times today. 27 of them left without paying.',
    detail:
      '31 visitors tapped it 4 or more times today and 27 left without paying. It only happens on screens narrower than 400px.',
    firstSeen: '09:42',
    updated: '4 min ago',
    chips: ['31 visitors affected', 'Android · Chrome 129', 'Rage clicks on button.pay-telebirr'],
    impact: {
      ordersPerDay: 9,
      revenuePerDay: 1665000,
      averageOrder: 185000,
      basis: 'Based on today’s 27 abandons and your usual 33% payment completion.',
    },
    suggestion: {
      text: 'A cookie banner overlay sits above the button on screens under 400px wide and swallows the tap. Lower the banner’s z-index or close it before showing payment options.',
      code: '@media (max-width: 400px) {\n  .cookie-banner { position: static; }\n}',
      basis: 'Generated from 3 replays and the page’s CSS. Check before shipping.',
    },
    clip: {
      caption: 'Replay clip · visitor from Addis Ababa · Ethio telecom 4G',
      story:
        'The visitor taps the payment button 6 times in 4 seconds. The cookie banner covers its lower half, so taps land on the banner’s empty area. They leave 11 seconds later.',
    },
    affectedToday: 31,
    visits: [
      { time: '14:06', device: 'Tecno Spark 20', network: '4G', taps: 6, outcome: 'left' },
      { time: '13:51', device: 'Samsung A14', network: '3G', taps: 4, outcome: 'left' },
      { time: '13:20', device: 'Infinix Hot 40', network: '4G', taps: 9, outcome: 'paid' },
      { time: '12:47', device: 'Samsung A05', network: 'Wi-Fi', taps: 5, outcome: 'left' },
      { time: '11:58', device: 'Tecno Camon 30', network: '4G', taps: 4, outcome: 'left' },
    ],
    replayIds: ['rep_1406', 'rep_1351', 'rep_1247'],
  },
  {
    id: 'fix_131',
    number: 131,
    severity: 'watch',
    status: 'open',
    site: 'demostore.et',
    page: '/signup',
    kind: 'Form errors',
    title: 'The phone field rejects numbers that start with 09',
    summary: '42% of people who start the sign-up form hit an error on this field. 64 abandoned this week.',
    firstSeen: 'Mon 10:15',
    updated: '1 h ago',
    chips: ['64 abandoned this week', 'Field: phone', 'All devices'],
    suggestion: {
      text: 'The validation pattern only accepts +251 numbers. Accept local 09… and 07… formats and normalise them to +251 on submit.',
      basis: 'Generated from form-error events on /signup.',
    },
    replayIds: [],
  },
  {
    id: 'fix_133',
    number: 133,
    severity: 'watch',
    status: 'open',
    site: 'lalibela-tours.et',
    page: '/packages/*',
    kind: 'Slow pages',
    title: 'Tour pages take 4.8 s to show on mobile data',
    summary: 'Largest image is 2.1 MB. Visitors on 3G leave twice as often as on Wi-Fi.',
    firstSeen: 'Sat 18:02',
    updated: '3 h ago',
    chips: ['p75 load 4.8 s on 3G', 'Largest image 2.1 MB'],
    suggestion: {
      text: 'Serve the hero images as WebP under 200 KB and lazy-load the gallery below the fold.',
      basis: 'Generated from Web Vitals and page weight.',
    },
    replayIds: [],
  },
  {
    id: 'fix_120',
    number: 120,
    severity: 'watch',
    status: 'fixing',
    site: 'tena-clinic.et',
    page: '/book',
    kind: 'Dead clicks',
    title: 'The date picker doesn’t open on older iPhones',
    summary: 'Taps on the date field do nothing on iOS 15. 12 booking attempts stopped there this week.',
    firstSeen: 'Thu 08:30',
    updated: 'yesterday',
    chips: ['iOS 15 · Safari', '12 attempts'],
    replayIds: [],
  },
  {
    id: 'fix_117',
    number: 117,
    severity: 'watch',
    status: 'verified',
    site: 'demostore.et',
    page: '/menu',
    kind: 'Dead clicks',
    title: 'Dead clicks on the menu page',
    summary: 'Menu links weren’t tappable on phones.',
    firstSeen: 'Oct 2',
    updated: 'yesterday',
    chips: [],
    verified: { label: 'Dead clicks on the menu page', before: '58', after: '3 a day', when: 'yesterday' },
    replayIds: [],
  },
];

const REPLAYS: Replay[] = [
  {
    id: 'rep_1406',
    fixId: 'fix_128',
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
    fixId: 'fix_128',
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
    fixId: 'fix_128',
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

/** Shown by the fix feed (lib/fixes.ts) until an organization has real fixes. */
export const loadSampleFixes = () => later(FIXES);
export const sampleReplaysQuery = queryOptions({
  queryKey: ['sample', 'replays'],
  queryFn: () => later(REPLAYS),
  staleTime: Infinity,
});
export const sampleReportsQuery = queryOptions({
  queryKey: ['sample', 'reports'],
  queryFn: () => later(REPORTS),
  staleTime: Infinity,
});
