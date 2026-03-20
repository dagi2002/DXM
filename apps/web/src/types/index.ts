import type { OverviewAiBrief as OverviewAiBriefContract } from '../../../../packages/contracts/index.js';

export type {
  CollectReplayRequest,
  CollectRequest,
  HeatmapPoint as SessionHeatmapPoint,
  HeatmapReadModel,
  OverviewAiBrief,
  SessionDetail as SessionRecordingDetail,
  SessionRecordingEvent,
  SessionRecordingMetadata,
  SessionRecordingStats,
  SessionReplay as SessionReplayData,
  SessionSummary as SessionRecording,
} from '../../../../packages/contracts/index.js';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'viewer';
  avatar?: string;
  lastLogin: string | null;
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
  timestamp: string | Date;
  resolved: boolean;
  affectedSessions: number;
}

export interface HeatmapData {
  x: number;
  y: number;
  intensity: number;
  type: 'click' | 'scroll';
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

export interface ClientSiteSummary {
  id: string;
  name: string;
  domain: string;
  siteKey: string;
  createdAt: string;
  verified: boolean;
  trackingStatus: 'live' | 'attention' | 'install';
  lastActivityAt: string | null;
  sessionCount7d: number;
  openAlerts: number;
  criticalAlerts: number;
  avgDurationSeconds: number;
  bounceRate: number;
  conversionRate: number;
  healthScore: number;
}

export interface ClientSiteDetail extends ClientSiteSummary {
  snippet: string;
  recentSessions: Array<{
    id: string;
    startedAt: string | null;
    duration: number;
    device: string;
    browser: string;
    entryUrl: string;
    createdAt: string;
  }>;
  openAlertsList: Array<{
    id: string;
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    description: string | null;
    affectedSessions: number;
    createdAt: string;
  }>;
  vitals: Record<string, { value: number; p50: number; p75: number; p95: number }>;
  funnels: Array<{
    id: string;
    name: string;
    stepCount: number;
    createdAt: string;
  }>;
}

export interface AgencyReportSummary {
  id: string;
  title: string;
  period: string;
  summary: string;
  audience: string;
  highlights: string[];
}

export interface PortfolioOverview {
  summary: {
    totalClients: number;
    liveClients: number;
    atRiskClients: number;
    unresolvedAlerts: number;
    sessions7d: number;
    averageHealthScore: number;
  };
  siteRollups: ClientSiteSummary[];
  alertHotspots: Array<{
    id: string;
    siteId: string | null;
    siteName: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    description: string | null;
    createdAt: string;
  }>;
  recentActivity: Array<{
    id: string;
    siteId: string | null;
    siteName: string;
    startedAt: string | null;
    duration: number;
    device: string;
    entryUrl: string;
  }>;
  recommendedActions: Array<{
    id: string;
    title: string;
    detail: string;
    href: string;
    priority: 'high' | 'medium' | 'low';
  }>;
  reports: AgencyReportSummary[];
  ai?: OverviewAiBriefContract;
}
