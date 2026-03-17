/**
 * Demo data for /demo route — fully offline, no API dependency.
 * Represents a fictional Ethiopian e-commerce platform "Habesha Mart".
 * All numbers are realistic for an Ethiopian online retailer in 2024.
 */

export interface DemoSession {
  id: string;
  startedAt: string;
  duration: number; // seconds
  device: 'mobile' | 'desktop' | 'tablet';
  browser: string;
  entryUrl: string;
  clicks: number;
  scrollDepth: number;
  bounced: boolean;
  converted: boolean;
  pageCount: number;
}

export interface DemoClickPoint {
  x: number; // 0-100 (percentage of viewport width)
  y: number; // 0-100 (percentage of viewport height)
  count: number;
}

export interface DemoFunnelStep {
  name: string;
  users: number;
  conversionRate: number;
  dropoffRate: number;
  avgTimeToNext: number; // seconds
  exitReasons: { reason: string; pct: number }[];
}

export interface DemoAlert {
  id: string;
  type: 'error' | 'performance' | 'frustration' | 'conversion';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  affectedSessions: number;
  createdAt: string;
  resolved: boolean;
}

export interface DemoMetrics {
  activeSessions: number;
  avgSessionDuration: number; // seconds
  bounceRate: number; // percent
  conversionRate: number; // percent
  totalPageviews: number;
  returningVisitors: number; // percent
}

export interface DemoVitals {
  name: string;
  p50: number;
  p75: number;
  p95: number;
  unit: string;
  status: 'good' | 'warning' | 'poor';
}

export interface DemoUserFlowNode {
  id: string;
  label: string;
  users: number;
}

export interface DemoUserFlowEdge {
  from: string;
  to: string;
  users: number;
}

// ─── Metrics ───────────────────────────────────────────────────────────────────

export const demoMetrics: DemoMetrics = {
  activeSessions: 1324,
  avgSessionDuration: 192, // 3m 12s
  bounceRate: 39,
  conversionRate: 4.2,
  totalPageviews: 8741,
  returningVisitors: 28,
};

// ─── Active Sessions ────────────────────────────────────────────────────────────

export const demoSessions: DemoSession[] = [
  {
    id: 'demo_sess_001',
    startedAt: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
    duration: 240,
    device: 'mobile',
    browser: 'Chrome Mobile',
    entryUrl: '/products/injera-maker',
    clicks: 12,
    scrollDepth: 87,
    bounced: false,
    converted: true,
    pageCount: 5,
  },
  {
    id: 'demo_sess_002',
    startedAt: new Date(Date.now() - 9 * 60 * 1000).toISOString(),
    duration: 78,
    device: 'mobile',
    browser: 'Samsung Internet',
    entryUrl: '/',
    clicks: 3,
    scrollDepth: 42,
    bounced: true,
    converted: false,
    pageCount: 2,
  },
  {
    id: 'demo_sess_003',
    startedAt: new Date(Date.now() - 22 * 60 * 1000).toISOString(),
    duration: 480,
    device: 'desktop',
    browser: 'Chrome',
    entryUrl: '/sale',
    clicks: 31,
    scrollDepth: 95,
    bounced: false,
    converted: false,
    pageCount: 11,
  },
  {
    id: 'demo_sess_004',
    startedAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    duration: 157,
    device: 'mobile',
    browser: 'Chrome Mobile',
    entryUrl: '/products/tej-jar',
    clicks: 7,
    scrollDepth: 61,
    bounced: false,
    converted: true,
    pageCount: 4,
  },
  {
    id: 'demo_sess_005',
    startedAt: new Date(Date.now() - 48 * 60 * 1000).toISOString(),
    duration: 33,
    device: 'mobile',
    browser: 'Opera Mini',
    entryUrl: '/checkout',
    clicks: 2,
    scrollDepth: 28,
    bounced: true,
    converted: false,
    pageCount: 1,
  },
];

// ─── Heatmap Click Points ──────────────────────────────────────────────────────
// Clustered around realistic CTA positions on a product page

