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

export interface SessionRecordingEvent {
  type: 'mousemove' | 'click' | 'scroll' | 'hover';
  timestamp: number;
  x?: number;
  y?: number;
  scrollX?: number;
  scrollY?: number;
  button?: number;
  target?: string;
  phase?: 'enter' | 'leave';
}

export interface SessionRecordingMetadata {
  startedAt?: string;
  userAgent?: string;
  url?: string;
  referrer?: string;
  language?: string;
  screen?: {
    width: number;
    height: number;
  };
  timezone?: string;
  devicePixelRatio?: number;
  device?: string;
  browser?: string;
}

export interface SessionRecordingStats {
  clicks: number;
  scrollDepth: number;
  totalEvents: number;
}

export interface SessionRecording {
  id: string;
  startedAt: string;
  endedAt?: string;
  duration: number;
  metadata: SessionRecordingMetadata;
  stats: SessionRecordingStats;
  events: SessionRecordingEvent[];
  updatedAt: string;
  completed: boolean;
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
  status: 'new' | 'acknowledged' | 'resolved';
  title: string;
  description: string;
  timestamp: Date;
  resolved: boolean;
  page?: string;
  affectedSessions: number;
}

export interface Report {
  id: string;
  title: string;
  description: string;
  type: 'weekly' | 'behavior' | 'custom';
  createdAt: Date;
  status: 'published' | 'draft';
}

export interface WebsiteConfig {
  name: string;
  url: string;
  trackingId: string;
  status: 'active' | 'inactive';
  totalSessions: number;
  totalPageviews: number;
}

export interface InsightCard {
  id: string;
  title: string;
  description: string;
  change: number;
  trend: 'up' | 'down' | 'stable';
  icon: string;
}

export interface TopPage {
  name: string;
  path: string;
  views: number;
  avgTime: string;
  scrollDepth: number;
  bounceRate: number;
}

export interface UserFlowStep {
  id: string;
  page: string;
  sessions: number;
  column: number;
  targets: { page: string; percent: number }[];
}

export interface DropOffPoint {
  page: string;
  dropOffRate: number;
  usersLeft: number;
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

export interface UserFlowNode {
  page: string;
  users: number;
  next: {
    target: string;
    percent: number;
  }[];
}