/**
 * Ask Pulse — natural-language query over DXM Pulse data.
 *
 * Strategy:
 *  - Use Claude tool use (not raw text completion) so the model retrieves facts
 *    rather than confabulating.
 *  - The model sees a tool catalogue; each tool runs a focused read-only query
 *    scoped to the caller's workspace.
 *  - Loop bounded at 5 iterations + 60s wall clock so runaway loops cost us
 *    nothing.
 *  - On failure (no key, provider error, timeout, empty): return a graceful
 *    fallback message instead of 500. Ask Pulse never breaks the dashboard.
 *
 * Exposed via POST /ask.
 */
import Anthropic from '@anthropic-ai/sdk';
import type {
  MessageParam,
  ToolUnion,
  ToolUseBlock,
  TextBlock,
} from '@anthropic-ai/sdk/resources/messages';
import { db } from '../../db/index.js';
import { CLAUDE_MODEL, isLlmEnabled } from './config.js';
import { logger } from '../../lib/logger.js';

export type AskPulseLang = 'en' | 'am';

export interface AskPulseCitation {
  kind: 'site' | 'alert' | 'funnel' | 'session';
  id: string;
  label: string;
}

export interface AskPulseToolCall {
  name: string;
  input: unknown;
  summary: string;
}

export interface AskPulseResponse {
  question: string;
  answer: string;
  citations: AskPulseCitation[];
  toolCalls: AskPulseToolCall[];
  /** 'ai' means Claude answered. 'fallback' means we gave a deterministic note. */
  mode: 'ai' | 'fallback';
}

const MAX_TOOL_ITERATIONS = 5;
const WALL_CLOCK_TIMEOUT_MS = 60_000;

// ─── Tool catalogue ──────────────────────────────────────────────────────────

const TOOLS: ToolUnion[] = [
  {
    name: 'list_sites',
    description:
      'List all client sites in this workspace with their 7-day session count and current open-alert count. Call this first when the user mentions a site by name so you can look up the id.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_site_metrics',
    description:
      'Return headline metrics for one site: total sessions, bounce rate, conversion rate, average duration, and worst LCP (in ms) over the chosen range.',
    input_schema: {
      type: 'object',
      properties: {
        site_id: { type: 'string', description: 'Site id (from list_sites).' },
        range: {
          type: 'string',
          enum: ['24h', '7d', '30d'],
          description: 'Time window. Defaults to 7d.',
        },
      },
      required: ['site_id'],
    },
  },
  {
    name: 'recent_alerts',
    description:
      'Return the most recent open alerts across the workspace, or scoped to a single site if site_id is provided. Max 10.',
    input_schema: {
      type: 'object',
      properties: {
        site_id: {
          type: 'string',
          description: 'Optional — scope to one site.',
        },
      },
      required: [],
    },
  },
  {
    name: 'search_sessions',
    description:
      'Find recent sessions matching a keyword (matched against entry URL, device, or browser). Returns up to 10 results ordered by most recent. Useful when the user asks "show me sessions where X happened".',
    input_schema: {
      type: 'object',
      properties: {
        keyword: {
          type: 'string',
          description: 'Free-text keyword. Empty string returns the latest sessions.',
        },
        site_id: {
          type: 'string',
          description: 'Optional — scope to one site.',
        },
      },
      required: [],
    },
  },
];

// ─── Tool handlers ───────────────────────────────────────────────────────────

type ToolInput = Record<string, unknown>;
type ToolResult = { output: unknown; summary: string; citations: AskPulseCitation[] };

const RANGE_TO_SQLITE: Record<string, string> = {
  '24h': '-1 day',
  '7d':  '-7 days',
  '30d': '-30 days',
};

const safeString = (v: unknown, max = 200): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
};

