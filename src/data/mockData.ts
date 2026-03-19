import { User, Session, SessionEvent, Metric, Alert, HeatmapData, FunnelStep, UserFlowNode, Report, WebsiteConfig, InsightCard, TopPage, UserFlowStep, DropOffPoint } from '../types';

export const mockUser: User = {
  id: '1',
  name: 'Sarah Chen',
  email: 'sarah@bitsacademy.edu',
  role: 'admin',
  avatar: 'https://images.pexels.com/photos/774909/pexels-photo-774909.jpeg?auto=compress&cs=tinysrgb&w=100&h=100&dpr=2',
  lastLogin: new Date()
};

export const mockSessions: Session[] = Array.from({ length: 50 }, (_, i) => ({
  id: `session_${i + 1}`,
  userId: Math.random() > 0.3 ? `user_${Math.floor(Math.random() * 20)}` : undefined,
  startTime: new Date(Date.now() - Math.random() * 86400000 * 7),
  endTime: Math.random() > 0.1 ? new Date(Date.now() - Math.random() * 86400000 * 7 + Math.random() * 3600000) : undefined,
  duration: Math.floor(Math.random() * 1800) + 30,
  pageViews: Math.floor(Math.random() * 15) + 1,
  clicks: Math.floor(Math.random() * 50) + 5,
  scrollDepth: Math.floor(Math.random() * 100) + 10,
  device: ['Desktop', 'Mobile', 'Tablet'][Math.floor(Math.random() * 3)],
  browser: ['Chrome', 'Safari', 'Firefox', 'Edge'][Math.floor(Math.random() * 4)],
  country: ['United States', 'India', 'United Kingdom', 'Canada', 'Australia'][Math.floor(Math.random() * 5)],
  bounced: Math.random() > 0.7,
  converted: Math.random() > 0.85,
  frustrationEvents: Math.floor(Math.random() * 5)
}));

export const mockEvents: SessionEvent[] = Array.from({ length: 200 }, (_, i) => ({
  id: `event_${i + 1}`,
  sessionId: `session_${Math.floor(Math.random() * 50) + 1}`,
  type: ['click', 'scroll', 'navigation', 'rage_click', 'error'][Math.floor(Math.random() * 5)] as any,
  timestamp: new Date(Date.now() - Math.random() * 86400000),
  element: Math.random() > 0.3 ? ['button', 'link', 'form', 'image', 'navbar'][Math.floor(Math.random() * 5)] : undefined,
  coordinates: Math.random() > 0.4 ? { x: Math.floor(Math.random() * 1920), y: Math.floor(Math.random() * 1080) } : undefined,
  value: Math.random() > 0.7 ? ['Sign Up', 'Contact Us', 'Learn More', 'Download'][Math.floor(Math.random() * 4)] : undefined,
  url: ['/home', '/products', '/about', '/contact', '/pricing'][Math.floor(Math.random() * 5)]
}));

export const mockMetrics: Metric[] = [
  { name: 'Active Sessions', value: 1247, change: 12.5, trend: 'up' },
  { name: 'Avg Session Duration', value: '3m 24s', change: -8.2, trend: 'down' },
  { name: 'Bounce Rate', value: '42%', change: -5.1, trend: 'down' },
  { name: 'Conversion Rate', value: '3.8%', change: 15.3, trend: 'up' },
  { name: 'Page Load Time', value: '2.1s', change: -12.4, trend: 'down' },
  { name: 'Error Rate', value: '0.3%', change: -25.0, trend: 'down' }
];

