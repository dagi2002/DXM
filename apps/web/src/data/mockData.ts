import { User, Session, SessionEvent, Metric, Alert, HeatmapData, FunnelStep, UserFlowNode } from '../types';

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
    type: 'performance',
    severity: 'high',
    title: 'Slow Page Load Detected',
    description: 'Homepage loading time increased by 45% in the last hour',
    timestamp: new Date(Date.now() - 1800000),
    resolved: false,
    affectedSessions: 124
  },
  {
    id: 'alert_2',
    type: 'frustration',
    severity: 'medium',
    title: 'High Rage Click Activity',
    description: 'Users are repeatedly clicking on non-functional elements on the contact page',
    timestamp: new Date(Date.now() - 3600000),
    resolved: false,
    affectedSessions: 67
  },
  {
    id: 'alert_3',
    type: 'error',
    severity: 'critical',
    title: 'JavaScript Error Spike',
    description: 'Uncaught TypeError affecting checkout process',
    timestamp: new Date(Date.now() - 7200000),
    resolved: true,
    affectedSessions: 89
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
