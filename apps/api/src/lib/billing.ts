import type { RequestHandler, Response } from 'express';
import {
  BILLING_FEATURES,
  DXM_PLAN_CATALOG,
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

// ── Billing helpers used by admin, webhook, and collect routes ────────────────

/**
 * Numeric rank of a plan in the upgrade hierarchy.
 * free=0, starter=1, pro=2. Returns -1 for unknown plan IDs.
 * Uses DXM_PLAN_CATALOG array order as the single source of truth.
 */
export const planRank = (plan: string): number =>
  DXM_PLAN_CATALOG.findIndex(p => p.id === plan);

/**
 * Monthly session limit for a given plan ID.
 * Delegates to getPlanCatalogEntry — no hardcoded numbers here.
 */
export const getWorkspaceSessionLimit = (plan: string): number =>
  getPlanCatalogEntry(plan as WorkspacePlanId).sessions;

/**
 * Count sessions created in the last 30 days for a workspace.
 * Uses idx_sessions_workspace_created for fast indexed lookup.
 */
export const countWorkspaceSessionsLast30Days = (workspaceId: string): number => {
  const row = db
    .prepare<[string], { count: number }>(
      `SELECT COUNT(*) as count FROM sessions
       WHERE workspace_id = ?
         AND created_at >= datetime('now', '-30 days')`
    )
    .get(workspaceId);
  return row?.count ?? 0;
};

/**
 * Set a workspace's plan and mark billing_status as active.
 * Intentionally narrow — callers must call reconcileUpgradeRequests() afterwards
 * to avoid a circular import with workspaceSignals.ts.
 */
export const activateWorkspacePlan = (
  workspaceId: string,
  plan: 'starter' | 'pro',
): void => {
  db.prepare(
    "UPDATE workspaces SET plan = ?, billing_status = 'active' WHERE id = ?"
  ).run(plan, workspaceId);
};