export const demoClickPoints: DemoClickPoint[] = [
  // "Add to Cart" button — main CTA, heavy cluster
  { x: 50, y: 62, count: 342 },
  { x: 49, y: 61, count: 289 },
  { x: 51, y: 63, count: 274 },
  { x: 48, y: 62, count: 198 },
  { x: 52, y: 61, count: 187 },
  { x: 50, y: 64, count: 156 },
  // Product image — curious taps
  { x: 50, y: 28, count: 214 },
  { x: 47, y: 26, count: 143 },
  { x: 53, y: 30, count: 129 },
  // Size selector
  { x: 28, y: 52, count: 176 },
  { x: 37, y: 52, count: 148 },
  { x: 46, y: 52, count: 92 },
  // Product title (copy/share)
  { x: 50, y: 42, count: 87 },
  // Reviews section
  { x: 50, y: 78, count: 134 },
  { x: 40, y: 80, count: 89 },
  { x: 60, y: 79, count: 76 },
  // Navigation header
  { x: 15, y: 5, count: 98 },
  { x: 85, y: 5, count: 112 },
  { x: 50, y: 5, count: 67 },
  // Back button — frustration signal
  { x: 5, y: 5, count: 203 },
  // Price section
  { x: 32, y: 47, count: 67 },
  // "Buy Now" CTA (secondary)
  { x: 50, y: 68, count: 98 },
  { x: 51, y: 69, count: 76 },
  // Related products
  { x: 22, y: 92, count: 54 },
  { x: 50, y: 92, count: 61 },
  { x: 78, y: 92, count: 48 },
];

// ─── Funnel ────────────────────────────────────────────────────────────────────

export const demoFunnel: DemoFunnelStep[] = [
  {
    name: 'Landing Page',
    users: 10000,
    conversionRate: 100,
    dropoffRate: 0,
    avgTimeToNext: 45,
    exitReasons: [
      { reason: 'Slow load (>4s on 3G)', pct: 38 },
      { reason: 'Not what they searched', pct: 27 },
      { reason: 'Distracted / switched app', pct: 21 },
      { reason: 'Price too high', pct: 14 },
    ],
  },
  {
    name: 'Product Page',
    users: 7500,
    conversionRate: 75,
    dropoffRate: 25,
    avgTimeToNext: 118,
    exitReasons: [
      { reason: 'No Amharic product details', pct: 31 },
      { reason: 'Unclear shipping cost', pct: 28 },
      { reason: 'No cash on delivery option', pct: 24 },
      { reason: 'Product out of stock', pct: 17 },
    ],
  },
  {
    name: 'Add to Cart',
    users: 4500,
    conversionRate: 60,
    dropoffRate: 40,
    avgTimeToNext: 62,
    exitReasons: [
      { reason: 'Confused by size/variant', pct: 34 },
      { reason: 'Wanted to compare products', pct: 29 },
      { reason: 'Changed mind', pct: 22 },
      { reason: 'Technical error', pct: 15 },
    ],
  },
  {
    name: 'Checkout',
    users: 2200,
    conversionRate: 48.9,
    dropoffRate: 51.1,
    avgTimeToNext: 210,
    exitReasons: [
      { reason: 'Telebirr/CBEBirr not available', pct: 41 },
      { reason: 'Unexpected delivery fees', pct: 29 },
      { reason: 'Form too long (no autofill)', pct: 18 },
      { reason: 'App crashed on payment', pct: 12 },
    ],
  },
  {
    name: 'Order Confirmed',
    users: 1490,
    conversionRate: 67.7,
    dropoffRate: 32.3,
    avgTimeToNext: 0,
    exitReasons: [],
  },
];

// ─── Performance Vitals ────────────────────────────────────────────────────────

export const demoVitals: DemoVitals[] = [
  { name: 'LCP', p50: 3200, p75: 5100, p95: 8900, unit: 'ms', status: 'poor' },
  { name: 'FCP', p50: 1800, p75: 2900, p95: 5200, unit: 'ms', status: 'warning' },
  { name: 'TTFB', p50: 620, p75: 980, p95: 2100, unit: 'ms', status: 'warning' },
  { name: 'CLS', p50: 0.08, p75: 0.18, p95: 0.41, unit: '', status: 'warning' },
  { name: 'INP', p50: 280, p75: 450, p95: 820, unit: 'ms', status: 'poor' },
];

// ─── Alerts ────────────────────────────────────────────────────────────────────

