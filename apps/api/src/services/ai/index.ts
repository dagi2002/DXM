import type {
  AlertAiBrief,
  AlertDetail,
  FunnelAiBrief,
  FunnelAnalysisDetail,
  OverviewAiBrief,
  SiteAiBrief,
} from '../../../../../packages/contracts/index.js';
import type { ClientSiteDetail, PortfolioOverview } from '../siteAnalytics.js';
import {
  ALERT_AI_PERIOD,
  ALERT_AI_TTL_HOURS,
  ALERT_AI_VERSION,
  FUNNEL_AI_TTL_HOURS,
  FUNNEL_AI_VERSION,
  OVERVIEW_AI_PERIOD,
  OVERVIEW_AI_TTL_HOURS,
  OVERVIEW_AI_VERSION,
  SITE_AI_PERIOD,
  SITE_AI_TTL_HOURS,
  SITE_AI_VERSION,
  isAiEnabled,
} from './config.js';
import { addHours, getAiArtifact, hashAiInput, isArtifactFresh, upsertAiArtifact } from './artifactStore.js';
import { buildAlertAiBrief } from './alertBrief.js';
import { buildAlertAiContext, type AlertAiContext } from './alertContext.js';
import { buildFunnelAiBrief } from './funnelBrief.js';
import { buildFunnelAiContext, type FunnelAiContext } from './funnelContext.js';
import { buildOverviewAiBrief } from './overviewBrief.js';
import { buildOverviewAiContext, type OverviewAiContext } from './overviewContext.js';
import { buildSiteAiBrief } from './siteBrief.js';
import { buildSiteAiContext, type SiteAiContext } from './siteContext.js';

const OVERVIEW_ARTIFACT_KIND = 'overview_brief';
const OVERVIEW_ENTITY_TYPE = 'workspace';
const SITE_ARTIFACT_KIND = 'site_brief';
const SITE_ENTITY_TYPE = 'site';
const ALERT_ARTIFACT_KIND = 'alert_brief';
const ALERT_ENTITY_TYPE = 'alert';
const FUNNEL_ARTIFACT_KIND = 'funnel_brief';
const FUNNEL_ENTITY_TYPE = 'funnel';

export const getOverviewAiBriefOrNull = (
  workspaceId: string,
  overview: PortfolioOverview,
): OverviewAiBrief | null => {
  if (!isAiEnabled()) return null;

  try {
    const context = buildOverviewAiContext(overview);
    const inputHash = hashAiInput({
      version: OVERVIEW_AI_VERSION,
      period: OVERVIEW_AI_PERIOD,
      context,
    });
    const cachedArtifact = getAiArtifact<OverviewAiBrief, OverviewAiContext>({
      workspaceId,
      entityType: OVERVIEW_ENTITY_TYPE,
      entityId: workspaceId,
      artifactKind: OVERVIEW_ARTIFACT_KIND,
      periodKey: OVERVIEW_AI_PERIOD,
    });

    if (
      cachedArtifact &&
      cachedArtifact.status === 'ready' &&
      cachedArtifact.inputHash === inputHash &&
      isArtifactFresh(cachedArtifact.expiresAt)
    ) {
      return cachedArtifact.output;
    }

    // `building` is intentionally reserved for future async refresh flows.
    // Phase 1 still behaves synchronously and only reuses fully ready artifacts.

    const now = new Date();
    const brief = buildOverviewAiBrief(context, now.toISOString());

    upsertAiArtifact({
      workspaceId,
      siteId: null,
      entityType: OVERVIEW_ENTITY_TYPE,
      entityId: workspaceId,
      artifactKind: OVERVIEW_ARTIFACT_KIND,
      periodKey: OVERVIEW_AI_PERIOD,
      status: 'ready',
      generatorType: 'deterministic',
      inputHash,
      evidence: context,
      output: brief,
      expiresAt: addHours(now, OVERVIEW_AI_TTL_HOURS).toISOString(),
      now,
    });

    return brief;
  } catch {
    return null;
  }
};

