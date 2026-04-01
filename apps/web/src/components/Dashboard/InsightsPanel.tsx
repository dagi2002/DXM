import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Eye,
  Lightbulb,
  TrendingUp,
  XCircle,
} from 'lucide-react';

export interface Insight {
  id: string;
  siteId: string | null;
  type: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  recommendation: string | null;
  data: Record<string, unknown> | null;
  active: boolean;
  createdAt: string;
  resolvedAt: string | null;
}

interface InsightsPanelProps {
  insights: Insight[];
  isLoading: boolean;
}

const severityConfig = {
  critical: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: <XCircle className="h-5 w-5 text-red-600" />,
    badge: 'bg-red-100 text-red-700',
  },
  warning: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    icon: <AlertTriangle className="h-5 w-5 text-amber-600" />,
    badge: 'bg-amber-100 text-amber-700',
  },
  info: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    icon: <TrendingUp className="h-5 w-5 text-emerald-600" />,
    badge: 'bg-emerald-100 text-emerald-700',
  },
};

// Insight types that are session-related — show "View sessions" link
const SESSION_RELATED_TYPES = new Set(['bounce_rate', 'low_duration', 'traffic_drop', 'traffic_growth']);

function buildSessionLink(insight: Insight): string | null {
  if (!SESSION_RELATED_TYPES.has(insight.type)) return null;
  const params = new URLSearchParams();
  params.set('insightTitle', insight.title);
  params.set('insightSeverity', insight.severity);
  return `/sessions?${params.toString()}`;
}

export const InsightsPanel: React.FC<InsightsPanelProps> = ({ insights, isLoading }) => {
  const [collapsed, setCollapsed] = useState(false);

  if (isLoading || insights.length === 0) return null;

  const activeInsights = insights.filter((i) => i.active);
  const criticalCount = activeInsights.filter((i) => i.severity === 'critical').length;
  const warningCount = activeInsights.filter((i) => i.severity === 'warning').length;

  return (
    <div className="rounded-xl border border-surface-200 bg-white shadow-sm">
      {/* Header — always visible, clickable to collapse */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-surface-50"
      >
        <div className="flex items-center gap-3">
          <Lightbulb className="h-5 w-5 text-primary-600" />
          <h3 className="text-lg font-semibold text-surface-900">Insights</h3>
          <div className="flex items-center gap-2">
            {criticalCount > 0 && (
              <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                {criticalCount} critical
              </span>
            )}
            {warningCount > 0 && (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                {warningCount} warning{warningCount > 1 ? 's' : ''}
              </span>
            )}
            {criticalCount === 0 && warningCount === 0 && (
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                All good
              </span>
            )}
          </div>
        </div>
        {collapsed ? (
          <ChevronDown className="h-5 w-5 text-surface-400" />
        ) : (
          <ChevronUp className="h-5 w-5 text-surface-400" />
        )}
      </button>

      {/* Body — collapsible */}
      {!collapsed && (
        <div className="space-y-3 px-5 pb-5">
          {activeInsights.map((insight) => {
            const config = severityConfig[insight.severity];
            const sessionLink = buildSessionLink(insight);

            return (
              <div
                key={insight.id}
                className={`rounded-lg border ${config.border} ${config.bg} p-4`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex-shrink-0">{config.icon}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-surface-900">{insight.title}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${config.badge}`}>
                        {insight.severity}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-surface-600">{insight.description}</p>
                    {insight.recommendation && (
                      <div className="mt-2 flex items-start gap-2 rounded-md bg-white/60 px-3 py-2">
                        <Lightbulb className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary-500" />
                        <p className="text-xs text-surface-700">{insight.recommendation}</p>
                      </div>
                    )}
                    {sessionLink && (
                      <Link
                        to={sessionLink}
                        className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View sessions
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
