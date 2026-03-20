import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BellRing,
  Settings,
} from 'lucide-react';
import type { Alert, Metric, SessionRecording } from '../../types';

interface RecommendedActionsProps {
  sessions: SessionRecording[];
  metrics: Metric[];
  alerts: Alert[];
}

interface SuggestedAction {
  id: string;
  title: string;
  description: string;
  ctaLabel: string;
  to: string;
  tone: 'danger' | 'warning' | 'success';
  Icon: typeof AlertTriangle;
}

const getNumericMetric = (metric?: Metric) => {
  if (!metric) {
    return null;
  }

  if (typeof metric.value === 'number') {
    return metric.value;
  }

  const parsed = parseFloat(String(metric.value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

const toneStyles: Record<SuggestedAction['tone'], string> = {
  danger: 'border-red-200 bg-red-50 text-red-900',
  warning: 'border-accent-200 bg-accent-50 text-accent-900',
  success: 'border-primary-200 bg-primary-50 text-primary-900',
};

export const RecommendedActions: React.FC<RecommendedActionsProps> = ({
  sessions,
  metrics,
  alerts,
}) => {
  const actions = useMemo(() => {
    const nextActions: SuggestedAction[] = [];
    const openAlerts = alerts.filter((alert) => !alert.resolved);
    const urgentAlerts = openAlerts.filter(
      (alert) => alert.severity === 'critical' || alert.severity === 'high'
    );
    const bounceRate = getNumericMetric(
      metrics.find((metric) => metric.name.toLowerCase().includes('bounce'))
    );
    const conversionRate = getNumericMetric(
      metrics.find((metric) => metric.name.toLowerCase().includes('conversion'))
    );

    if (sessions.length === 0) {
      nextActions.push({
        id: 'setup',
        title: 'Finish installation on your first site',
        description:
          'No live sessions have arrived yet. Copy the install snippet, publish it, and verify the site so the dashboard starts earning trust immediately.',
        ctaLabel: 'Open setup',
        to: '/settings',
        tone: 'warning',
        Icon: Settings,
      });
    }

    if (urgentAlerts.length > 0) {
      nextActions.push({
        id: 'alerts',
        title: 'Resolve the highest-impact website issues first',
        description:
          'DXM Pulse is already catching live friction. Clearing the urgent alerts will improve confidence in the product and reduce obvious user pain quickly.',
        ctaLabel: 'Review alerts',
        to: '/alerts',
        tone: 'danger',
        Icon: AlertTriangle,
      });
    }

    if (typeof bounceRate === 'number' && bounceRate >= 60) {
      nextActions.push({
        id: 'bounce',
        title: 'Investigate why visitors leave so quickly',
        description:
          'Bounce rate is high enough to suggest a weak landing page, a broken CTA, or a slow mobile experience. Session replay and user flow will show where the drop starts.',
        ctaLabel: 'Open analytics',
        to: '/analytics',
        tone: 'warning',
        Icon: BarChart3,
      });
    }

    if (typeof conversionRate === 'number' && conversionRate > 0 && conversionRate < 2) {
      nextActions.push({
        id: 'conversion',
        title: 'Turn low conversion into a clearer business story',
        description:
          'Conversion is live, but weak. Use funnels and replay to find where sign-up, contact, or checkout intent is breaking down for Ethiopian mobile visitors.',
        ctaLabel: 'Inspect funnels',
        to: '/analytics',
        tone: 'warning',
        Icon: BarChart3,
      });
    }

    if (sessions.length > 0 && openAlerts.length === 0) {
      nextActions.push({
        id: 'digest',
        title: 'Push insights to the team instead of waiting for logins',
        description:
          'Weekly Telegram digest is the easiest retention loop in the current product. Turn it on so DXM Pulse keeps showing value even when customers do not open the dashboard daily.',
        ctaLabel: 'Enable digest',
        to: '/settings',
        tone: 'success',
        Icon: BellRing,
      });
    }

    return nextActions.slice(0, 3);
  }, [alerts, metrics, sessions]);

  if (actions.length === 0) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-surface-200 bg-white p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-surface-900">Next best actions</h2>
        <p className="mt-1 text-sm text-surface-500">
          Real recommendations based on your live alerts, sessions, and conversion signals.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {actions.map((action) => (
          <div
            key={action.id}
            className={`rounded-xl border p-4 ${toneStyles[action.tone]}`}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/70">
                <action.Icon className="h-5 w-5" />
              </div>

              <div className="min-w-0">
                <h3 className="text-sm font-semibold">{action.title}</h3>
                <p className="mt-1 text-sm opacity-90">{action.description}</p>
              </div>
            </div>

            <Link
              to={action.to}
              className="mt-4 inline-flex items-center gap-2 text-sm font-semibold"
            >
              {action.ctaLabel}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
};
