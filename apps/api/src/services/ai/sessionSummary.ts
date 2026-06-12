/**
 * Per-session AI summary.
 *
 * Runs through the same pattern as overview/site/alert/funnel briefs:
 *   1. Try LLM (Claude Haiku) for a narrative summary
 *   2. Fall back to deterministic templating
 *   3. Cache via artifactStore (entity_type='session', period_key='single')
 *
 * Exposed via GET /sessions/:id/summary.
 */
import type {
  SessionAiSummary,
  SessionFrictionMoment,
  SessionOpportunity,
} from '../../../../../packages/contracts/index.js';
import {
  SESSION_AI_PERIOD,
  SESSION_AI_TTL_HOURS,
  SESSION_AI_VERSION,
  isAiEnabled,
  isLlmEnabled,
} from './config.js';
import { addHours, getAiArtifact, hashAiInput, isArtifactFresh, upsertAiArtifact } from './artifactStore.js';
import { buildSessionAiContext, type SessionAiContext } from './sessionSummaryContext.js';
import { generateBriefWithLLM } from './llm.js';

const SESSION_ARTIFACT_KIND = 'session_summary';
const SESSION_ENTITY_TYPE = 'session';

const SESSION_BRIEF_SCHEMA = `{
  "sessionId": "<session id echoed back>",
  "generatedAt": "<ISO 8601 timestamp>",
  "mode": "llm",
  "headline": "<one sentence, max 14 words, describing what happened in this session>",
  "narrative": "<2-4 sentences walking through the session: what the visitor did, what went well, what went wrong>",
  "frictionMoments": [
    { "ts": 0, "kind": "rage_click|dead_click|form_error|slow_lcp|u_turn", "detail": "string" }
  ],
  "opportunities": [
    { "title": "string — what to change", "rationale": "string — why it matters" }
  ]
}`;

// ─── Deterministic fallback ──────────────────────────────────────────────────

const describeDevice = (ctx: SessionAiContext): string => {
  const parts = [ctx.device || 'desktop', ctx.browser || 'browser'];
  return parts.join(' · ');
};

const buildHeadline = (ctx: SessionAiContext): string => {
  if (ctx.converted) return `Converting visit on ${describeDevice(ctx)} — opportunity to learn from what worked.`;
  if (ctx.signals.rageClickBursts > 0) return `Rage clicks surfaced on ${describeDevice(ctx)} — visitor hit friction fast.`;
  if (ctx.signals.deadClicks > 0) return `${ctx.signals.deadClicks} dead click${ctx.signals.deadClicks === 1 ? '' : 's'} on ${describeDevice(ctx)} — UI cues may be misleading.`;
  if (ctx.signals.formErrors > 0) return `Form validation blocked submit on ${describeDevice(ctx)} — review the field that failed.`;
  if (ctx.signals.slowLcp) return `Slow LCP (${Math.round(ctx.vitals.LCP)}ms) on ${describeDevice(ctx)} — page felt sluggish to load.`;
  if (ctx.signals.uTurns > 0) return `Visitor U-turned on ${describeDevice(ctx)} — destination page missed the mark.`;
  if (ctx.bounced) return `Short bounce on ${describeDevice(ctx)} — visitor left before engaging.`;
  return `Standard session on ${describeDevice(ctx)} — no friction signals recorded.`;
};

const buildNarrative = (ctx: SessionAiContext): string => {
  const bits: string[] = [];
  bits.push(
    `Visitor arrived on ${ctx.siteDomain || 'the site'} from ${describeDevice(ctx)} and visited ${ctx.pageCount} page${ctx.pageCount === 1 ? '' : 's'} over ${Math.max(1, ctx.durationSeconds)}s with ${ctx.clicks} click${ctx.clicks === 1 ? '' : 's'}.`,
  );
  if (ctx.converted) {
    bits.push('The session converted — treat the path as proof of what is working.');
  } else if (ctx.bounced) {
    bits.push('The session bounced — look for the last interaction before the exit.');
  }
  if (ctx.signals.slowLcp) {
    bits.push(`Largest Contentful Paint clocked ${Math.round(ctx.vitals.LCP)}ms, well above the 2500ms target.`);
  }
  if (ctx.signals.formErrors > 0 && ctx.signals.formSubmits === 0 && ctx.signals.formStarts > 0) {
    bits.push('The visitor started a form but validation blocked submit — field copy or server-side rules likely need to soften.');
  }
  if (ctx.signals.rageClickBursts > 0) {
    bits.push('Rage-click bursts are usually a sign that the element looked interactive but did nothing.');
  }
  if (ctx.signals.uTurns > 0) {
    bits.push('A U-turn navigation means the destination page did not match the visitor\u2019s expectation — check the preceding link copy.');
  }
  return bits.join(' ');
};

