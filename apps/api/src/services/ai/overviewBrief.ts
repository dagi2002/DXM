import type { AiEvidenceItem, AiRecommendation, OverviewAiBrief } from '../../../../../packages/contracts/index.js';
import type { OverviewAiContext } from './overviewContext.js';

const pluralize = (count: number, singular: string, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`;

const getRecommendationRationale = (recommendationId: string) => {
  switch (recommendationId) {
    case 'verify-sites':
      return 'Unverified sites weaken portfolio coverage and make reporting less credible than it should be.';
    case 'resolve-alerts':
      return 'Open alerts are the fastest path from hidden issue to client-visible incident.';
    case 'health-review':
      return 'The weakest site is the best place to intervene before the next client check-in.';
    case 'add-first-client':
      return 'The overview only becomes operational once at least one client site is installed and verified.';
    default:
      return 'This action is already supported by the current overview signals and should stay near the top of the queue.';
  }
};

const buildHeadline = (context: OverviewAiContext) => {
  if (context.summary.liveClients === 0) return 'No client sites are live yet.';
  if (context.summary.unresolvedAlerts > 0) {
    return `${pluralize(context.summary.unresolvedAlerts, 'unresolved alert')} ${
      context.summary.unresolvedAlerts === 1 ? 'needs' : 'need'
    } attention across the portfolio.`;
  }
  if (context.summary.atRiskClients > 0) {
    return `${pluralize(context.summary.atRiskClients, 'client site')} ${
      context.summary.atRiskClients === 1 ? 'needs' : 'need'
    } attention before the next check-in.`;
  }
  return `The portfolio looks stable across ${pluralize(context.summary.liveClients, 'live client site')}.`;
};

const buildSummary = (context: OverviewAiContext) => {
  if (context.summary.totalClients === 0) {
    return 'Add your first client site and verify tracking so DXM Pulse can turn empty setup into live portfolio proof.';
  }

  if (context.summary.liveClients === 0) {
    return `You have ${pluralize(context.summary.totalClients, 'client site')} configured, but none are live yet. Finish installation so the overview can move from setup to live monitoring.`;
  }

  if (context.summary.unresolvedAlerts > 0) {
    return `DXM Pulse recorded ${context.summary.sessions7d.toLocaleString()} sessions in the last 7 days, but open alerts are pulling focus away from a ${context.summary.averageHealthScore}/100 portfolio baseline.`;
  }

  if (context.summary.atRiskClients > 0) {
    return `DXM Pulse recorded ${context.summary.sessions7d.toLocaleString()} sessions in the last 7 days, and ${pluralize(context.summary.atRiskClients, 'client site')} still need attention to steady the portfolio.`;
  }

  return `DXM Pulse recorded ${context.summary.sessions7d.toLocaleString()} sessions in the last 7 days, with the portfolio holding at ${context.summary.averageHealthScore}/100 average health.`;
};

const buildTopRisk = (context: OverviewAiContext) => {
  if (context.topAlertHotspot) {
    return `${context.topAlertHotspot.siteName} is leading risk with a ${context.topAlertHotspot.severity} alert: ${context.topAlertHotspot.title}.`;
  }

  if (context.summary.unverifiedClients > 0) {
    return `${pluralize(context.summary.unverifiedClients, 'client site')} ${
      context.summary.unverifiedClients === 1 ? 'still lacks' : 'still lack'
    } live tracking, so reporting can look thinner than the real opportunity.`;
  }

  if (context.weakestSite) {
    const alertDetail =
      context.weakestSite.openAlerts > 0
        ? ` with ${pluralize(context.weakestSite.openAlerts, 'open alert')}`
        : '';
    return `${context.weakestSite.name} is the weakest site at ${context.weakestSite.healthScore}/100 health${alertDetail}.`;
  }

  return null;
};

const buildTopOpportunity = (context: OverviewAiContext) => {
  if (context.strongestSite) {
    return `${context.strongestSite.name} is the healthiest site at ${context.strongestSite.healthScore}/100 and can anchor proof-of-value conversations.`;
  }

  if (context.summary.liveClients < context.summary.totalClients) {
    return 'Move more sites from install to live so the portfolio baseline reflects the full client roster.';
  }

  if (context.summary.totalClients > 0) {
    return 'The portfolio is stable enough to turn this week’s performance into a client-ready update.';
  }

  return 'Add your first client site to unlock live portfolio benchmarking.';
};

const buildEvidence = (context: OverviewAiContext): AiEvidenceItem[] => [
  {
    id: 'live-clients',
    label: 'Live clients',
    value: `${context.summary.liveClients}/${context.summary.totalClients} live`,
    tone: context.summary.liveClients > 0 ? 'positive' : 'warning',
  },
  {
    id: 'unresolved-alerts',
    label: 'Open alerts',
    value: `${context.summary.unresolvedAlerts} open`,
    tone: context.summary.unresolvedAlerts > 0 ? 'warning' : 'positive',
  },
  {
    id: 'sessions-7d',
    label: 'Sessions (7d)',
    value: context.summary.sessions7d.toLocaleString(),
    tone: context.summary.sessions7d > 0 ? 'positive' : context.summary.totalClients > 0 ? 'warning' : 'neutral',
  },
  {
    id: 'average-health',
    label: 'Portfolio health',
    value: `${context.summary.averageHealthScore}/100`,
    tone:
      context.summary.averageHealthScore >= 70
        ? 'positive'
        : context.summary.averageHealthScore < 55
          ? 'warning'
          : 'neutral',
  },
  {
    id: 'strongest-site',
    label: 'Strongest site',
    value: context.strongestSite
      ? `${context.strongestSite.name} (${context.strongestSite.healthScore}/100)`
      : 'No benchmark yet',
    tone: context.strongestSite ? 'positive' : 'neutral',
  },
  {
    id: 'weakest-site',
    label: 'Weakest site',
    value: context.weakestSite
      ? `${context.weakestSite.name} (${context.weakestSite.healthScore}/100)`
      : 'No risk signal yet',
    tone: context.weakestSite ? 'warning' : 'neutral',
  },
];

const buildRecommendations = (context: OverviewAiContext): AiRecommendation[] =>
  context.recommendedActions.map((action) => ({
    ...action,
    rationale: getRecommendationRationale(action.id),
  }));

export const buildOverviewAiBrief = (
  context: OverviewAiContext,
  generatedAt: string,
): OverviewAiBrief => ({
  period: '7d',
  mode: 'deterministic',
  generatedAt,
  headline: buildHeadline(context),
  summary: buildSummary(context),
  topRisk: buildTopRisk(context),
  topOpportunity: buildTopOpportunity(context),
  recommendations: buildRecommendations(context),
  evidence: buildEvidence(context),
});
