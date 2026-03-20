import type {
  FunnelAnalysisDetail,
  FunnelAnalysisPeriod,
} from '../../../../../packages/contracts/index.js';

interface FunnelAiStepContext {
  name: string;
  urlPattern: string;
  users: number;
  conversionRate: number;
  dropoffRate: number;
  avgTimeToNext: number | null;
}

export interface FunnelAiContext {
  funnel: {
    id: string;
    name: string;
    siteId: string | null;
  };
  period: FunnelAnalysisPeriod;
  totalSessions: number;
  stepCount: number;
  steps: FunnelAiStepContext[];
}

export const buildFunnelAiContext = (
  analysis: FunnelAnalysisDetail,
  siteId: string | null,
): FunnelAiContext => ({
  funnel: {
    id: analysis.funnelId,
    name: analysis.funnelName,
    siteId,
  },
  period: analysis.period,
  totalSessions: analysis.totalSessions,
  stepCount: analysis.steps.length,
  steps: analysis.steps.map((step) => ({
    name: step.name,
    urlPattern: step.urlPattern,
    users: step.users,
    conversionRate: step.conversionRate,
    dropoffRate: step.dropoffRate,
    avgTimeToNext: step.avgTimeToNext,
  })),
});