export const demoAlerts: DemoAlert[] = [
  {
    id: 'demo_alert_001',
    type: 'performance',
    severity: 'high',
    title: 'Checkout page LCP > 6s on mobile',
    description:
      'The checkout page is loading critical content in over 6 seconds on mobile 3G/4G connections. This is causing 41% of users to abandon before entering payment details.',
    affectedSessions: 892,
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    resolved: false,
  },
  {
    id: 'demo_alert_002',
    type: 'frustration',
    severity: 'medium',
    title: 'Rage clicks on pricing toggle',
    description:
      'Users are repeatedly clicking the USD/ETB currency toggle 4+ times in a session. The toggle may not be responding correctly or the price change is confusing.',
    affectedSessions: 234,
    createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    resolved: false,
  },
  {
    id: 'demo_alert_003',
    type: 'conversion',
    severity: 'high',
    title: 'Payment method drop-off spike (+22%)',
    description:
      'Drop-off at the payment method selection screen has increased 22% in the last 24 hours. Telebirr payment option may be experiencing issues.',
    affectedSessions: 418,
    createdAt: new Date(Date.now() - 14 * 60 * 60 * 1000).toISOString(),
    resolved: false,
  },
  {
    id: 'demo_alert_004',
    type: 'error',
    severity: 'critical',
    title: 'JS error on cart page (Samsung Internet)',
    description:
      "Uncaught TypeError: Cannot read property 'price' of undefined occurring on cart page for Samsung Internet users. Affects ~18% of mobile visitors.",
    affectedSessions: 156,
    createdAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
    resolved: true,
  },
];

// ─── User Flow ─────────────────────────────────────────────────────────────────

export const demoUserFlowNodes: DemoUserFlowNode[] = [
  { id: 'home', label: 'Home', users: 10000 },
  { id: 'category', label: 'Category', users: 6200 },
  { id: 'product', label: 'Product', users: 7500 },
  { id: 'cart', label: 'Cart', users: 4500 },
  { id: 'checkout', label: 'Checkout', users: 2200 },
  { id: 'confirm', label: 'Confirmed', users: 1490 },
  { id: 'search', label: 'Search', users: 3100 },
  { id: 'exit', label: 'Exit', users: 8510 },
];

export const demoUserFlowEdges: DemoUserFlowEdge[] = [
  { from: 'home', to: 'category', users: 6200 },
  { from: 'home', to: 'product', users: 2100 },
  { from: 'home', to: 'search', users: 3100 },
  { from: 'category', to: 'product', users: 5400 },
  { from: 'search', to: 'product', users: 2800 },
  { from: 'product', to: 'cart', users: 4500 },
  { from: 'cart', to: 'checkout', users: 2200 },
  { from: 'checkout', to: 'confirm', users: 1490 },
];

// ─── Demo Replay Events ─────────────────────────────────────────────────────────
// Synthetic rrweb-compatible events for a 45-second shopping session

export const demoReplayEvents = [
  { type: 4, data: { href: 'https://habeshamart.et/products/injera-maker', width: 390, height: 844 }, timestamp: 0 },
  { type: 3, data: { source: 6, x: 195, y: 200, type: 1 }, timestamp: 2100 },
  { type: 3, data: { source: 3, id: 1, x: 0, y: 0, positions: [{ x: 195, y: 350, id: 1, timeOffset: 0 }] }, timestamp: 3200 },
  { type: 3, data: { source: 6, x: 195, y: 450, type: 1 }, timestamp: 8400 },
  { type: 3, data: { source: 3, id: 1, x: 0, y: 0, positions: [{ x: 195, y: 520, id: 1, timeOffset: 0 }] }, timestamp: 12000 },
  { type: 3, data: { source: 6, x: 195, y: 610, type: 1 }, timestamp: 18200 },
  { type: 3, data: { source: 6, x: 195, y: 610, type: 1 }, timestamp: 18400 },
  { type: 3, data: { source: 6, x: 195, y: 610, type: 1 }, timestamp: 18600 },
  // rage click on Add to Cart (3 rapid clicks)
  { type: 3, data: { source: 6, x: 195, y: 730, type: 1 }, timestamp: 24100 },
  { type: 4, data: { href: 'https://habeshamart.et/cart', width: 390, height: 844 }, timestamp: 26000 },
  { type: 3, data: { source: 3, id: 1, x: 0, y: 0, positions: [{ x: 195, y: 400, id: 1, timeOffset: 0 }] }, timestamp: 30000 },
  { type: 3, data: { source: 6, x: 195, y: 680, type: 1 }, timestamp: 34000 },
  { type: 4, data: { href: 'https://habeshamart.et/checkout', width: 390, height: 844 }, timestamp: 36500 },
  { type: 3, data: { source: 6, x: 195, y: 750, type: 1 }, timestamp: 44000 },
  { type: 4, data: { href: 'https://habeshamart.et/order-confirmed', width: 390, height: 844 }, timestamp: 45200 },
];
