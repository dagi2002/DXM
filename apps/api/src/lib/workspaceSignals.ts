import { nanoid } from 'nanoid';
import type { WorkspacePlanId } from '../../../../packages/contracts/index.js';
import { db } from '../db/index.js';
import { getWorkspaceBillingSnapshot } from './billing.js';

export type AgencyType = 'web_agency' | 'growth_agency' | 'studio' | 'freelancer' | 'in_house';
export type ManagedSitesBand = '1_2' | '3_5' | '6_10' | '11_15' | '16_plus';
export type ReportingWorkflow = 'manual_docs' | 'slides' | 'chat_updates' | 'mixed' | 'none_yet';
export type JourneyMilestoneKey =
  | 'site_live'
  | 'replay_viewed'
  | 'alert_reviewed'
  | 'report_exported'
  | 'upgrade_request';
export type UpgradeRequestSource =
  | 'site_limit'
  | 'replay'
  | 'funnels'
  | 'user_flow'
  | 'alerts'
  | 'reports'
  | 'telegram'
  | 'digest'
  | 'direct_billing';
export type UpgradeRequestStatus = 'requested' | 'activated';

export interface WorkspaceFitProfile {
  agencyType: AgencyType | null;
  managedSitesBand: ManagedSitesBand | null;
  reportingWorkflow: ReportingWorkflow | null;
  evaluationReason: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface WorkspaceJourneyMilestones {
  firstSiteLiveAt: string | null;
  firstReplayViewedAt: string | null;
  firstAlertReviewedAt: string | null;
  firstReportExportedAt: string | null;
  firstUpgradeRequestAt: string | null;
}

export interface UpgradeRequestRecord {
  id: string;
  currentPlan: WorkspacePlanId;
  requestedPlan: WorkspacePlanId;
  source: UpgradeRequestSource;
  siteCountAtRequest: number;
  siteLimitAtRequest: number;
  status: UpgradeRequestStatus;
  createdAt: string;
  activatedAt: string | null;
  notes: string | null;
}

interface WorkspaceProfileRow {
  agency_type: AgencyType | null;
  managed_sites_band: ManagedSitesBand | null;
  reporting_workflow: ReportingWorkflow | null;
  evaluation_reason: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface WorkspaceMilestoneRow {
  first_site_live_at: string | null;
  first_replay_viewed_at: string | null;
  first_alert_reviewed_at: string | null;
  first_report_exported_at: string | null;
  first_upgrade_request_at: string | null;
}

interface UpgradeRequestRow {
  id: string;
  current_plan: WorkspacePlanId;
  requested_plan: WorkspacePlanId;
  source: UpgradeRequestSource;
  site_count_at_request: number;
  site_limit_at_request: number;
  status: UpgradeRequestStatus;
  created_at: string;
  activated_at: string | null;
  notes: string | null;
}

const MILESTONE_COLUMN_BY_KEY: Record<JourneyMilestoneKey, string> = {
  site_live: 'first_site_live_at',
  replay_viewed: 'first_replay_viewed_at',
  alert_reviewed: 'first_alert_reviewed_at',
  report_exported: 'first_report_exported_at',
  upgrade_request: 'first_upgrade_request_at',
};

const planRank = (plan: WorkspacePlanId) => {
  if (plan === 'pro') return 3;
  if (plan === 'starter') return 2;
  return 1;
};

const normalizePlan = (plan: string): WorkspacePlanId => {
  if (plan === 'starter' || plan === 'pro') {
    return plan;
  }

  return 'free';
};

const mapProfile = (row?: WorkspaceProfileRow): WorkspaceFitProfile => ({
  agencyType: row?.agency_type ?? null,
  managedSitesBand: row?.managed_sites_band ?? null,
  reportingWorkflow: row?.reporting_workflow ?? null,
  evaluationReason: row?.evaluation_reason ?? null,
  createdAt: row?.created_at ?? null,
  updatedAt: row?.updated_at ?? null,
});

const mapMilestones = (row?: WorkspaceMilestoneRow): WorkspaceJourneyMilestones => ({
  firstSiteLiveAt: row?.first_site_live_at ?? null,
  firstReplayViewedAt: row?.first_replay_viewed_at ?? null,
  firstAlertReviewedAt: row?.first_alert_reviewed_at ?? null,
  firstReportExportedAt: row?.first_report_exported_at ?? null,
  firstUpgradeRequestAt: row?.first_upgrade_request_at ?? null,
});

const mapUpgradeRequest = (row: UpgradeRequestRow): UpgradeRequestRecord => ({
  id: row.id,
  currentPlan: normalizePlan(row.current_plan),
  requestedPlan: normalizePlan(row.requested_plan),
  source: row.source,
  siteCountAtRequest: row.site_count_at_request,
  siteLimitAtRequest: row.site_limit_at_request,
  status: row.status,
  createdAt: row.created_at,
  activatedAt: row.activated_at,
  notes: row.notes,
});

export const getWorkspaceFitProfile = (workspaceId: string): WorkspaceFitProfile => {
  const row = db
    .prepare<[string], WorkspaceProfileRow>(
      `
        SELECT agency_type, managed_sites_band, reporting_workflow, evaluation_reason, created_at, updated_at
        FROM workspace_profiles
        WHERE workspace_id = ?
      `,
    )
    .get(workspaceId);

  return mapProfile(row);
};

export const getWorkspaceJourneyMilestones = (workspaceId: string): WorkspaceJourneyMilestones => {
  const row = db
    .prepare<[string], WorkspaceMilestoneRow>(
      `
        SELECT
          first_site_live_at,
          first_replay_viewed_at,
          first_alert_reviewed_at,
          first_report_exported_at,
          first_upgrade_request_at
        FROM workspace_milestones
        WHERE workspace_id = ?
      `,
    )
    .get(workspaceId);

  return mapMilestones(row);
};

export const upsertWorkspaceFitProfile = (
  workspaceId: string,
  input: {
    agencyType?: AgencyType | null;
    managedSitesBand?: ManagedSitesBand | null;
    reportingWorkflow?: ReportingWorkflow | null;
    evaluationReason?: string | null;
  },
) => {
  const current = getWorkspaceFitProfile(workspaceId);

  db.prepare(
    `
      INSERT INTO workspace_profiles (
        workspace_id,
        agency_type,
        managed_sites_band,
        reporting_workflow,
        evaluation_reason,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(workspace_id) DO UPDATE SET
        agency_type = excluded.agency_type,
        managed_sites_band = excluded.managed_sites_band,
        reporting_workflow = excluded.reporting_workflow,
        evaluation_reason = excluded.evaluation_reason,
        updated_at = CURRENT_TIMESTAMP
    `,
  ).run(
    workspaceId,
    typeof input.agencyType !== 'undefined' ? input.agencyType : current.agencyType,
    typeof input.managedSitesBand !== 'undefined'
      ? input.managedSitesBand
      : current.managedSitesBand,
    typeof input.reportingWorkflow !== 'undefined'
      ? input.reportingWorkflow
      : current.reportingWorkflow,
    typeof input.evaluationReason !== 'undefined'
      ? input.evaluationReason
      : current.evaluationReason,
  );
};

export const recordJourneyMilestone = (workspaceId: string, milestone: JourneyMilestoneKey) => {
  const column = MILESTONE_COLUMN_BY_KEY[milestone];

  db.transaction(() => {
    db.prepare(
      `
        INSERT INTO workspace_milestones (workspace_id, created_at, updated_at)
        VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(workspace_id) DO NOTHING
      `,
    ).run(workspaceId);

    db.prepare(
      `
        UPDATE workspace_milestones
        SET ${column} = COALESCE(${column}, CURRENT_TIMESTAMP),
            updated_at = CURRENT_TIMESTAMP
        WHERE workspace_id = ?
      `,
    ).run(workspaceId);
  })();

  return getWorkspaceJourneyMilestones(workspaceId);
};

export const reconcileUpgradeRequests = (workspaceId: string) => {
  const workspace = db
    .prepare<[string], { plan: WorkspacePlanId }>('SELECT plan FROM workspaces WHERE id = ?')
    .get(workspaceId);

  if (!workspace) return;

  const pendingRequests = db
    .prepare<[string], { id: string; requested_plan: string }>(
      `
        SELECT id, requested_plan
        FROM upgrade_requests
        WHERE workspace_id = ?
          AND status = 'requested'
      `,
    )
    .all(workspaceId);

  for (const request of pendingRequests) {
    if (planRank(workspace.plan) < planRank(normalizePlan(request.requested_plan))) {
      continue;
    }

    db.prepare(
      `
        UPDATE upgrade_requests
        SET
          status = 'activated',
          activated_at = COALESCE(activated_at, CURRENT_TIMESTAMP)
        WHERE id = ?
      `,
    ).run(request.id);
  }
};

export const listUpgradeRequests = (workspaceId: string): UpgradeRequestRecord[] => {
  reconcileUpgradeRequests(workspaceId);

  const rows = db
    .prepare<[string], UpgradeRequestRow>(
      `
        SELECT
          id,
          current_plan,
          requested_plan,
          source,
          site_count_at_request,
          site_limit_at_request,
          status,
          created_at,
          activated_at,
          notes
        FROM upgrade_requests
        WHERE workspace_id = ?
        ORDER BY created_at DESC
      `,
    )
    .all(workspaceId);

  return rows.map(mapUpgradeRequest);
};

export const createUpgradeRequest = (input: {
  workspaceId: string;
  requestedByUserId: string;
  requestedPlan: WorkspacePlanId;
  source: UpgradeRequestSource;
  notes?: string | null;
}) => {
  reconcileUpgradeRequests(input.workspaceId);

  const latestMatching = db
    .prepare<[string, WorkspacePlanId, UpgradeRequestSource], UpgradeRequestRow>(
      `
        SELECT
          id,
          current_plan,
          requested_plan,
          source,
          site_count_at_request,
          site_limit_at_request,
          status,
          created_at,
          activated_at,
          notes
        FROM upgrade_requests
        WHERE workspace_id = ?
          AND requested_plan = ?
          AND source = ?
          AND status = 'requested'
          AND created_at >= datetime('now', '-12 hours')
        ORDER BY created_at DESC
        LIMIT 1
      `,
    )
    .get(input.workspaceId, input.requestedPlan, input.source);

  if (latestMatching) {
    return mapUpgradeRequest(latestMatching);
  }

  const snapshot = getWorkspaceBillingSnapshot(input.workspaceId);
  const id = `upg_${nanoid(12)}`;

  db.prepare(
    `
      INSERT INTO upgrade_requests (
        id,
        workspace_id,
        requested_by_user_id,
        current_plan,
        requested_plan,
        source,
        site_count_at_request,
        site_limit_at_request,
        notes
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
  ).run(
    id,
    input.workspaceId,
    input.requestedByUserId,
    snapshot.plan,
    input.requestedPlan,
    input.source,
    snapshot.siteCount,
    snapshot.siteLimit,
    input.notes ?? null,
  );

  recordJourneyMilestone(input.workspaceId, 'upgrade_request');

  return listUpgradeRequests(input.workspaceId)[0];
};