export const getSiteAiBriefOrNull = (
  workspaceId: string,
  detail: ClientSiteDetail,
): SiteAiBrief | null => {
  if (!isAiEnabled()) return null;

  try {
    const context = buildSiteAiContext(detail);
    const inputHash = hashAiInput({
      version: SITE_AI_VERSION,
      period: SITE_AI_PERIOD,
      context,
    });
    const cachedArtifact = getAiArtifact<SiteAiBrief, SiteAiContext>({
      workspaceId,
      siteId: detail.id,
      entityType: SITE_ENTITY_TYPE,
      entityId: detail.id,
      artifactKind: SITE_ARTIFACT_KIND,
      periodKey: SITE_AI_PERIOD,
    });

    if (
      cachedArtifact &&
      cachedArtifact.status === 'ready' &&
      cachedArtifact.inputHash === inputHash &&
      isArtifactFresh(cachedArtifact.expiresAt)
    ) {
      return cachedArtifact.output;
    }

    const now = new Date();
    const brief = buildSiteAiBrief(context, now.toISOString());

    upsertAiArtifact({
      workspaceId,
      siteId: detail.id,
      entityType: SITE_ENTITY_TYPE,
      entityId: detail.id,
      artifactKind: SITE_ARTIFACT_KIND,
      periodKey: SITE_AI_PERIOD,
      status: 'ready',
      generatorType: 'deterministic',
      inputHash,
      evidence: context,
      output: brief,
      expiresAt: addHours(now, SITE_AI_TTL_HOURS).toISOString(),
      now,
    });

    return brief;
  } catch {
    return null;
  }
};

export const getAlertAiBriefOrNull = (
  workspaceId: string,
  alert: AlertDetail,
): AlertAiBrief | null => {
  if (!isAiEnabled()) return null;

  try {
    const context = buildAlertAiContext(alert);
    const inputHash = hashAiInput({
      version: ALERT_AI_VERSION,
      period: ALERT_AI_PERIOD,
      context,
    });
    const cachedArtifact = getAiArtifact<AlertAiBrief, AlertAiContext>({
      workspaceId,
      siteId: alert.siteId,
      entityType: ALERT_ENTITY_TYPE,
      entityId: alert.id,
      artifactKind: ALERT_ARTIFACT_KIND,
      periodKey: ALERT_AI_PERIOD,
    });

    if (
      cachedArtifact &&
      cachedArtifact.status === 'ready' &&
      cachedArtifact.inputHash === inputHash &&
      isArtifactFresh(cachedArtifact.expiresAt)
    ) {
      return cachedArtifact.output;
    }

    const now = new Date();
    const brief = buildAlertAiBrief(context, now.toISOString());

    upsertAiArtifact({
      workspaceId,
      siteId: alert.siteId,
      entityType: ALERT_ENTITY_TYPE,
      entityId: alert.id,
      artifactKind: ALERT_ARTIFACT_KIND,
      periodKey: ALERT_AI_PERIOD,
      status: 'ready',
      generatorType: 'deterministic',
      inputHash,
      evidence: context,
      output: brief,
      expiresAt: addHours(now, ALERT_AI_TTL_HOURS).toISOString(),
      now,
    });

    return brief;
  } catch {
    return null;
  }
};

export const getFunnelAiBriefOrNull = (
  workspaceId: string,
  analysis: FunnelAnalysisDetail,
  siteId: string | null,
): FunnelAiBrief | null => {
  if (!isAiEnabled()) return null;

  try {
    const context = buildFunnelAiContext(analysis, siteId);
    const inputHash = hashAiInput({
      version: FUNNEL_AI_VERSION,
      period: analysis.period,
      context,
    });
    const cachedArtifact = getAiArtifact<FunnelAiBrief, FunnelAiContext>({
      workspaceId,
      siteId,
      entityType: FUNNEL_ENTITY_TYPE,
      entityId: analysis.funnelId,
      artifactKind: FUNNEL_ARTIFACT_KIND,
      periodKey: analysis.period,
    });

    if (
      cachedArtifact &&
      cachedArtifact.status === 'ready' &&
      cachedArtifact.inputHash === inputHash &&
      isArtifactFresh(cachedArtifact.expiresAt)
    ) {
      return cachedArtifact.output;
    }

    const now = new Date();
    const brief = buildFunnelAiBrief(context, now.toISOString());

    upsertAiArtifact({
      workspaceId,
      siteId,
      entityType: FUNNEL_ENTITY_TYPE,
      entityId: analysis.funnelId,
      artifactKind: FUNNEL_ARTIFACT_KIND,
      periodKey: analysis.period,
      status: 'ready',
      generatorType: 'deterministic',
      inputHash,
      evidence: context,
      output: brief,
      expiresAt: addHours(now, FUNNEL_AI_TTL_HOURS).toISOString(),
      now,
    });

    return brief;
  } catch {
    return null;
  }
};
