/**
 * Bearer-token auth for workspace API keys (MCP endpoint).
 *
 *   Authorization: Bearer dxm_live_<raw>
 *
 * Flow:
 *   1. Extract raw token from the Authorization header.
 *   2. Hash with sha256(raw || WORKSPACE_API_PEPPER).
 *   3. Look up hash in workspace_api_keys. Reject if missing or revoked.
 *   4. Update last_used_at (synchronous; no caching so revocation takes effect
 *      on the very next request).
 *
 * The pepper protects us if the DB is exfiltrated — the attacker still needs
 * the env secret to forge a lookup. Keys are one-use-display: we never store
 * the raw token, only the hash + prefix for UI.
 */
import type { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import { db } from '../db/index.js';

const PEPPER = process.env.WORKSPACE_API_PEPPER?.trim() || '';

/**
 * Hash a raw API key with the workspace pepper. Exported so the key creation
 * flow uses the exact same encoding as lookup.
 */
export const hashApiKey = (raw: string): string => {
  return createHash('sha256').update(raw + PEPPER).digest('hex');
};

interface KeyRow {
  id: string;
  workspace_id: string;
  revoked_at: string | null;
}

export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const header = req.header('authorization') || req.header('Authorization');
  if (!header || !/^Bearer\s+/i.test(header)) {
    return res.status(401).json({ error: 'API key required' });
  }
  const raw = header.replace(/^Bearer\s+/i, '').trim();
  if (!raw || raw.length < 16 || raw.length > 200) {
    return res.status(401).json({ error: 'Malformed API key' });
  }
  const hash = hashApiKey(raw);
  const row = db
    .prepare<[string], KeyRow>(
      'SELECT id, workspace_id, revoked_at FROM workspace_api_keys WHERE key_hash = ? LIMIT 1',
    )
    .get(hash);

  if (!row) return res.status(401).json({ error: 'Invalid API key' });
  if (row.revoked_at) return res.status(401).json({ error: 'API key revoked' });

  // Sync last-used bump — avoids fragile background queues; the write is cheap.
  try {
    db.prepare('UPDATE workspace_api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?').run(
      row.id,
    );
  } catch {
    /* non-fatal */
  }

  // Attach workspace context so downstream handlers can scope queries.
  (req as Request & { apiKey?: { id: string; workspaceId: string } }).apiKey = {
    id: row.id,
    workspaceId: row.workspace_id,
  };
  next();
}
