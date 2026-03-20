import {
  BILLING_FEATURES,
  DXM_PLAN_CATALOG,
  getNextPlanId,
  getPlanCatalogEntry,
  planSupportsFeature,
  type BillingFeatureId,
  type PlanCatalogEntry,
  type WorkspacePlanId,
} from '../../../../packages/contracts/index.js';

export type BillingStatus = 'active' | 'past_due' | 'cancelled';
export type UpgradeSource =
  | 'site_limit'
  | 'replay'
  | 'funnels'
  | 'user_flow'
  | 'alerts'
  | 'reports'
  | 'telegram'
  | 'digest'
  | 'direct_billing';

export interface BillingCurrentResponse {
  plan: WorkspacePlanId;
  billing_status: BillingStatus;
  siteCount: number;
  siteLimit: number;
}

export interface BillingUpgradeRequest {
  id: string;
  currentPlan: WorkspacePlanId;
  requestedPlan: WorkspacePlanId;
  source: UpgradeSource;
  siteCountAtRequest: number;
  siteLimitAtRequest: number;
  status: 'requested' | 'activated';
  createdAt: string;
  activatedAt: string | null;
  notes: string | null;
}

export const PLAN_CATALOG = DXM_PLAN_CATALOG;
export { BILLING_FEATURES };

export const getPlanMeta = (planId: WorkspacePlanId | string): PlanCatalogEntry =>
  getPlanCatalogEntry(planId);

export const getPlanLabel = (planId: WorkspacePlanId | string): string =>
  getPlanCatalogEntry(planId).name;

export const getRecommendedUpgradePlan = (currentPlan: WorkspacePlanId | string): WorkspacePlanId =>
  getNextPlanId(currentPlan);

export const workspaceHasFeature = (
  planId: WorkspacePlanId | string,
  featureId: BillingFeatureId,
): boolean => planSupportsFeature(planId, featureId);

export const buildBillingPath = (planId: WorkspacePlanId, source?: UpgradeSource): string => {
  const params = new URLSearchParams({ plan: planId });

  if (source) {
    params.set('source', source);
  }

  return `/settings/billing?${params.toString()}`;
};

export const getUpgradeSourceLabel = (source: UpgradeSource | null): string | null => {
  switch (source) {
    case 'site_limit':
      return 'You reached the current tracked-site limit for this workspace.';
    case 'replay':
      return 'Session replay is available on paid DXM plans.';
    case 'funnels':
      return 'Funnel analysis is available on paid DXM plans.';
    case 'user_flow':
      return 'User flow analysis is available on paid DXM plans.';
    case 'alerts':
      return 'The alert feed is available on paid DXM plans.';
    case 'reports':
      return 'Share-ready reports are available on paid DXM plans.';
    case 'telegram':
      return 'Telegram alert delivery is available on paid DXM plans.';
    case 'digest':
      return 'Weekly digest delivery is available on paid DXM plans.';
    case 'direct_billing':
      return 'You opened the billing page directly to request a manual upgrade.';
    default:
      return null;
  }
};
