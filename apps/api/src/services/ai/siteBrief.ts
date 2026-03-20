import type { AiEvidenceItem, AiRecommendation, SiteAiBrief } from '../../../../../packages/contracts/index.js';
import type { SiteAiContext } from './siteContext.js';

const pluralize = (count: number, singular: string, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`;

const formatDuration = (seconds: number) => {
  if (!seconds) return '0s';
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${seconds}s`;
};

const hasHighBounceRisk = (context: SiteAiContext) => context.tracking.verified && context.summary.bounceRate >= 70;

const hasLowConversionRisk = (context: SiteAiContext) =>
  context.tracking.verified && context.summary.sessionCount7d > 0 && context.summary.conversionRate <= 1;

const hasShortSessionRisk = (context: SiteAiContext) =>
  context.tracking.verified && context.summary.sessionCount7d > 0 && context.summary.avgDurationSeconds <= 45;

const hasBehaviorRisk = (context: SiteAiContext) =>
  hasHighBounceRisk(context) || hasLowConversionRisk(context) || hasShortSessionRisk(context);

const getRecommendationRationale = (recommendationId: string) => {
  switch (recommendationId) {
    case 'verify-installation':
      return 'This site cannot produce trustworthy client reporting until tracking is live.';
    case 'resolve-alerts':
      return 'Open alerts keep the account in reaction mode and can undercut the next client update.';
    case 'configure-funnel':
      return 'Funnels turn raw traffic into progress against the outcomes the client actually cares about.';
    case 'review-recent-sessions':
      return 'Recent session evidence is the fastest way to explain weak engagement signals with confidence.';
    case 'prepare-client-update':
      return 'A healthy quiet site is a good chance to package proof of value before the client asks for it.';
    default:
      return 'This action is directly supported by the current site detail signals.';
  }
};

const buildHeadline = (context: SiteAiContext) => {
  if (!context.tracking.verified || context.tracking.trackingStatus === 'install') {
    return `Tracking is not live on ${context.site.name} yet.`;
  }
  if (context.summary.criticalAlerts > 0) {
    return `${pluralize(context.summary.criticalAlerts, 'critical alert')} need attention on ${context.site.name}.`;
  }
  if (context.summary.openAlerts > 0) {
    return `${pluralize(context.summary.openAlerts, 'open alert')} need attention on ${context.site.name}.`;
  }
  if (context.summary.healthScore < 55) {
    return `${context.site.name} is at risk this week.`;
  }
  if (context.summary.sessionCount7d === 0) {
    return `${context.site.name} has gone quiet this week.`;
  }
  return `${context.site.name} looks stable this week.`;
};

const buildSummary = (context: SiteAiContext) => {
  if (!context.tracking.verified || context.tracking.trackingStatus === 'install') {
    return `Finish installation so DXM Pulse can start turning live traffic on ${context.site.name} into a reliable client-facing reporting surface.`;
  }

  if (context.summary.criticalAlerts > 0) {
    return `${context.site.name} recorded ${context.summary.sessionCount7d.toLocaleString()} sessions in the last 7 days, but ${pluralize(context.summary.criticalAlerts, 'critical alert')} are keeping the account in reaction mode.`;
  }

  if (context.summary.openAlerts > 0) {
    return `${context.site.name} recorded ${context.summary.sessionCount7d.toLocaleString()} sessions in the last 7 days, and unresolved alerts are keeping the site in attention mode.`;
  }

  if (context.summary.healthScore < 55) {
    return `${context.site.name} recorded ${context.summary.sessionCount7d.toLocaleString()} sessions in the last 7 days, but the site is only at ${context.summary.healthScore}/100 health and needs intervention before the next client check-in.`;
  }

  if (context.summary.sessionCount7d === 0) {
    return `No sessions were recorded on ${context.site.name} in the last 7 days, so confirm whether traffic is down or tracking has gone quiet.`;
  }

  return `${context.site.name} recorded ${context.summary.sessionCount7d.toLocaleString()} sessions in the last 7 days and is currently sitting at ${context.summary.healthScore}/100 health with no unresolved alerts.`;
};

const buildTopRisk = (context: SiteAiContext) => {
  if (context.topAlert) {
    return `${context.topAlert.title}${context.topAlert.affectedSessions > 0 ? ` is affecting ${pluralize(context.topAlert.affectedSessions, 'session')}` : ''}.`;
  }

  if (!context.tracking.verified || context.tracking.trackingStatus === 'install') {
    return `Tracking is still unverified, so this site can fall out of reporting before the agency notices.`;
  }

  if (hasHighBounceRisk(context)) {
    return `Bounce rate is ${context.summary.bounceRate}%, which suggests visitors are leaving before the site earns attention.`;
  }

  if (hasLowConversionRisk(context)) {
    return `Conversion rate is ${context.summary.conversionRate}%, so current traffic is not turning into measurable outcomes yet.`;
  }

  if (hasShortSessionRisk(context)) {
    return `Average session duration is ${formatDuration(context.summary.avgDurationSeconds)}, which points to shallow engagement.`;
  }

  if (context.summary.sessionCount7d === 0) {
    return `No sessions were recorded in the last 7 days.`;
  }

  return null;
};

