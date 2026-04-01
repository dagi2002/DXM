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
  isLlmEnabled,
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
import { generateBriefWithLLM } from './llm.js';

const OVERVIEW_ARTIFACT_KIND = 'overview_brief';
const OVERVIEW_ENTITY_TYPE = 'workspace';
const SITE_ARTIFACT_KIND = 'site_brief';
const SITE_ENTITY_TYPE = 'site';
const ALERT_ARTIFACT_KIND = 'alert_brief';
const ALERT_ENTITY_TYPE = 'alert';
const FUNNEL_ARTIFACT_KIND = 'funnel_brief';
const FUNNEL_ENTITY_TYPE = 'funnel';

// ─── Schema descriptions passed to the LLM ──────────────────────────────────

const OVERVIEW_BRIEF_SCHEMA = `{
  "period": "7d",
  "mode": "llm",
  "generatedAt": "<ISO 8601 timestamp>",
  "headline": "<one sentence, max 12 words, describing the portfolio state right now>",
  "summary": "<1-2 sentences of operational intelligence>",
  "topRisk": "<the single biggest risk signal, or null if none>",
  "topOpportunity": "<the single biggest opportunity, or null if none>",
  "recommendations": [
    { "id": "string", "title": "string", "detail": "string", "href": "/alerts", "priority": "high|medium|low", "rationale": "string" }
  ],
  "evidence": [
    { "id": "string", "label": "string", "value": "string", "tone": "positive|warning|neutral" }
  ]
}`;

const SITE_BRIEF_SCHEMA = `{
  "period": "7d",
  "mode": "llm",
  "generatedAt": "<ISO 8601 timestamp>",
  "headline": "<one sentence, max 12 words, describing this site's state>",
  "summary": "<1-2 sentences of operational intelligence for this site>",
  "topRisk": "<the single biggest risk signal for this site, or null>",
  "topOpportunity": "<the single biggest opportunity for this site, or null>",
  "recommendations": [
    { "id": "string", "title": "string", "detail": "string", "href": "/sessions", "priority": "high|medium|low", "rationale": "string" }
  ],
  "evidence": [
    { "id": "string", "label": "string", "value": "string", "tone": "positive|warning|neutral" }
  ]
}`;

const ALERT_BRIEF_SCHEMA = `{
  "period": "current",
  "mode": "llm",
  "generatedAt": "<ISO 8601 timestamp>",
  "state": "active|resolved",
  "headline": "<one sentence explaining what this alert means>",
  "summary": "<1-2 sentences of context and impact>",
  "whyFired": "<why this alert was triggered — specific and technical>",
  "impact": "<what effect this has on the site's visitors or conversion>",
  "recommendations": [
    { "id": "string", "title": "string", "detail": "string", "href": "/sessions", "priority": "high|medium|low", "rationale": "string" }
  ],
  "evidence": [
    { "id": "string", "label": "string", "value": "string", "tone": "positive|warning|neutral" }
  ]
}`;

const FUNNEL_BRIEF_SCHEMA = `{
  "period": "<the funnel analysis period>",
  "mode": "llm",
  "generatedAt": "<ISO 8601 timestamp>",
  "headline": "<one sentence describing the funnel performance>",
  "summary": "<1-2 sentences of insight about conversion and drop-off>",
  "biggestDropoff": "<the step with the biggest drop-off, or null>",
  "likelyReason": "<why that drop-off is happening, or null>",
  "recommendations": [
    { "id": "string", "title": "string", "detail": "string", "href": "/analytics/funnels", "priority": "high|medium|low", "rationale": "string" }
  ],
  "evidence": [
    { "id": "string", "label": "string", "value": "string", "tone": "positive|warning|neutral" }
  ]
}`;

// ─── Exported async brief functions ─────────────────────────────────────────