const runListSites = (workspaceId: string): ToolResult => {
  const rows = db
    .prepare(`
      SELECT
        s.id, s.name, s.domain,
        (SELECT COUNT(*) FROM sessions ss WHERE ss.site_id = s.id AND ss.created_at >= datetime('now', '-7 days')) AS sessions_7d,
        (SELECT COUNT(*) FROM alerts a WHERE a.site_id = s.id AND a.resolved = 0) AS open_alerts
      FROM sites s
      WHERE s.workspace_id = ?
      ORDER BY sessions_7d DESC
      LIMIT 25
    `)
    .all(workspaceId) as Array<{
      id: string;
      name: string;
      domain: string;
      sessions_7d: number;
      open_alerts: number;
    }>;

  return {
    output: rows,
    summary: `list_sites returned ${rows.length} site${rows.length === 1 ? '' : 's'}.`,
    citations: rows.map((r) => ({
      kind: 'site' as const,
      id: r.id,
      label: `${r.name} (${r.domain})`,
    })),
  };
};

const runGetSiteMetrics = (workspaceId: string, input: ToolInput): ToolResult => {
  const siteId = safeString(input.site_id, 80);
  const rangeRaw = safeString(input.range, 5) ?? '7d';
  const range = ['24h', '7d', '30d'].includes(rangeRaw) ? rangeRaw : '7d';

  if (!siteId) {
    return { output: { error: 'site_id is required' }, summary: 'get_site_metrics missing site_id', citations: [] };
  }

  const site = db
    .prepare('SELECT id, name FROM sites WHERE workspace_id = ? AND id = ?')
    .get(workspaceId, siteId) as { id: string; name: string } | undefined;
  if (!site) {
    return { output: { error: 'site_not_found' }, summary: `get_site_metrics: ${siteId} not found`, citations: [] };
  }

  const rel = RANGE_TO_SQLITE[range];
  const stats = db
    .prepare(`
      SELECT
        COUNT(*)                                                 AS total_sessions,
        SUM(CASE WHEN bounced   = 1 THEN 1 ELSE 0 END)           AS bounces,
        SUM(CASE WHEN converted = 1 THEN 1 ELSE 0 END)           AS conversions,
        AVG(duration)                                            AS avg_duration
      FROM sessions
      WHERE workspace_id = ? AND site_id = ? AND created_at >= datetime('now', '${rel}')
    `)
    .get(workspaceId, siteId) as {
      total_sessions: number;
      bounces: number;
      conversions: number;
      avg_duration: number | null;
    };

  const lcpRow = db
    .prepare(`
      SELECT MAX(CAST(SUBSTR(e.value_text, 5) AS REAL)) AS worst_lcp
      FROM events e
      JOIN sessions s ON s.id = e.session_id
      WHERE e.type = 'vital'
        AND e.value_text LIKE 'LCP:%'
        AND s.workspace_id = ? AND s.site_id = ?
        AND e.created_at >= datetime('now', '${rel}')
    `)
    .get(workspaceId, siteId) as { worst_lcp: number | null };

  const total = stats.total_sessions || 0;
  const bounceRate = total > 0 ? Math.round((stats.bounces / total) * 1000) / 10 : 0;
  const conversionRate = total > 0 ? Math.round((stats.conversions / total) * 1000) / 10 : 0;

  const output = {
    site: { id: site.id, name: site.name },
    range,
    total_sessions: total,
    bounce_rate_pct: bounceRate,
    conversion_rate_pct: conversionRate,
    avg_duration_seconds: stats.avg_duration ? Math.round(stats.avg_duration) : 0,
    worst_lcp_ms: lcpRow.worst_lcp !== null ? Math.round(lcpRow.worst_lcp) : null,
  };

  return {
    output,
    summary: `get_site_metrics(${site.name}, ${range}) → ${total} sessions, ${bounceRate}% bounce.`,
    citations: [{ kind: 'site', id: site.id, label: site.name }],
  };
};

