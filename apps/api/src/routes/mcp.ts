/**
 * MCP (Model Context Protocol) endpoint for Claude Desktop / Cursor integration.
 *
 * Why a hand-rolled JSON-RPC handler instead of `@modelcontextprotocol/sdk`:
 *   - The SDK ships a stdio transport by default; wiring it through Express
 *     needs their ad-hoc HTTP adapter, which pulls in a WS client we don't
 *     need. For 4 read-only tools the parser is ~60 lines — cheaper than
 *     another runtime dep.
 *   - Keeps the build thin and avoids locking us to the SDK's major-version
 *     cadence (MCP is still churning spec revisions as of 2026-Q2).
 *
 * The wire protocol is JSON-RPC 2.0 over POST. Supported methods:
 *   - initialize              → handshake, advertise capabilities
 *   - notifications/initialized → no-op (notifications have no response)
 *   - tools/list              → returns MCP_TOOLS formatted per spec
 *   - tools/call              → dispatches to mcpTools.ts, wraps in content[]
 *
 * Authentication is provided by requireApiKey, which attaches the bearer's
 * workspaceId to req.apiKey. Every tool call is then scoped to that workspace.
 */
import { Router, type Request, type Response } from 'express';
import { requireApiKey } from '../middleware/apiKeyAuth.js';
import { MCP_TOOLS, dispatchMcpTool } from '../services/mcpTools.js';

const router = Router();

// Protocol version we speak. Clients echo this back in `initialize`; if they
// send something newer we still respond with ours — they can negotiate down.
const MCP_PROTOCOL_VERSION = '2024-11-05';

// JSON-RPC error codes we emit. -32xxx is the standard range.
const ERR_PARSE = -32700;
const ERR_INVALID_REQUEST = -32600;
const ERR_METHOD_NOT_FOUND = -32601;
const ERR_INVALID_PARAMS = -32602;
const ERR_INTERNAL = -32603;

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcSuccess {
  jsonrpc: '2.0';
  id: number | string | null;
  result: unknown;
}

interface JsonRpcError {
  jsonrpc: '2.0';
  id: number | string | null;
  error: { code: number; message: string; data?: unknown };
}

type JsonRpcResponse = JsonRpcSuccess | JsonRpcError;

const ok = (id: number | string | null, result: unknown): JsonRpcSuccess => ({
  jsonrpc: '2.0',
  id,
  result,
});

const fail = (
  id: number | string | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcError => ({
  jsonrpc: '2.0',
  id,
  error: { code, message, ...(data !== undefined ? { data } : {}) },
});

// ─── Method handlers ─────────────────────────────────────────────────────────

const handleInitialize = (id: number | string | null): JsonRpcResponse => {
  return ok(id, {
    protocolVersion: MCP_PROTOCOL_VERSION,
    // Only `tools` is advertised — we don't serve prompts, resources, or
    // sampling. Claude Desktop / Cursor handle the missing capabilities fine.
    capabilities: { tools: { listChanged: false } },
    serverInfo: {
      name: 'dxm-pulse',
      version: '1.0.0',
    },
  });
};

const handleToolsList = (id: number | string | null): JsonRpcResponse => {
  return ok(id, { tools: MCP_TOOLS });
};

const handleToolsCall = (
  id: number | string | null,
  workspaceId: string,
  params: Record<string, unknown> | undefined,
): JsonRpcResponse => {
  const name = typeof params?.name === 'string' ? params.name : null;
  if (!name) return fail(id, ERR_INVALID_PARAMS, 'tools/call requires a string "name"');

  const args =
    params?.arguments && typeof params.arguments === 'object'
      ? (params.arguments as Record<string, unknown>)
      : {};

  try {
    const result = dispatchMcpTool(workspaceId, name, args);
    if (!result.ok) {
      // Tool-level error — still a valid JSON-RPC response, but the tool
      // payload flags isError so the LLM knows not to trust the content.
      return ok(id, {
        content: [{ type: 'text', text: result.error }],
        isError: true,
      });
    }
    // MCP tool output must be an array of content blocks. JSON is the
    // simplest encoding — clients stringify-and-parse either way.
    return ok(id, {
      content: [{ type: 'text', text: JSON.stringify(result.data) }],
      isError: false,
    });
  } catch (err) {
    return fail(
      id,
      ERR_INTERNAL,
      err instanceof Error ? err.message : 'tool_dispatch_failed',
    );
  }
};

// ─── Entry ───────────────────────────────────────────────────────────────────

router.post('/', requireApiKey, (req: Request, res: Response) => {
  const workspaceId = req.apiKey?.workspaceId;
  if (!workspaceId) {
    // Belt-and-braces: requireApiKey already guards this, but keep the check
    // so typecheckers are happy without a non-null assertion.
    return res.status(401).json({ error: 'API key required' });
  }

  const body = req.body;
  // Batch requests are allowed by JSON-RPC but not used by any MCP client we
  // care about. Reject to keep the handler simple.
  if (Array.isArray(body)) {
    return res.json(fail(null, ERR_INVALID_REQUEST, 'Batch requests are not supported'));
  }
  if (!body || typeof body !== 'object') {
    return res.json(fail(null, ERR_PARSE, 'Invalid JSON payload'));
  }

  const rpc = body as JsonRpcRequest;
  if (rpc.jsonrpc !== '2.0' || typeof rpc.method !== 'string') {
    return res.json(
      fail(rpc.id ?? null, ERR_INVALID_REQUEST, 'Expected JSON-RPC 2.0 request'),
    );
  }

  // Notifications omit `id` and expect no response per the JSON-RPC spec.
  // MCP uses one: `notifications/initialized` after handshake.
  const isNotification = rpc.id === undefined || rpc.id === null;
  if (rpc.method.startsWith('notifications/')) {
    // 204 No Content is the canonical "acknowledged silently" response.
    return res.status(204).end();
  }

  const id = rpc.id ?? null;
  let response: JsonRpcResponse;

  switch (rpc.method) {
    case 'initialize':
      response = handleInitialize(id);
      break;
    case 'tools/list':
      response = handleToolsList(id);
      break;
    case 'tools/call':
      response = handleToolsCall(id, workspaceId, rpc.params);
      break;
    // Cursor probes these for capability discovery — return an empty list
    // rather than a hard error so the client doesn't log a warning.
    case 'resources/list':
      response = ok(id, { resources: [] });
      break;
    case 'prompts/list':
      response = ok(id, { prompts: [] });
      break;
    case 'ping':
      response = ok(id, {});
      break;
    default:
      response = fail(id, ERR_METHOD_NOT_FOUND, `Unknown method: ${rpc.method}`);
  }

  if (isNotification) return res.status(204).end();
  return res.json(response);
});

// GET /mcp → discovery-friendly descriptor. Handy for `curl` sanity checks and
// for Claude Desktop's "Test connection" button which issues an HTTP GET first.
router.get('/', requireApiKey, (_req, res) => {
  res.json({
    name: 'dxm-pulse',
    version: '1.0.0',
    protocol: 'mcp',
    protocolVersion: MCP_PROTOCOL_VERSION,
    transports: ['http'],
    tools: MCP_TOOLS.map((t) => ({ name: t.name, description: t.description })),
  });
});

export default router;