const buildTopOpportunity = (context: SiteAiContext) => {
  if (!context.tracking.verified || context.tracking.trackingStatus === 'install') {
    return 'Finish installation to unlock live reporting, alert confidence, and session evidence.';
  }

  if (context.funnels.count === 0) {
    return 'Configure a funnel so the agency can measure progress through the client’s real conversion path.';
  }

  if (hasBehaviorRisk(context)) {
    return 'Review recent sessions to find where visitors stall, bounce, or miss the conversion path.';
  }

  if (context.summary.openAlerts === 0 && context.summary.healthScore >= 70) {
    return 'Turn this week’s stable performance into a client-ready update while the account is healthy.';
  }

  return 'Use the current site signals to sharpen the next client conversation before issues compound.';
};

const buildRecommendations = (context: SiteAiContext): AiRecommendation[] => {
  const recommendations: AiRecommendation[] = [];

  if (!context.tracking.verified || context.tracking.trackingStatus === 'install') {
    recommendations.push({
      id: 'verify-installation',
      title: 'Finish installation and verify live traffic',
      detail: 'Send traffic through the site and confirm the client account is producing live data before the next report.',
      href: `/clients/${context.site.id}`,
      priority: 'high',
      rationale: getRecommendationRationale('verify-installation'),
    });
  }

  if (context.summary.openAlerts > 0) {
    recommendations.push({
      id: 'resolve-alerts',
      title: 'Resolve open client alerts first',
      detail: `${pluralize(context.summary.openAlerts, 'unresolved alert')} are active on ${context.site.name}. Clear those before they become client-visible incidents.`,
      href: '/alerts',
      priority: context.summary.criticalAlerts > 0 ? 'high' : 'medium',
      rationale: getRecommendationRationale('resolve-alerts'),
    });
  }

  if (context.tracking.verified && context.funnels.count === 0) {
    recommendations.push({
      id: 'configure-funnel',
      title: 'Add a funnel for this client',
      detail: 'The site is live, but DXM is not yet mapping traffic into the conversion steps this client cares about.',
      href: '/analytics',
      priority: 'medium',
      rationale: getRecommendationRationale('configure-funnel'),
    });
  }

  if (context.tracking.verified && hasBehaviorRisk(context)) {
    recommendations.push({
      id: 'review-recent-sessions',
      title: 'Review recent sessions for friction',
      detail: 'Use recent session evidence to explain the current bounce, conversion, or engagement weakness before it reaches the client.',
      href: '/sessions',
      priority: 'medium',
      rationale: getRecommendationRationale('review-recent-sessions'),
    });
  }

  if (context.tracking.verified && context.summary.openAlerts === 0 && context.summary.healthScore >= 70) {
    recommendations.push({
      id: 'prepare-client-update',
      title: 'Turn current performance into a client update',
      detail: 'This site is stable enough to package into a concise proof-of-value update while the account is quiet.',
      href: '/reports',
      priority: 'low',
      rationale: getRecommendationRationale('prepare-client-update'),
    });
  }

  return recommendations.slice(0, 3);
};

const buildEvidence = (context: SiteAiContext): AiEvidenceItem[] => [
  {
    id: 'health-score',
    label: 'Health score',
    value: `${context.summary.healthScore}/100`,
    tone:
      context.summary.healthScore >= 70
        ? 'positive'
        : context.summary.healthScore < 55
          ? 'warning'
          : 'neutral',
  },
  {
    id: 'sessions-7d',
    label: 'Sessions (7d)',
    value:
      !context.tracking.verified && context.summary.sessionCount7d === 0
        ? 'No traffic yet'
        : context.summary.sessionCount7d.toLocaleString(),
    tone: context.summary.sessionCount7d > 0 ? 'positive' : 'warning',
  },
  {
    id: 'open-alerts',
    label: 'Open alerts',
    value: `${context.summary.openAlerts} open`,
    tone: context.summary.openAlerts > 0 ? 'warning' : 'positive',
  },
  {
    id: 'bounce-rate',
    label: 'Bounce rate',
    value:
      !context.tracking.verified
        ? 'No traffic yet'
        : `${context.summary.bounceRate}%`,
    tone:
      !context.tracking.verified
        ? 'neutral'
        : context.summary.bounceRate >= 70
          ? 'warning'
          : context.summary.bounceRate <= 35
            ? 'positive'
            : 'neutral',
  },
  {
    id: 'conversion-rate',
    label: 'Conversion rate',
    value:
      !context.tracking.verified
        ? 'No traffic yet'
        : `${context.summary.conversionRate}%`,
    tone:
      !context.tracking.verified
        ? 'neutral'
        : context.summary.conversionRate >= 4
          ? 'positive'
          : context.summary.conversionRate <= 1
            ? 'warning'
            : 'neutral',
  },
  {
    id: 'funnel-coverage',
    label: 'Funnels',
    value: context.funnels.count > 0 ? `${context.funnels.count} configured` : 'None configured',
    tone:
      context.funnels.count > 0
        ? 'positive'
        : context.tracking.verified
          ? 'warning'
          : 'neutral',
  },
];

export const buildSiteAiBrief = (
  context: SiteAiContext,
  generatedAt: string,
): SiteAiBrief => ({
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
