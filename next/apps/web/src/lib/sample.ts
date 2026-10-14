/**
 * Sample dataset for screens whose backend hasn't shipped yet (replay = slice 4). Fixes (slice 3),
 * insights (slice 5) and client reports (slice 6) are real and have no sample.
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

const later = <T>(value: T) => Promise.resolve(structuredClone(value));

export const sampleReplaysQuery = queryOptions({
  queryKey: ['sample', 'replays'],
  queryFn: () => later(REPLAYS),
  staleTime: Infinity,
});