export const mockAlerts: Alert[] = [
  {
    id: 'alert_1',
    type: 'frustration',
    severity: 'high',
    status: 'new',
    title: 'Rage clicks detected on pricing page',
    description: 'Multiple users are repeatedly clicking the comparison table headers which are not interactive. 23 sessions affected in the last 24 hours.',
    timestamp: new Date(Date.now() - 1800000),
    resolved: false,
    page: '/pricing',
    affectedSessions: 23
  },
  {
    id: 'alert_2',
    type: 'performance',
    severity: 'critical',
    status: 'new',
    title: 'High bounce rate on mobile landing page',
    description: '68% of mobile users are leaving the homepage within 5 seconds. This is 3x higher than the desktop bounce rate.',
    timestamp: new Date(Date.now() - 3600000),
    resolved: false,
    page: '/home',
    affectedSessions: 412
  },
  {
    id: 'alert_3',
    type: 'conversion',
    severity: 'medium',
    status: 'acknowledged',
    title: 'Engagement dropped 15% on checkout flow',
    description: 'Average time on checkout page decreased from 2m to 45s this week. Users may be abandoning due to form complexity.',
    timestamp: new Date(Date.now() - 7200000),
    resolved: false,
    page: '/checkout',
    affectedSessions: 156
  },
  {
    id: 'alert_4',
    type: 'frustration',
    severity: 'low',
    status: 'new',
    title: 'Dead clicks on feature badges',
    description: 'Users are clicking on static badge elements on the features page expecting them to be interactive.',
    timestamp: new Date(Date.now() - 10800000),
    resolved: false,
    page: '/features',
    affectedSessions: 89
  },
  {
    id: 'alert_5',
    type: 'error',
    severity: 'high',
    status: 'resolved',
    title: 'JavaScript errors spiking on signup page',
    description: 'Form validation errors increased 200% after the latest deployment. Users are unable to submit the signup form.',
    timestamp: new Date(Date.now() - 14400000),
    resolved: true,
    page: '/signup',
    affectedSessions: 67
  }
];

export const mockHeatmapData: HeatmapData[] = Array.from({ length: 100 }, (_, i) => ({
  x: Math.floor(Math.random() * 1200),
  y: Math.floor(Math.random() * 800),
  intensity: Math.random(),
  type: ['click', 'scroll', 'hover'][Math.floor(Math.random() * 3)] as any
}));

// ✅ Funnels mock data (used by FunnelAnalysis UI)
export const mockFunnelData: FunnelStep[] = [
  { name: 'Landing Page', users: 10000, conversionRate: 100, dropoffRate: 0 },
  { name: 'Product View', users: 7500, conversionRate: 75, dropoffRate: 25 },
  { name: 'Add to Cart', users: 4500, conversionRate: 45, dropoffRate: 40 },
  { name: 'Checkout', users: 2700, conversionRate: 27, dropoffRate: 40 },
  { name: 'Payment', users: 1890, conversionRate: 18.9, dropoffRate: 30 },
  { name: 'Confirmation', users: 1350, conversionRate: 13.5, dropoffRate: 28.5 }
];

export const mockUserFlowData: UserFlowNode[] = [
  {
    page: '/home',
    users: 10000,
    next: [
      { target: '/products', percent: 42 },
      { target: '/about', percent: 28 },
      { target: '/contact', percent: 15 },
      { target: 'exit', percent: 15 }
    ]
  },
  {
    page: '/products',
    users: 4200,
    next: [
      { target: '/product/detail', percent: 50 },
      { target: '/pricing', percent: 25 },
      { target: '/home', percent: 15 },
      { target: 'exit', percent: 10 }
    ]
  },
  {
    page: '/product/detail',
    users: 2100,
    next: [
      { target: '/cart', percent: 45 },
      { target: '/products', percent: 20 },
      { target: '/pricing', percent: 15 },
      { target: 'exit', percent: 20 }
    ]
  }
];

// Dashboard metrics (redesigned — 4 cards)
export const mockDashboardMetrics = [
  { name: 'Total Sessions', value: '24,891', change: 12.4, trend: 'up' as const, icon: 'Users' },
  { name: 'Avg. Session Duration', value: '2m 34s', change: -3.1, trend: 'down' as const, icon: 'Clock' },
  { name: 'Total Clicks', value: '142.3K', change: 8.7, trend: 'up' as const, icon: 'MousePointer' },
  { name: 'Page Views', value: '67,240', change: 5.2, trend: 'up' as const, icon: 'Eye' },
];

// Sessions over time (28 days, 2 series)
export const mockSessionsOverTime = Array.from({ length: 28 }, (_, i) => {
  const date = new Date();
  date.setDate(date.getDate() - 27 + i);
  const day = date.toLocaleDateString('en-US', { weekday: 'short' });
  const weekLabel = `${day} ${Math.ceil((i + 1) / 7)}`;
  const total = Math.floor(300 + Math.sin(i / 4) * 150 + Math.random() * 80);
  const engaged = Math.floor(total * (0.5 + Math.random() * 0.2));
  return { day: i % 7 === 0 ? `Mon ${Math.ceil((i + 1) / 7)}` : '', total, engaged, index: i };
});

