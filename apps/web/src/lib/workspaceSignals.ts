import { fetchJson } from './api';

export type AgencyType = 'web_agency' | 'growth_agency' | 'studio' | 'freelancer' | 'in_house';
export type ManagedSitesBand = '1_2' | '3_5' | '6_10' | '11_15' | '16_plus';
export type ReportingWorkflow = 'manual_docs' | 'slides' | 'chat_updates' | 'mixed' | 'none_yet';
export type JourneyMilestoneKey = 'replay_viewed' | 'alert_reviewed' | 'report_exported';

export interface WorkspaceFitProfile {
  agencyType: AgencyType | null;
  managedSitesBand: ManagedSitesBand | null;
  reportingWorkflow: ReportingWorkflow | null;
  evaluationReason: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface WorkspaceJourney {
  firstSiteLiveAt: string | null;
  firstReplayViewedAt: string | null;
  firstAlertReviewedAt: string | null;
  firstReportExportedAt: string | null;
  firstUpgradeRequestAt: string | null;
}

export const AGENCY_TYPE_OPTIONS: Array<{ value: AgencyType; label: string }> = [
  { value: 'web_agency', label: 'Web agency' },
  { value: 'growth_agency', label: 'Growth agency' },
  { value: 'studio', label: 'Creative studio' },
  { value: 'freelancer', label: 'Freelancer / solo operator' },
  { value: 'in_house', label: 'In-house team' },
];

export const MANAGED_SITES_BAND_OPTIONS: Array<{ value: ManagedSitesBand; label: string }> = [
  { value: '1_2', label: '1-2 client sites' },
  { value: '3_5', label: '3-5 client sites' },
  { value: '6_10', label: '6-10 client sites' },
  { value: '11_15', label: '11-15 client sites' },
  { value: '16_plus', label: '16+ client sites' },
];

export const REPORTING_WORKFLOW_OPTIONS: Array<{ value: ReportingWorkflow; label: string }> = [
  { value: 'manual_docs', label: 'Manual docs' },
  { value: 'slides', label: 'Slides / decks' },
  { value: 'chat_updates', label: 'Chat updates' },
  { value: 'mixed', label: 'Mixed workflow' },
  { value: 'none_yet', label: 'No reporting flow yet' },
];

export const formatAgencyType = (value: AgencyType | null) =>
  AGENCY_TYPE_OPTIONS.find((option) => option.value === value)?.label || 'Not set';

export const formatManagedSitesBand = (value: ManagedSitesBand | null) =>
  MANAGED_SITES_BAND_OPTIONS.find((option) => option.value === value)?.label || 'Not set';

export const formatReportingWorkflow = (value: ReportingWorkflow | null) =>
  REPORTING_WORKFLOW_OPTIONS.find((option) => option.value === value)?.label || 'Not set';

export const markJourneyMilestone = async (milestoneKey: JourneyMilestoneKey) =>
  fetchJson<WorkspaceJourney>(`/settings/milestones/${milestoneKey}`, { method: 'POST' });