const runRecentAlerts = (workspaceId: string, input: ToolInput): ToolResult => {
  const siteId = safeString(input.site_id, 80);
  const rows = siteId
    ? (db
        .prepare(`
          SELECT a.id, a.type, a.severity, a.title, a.created_at, a.site_id,
                 (SELECT name FROM sites s WHERE s.id = a.site_id) AS site_name
          FROM alerts a
          WHERE a.workspace_id = ? AND a.site_id = ? AND a.resolved = 0
          ORDER BY a.created_at DESC
          LIMIT 10
        `)
        .all(workspaceId, siteId) as Array<{ id: string; type: string; severity: string; title: string; created_at: string; site_id: string | null; site_name: string | null }>)
    : (db
        .prepare(`
          SELECT a.id, a.type, a.severity, a.title, a.created_at, a.site_id,
                 (SELECT name FROM sites s WHERE s.id = a.site_id) AS site_name
          FROM alerts a
          WHERE a.workspace_id = ? AND a.resolved = 0
          ORDER BY a.created_at DESC
          LIMIT 10
        `)
        .all(workspaceId) as Array<{ id: string; type: string; severity: string; title: string; created_at: string; site_id: string | null; site_name: string | null }>);

  return {
    output: rows,
    summary: `recent_alerts${siteId ? `(${siteId})` : ''} → ${rows.length} open alert${rows.length === 1 ? '' : 's'}.`,
    citations: rows.map((r) => ({
      kind: 'alert' as const,
      id: r.id,
      label: r.site_name ? `${r.title} — ${r.site_name}` : r.title,
    })),
  };
};

const runSearchSessions = (workspaceId: string, input: ToolInput): ToolResult => {
  const keyword = safeString(input.keyword, 120);
  const siteId = safeString(input.site_id, 80);

  const wheres: string[] = ['s.workspace_id = ?'];
  const params: (string | null)[] = [workspaceId];
  if (siteId) {
    wheres.push('s.site_id = ?');
    params.push(siteId);
  }
  if (keyword) {
    wheres.push('(s.entry_url LIKE ? OR s.device LIKE ? OR s.browser LIKE ?)');
    const like = `%${keyword}%`;
    params.push(like, like, like);
  }

  const rows = db
    .prepare(`
      SELECT s.id, s.site_id, s.entry_url, s.device, s.browser, s.started_at, s.duration, s.bounced, s.converted,
             (SELECT name FROM sites sx WHERE sx.id = s.site_id) AS site_name
      FROM sessions s
      WHERE ${wheres.join(' AND ')}
      ORDER BY s.created_at DESC
      LIMIT 10
    `)
    .all(...params) as Array<{
      id: string;
      site_id: string | null;
      entry_url: string | null;
      device: string | null;
      browser: string | null;
      started_at: string | null;
      duration: number | null;
      bounced: number;
      converted: number;
      site_name: string | null;
    }>;

  return {
    output: rows,
    summary: `search_sessions(${keyword ?? ''}) → ${rows.length} session${rows.length === 1 ? '' : 's'}.`,
    citations: rows.map((r) => ({
      kind: 'session' as const,
      id: r.id,
      label: r.site_name
        ? `${r.site_name} · ${r.entry_url ?? '/'}`
        : r.entry_url ?? r.id,
    })),
  };
};

