import type {
  AiEvidenceItem,
  AiRecommendation,
  FunnelAiBrief,
} from '../../../../../packages/contracts/index.js';
import type { FunnelAiContext } from './funnelContext.js';

const LOW_SIGNAL_THRESHOLD = 5;

const pluralize = (count: number, singular: string, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`;

const formatPercent = (value: number) => `${value.toFixed(1)}%`;

const addRecommendation = (
  recommendations: AiRecommendation[],
  recommendation: AiRecommendation,
) => {
  if (recommendations.some((item) => item.id === recommendation.id)) return;
  recommendations.push(recommendation);
};

const getRecommendationRationale = (recommendationId: string) => {
  switch (recommendationId) {
    case 'review-funnel-sessions':
      return 'Session review is the safest way to validate whether the drop-off pattern reflects real user friction or just a small sample.';
    case 'refine-funnel-steps':
      return 'Funnels only help when the step definitions still match the path you want to measure.';
    case 'inspect-client-site':
      return 'The client detail view adds the surrounding site context without turning the funnel pattern into a stronger claim than the data supports.';
    case 'wait-for-more-signal':
      return 'Sparse funnel volume can change quickly, so it is safer to wait for more signal before calling the leak confidently.';
    default:
      return 'This action is directly supported by the current funnel analysis output.';
  }
};

const getLargestDropoffStep = (context: FunnelAiContext) =>
  context.steps.slice(1).reduce<(typeof context.steps)[number] | null>((current, step) => {
    if (!current || step.dropoffRate > current.dropoffRate) {
      return step;
    }

    return current;
  }, null);

const getOverallCompletionRate = (context: FunnelAiContext) =>
  context.steps.length > 0 ? context.steps[context.steps.length - 1].conversionRate : 0;

const formatBiggestDropoff = (context: FunnelAiContext, step: (typeof context.steps)[number] | null) => {
  if (!step) return null;

  const currentIndex = context.steps.findIndex((candidate) => candidate.name === step.name);
  const previousUsers = currentIndex > 0 ? context.steps[currentIndex - 1]?.users ?? 0 : 0;
  const lostUsers = Math.max(previousUsers - step.users, 0);

  if (lostUsers > 0) {
    return `${step.name} loses ${formatPercent(step.dropoffRate)} of users at that handoff (${pluralize(lostUsers, 'user')}).`;
  }

  return `${step.name} shows the largest drop-off at ${formatPercent(step.dropoffRate)}.`;
};

const buildHeadline = (context: FunnelAiContext, largestDropoffStep: (typeof context.steps)[number] | null) => {
  if (context.totalSessions === 0) {
    return `Not enough signal yet for ${context.funnel.name}.`;
  }

  if (context.totalSessions < LOW_SIGNAL_THRESHOLD) {
    return `${context.funnel.name} needs more volume before DXM can call the leak confidently.`;
  }

  if (largestDropoffStep && largestDropoffStep.dropoffRate >= 40) {
    return `${largestDropoffStep.name} is the biggest drop-off point in ${context.funnel.name}.`;
  }

  return `${context.funnel.name} looks relatively stable for ${context.period}.`;
};

const buildSummary = (context: FunnelAiContext, largestDropoffStep: (typeof context.steps)[number] | null) => {
  const overallCompletionRate = getOverallCompletionRate(context);

  if (context.totalSessions === 0) {
    return `No recorded sessions matched the defined funnel steps in ${context.period}. Not enough signal yet to describe where users are dropping.`;
  }

  if (context.totalSessions < LOW_SIGNAL_THRESHOLD) {
    return `${context.funnel.name} only matched ${pluralize(context.totalSessions, 'session')} in ${context.period}, so this pattern may change quickly. Overall completion is ${formatPercent(overallCompletionRate)}.`;
  }

  if (largestDropoffStep && largestDropoffStep.dropoffRate >= 20) {
    return `${context.funnel.name} matched ${pluralize(context.totalSessions, 'session')} in ${context.period} with an overall completion rate of ${formatPercent(overallCompletionRate)}. The largest loss currently appears at ${largestDropoffStep.name}, but this remains a heuristic reading of funnel shape rather than a confirmed cause.`;
  }

  return `${context.funnel.name} matched ${pluralize(context.totalSessions, 'session')} in ${context.period} with an overall completion rate of ${formatPercent(overallCompletionRate)}. No single step is currently dominating losses.`;
};

const buildLikelyReason = (context: FunnelAiContext, largestDropoffStep: (typeof context.steps)[number] | null) => {
  if (context.totalSessions === 0) {
    return 'Not enough signal yet. No sessions matched this funnel in the selected period.';
  }

  if (context.totalSessions < LOW_SIGNAL_THRESHOLD) {
    return `Not enough signal yet. Only ${pluralize(context.totalSessions, 'session')} matched the funnel, so the current shape may shift quickly.`;
  }

  if (!largestDropoffStep || largestDropoffStep.dropoffRate < 20) {
    return 'This pattern often suggests the funnel is relatively stable for now, and volume may be the bigger limitation than any single handoff.';
  }

  const stepIndex = context.steps.findIndex((step) => step.name === largestDropoffStep.name);
  const isEarlyHandoff = stepIndex === 1;
  const isFinalHandoff = stepIndex === context.steps.length - 1;

  if (isEarlyHandoff) {
    return 'This pattern often suggests the first handoff after entry is not carrying visitors forward clearly, but funnel shape alone cannot confirm why.';
  }

  if (isFinalHandoff) {
    return 'A likely explanation is that the final handoff is losing visitors before completion, though this may indicate friction rather than prove a specific cause.';
  }

  return 'This may indicate that users are not moving cleanly from one defined step to the next, but the current analysis does not prove the exact reason for the leak.';
};

const buildRecommendations = (context: FunnelAiContext, largestDropoffStep: (typeof context.steps)[number] | null) => {
  const recommendations: AiRecommendation[] = [];
  const lowSignal = context.totalSessions === 0 || context.totalSessions < LOW_SIGNAL_THRESHOLD;

  if (lowSignal) {
    addRecommendation(recommendations, {
      id: 'wait-for-more-signal',
      title: 'Wait for more signal before calling the leak',
      detail: 'Use the funnel as a live watchpoint, but avoid strong conclusions until more sessions move through these steps.',
      href: '/analytics',
      priority: 'medium',
      rationale: getRecommendationRationale('wait-for-more-signal'),
    });

    if (context.funnel.siteId) {
      addRecommendation(recommendations, {
        id: 'inspect-client-site',
        title: 'Inspect the linked client site',
        detail: 'Review the client detail view to confirm installation, site health, and whether the funnel is scoped to the right account.',
        href: `/clients/${context.funnel.siteId}`,
        priority: 'low',
        rationale: getRecommendationRationale('inspect-client-site'),
      });
    }

    return recommendations.slice(0, 3);
  }

  if (largestDropoffStep && largestDropoffStep.dropoffRate >= 20) {
    addRecommendation(recommendations, {
      id: 'review-funnel-sessions',
      title: 'Review sessions around the drop-off',
      detail: 'Check real session paths before changing the funnel so you can see whether this shape reflects genuine friction or just a noisy sample.',
      href: '/sessions',
      priority: largestDropoffStep.dropoffRate >= 40 ? 'high' : 'medium',
      rationale: getRecommendationRationale('review-funnel-sessions'),
    });
  }

  addRecommendation(recommendations, {
    id: 'refine-funnel-steps',
    title: 'Confirm the funnel steps still match the journey',
    detail: 'Review the current step definitions and URL patterns so the funnel is measuring the path you actually want to manage.',
    href: '/analytics',
    priority: 'medium',
    rationale: getRecommendationRationale('refine-funnel-steps'),
  });

  if (context.funnel.siteId) {
    addRecommendation(recommendations, {
      id: 'inspect-client-site',
      title: 'Inspect the linked client site',
      detail: 'Open the client detail view to add surrounding context before turning this pattern into a stronger explanation.',
      href: `/clients/${context.funnel.siteId}`,
      priority: 'low',
      rationale: getRecommendationRationale('inspect-client-site'),
    });
  }

  return recommendations.slice(0, 3);
};

const buildEvidence = (context: FunnelAiContext, largestDropoffStep: (typeof context.steps)[number] | null): AiEvidenceItem[] => [
  {
    id: 'total-sessions',
    label: 'Total sessions',
    value: pluralize(context.totalSessions, 'session'),
    tone: context.totalSessions >= LOW_SIGNAL_THRESHOLD ? 'positive' : 'neutral',
  },
  {
    id: 'overall-completion',
    label: 'Completion rate',
    value: formatPercent(getOverallCompletionRate(context)),
    tone: getOverallCompletionRate(context) >= 40 ? 'positive' : getOverallCompletionRate(context) < 15 ? 'warning' : 'neutral',
  },
  {
    id: 'largest-dropoff',
    label: 'Largest drop-off',
    value: largestDropoffStep ? `${largestDropoffStep.name} (${formatPercent(largestDropoffStep.dropoffRate)})` : 'Not enough signal yet',
    tone: largestDropoffStep && largestDropoffStep.dropoffRate >= 40 ? 'warning' : 'neutral',
  },
  {
    id: 'configured-steps',
    label: 'Steps configured',
    value: pluralize(context.stepCount, 'step'),
    tone: context.stepCount >= 2 ? 'positive' : 'neutral',
  },
  {
    id: 'selected-period',
    label: 'Period',
    value: context.period,
    tone: 'neutral',
  },
];

export const buildFunnelAiBrief = (
  context: FunnelAiContext,
  generatedAt: string,
): FunnelAiBrief => {
  const largestDropoffStep = getLargestDropoffStep(context);

  return {
    period: context.period,
    mode: 'deterministic',
    generatedAt,
    headline: buildHeadline(context, largestDropoffStep),
    summary: buildSummary(context, largestDropoffStep),
    biggestDropoff: formatBiggestDropoff(context, largestDropoffStep),
    likelyReason: buildLikelyReason(context, largestDropoffStep),
    recommendations: buildRecommendations(context, largestDropoffStep),
    evidence: buildEvidence(context, largestDropoffStep),
  };
};
