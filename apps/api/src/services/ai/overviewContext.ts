import type { PortfolioOverview } from '../siteAnalytics.js';

type OverviewSite = PortfolioOverview['siteRollups'][number];
type OverviewAlertHotspot = PortfolioOverview['alertHotspots'][number];
type OverviewAction = PortfolioOverview['recommendedActions'][number];

interface OverviewAiSiteSnapshot {
  id: string;
  name: string;
  healthScore: number;
  openAlerts: number;
  verified: boolean;
  trackingStatus: OverviewSite['trackingStatus'];
}

interface OverviewAiAlertSnapshot {
  id: string;
  siteId: string | null;
  siteName: string;
  severity: OverviewAlertHotspot['severity'];
  title: string;
  description: string | null;
}

export interface OverviewAiContext {
  summary: PortfolioOverview['summary'] & {
    unverifiedClients: number;
  };
  topAlertHotspot: OverviewAiAlertSnapshot | null;
  strongestSite: OverviewAiSiteSnapshot | null;
  weakestSite: OverviewAiSiteSnapshot | null;
  recommendedActions: OverviewAction[];
}

const compareSiteNames = (left: OverviewSite, right: OverviewSite) => left.name.localeCompare(right.name);

const pickStrongestSite = (siteRollups: PortfolioOverview['siteRollups']): OverviewAiSiteSnapshot | null => {
  const strongestSite = [...siteRollups].sort((left, right) => {
    if (right.healthScore !== left.healthScore) return right.healthScore - left.healthScore;
    return compareSiteNames(left, right);
  })[0];

  if (!strongestSite) return null;

  return {
    id: strongestSite.id,
    name: strongestSite.name,
    healthScore: strongestSite.healthScore,
    openAlerts: strongestSite.openAlerts,
    verified: strongestSite.verified,
    trackingStatus: strongestSite.trackingStatus,
  };
};

const pickWeakestSite = (siteRollups: PortfolioOverview['siteRollups']): OverviewAiSiteSnapshot | null => {
  const weakestSite = [...siteRollups].sort((left, right) => {
    if (left.healthScore !== right.healthScore) return left.healthScore - right.healthScore;
    return compareSiteNames(left, right);
  })[0];

  if (!weakestSite) return null;

  return {
    id: weakestSite.id,
    name: weakestSite.name,
    healthScore: weakestSite.healthScore,
    openAlerts: weakestSite.openAlerts,
    verified: weakestSite.verified,
    trackingStatus: weakestSite.trackingStatus,
  };
};

export const buildOverviewAiContext = (overview: PortfolioOverview): OverviewAiContext => ({
  summary: {
    ...overview.summary,
    unverifiedClients: overview.siteRollups.filter((site) => !site.verified).length,
  },
  topAlertHotspot: overview.alertHotspots[0]
    ? {
        id: overview.alertHotspots[0].id,
        siteId: overview.alertHotspots[0].siteId,
        siteName: overview.alertHotspots[0].siteName,
        severity: overview.alertHotspots[0].severity,
        title: overview.alertHotspots[0].title,
        description: overview.alertHotspots[0].description,
      }
    : null,
  strongestSite: pickStrongestSite(overview.siteRollups),
  weakestSite: pickWeakestSite(overview.siteRollups),
  recommendedActions: overview.recommendedActions.map((action) => ({ ...action })),
});
