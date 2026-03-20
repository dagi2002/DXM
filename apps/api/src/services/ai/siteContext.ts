import type { ClientSiteDetail } from '../siteAnalytics.js';

interface SiteAiAlertSnapshot {
  id: string;
  severity: ClientSiteDetail['openAlertsList'][number]['severity'];
  title: string;
  description: string | null;
  affectedSessions: number;
  createdAt: string;
}

interface SiteAiSessionSnapshot {
  id: string;
  startedAt: string | null;
  duration: number;
  device: string;
  entryUrl: string;
}

interface SiteAiFunnelSnapshot {
  id: string;
  name: string;
  stepCount: number;
}

export interface SiteAiContext {
  site: {
    id: string;
    name: string;
    domain: string;
  };
  tracking: {
    verified: boolean;
    trackingStatus: ClientSiteDetail['trackingStatus'];
    lastActivityAt: string | null;
  };
  summary: {
    sessionCount7d: number;
    openAlerts: number;
    criticalAlerts: number;
    avgDurationSeconds: number;
    bounceRate: number;
    conversionRate: number;
    healthScore: number;
  };
  topAlert: SiteAiAlertSnapshot | null;
  latestSession: SiteAiSessionSnapshot | null;
  vitals: {
    count: number;
    keys: string[];
  };
  funnels: {
    count: number;
    first: SiteAiFunnelSnapshot | null;
  };
}

export const buildSiteAiContext = (detail: ClientSiteDetail): SiteAiContext => ({
  site: {
    id: detail.id,
    name: detail.name,
    domain: detail.domain,
  },
  tracking: {
    verified: detail.verified,
    trackingStatus: detail.trackingStatus,
    lastActivityAt: detail.lastActivityAt,
  },
  summary: {
    sessionCount7d: detail.sessionCount7d,
    openAlerts: detail.openAlerts,
    criticalAlerts: detail.criticalAlerts,
    avgDurationSeconds: detail.avgDurationSeconds,
    bounceRate: detail.bounceRate,
    conversionRate: detail.conversionRate,
    healthScore: detail.healthScore,
  },
  topAlert: detail.openAlertsList[0]
    ? {
        id: detail.openAlertsList[0].id,
        severity: detail.openAlertsList[0].severity,
        title: detail.openAlertsList[0].title,
        description: detail.openAlertsList[0].description,
        affectedSessions: detail.openAlertsList[0].affectedSessions,
        createdAt: detail.openAlertsList[0].createdAt,
      }
    : null,
  latestSession: detail.recentSessions[0]
    ? {
        id: detail.recentSessions[0].id,
        startedAt: detail.recentSessions[0].startedAt,
        duration: detail.recentSessions[0].duration,
        device: detail.recentSessions[0].device,
        entryUrl: detail.recentSessions[0].entryUrl,
      }
    : null,
  vitals: {
    count: Object.keys(detail.vitals).length,
    keys: Object.keys(detail.vitals).sort(),
  },
  funnels: {
    count: detail.funnels.length,
    first: detail.funnels[0]
      ? {
          id: detail.funnels[0].id,
          name: detail.funnels[0].name,
          stepCount: detail.funnels[0].stepCount,
        }
      : null,
  },
});
