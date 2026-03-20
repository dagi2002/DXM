import type { RequestHandler, Response } from 'express';
import {
  BILLING_FEATURES,
  getNextPlanId,
  getPlanCatalogEntry,
  getPlanSiteLimit,
  planSupportsFeature,
  type BillingFeatureId,
  type WorkspacePlanId,
} from '../../../../packages/contracts/index.js';
import { db } from '../db/index.js';

export type WorkspaceBillingStatus = 'active' | 'past_due' | 'cancelled';

export interface WorkspacePlanState {
  plan: WorkspacePlanId;
  billingStatus: WorkspaceBillingStatus;
}

export interface WorkspaceBillingSnapshot extends WorkspacePlanState {
  siteCount: number;
  siteLimit: number;
}

const FALLBACK_PLAN_STATE: WorkspacePlanState = {
  plan: 'free',
  billingStatus: 'active',
};

const normalizePlanId = (value: unknown): WorkspacePlanId => {
  if (value === 'starter' || value === 'pro') {
    return value;
  }

  return 'free';
};

const normalizeBillingStatus = (value: unknown): WorkspaceBillingStatus => {
  if (value === 'past_due' || value === 'cancelled') {
    return value;
  }

  return 'active';
};

export const getWorkspacePlanState = (workspaceId: string): WorkspacePlanState => {
  const workspace = db
    .prepare<[string], { plan: string; billing_status: string }>(
      'SELECT plan, billing_status FROM workspaces WHERE id = ?',
    )
    .get(workspaceId);

  if (!workspace) {
    return FALLBACK_PLAN_STATE;
  }

  return {
    plan: normalizePlanId(workspace.plan),
    billingStatus: normalizeBillingStatus(workspace.billing_status),
  };
};

export const getWorkspaceSiteCount = (workspaceId: string): number =>
  db.prepare<[string], { count: number }>('SELECT COUNT(*) as count FROM sites WHERE workspace_id = ?')
    .get(workspaceId)?.count ?? 0;

export const getWorkspaceBillingSnapshot = (workspaceId: string): WorkspaceBillingSnapshot => {
  const planState = getWorkspacePlanState(workspaceId);

  return {
    ...planState,
    siteCount: getWorkspaceSiteCount(workspaceId),
    siteLimit: getPlanSiteLimit(planState.plan),
  };
};

export const sendFeatureNotInPlan = (
  res: Response,
  plan: WorkspacePlanId,
  feature: BillingFeatureId,
) => {
  const upgradePlan = getNextPlanId(plan);
  const upgradePlanName = getPlanCatalogEntry(upgradePlan).name;

  return res.status(403).json({
    error: `${upgradePlanName} unlocks this feature for agency workspaces.`,
    code: 'feature_not_in_plan',
    feature,
    currentPlan: plan,
    upgradePlan,
  });
};

export const sendPlanLimitReached = (res: Response, snapshot: WorkspaceBillingSnapshot) => {
  const upgradePlan = getNextPlanId(snapshot.plan);
  const upgradePlanName = getPlanCatalogEntry(upgradePlan).name;

  return res.status(409).json({
    error: `You have reached the ${snapshot.siteLimit}-site limit on ${getPlanCatalogEntry(snapshot.plan).name}. Upgrade to ${upgradePlanName} to keep adding tracked client sites.`,
    code: 'plan_limit_reached',
    currentPlan: snapshot.plan,
    limitType: 'sites',
    limit: snapshot.siteLimit,
    currentCount: snapshot.siteCount,
    upgradePlan,
  });
};

export const requirePlanFeature = (feature: BillingFeatureId): RequestHandler => (req, res, next) => {
  const planState = getWorkspacePlanState(req.user!.workspaceId);

  if (!planSupportsFeature(planState.plan, feature)) {
    return sendFeatureNotInPlan(res, planState.plan, feature);
  }

  next();
};

export { BILLING_FEATURES, planSupportsFeature };