// Device breakdown
export const mockDeviceBreakdown = [
  { device: 'Desktop', share: 58, color: '#4f46e5' },
  { device: 'Mobile', share: 34, color: '#818cf8' },
  { device: 'Tablet', share: 8, color: '#c7d2fe' },
];

// Top pages
export const mockTopPages: TopPage[] = [
  { name: 'Homepage', path: '/home', views: 12480, avgTime: '1m 42s', scrollDepth: 78, bounceRate: 32 },
  { name: 'Pricing', path: '/pricing', views: 8340, avgTime: '2m 15s', scrollDepth: 92, bounceRate: 18 },
  { name: 'Features', path: '/features', views: 6720, avgTime: '1m 58s', scrollDepth: 85, bounceRate: 24 },
  { name: 'Blog', path: '/blog', views: 4510, avgTime: '3m 22s', scrollDepth: 67, bounceRate: 41 },
  { name: 'Contact', path: '/contact', views: 2890, avgTime: '0m 54s', scrollDepth: 45, bounceRate: 55 },
  { name: 'About', path: '/about', views: 1920, avgTime: '1m 12s', scrollDepth: 72, bounceRate: 38 },
];

// User flow steps (Sankey-style, 4 columns)
export const mockUserFlowSteps: UserFlowStep[] = [
  { id: 'home', page: '/home', sessions: 12480, column: 0, targets: [
    { page: '/pricing', percent: 42 },
    { page: '/features', percent: 38 },
    { page: '/blog', percent: 20 },
  ]},
  { id: 'pricing', page: '/pricing', sessions: 6340, column: 1, targets: [
    { page: '/signup', percent: 52 },
    { page: '/features', percent: 28 },
    { page: '/checkout', percent: 20 },
  ]},
  { id: 'features', page: '/features', sessions: 4720, column: 1, targets: [
    { page: '/signup', percent: 36 },
    { page: '/dashboard', percent: 28 },
  ]},
  { id: 'blog', page: '/blog', sessions: 3210, column: 1, targets: [
    { page: '/signup', percent: 15 },
  ]},
  { id: 'signup', page: '/signup', sessions: 3890, column: 2, targets: [
    { page: '/success', percent: 45 },
  ]},
  { id: 'checkout', page: '/checkout', sessions: 1540, column: 2, targets: [
    { page: '/success', percent: 60 },
  ]},
  { id: 'dashboard', page: '/dashboard', sessions: 2100, column: 3, targets: [] },
  { id: 'success', page: '/success', sessions: 980, column: 3, targets: [] },
];

export const mockDropOffPoints: DropOffPoint[] = [
  { page: '/pricing', dropOffRate: 28, usersLeft: 1775 },
  { page: '/signup', dropOffRate: 22, usersLeft: 856 },
  { page: '/checkout', dropOffRate: 40, usersLeft: 616 },
  { page: '/features', dropOffRate: 15, usersLeft: 708 },
];

// Insights
export const mockInsightCards: InsightCard[] = [
  { id: '1', title: 'Engagement up 12% on pricing page', description: 'Users are spending more time comparing plans after the recent redesign.', change: 12, trend: 'up', icon: 'TrendingUp' },
  { id: '2', title: 'Checkout abandonment spike detected', description: 'Payment form drop-off increased 5% this week. Consider simplifying the form.', change: 5, trend: 'up', icon: 'AlertTriangle' },
  { id: '3', title: 'Returning visitors growing steadily', description: '28% of visitors this month are returning users, up from 22% last month.', change: 28, trend: 'up', icon: 'TrendingUp' },
  { id: '4', title: 'Mobile engagement plateau', description: 'Mobile session duration has been flat for 3 weeks. May need mobile UX review.', change: 0, trend: 'stable', icon: 'Smartphone' },
];

