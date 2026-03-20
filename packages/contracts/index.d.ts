export interface ApiEndpoints {
  collect: '/collect';
  collectReplay: '/collect-replay/replay';
  sessions: '/sessions';
  heatmap: '/analytics/heatmap';
}

export const API_ENDPOINTS: ApiEndpoints;
export const CONVERSION_EVENT_KEYWORDS: readonly string[];
export type WorkspacePlanId = 'free' | 'starter' | 'pro';
export type BillingFeatureId =
  | 'session_list'
  | 'heatmaps'
  | 'performance'
  | 'replay'
  | 'alerts'
  | 'funnels'
  | 'user_flow'
  | 'reports'
  | 'telegram'
  | 'digest';

export interface BillingFeatureRegistry {
  sessionList: 'session_list';
  heatmaps: 'heatmaps';
  performance: 'performance';
  replay: 'replay';
  alerts: 'alerts';
  funnels: 'funnels';
  userFlow: 'user_flow';
  reports: 'reports';
  telegram: 'telegram';
  digest: 'digest';
}

export interface PlanCatalogEntry {
  id: WorkspacePlanId;
  name: string;
  description: string;
  priceEtb: number;
  sessions: number;
  sessionsLabel: string;
  siteLimit: number;
  siteLimitLabel: string;
  features: readonly string[];
  featureIds: readonly BillingFeatureId[];
  highlight: boolean;
}

export const BILLING_FEATURES: BillingFeatureRegistry;
export const DXM_PLAN_CATALOG: readonly PlanCatalogEntry[];
export function getPlanCatalogEntry(planId: string): PlanCatalogEntry;
export function getNextPlanId(planId: WorkspacePlanId | string): WorkspacePlanId;
export function getPlanSiteLimit(planId: WorkspacePlanId | string): number;
export function planSupportsFeature(planId: WorkspacePlanId | string, featureId: BillingFeatureId): boolean;

export type SdkEventType =
  | 'pageview'
  | 'click'
  | 'scroll'
  | 'navigation'
  | 'vital'
  | 'custom'
  | 'identify';

export interface SessionDimensions {
  width: number;
  height: number;
}

export interface SessionRecordingMetadata {
  startedAt?: string;
  userId?: string;
  userAgent?: string;
  url?: string;
  referrer?: string;
  language?: string;
  screen?: SessionDimensions;
  viewport?: SessionDimensions;
  timezone?: string;
  devicePixelRatio?: number;
  device?: string;
  browser?: string;
}

export interface SdkCollectEvent {
  [key: string]: unknown;
  type: SdkEventType;
  ts?: number;
  x?: number;
  y?: number;
  depth?: number;
  pct?: number;
  url?: string;
  target?: string;
  name?: string;
  value?: string | number;
  event?: string;
  userId?: string;
  data?: unknown;
}

export interface CollectRequest {
  sessionId: string;
  siteId: string;
  events: SdkCollectEvent[];
  metadata?: SessionRecordingMetadata;
  completed?: boolean;
}

export interface CollectReplayRequest {
  sessionId: string;
  siteId: string;
  replayEvents: unknown[];
  chunkIndex: number;
}

export interface SessionRecordingStats {
  clicks: number;
  scrollDepth: number;
  totalEvents: number;
  bounced: boolean;
  converted: boolean;
}

export type SessionRecordingEventType =
  | 'click'
  | 'scroll'
  | 'navigation'
  | 'pageview'
  | 'custom'
  | 'vital'
  | 'hover'
  | 'mousemove';

export interface SessionRecordingEvent {
  type: SessionRecordingEventType;
  timestamp: number;
  absoluteTimestamp: number;
  x?: number;
  y?: number;
  scrollY?: number;
  depth?: number;
  button?: number;
  target?: string;
  url?: string;
  value?: string;
  phase?: 'enter' | 'leave';
}

export interface SessionSummary {
  id: string;
  startedAt: string;
  endedAt?: string;
  duration: number;
  metadata: SessionRecordingMetadata;
  stats: SessionRecordingStats;
  events: SessionRecordingEvent[];
  updatedAt: string;
  completed: boolean;
  hasReplay: boolean;
  siteDomain?: string;
}

export interface SessionDetail extends Omit<SessionSummary, 'events'> {
  events: SessionRecordingEvent[];
}

export interface ReplayEvent {
  type: number;
  data: unknown;
  timestamp: number;
}

export interface SessionReplay {
  sessionId: string;
  startedAt: string;
  duration: number;
  sizeBytes: number;
  events: ReplayEvent[];
}

export type FunnelAnalysisPeriod = '1d' | '7d' | '30d' | '90d';

export interface FunnelAnalysisStep {
  name: string;
  urlPattern: string;
  users: number;
  conversionRate: number;
  dropoffRate: number;
  avgTimeToNext: number | null;
}

export interface HeatmapPoint {
  type: 'click' | 'scroll' | 'hover';
  sessionId: string;
  url: string;
  x?: number;
  y?: number;
  depth?: number;
  target?: string;
  weight: number;
  phase?: 'enter' | 'leave';
}

export interface HeatmapReadModel {
  sessions: SessionSummary[];
  points: HeatmapPoint[];
}

export interface AiEvidenceItem {
  id: string;
  label: string;
  value: string;
  tone: 'neutral' | 'positive' | 'warning';
}

export interface AiRecommendation {
  id: string;
  title: string;
  detail: string;
  href: string;
  priority: 'high' | 'medium' | 'low';
  rationale: string;
}

export interface OverviewAiBrief {
  period: '7d';
  mode: 'deterministic';
  generatedAt: string;
  headline: string;
  summary: string;
  topRisk: string | null;
  topOpportunity: string | null;
  recommendations: AiRecommendation[];
  evidence: AiEvidenceItem[];
}

export interface SiteAiBrief {
  period: '7d';
  mode: 'deterministic';
  generatedAt: string;
  headline: string;
  summary: string;
  topRisk: string | null;
  topOpportunity: string | null;
  recommendations: AiRecommendation[];
  evidence: AiEvidenceItem[];
}

export interface AlertAiBrief {
  period: 'current';
  mode: 'deterministic';
  generatedAt: string;
  state: 'active' | 'resolved';
  headline: string;
  summary: string;
  whyFired: string;
  impact: string;
  recommendations: AiRecommendation[];
  evidence: AiEvidenceItem[];
}

export interface AlertListItem {
  id: string;
  siteId: string | null;
  type: 'error' | 'performance' | 'frustration' | 'conversion';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  timestamp: string;
  resolved: boolean;
  affectedSessions: number;
  telegramSent: boolean;
  resolvedAt: string | null;
}

export interface AlertDetail extends AlertListItem {
  ai?: AlertAiBrief;
}

export interface FunnelAiBrief {
  period: FunnelAnalysisPeriod;
  mode: 'deterministic';
  generatedAt: string;
  headline: string;
  summary: string;
  biggestDropoff: string | null;
  likelyReason: string | null;
  recommendations: AiRecommendation[];
  evidence: AiEvidenceItem[];
}

export interface FunnelAnalysisDetail {
  funnelId: string;
  funnelName: string;
  period: FunnelAnalysisPeriod;
  totalSessions: number;
  steps: FunnelAnalysisStep[];
  ai?: FunnelAiBrief;
}