const dispatchTool = (
  name: string,
  input: ToolInput,
  workspaceId: string,
): ToolResult => {
  try {
    switch (name) {
      case 'list_sites':        return runListSites(workspaceId);
      case 'get_site_metrics':  return runGetSiteMetrics(workspaceId, input);
      case 'recent_alerts':     return runRecentAlerts(workspaceId, input);
      case 'search_sessions':   return runSearchSessions(workspaceId, input);
      default:
        return { output: { error: `unknown_tool:${name}` }, summary: `unknown tool ${name}`, citations: [] };
    }
  } catch (err) {
    logger.error('Ask Pulse tool execution failed', {
      service: 'askPulse',
      tool: name,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      output: { error: 'tool_failed' },
      summary: `${name} threw during execution`,
      citations: [],
    };
  }
};

// ─── System prompt ───────────────────────────────────────────────────────────

const buildSystemPrompt = (lang: AskPulseLang) => {
  const langInstruction =
    lang === 'am'
      ? 'The user speaks Amharic. Reply in fluent, natural Amharic. Keep technical terms (LCP, INP, bounce rate) in English when no clean Amharic equivalent exists.'
      : 'Reply in clear, direct English.';

  return `You are Ask Pulse — an analytics copilot embedded in DXM Pulse, a Digital Experience Management platform for Ethiopian digital agencies.

Your job: answer the user's question about their site portfolio by calling the available tools to retrieve facts, then synthesizing a short, specific answer.

Rules:
- ALWAYS call at least one tool before answering. Do not rely on prior knowledge; the data you need is in the tools.
- Prefer calling \`list_sites\` first when the user mentions a site by name so you can resolve the id.
- Keep the final answer short (2–5 sentences). Use bullets only when listing sites or alerts.
- Cite specific numbers from tool results. Never fabricate metrics.
- If the tools return nothing useful, say so honestly and suggest one next step.
- ${langInstruction}
- Return markdown. Do NOT wrap the response in a code fence.`;
};

// ─── Main entry point ────────────────────────────────────────────────────────

let _client: Anthropic | null = null;
const getClient = (): Anthropic | null => {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  if (!_client) _client = new Anthropic({ apiKey });
  return _client;
};

const fallbackResponse = (question: string, reason: string): AskPulseResponse => ({
  question,
  answer:
    reason === 'no_key'
      ? 'Ask Pulse needs an Anthropic API key to answer live questions. The deterministic brief endpoints still work — check the Overview page for the latest pulse.'
      : 'Ask Pulse could not reach the language model. Try again in a moment, or use the Overview page for the latest automatic brief.',
  citations: [],
  toolCalls: [],
  mode: 'fallback',
});

export const askPulse = async (
  workspaceId: string,
  question: string,
  lang: AskPulseLang = 'en',
): Promise<AskPulseResponse> => {
  const trimmed = question.trim();
  if (!trimmed) {
    return fallbackResponse(question, 'empty_question');
  }

  if (!isLlmEnabled()) {
    return fallbackResponse(trimmed, 'no_key');
  }

  const client = getClient();
  if (!client) return fallbackResponse(trimmed, 'no_key');

  const started = Date.now();
  const messages: MessageParam[] = [{ role: 'user', content: trimmed }];
  const citations: AskPulseCitation[] = [];
  const toolCalls: AskPulseToolCall[] = [];
  const seenCitations = new Set<string>();

  try {
    for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
      if (Date.now() - started > WALL_CLOCK_TIMEOUT_MS) break;

      const response = await client.messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        system: buildSystemPrompt(lang),
        tools: TOOLS,
        messages,
      });

      const toolUses = response.content.filter(
        (b): b is ToolUseBlock => b.type === 'tool_use',
      );

      if (toolUses.length === 0 || response.stop_reason === 'end_turn') {
        const textBlocks = response.content.filter(
          (b): b is TextBlock => b.type === 'text',
        );
        const answer = textBlocks.map((b) => b.text).join('\n').trim();
        return {
          question: trimmed,
          answer: answer || 'I looked at the data but did not find enough to answer. Try a more specific question.',
          citations,
          toolCalls,
          mode: 'ai',
        };
      }

      // Execute tools locally and feed results back.
      messages.push({ role: 'assistant', content: response.content });

      const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = [];
      for (const use of toolUses) {
        const result = dispatchTool(
          use.name,
          (use.input ?? {}) as ToolInput,
          workspaceId,
        );
        toolCalls.push({ name: use.name, input: use.input, summary: result.summary });
        for (const c of result.citations) {
          const key = `${c.kind}:${c.id}`;
          if (!seenCitations.has(key)) {
            seenCitations.add(key);
            citations.push(c);
          }
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: use.id,
          content: JSON.stringify(result.output),
        });
      }

      messages.push({ role: 'user', content: toolResults });
    }

    // Ran out of iterations — one last turn without tools to extract whatever
    // answer Claude has already formed.
    const final = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 512,
      system: buildSystemPrompt(lang),
      messages,
    });
    const answer = final.content
      .filter((b): b is TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    return {
      question: trimmed,
      answer:
        answer ||
        'I hit the tool-use limit before reaching a full answer. Try narrowing the question to one site or one metric.',
      citations,
      toolCalls,
      mode: 'ai',
    };
  } catch (err) {
    logger.error('Ask Pulse failed', {
      service: 'askPulse',
      error: err instanceof Error ? err.message : String(err),
    });
    return fallbackResponse(trimmed, 'llm_error');
  }
};