export const mockEngagementTrend = [
  { month: 'Jan', score: 62 }, { month: 'Feb', score: 58 }, { month: 'Mar', score: 71 },
  { month: 'Apr', score: 65 }, { month: 'May', score: 68 }, { month: 'Jun', score: 54 },
  { month: 'Jul', score: 72 }, { month: 'Aug', score: 78 }, { month: 'Sep', score: 69 },
  { month: 'Oct', score: 74 }, { month: 'Nov', score: 82 }, { month: 'Dec', score: 79 },
];

export const mockVisitorComparison = [
  { week: 'W1', newVisitors: 3200, returning: 1800 },
  { week: 'W2', newVisitors: 2800, returning: 2200 },
  { week: 'W3', newVisitors: 3500, returning: 2600 },
  { week: 'W4', newVisitors: 4200, returning: 3100 },
  { week: 'W5', newVisitors: 3800, returning: 3400 },
  { week: 'W6', newVisitors: 4500, returning: 3800 },
];

export const mockDropOffPages = [
  { page: '/checkout/payment', rate: 42, trend: 'up' as const },
  { page: '/signup/verify', rate: 38, trend: 'up' as const },
  { page: '/pricing/compare', rate: 31, trend: 'down' as const },
  { page: '/onboarding/step3', rate: 27, trend: 'stable' as const },
  { page: '/profile/settings', rate: 22, trend: 'down' as const },
];

// Reports
export const mockReports: Report[] = [
  { id: '1', title: 'Weekly Behavior Summary — Mar 10-16', description: 'Overview of user behavior patterns, top pages, and engagement metrics for the week.', type: 'weekly', createdAt: new Date('2026-03-16'), status: 'published' },
  { id: '2', title: 'Mobile UX Analysis', description: 'Deep dive into mobile user behavior patterns and friction points.', type: 'behavior', createdAt: new Date('2026-03-16'), status: 'draft' },
  { id: '3', title: 'Checkout Flow Optimization', description: 'Analysis of checkout funnel performance and drop-off points.', type: 'behavior', createdAt: new Date('2026-03-14'), status: 'published' },
  { id: '4', title: 'Weekly Behavior Summary — Mar 3-9', description: 'Overview of user behavior patterns, top pages, and engagement metrics for the week.', type: 'weekly', createdAt: new Date('2026-03-09'), status: 'published' },
];

// Settings
export const mockWebsiteConfig: WebsiteConfig = {
  name: 'DXM Labs',
  url: 'https://dxmlabs.com',
  trackingId: 'dxm_a3k9f2m1',
  status: 'active',
  totalSessions: 24891,
  totalPageviews: 67240,
};

export const mockPerformanceData = {
  coreWebVitals: {
    lcp: {
      value: 1.8,
      percentiles: {
        p50: 1.5,
        p75: 2.3,
        p95: 3.6
      }
    },
    fid: {
      value: 12,
      percentiles: {
        p50: 10,
        p75: 18,
        p95: 45
      }
    },
    cls: {
      value: 0.03,
      percentiles: {
        p50: 0.02,
        p75: 0.08,
        p95: 0.22
      }
    },
    inp: {
      value: 120,
      percentiles: {
        p50: 95,
        p75: 160,
        p95: 320
      }
    },
    fcp: {
      value: 1.1,
      percentiles: {
        p50: 0.9,
        p75: 1.6,
        p95: 2.8
      }
    },
    ttfb: {
      value: 0.42,
      percentiles: {
        p50: 0.28,
        p75: 0.6,
        p95: 1.1
      }
    }
  },
  errorRate: 0.3,
  apiLatency: 320,
  deviceBreakdown: {
    desktop: 54,
    mobile: 36,
    tablet: 10
  },
  geoPerformance: [
    { region: 'North America', avgLcp: 1.6, errorRate: 0.2 },
    { region: 'Europe', avgLcp: 1.9, errorRate: 0.35 },
    { region: 'Asia-Pacific', avgLcp: 2.4, errorRate: 0.5 },
    { region: 'South America', avgLcp: 2.7, errorRate: 0.6 },
    { region: 'Middle East & Africa', avgLcp: 2.9, errorRate: 0.7 }
  ],
  resourceUsage: [
    { type: 'js', size: 1450 },
    { type: 'css', size: 420 },
    { type: 'image', size: 2350 },
    { type: 'font', size: 180 }
  ]
};
