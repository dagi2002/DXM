import { createHash } from 'node:crypto';
import { FixEvidence, type FixKind } from '@pulse/contracts';
import { aiArtifacts, and, eq, gt, issues, newId, sites, sql, withOrg, type Db } from '@pulse/db';

/**
 * AI suggested fixes (`ai.recommend`). Off unless AI_ENABLED and a key are set; every result is
 * cached in `ai_artifacts` by (issue, input hash) and counted against a per-org monthly budget.
 * The model only sees the issue's evidence — never visitor ids, replays or anything typed.
 */

export interface AiCompletion {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface AiClient {
  complete(req: { system: string; prompt: string; maxTokens: number }): Promise<AiCompletion>;
}

/** Anthropic Messages API over fetch. The key is a secret: only ever a request header. */
export class AnthropicClient implements AiClient {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly baseUrl = 'https://api.anthropic.com',
  ) {}
  async complete(req: { system: string; prompt: string; maxTokens: number }): Promise<AiCompletion> {
    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: req.maxTokens,
        system: req.system,
        messages: [{ role: 'user', content: req.prompt }],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`AI provider responded ${res.status}`);
    const body = (await res.json()) as {
      model?: string;
      content?: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    return {
      text: (body.content ?? []).map((c) => (c.type === 'text' ? (c.text ?? '') : '')).join(''),
      model: body.model ?? this.model,
      inputTokens: body.usage?.input_tokens ?? 0,
      outputTokens: body.usage?.output_tokens ?? 0,
    };
  }
}

export interface AiConfig {
  /** AI_ENABLED and a key are both set. */
  enabled: boolean;
  monthlyBudget: number;
}

/** The evidence the model may see: no visitor ids. */
export function suggestionInput(kind: FixKind, evidence: FixEvidence, domain: string) {
  const rest: Record<string, unknown> = { ...evidence };
  delete rest.sampleVisitIds;
  return { kind, domain, evidence: rest };
}

export const inputHashOf = (input: ReturnType<typeof suggestionInput>) =>
  createHash('sha256').update(JSON.stringify(input)).digest('hex');

export const SYSTEM_PROMPT = [
  'You help owners of small Ethiopian e-commerce and service websites fix problems their visitors hit.',
  'You get structured evidence from an analytics detector (no page source).',
  'Reply with JSON only: {"text": string, "code": string | null}.',
  '"text": 2–4 plain sentences: the most likely cause and what to change. Say what to check if unsure.',
  '"code": a short CSS/HTML/JS snippet only when one clearly helps, otherwise null.',
  'Never invent numbers that are not in the evidence.',
].join(' ');

export function buildPrompt(input: ReturnType<typeof suggestionInput>): string {
  return `Detector evidence for ${input.domain}:\n${JSON.stringify(input, null, 2)}`;
}

/** Parses the model's reply; null when it isn't the JSON we asked for (nothing is stored then). */
export function parseSuggestion(raw: string): { text: string; code: string | null } | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const v = JSON.parse(raw.slice(start, end + 1)) as { text?: unknown; code?: unknown };
    if (typeof v.text !== 'string' || !v.text.trim()) return null;
    const code = typeof v.code === 'string' && v.code.trim() ? v.code.trim().slice(0, 4000) : null;
    return { text: v.text.trim().slice(0, 2000), code };
  } catch {
    return null;
  }
}

export type RecommendResult = {
  status: 'disabled' | 'skipped' | 'cached' | 'over_budget' | 'created' | 'unparseable';
};

const monthStart = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

/**
 * One suggested fix for one issue. Cached by evidence hash; skipped when AI is off, the issue is
 * gone or no longer open, or the org has used its monthly budget. The call to the model happens
 * outside the transaction; a concurrent duplicate is dropped by the unique index.
 */
export async function recommendFix(
  db: Db,
  client: AiClient | null,
  config: AiConfig,
  job: { issueId: string; orgId: string },
  now: Date = new Date(),
): Promise<RecommendResult> {
  if (!config.enabled || !client) return { status: 'disabled' };
  const prep = await withOrg(db, job.orgId, async (tx) => {
    const [row] = await tx
      .select({ issue: issues, domain: sites.domain })
      .from(issues)
      .innerJoin(sites, eq(sites.id, issues.siteId))
      .where(eq(issues.id, job.issueId))
      .limit(1);
    if (!row || (row.issue.status !== 'open' && row.issue.status !== 'fixing'))
      return { status: 'skipped' as const };
    const input = suggestionInput(row.issue.kind, FixEvidence.parse(row.issue.evidence), row.domain);
    const inputHash = inputHashOf(input);
    const [cached] = await tx
      .select({ id: aiArtifacts.id })
      .from(aiArtifacts)
      .where(and(eq(aiArtifacts.issueId, job.issueId), eq(aiArtifacts.inputHash, inputHash)))
      .limit(1);
    if (cached) return { status: 'cached' as const };
    const [used] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(aiArtifacts)
      .where(gt(aiArtifacts.createdAt, monthStart(now)));
    if ((used?.n ?? 0) >= config.monthlyBudget) return { status: 'over_budget' as const };
    return { status: 'go' as const, input, inputHash };
  });
  if (prep.status !== 'go') return { status: prep.status };

  const completion = await client.complete({
    system: SYSTEM_PROMPT,
    prompt: buildPrompt(prep.input),
    maxTokens: 600,
  });
  const suggestion = parseSuggestion(completion.text);
  if (!suggestion) return { status: 'unparseable' };
  await withOrg(db, job.orgId, (tx) =>
    tx
      .insert(aiArtifacts)
      .values({
        id: newId('ai'),
        orgId: job.orgId,
        issueId: job.issueId,
        kind: 'fix_suggestion',
        inputHash: prep.inputHash,
        model: completion.model,
        content: suggestion,
        inputTokens: completion.inputTokens,
        outputTokens: completion.outputTokens,
      })
      .onConflictDoNothing(),
  );
  return { status: 'created' };
}
