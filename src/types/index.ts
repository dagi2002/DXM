export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'analyst' | 'viewer';
  avatar?: string;
  lastLogin: Date;
}

export interface Session {
  id: string;
  userId?: string;
  startTime: Date;
  endTime?: Date;
  duration: number;
  pageViews: number;
  clicks: number;
  scrollDepth: number;
  device: string;
  browser: string;
  country: string;
  bounced: boolean;
  converted: boolean;
  frustrationEvents: number;
}

export interface SessionEvent {
  id: string;
  sessionId: string;
  type: 'click' | 'scroll' | 'navigation' | 'rage_click' | 'error';
  timestamp: Date;
  element?: string;
  coordinates?: { x: number; y: number };
  value?: string;
  url: string;
}

export interface Metric {
  name: string;
  value: number | string;
  change: number;
  trend: 'up' | 'down' | 'stable';
}

export interface Alert {
  id: string;
  type: 'error' | 'performance' | 'frustration' | 'conversion';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  timestamp: Date;
  resolved: boolean;
  affectedSessions: number;
}

export interface HeatmapData {
  x: number;
  y: number;
  intensity: number;
  type: 'click' | 'scroll' | 'hover';
}

export interface FunnelStep {
  name: string;
  users: number;
  conversionRate: number;
  dropoffRate: number;
}