export const getOverviewAiBriefOrNull = async (
  workspaceId: string,
  overview: PortfolioOverview,
): Promise<OverviewAiBrief | null> => {
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

    const now = new Date();

    // Try LLM first; fall back to deterministic on failure or when key is absent
    let brief: OverviewAiBrief;
    let generatorType: 'llm' | 'deterministic';

    const llmBrief = isLlmEnabled()
      ? await generateBriefWithLLM<OverviewAiBrief>(OVERVIEW_BRIEF_SCHEMA, context)
      : null;

    if (llmBrief) {
      llmBrief.generatedAt = now.toISOString();
      brief = llmBrief;
      generatorType = 'llm';
    } else {
      brief = buildOverviewAiBrief(context, now.toISOString());
      generatorType = 'deterministic';
    }

    upsertAiArtifact({
      workspaceId,
      siteId: null,
      entityType: OVERVIEW_ENTITY_TYPE,
      entityId: workspaceId,
      artifactKind: OVERVIEW_ARTIFACT_KIND,
      periodKey: OVERVIEW_AI_PERIOD,
      status: 'ready',
      generatorType,
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

export const getSiteAiBriefOrNull = async (
  workspaceId: string,
  detail: ClientSiteDetail,
): Promise<SiteAiBrief | null> => {
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

    let brief: SiteAiBrief;
    let generatorType: 'llm' | 'deterministic';

    const llmBrief = isLlmEnabled()
      ? await generateBriefWithLLM<SiteAiBrief>(SITE_BRIEF_SCHEMA, context)
      : null;

    if (llmBrief) {
      llmBrief.generatedAt = now.toISOString();
      brief = llmBrief;
      generatorType = 'llm';
    } else {
      brief = buildSiteAiBrief(context, now.toISOString());
      generatorType = 'deterministic';
    }

    upsertAiArtifact({
      workspaceId,
      siteId: detail.id,
      entityType: SITE_ENTITY_TYPE,
      entityId: detail.id,
      artifactKind: SITE_ARTIFACT_KIND,
      periodKey: SITE_AI_PERIOD,
      status: 'ready',
      generatorType,
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

export const getAlertAiBriefOrNull = async (
  workspaceId: string,
  alert: AlertDetail,
): Promise<AlertAiBrief | null> => {
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

    let brief: AlertAiBrief;
    let generatorType: 'llm' | 'deterministic';

    const llmBrief = isLlmEnabled()
      ? await generateBriefWithLLM<AlertAiBrief>(ALERT_BRIEF_SCHEMA, context)
      : null;

    if (llmBrief) {
      llmBrief.generatedAt = now.toISOString();
      brief = llmBrief;
      generatorType = 'llm';
    } else {
      brief = buildAlertAiBrief(context, now.toISOString());
      generatorType = 'deterministic';
    }

    upsertAiArtifact({
      workspaceId,
      siteId: alert.siteId,
      entityType: ALERT_ENTITY_TYPE,
      entityId: alert.id,
      artifactKind: ALERT_ARTIFACT_KIND,
      periodKey: ALERT_AI_PERIOD,
      status: 'ready',
      generatorType,
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

export const getFunnelAiBriefOrNull = async (
  workspaceId: string,
  analysis: FunnelAnalysisDetail,
  siteId: string | null,
): Promise<FunnelAiBrief | null> => {
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

    let brief: FunnelAiBrief;
    let generatorType: 'llm' | 'deterministic';

    const llmBrief = isLlmEnabled()
      ? await generateBriefWithLLM<FunnelAiBrief>(FUNNEL_BRIEF_SCHEMA, context)
      : null;

    if (llmBrief) {
      llmBrief.generatedAt = now.toISOString();
      brief = llmBrief;
      generatorType = 'llm';
    } else {
      brief = buildFunnelAiBrief(context, now.toISOString());
      generatorType = 'deterministic';
    }

    upsertAiArtifact({
      workspaceId,
      siteId,
      entityType: FUNNEL_ENTITY_TYPE,
      entityId: analysis.funnelId,
      artifactKind: FUNNEL_ARTIFACT_KIND,
      periodKey: analysis.period,
      status: 'ready',
      generatorType,
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
