import { User, Session, SessionEvent, Metric, Alert, HeatmapData, FunnelStep } from '../types';

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

export const mockFunnelData: FunnelStep[] = [
  { name: 'Landing Page', users: 10000, conversionRate: 100, dropoffRate: 0 },
  { name: 'Product View', users: 7500, conversionRate: 75, dropoffRate: 25 },
  { name: 'Add to Cart', users: 4500, conversionRate: 45, dropoffRate: 40 },
  { name: 'Checkout', users: 2700, conversionRate: 27, dropoffRate: 40 },
  { name: 'Payment', users: 1890, conversionRate: 18.9, dropoffRate: 30 },
  { name: 'Confirmation', users: 1350, conversionRate: 13.5, dropoffRate: 28.5 }
];