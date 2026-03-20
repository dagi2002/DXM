import type {
  AiEvidenceItem,
  AiRecommendation,
  AlertAiBrief,
} from '../../../../../packages/contracts/index.js';
import type { AlertAiContext } from './alertContext.js';

const pluralize = (count: number, singular: string, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`;

const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

const getRecommendationRationale = (recommendationId: string) => {
  switch (recommendationId) {
    case 'review-sessions':
      return 'Session evidence is the fastest way to confirm what users actually experienced around this alert.';
    case 'inspect-client-site':
      return 'The client detail surface shows the site context most likely to explain or validate this alert.';
    case 'review-performance':
      return 'Performance and conversion alerts are easier to confirm when you inspect the live analytics context directly.';
    case 'follow-up-on-resolution':
      return 'Resolved alerts still need closure so the team can confirm the fix and communicate it clearly.';
    default:
      return 'This action is directly supported by the current alert record.';
  }
};

const matchesTitle = (context: AlertAiContext, expected: string) =>
  context.title.trim().toLowerCase() === expected;

const buildHeadline = (context: AlertAiContext) => {
  if (context.state === 'resolved') {
    return `${context.title} has been resolved.`;
  }

  if (context.severity === 'critical') {
    return `${context.title} needs immediate review.`;
  }

  if (context.severity === 'high') {
    return `${context.title} needs prompt attention.`;
  }

  return `${context.title} should be reviewed.`;
};

const buildSummary = (context: AlertAiContext) => {
  if (context.state === 'resolved') {
    return `${capitalize(context.severity)} ${context.type} alert${context.affectedSessions > 0 ? ` previously touched ${pluralize(context.affectedSessions, 'session')}` : ''} and is now resolved. Use it as follow-up context to confirm the fix and capture client-facing notes.`;
  }

  if (context.affectedSessions > 0) {
    return `${capitalize(context.severity)} ${context.type} alert is still active and is currently tied to ${pluralize(context.affectedSessions, 'session')}. Review it before it becomes client-visible.`;
  }

  return `${capitalize(context.severity)} ${context.type} alert is active without a confirmed affected-session count yet. Treat it as an early warning and verify whether impact is spreading.`;
};

const buildWhyFired = (context: AlertAiContext) => {
  const description = context.description ? ` ${context.description}` : '';

  switch (context.type) {
    case 'frustration':
      if (matchesTitle(context, 'rage click detected')) {
        return `This alert fired because repeated clicks on the same target usually mean visitors expect an interaction to work but it is not responding clearly.${description}`;
      }
      return `This alert fired because current user behavior suggests visitors are struggling to complete an interaction or are hitting a confusing UI state.${description}`;
    case 'performance':
      if (matchesTitle(context, 'slow page load detected')) {
        return `This alert fired because recent performance signals suggest slower-than-expected load or rendering behavior, which can undercut trust before the page fully settles.${description}`;
      }
      return `This alert fired because current performance signals suggest slower page experience or degraded rendering that may push visitors away early.${description}`;
    case 'conversion':
      if (matchesTitle(context, 'high bounce rate')) {
        return `This alert fired because visitors are leaving quickly before meaningful engagement, which usually signals weak landing-page fit, load friction, or a broken path forward.${description}`;
      }
      return `This alert fired because current traffic quality or on-page behavior suggests visitors are dropping out before reaching a meaningful conversion path.${description}`;
    case 'error':
    default:
      return `This alert fired because the recorded issue suggests part of the user journey may be broken, interrupted, or failing to behave as expected.${description}`;
  }
};

const buildImpact = (context: AlertAiContext) => {
  if (context.state === 'resolved') {
    return 'The immediate risk is lower because this alert is resolved, but it is still worth confirming the fix and folding the outcome into client follow-up or QA notes.';
  }

  if ((context.severity === 'critical' || context.severity === 'high') && context.affectedSessions > 0) {
    return `This is already touching ${pluralize(context.affectedSessions, 'session')} and can become account-visible quickly if it stays open.`;
  }

  if (context.affectedSessions > 0) {
    return `This issue has touched ${pluralize(context.affectedSessions, 'session')} so far and may already be influencing engagement, trust, or conversion.`;
  }

  return 'No affected-session count is attached yet, so treat this as an early warning signal and confirm whether the issue is spreading before the next client check-in.';
};

const addRecommendation = (
  recommendations: AiRecommendation[],
  recommendation: AiRecommendation,
) => {
  if (recommendations.some((item) => item.id === recommendation.id)) return;
  recommendations.push(recommendation);
};

const buildRecommendations = (context: AlertAiContext): AiRecommendation[] => {
  const recommendations: AiRecommendation[] = [];

  if (context.state === 'resolved') {
    addRecommendation(recommendations, {
      id: 'follow-up-on-resolution',
      title: 'Confirm the fix and close the loop',
      detail: 'Use this resolved alert as a follow-up checkpoint so the team can verify the fix and capture any client-facing notes.',
      href: '/alerts',
      priority: 'medium',
      rationale: getRecommendationRationale('follow-up-on-resolution'),
    });

    if (context.siteId) {
      addRecommendation(recommendations, {
        id: 'inspect-client-site',
        title: 'Review the client site context',
        detail: 'Open the client detail view to confirm the surrounding site health and make sure no related issues remain active.',
        href: `/clients/${context.siteId}`,
        priority: 'low',
        rationale: getRecommendationRationale('inspect-client-site'),
      });
    }

    return recommendations.slice(0, 3);
  }

  switch (context.type) {
    case 'frustration':
      addRecommendation(recommendations, {
        id: 'review-sessions',
        title: 'Review recent sessions around this issue',
        detail: 'Check session evidence first so you can see exactly where visitors struggled before deciding on a fix.',
        href: '/sessions',
        priority: context.severity === 'critical' ? 'high' : 'medium',
        rationale: getRecommendationRationale('review-sessions'),
      });
      if (context.siteId) {
        addRecommendation(recommendations, {
          id: 'inspect-client-site',
          title: 'Inspect the affected client site',
          detail: 'Open the client detail page to confirm whether this alert lines up with the site’s current health and active issues.',
          href: `/clients/${context.siteId}`,
          priority: 'medium',
          rationale: getRecommendationRationale('inspect-client-site'),
        });
      }
      break;
    case 'performance':
      addRecommendation(recommendations, {
        id: 'review-performance',
        title: 'Review performance signals next',
        detail: 'Use the analytics surface to confirm whether speed degradation is still active and where it is most visible.',
        href: '/analytics',
        priority: context.severity === 'critical' || context.severity === 'high' ? 'high' : 'medium',
        rationale: getRecommendationRationale('review-performance'),
      });
      addRecommendation(recommendations, {
        id: 'review-sessions',
        title: 'Inspect recent sessions for slowdown symptoms',
        detail: 'Session evidence helps confirm whether slow rendering is visibly degrading the experience.',
        href: '/sessions',
        priority: 'medium',
        rationale: getRecommendationRationale('review-sessions'),
      });
      break;
    case 'conversion':
      addRecommendation(recommendations, {
        id: 'review-sessions',
        title: 'Review sessions to understand the drop-off',
        detail: 'Check how visitors are arriving and leaving so you can verify whether the alert reflects real conversion friction.',
        href: '/sessions',
        priority: 'high',
        rationale: getRecommendationRationale('review-sessions'),
      });
      addRecommendation(recommendations, {
        id: 'review-performance',
        title: 'Check analytics for supporting signals',
        detail: 'Look for speed or engagement signals that help explain why visits are failing to turn into meaningful actions.',
        href: '/analytics',
        priority: 'medium',
        rationale: getRecommendationRationale('review-performance'),
      });
      break;
    case 'error':
    default:
      if (context.siteId) {
        addRecommendation(recommendations, {
          id: 'inspect-client-site',
          title: 'Inspect the affected client site',
          detail: 'Open the client detail page to review the site context before this issue reaches the client.',
          href: `/clients/${context.siteId}`,
          priority: 'high',
          rationale: getRecommendationRationale('inspect-client-site'),
        });
      }
      addRecommendation(recommendations, {
        id: 'review-sessions',
        title: 'Review recent sessions for breakage',
        detail: 'Session evidence is the fastest way to confirm what users hit when this issue occurred.',
        href: '/sessions',
        priority: 'medium',
        rationale: getRecommendationRationale('review-sessions'),
      });
      break;
  }

  addRecommendation(recommendations, {
    id: 'follow-up-on-resolution',
    title: 'Resolve after verification',
    detail: 'Once the issue is confirmed and addressed, close the alert so it does not linger in the operator feed.',
    href: '/alerts',
    priority: context.severity === 'critical' ? 'high' : 'low',
    rationale: getRecommendationRationale('follow-up-on-resolution'),
  });

  return recommendations.slice(0, 3);
};

const buildEvidence = (context: AlertAiContext): AiEvidenceItem[] => [
  {
    id: 'alert-severity',
    label: 'Severity',
    value: capitalize(context.severity),
    tone:
      context.severity === 'critical' || context.severity === 'high'
        ? 'warning'
        : 'neutral',
  },
  {
    id: 'alert-status',
    label: 'Status',
    value: context.state === 'resolved' ? 'Resolved' : 'Active',
    tone: context.state === 'resolved' ? 'positive' : 'warning',
  },
  {
    id: 'affected-sessions',
    label: 'Affected sessions',
    value: context.affectedSessions > 0 ? pluralize(context.affectedSessions, 'session') : 'None counted yet',
    tone:
      context.affectedSessions > 0 && context.state === 'active'
        ? 'warning'
        : context.state === 'resolved'
          ? 'positive'
          : 'neutral',
  },
  {
    id: 'alert-type',
    label: 'Alert type',
    value: capitalize(context.type),
    tone: 'neutral',
  },
  {
    id: 'telegram-delivery',
    label: 'Telegram delivery',
    value: context.telegramSent ? 'Sent' : 'Not sent',
    tone: context.telegramSent ? 'positive' : 'neutral',
  },
];

export const buildAlertAiBrief = (
  context: AlertAiContext,
  generatedAt: string,
): AlertAiBrief => ({
  period: 'current',
  mode: 'deterministic',
  generatedAt,
  state: context.state,
  headline: buildHeadline(context),
  summary: buildSummary(context),
  whyFired: buildWhyFired(context),
  impact: buildImpact(context),
  recommendations: buildRecommendations(context),
  evidence: buildEvidence(context),
});