const buildOpportunities = (ctx: SessionAiContext): SessionOpportunity[] => {
  const list: SessionOpportunity[] = [];
  if (ctx.signals.slowLcp) {
    list.push({
      title: 'Trim the hero payload to pull LCP under 2.5s',
      rationale: 'LCP above 4s is in the red zone — mobile visitors feel the lag immediately.',
    });
  }
  if (ctx.signals.deadClicks > 0) {
    list.push({
      title: 'Audit non-clickable elements that look clickable',
      rationale: 'Dead clicks signal a visual affordance problem — underlines, cursor states, or stale links.',
    });
  }
  if (ctx.signals.rageClickBursts > 0) {
    list.push({
      title: 'Wire the element that triggered rage clicks or surface a loading state',
      rationale: 'Rage clicks imply the visitor believed an action should have happened and nothing did.',
    });
  }
  if (ctx.signals.formErrors > 0) {
    list.push({
      title: 'Soften validation copy on the failing field',
      rationale: 'A form error reaching this view means the visitor hit the wall instead of self-recovering.',
    });
  }
  if (ctx.signals.uTurns > 0) {
    list.push({
      title: 'Rewrite the link copy that sent the visitor on a U-turn',
      rationale: 'Intent mismatch between anchor text and landing content is the usual root cause.',
    });
  }
  if (!list.length && !ctx.converted) {
    list.push({
      title: 'Seed more sessions before pulling conclusions',
      rationale: 'This session did not hit a friction signal; a broader sample will surface patterns worth acting on.',
    });
  }
  return list.slice(0, 3);
};

const buildDeterministicSummary = (
  ctx: SessionAiContext,
  generatedAt: string,
): SessionAiSummary => ({
  sessionId: ctx.sessionId,
  generatedAt,
  mode: 'deterministic',
  headline: buildHeadline(ctx),
  narrative: buildNarrative(ctx),
  frictionMoments: ctx.frictionMoments.slice(0, 6),
  opportunities: buildOpportunities(ctx),
});

// ─── Orchestrator ────────────────────────────────────────────────────────────

/**
 * Returns the AI session summary, caching for 7 days.
 * Returns null only when `ctx` cannot be built (e.g. session not found).
 */
export const getSessionAiSummaryOrNull = async (
  workspaceId: string,
  sessionId: string,
): Promise<SessionAiSummary | null> => {
  const context = buildSessionAiContext(workspaceId, sessionId);
  if (!context) return null;

  // If AI is globally disabled, still return the deterministic summary — it's useful on its own.
  if (!isAiEnabled()) {
    return buildDeterministicSummary(context, new Date().toISOString());
  }

  const inputHash = hashAiInput({
    version: SESSION_AI_VERSION,
    period: SESSION_AI_PERIOD,
    context,
  });

  const cachedArtifact = getAiArtifact<SessionAiSummary, SessionAiContext>({
    workspaceId,
    entityType: SESSION_ENTITY_TYPE,
    entityId: sessionId,
    artifactKind: SESSION_ARTIFACT_KIND,
    periodKey: SESSION_AI_PERIOD,
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

  let summary: SessionAiSummary;
  let generatorType: 'llm' | 'deterministic';

  const llmSummary = isLlmEnabled()
    ? await generateBriefWithLLM<SessionAiSummary>(SESSION_BRIEF_SCHEMA, context)
    : null;

  if (llmSummary) {
    summary = {
      ...llmSummary,
      sessionId,
      generatedAt: now.toISOString(),
      mode: 'llm',
      // Trust LLM friction hits if present, else fall back to pre-computed.
      frictionMoments: Array.isArray(llmSummary.frictionMoments) && llmSummary.frictionMoments.length
        ? (llmSummary.frictionMoments as SessionFrictionMoment[])
        : context.frictionMoments.slice(0, 6),
      opportunities: Array.isArray(llmSummary.opportunities) && llmSummary.opportunities.length
        ? llmSummary.opportunities.slice(0, 3)
        : buildDeterministicSummary(context, now.toISOString()).opportunities,
    };
    generatorType = 'llm';
  } else {
    summary = buildDeterministicSummary(context, now.toISOString());
    generatorType = 'deterministic';
  }

  upsertAiArtifact({
    workspaceId,
    siteId: null,
    entityType: SESSION_ENTITY_TYPE,
    entityId: sessionId,
    artifactKind: SESSION_ARTIFACT_KIND,
    periodKey: SESSION_AI_PERIOD,
    status: 'ready',
    generatorType,
    inputHash,
    evidence: context,
    output: summary,
    expiresAt: addHours(now, SESSION_AI_TTL_HOURS).toISOString(),
    now,
  });

  return summary;
};
