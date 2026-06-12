/**
 * MCP tool catalogue and dispatch.
 *
 * These tools are surfaced to external MCP clients (Claude Desktop, Cursor)
 * over POST /mcp. They are read-only and strictly workspace-scoped — every
 * query is constrained to the workspace the bearer key belongs to.
 *
 * Reuses existing services where possible:
 *   - siteAnalytics.ts   → getWebVitalsPercentiles, listWorkspaceSites
 *   - sessionReadModels → direct session listing via inline query
 *   - alert reads       → direct SQL (no shared helper exported)
 *
 * Kept separate from `ai/askPulse.ts` tool handlers because MCP exposes a
 * slightly different shape (uses `name`, `description`, `inputSchema` keys
 * per the MCP spec) and the consumers differ (external IDE vs our chat UI).
 */
import { db } from '../db/index.js';
import {
  getWebVitalsPercentiles,
  listWorkspaceSites,
} from './siteAnalytics.js';

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const MCP_TOOLS: McpToolDefinition[] = [
  {
    name: 'list_sites',
    description:
      'List all client sites in the authenticated workspace with 7-day session count and current open alerts.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_site_health',
    description:
      'Return health snapshot for one site: Core Web Vitals percentiles (LCP, INP, CLS, FCP, TTFB), 7d session volume, top 3 open alerts.',
    inputSchema: {
      type: 'object',
      properties: {
        site_id: { type: 'string', description: 'Site id from list_sites.' },
      },
      required: ['site_id'],
    },
  },
  {
    name: 'recent_alerts',
    description:
      'Return the 20 most recent alerts in the workspace. If site_id is provided, scope to that site only.',
    inputSchema: {
      type: 'object',
      properties: {
        site_id: { type: 'string', description: 'Optional site filter.' },
      },
      required: [],
    },
  },
  {
    name: 'search_sessions',
    description:
      'Find up to 10 recent sessions matching a keyword in entry URL, device, or browser. Empty query returns the most recent sessions.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Free-text keyword.' },
        site_id: { type: 'string', description: 'Optional site filter.' },
      },
      required: [],
    },
  },
];

// ─── Dispatch ────────────────────────────────────────────────────────────────

type ToolInput = Record<string, unknown>;

const safeString = (v: unknown, max = 200): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
};

export const dispatchMcpTool = (
  workspaceId: string,
  name: string,
  input: ToolInput,
): { ok: true; data: unknown } | { ok: false; error: string } => {
  switch (name) {
    case 'list_sites': {
      const sites = listWorkspaceSites(workspaceId);
      return {
        ok: true,
        data: sites.map((s) => ({
          id: s.id,
          name: s.name,
          domain: s.domain,
          sessions_7d: s.sessionCount7d,
          open_alerts: s.openAlerts,
          health_score: s.healthScore,
          verified: s.verified,
        })),
      };
    }

    case 'get_site_health': {
      const siteId = safeString(input.site_id, 80);
      if (!siteId) return { ok: false, error: 'site_id is required' };
      const site = db
        .prepare('SELECT id, name, domain FROM sites WHERE workspace_id = ? AND id = ?')
        .get(workspaceId, siteId) as { id: string; name: string; domain: string } | undefined;
      if (!site) return { ok: false, error: 'site_not_found' };

      const vitals = getWebVitalsPercentiles(workspaceId, siteId, '7d', 'all');
      const topAlerts = db
        .prepare(`
          SELECT id, type, severity, title, created_at
          FROM alerts
          WHERE workspace_id = ? AND site_id = ? AND resolved = 0
          ORDER BY created_at DESC
          LIMIT 3
        `)
        .all(workspaceId, siteId) as Array<{
          id: string;
          type: string;
          severity: string;
          title: string;
          created_at: string;
        }>;

      return {
        ok: true,
        data: {
          site,
          vitals: {
            range: vitals.range,
            total_sessions: vitals.totalSessions,
            metrics: vitals.metrics,
          },
          top_alerts: topAlerts,
        },
      };
    }

    case 'recent_alerts': {
      const siteId = safeString(input.site_id, 80);
      const rows = siteId
        ? (db
            .prepare(`
              SELECT a.id, a.type, a.severity, a.title, a.description, a.resolved, a.created_at, a.site_id,
                     (SELECT name FROM sites s WHERE s.id = a.site_id) AS site_name
              FROM alerts a
              WHERE a.workspace_id = ? AND a.site_id = ?
              ORDER BY a.created_at DESC
              LIMIT 20
            `)
            .all(workspaceId, siteId))
        : (db
            .prepare(`
              SELECT a.id, a.type, a.severity, a.title, a.description, a.resolved, a.created_at, a.site_id,
                     (SELECT name FROM sites s WHERE s.id = a.site_id) AS site_name
              FROM alerts a
              WHERE a.workspace_id = ?
              ORDER BY a.created_at DESC
              LIMIT 20
            `)
            .all(workspaceId));
      return { ok: true, data: rows };
    }

    case 'search_sessions': {
      const keyword = safeString(input.query, 120);
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
          SELECT s.id, s.site_id, s.entry_url, s.device, s.browser, s.started_at, s.duration,
                 s.bounced, s.converted, s.sdk_version,
                 (SELECT name FROM sites sx WHERE sx.id = s.site_id) AS site_name
          FROM sessions s
          WHERE ${wheres.join(' AND ')}
          ORDER BY s.created_at DESC
          LIMIT 10
        `)
        .all(...params);
      return { ok: true, data: rows };
    }

    default:
      return { ok: false, error: `unknown_tool:${name}` };
  }
};
