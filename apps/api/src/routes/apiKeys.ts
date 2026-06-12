/**
 * Workspace API key management.
 *
 * These keys authenticate MCP (Model Context Protocol) requests from Claude
 * Desktop / Cursor. They are distinct from the JWT session cookie used by the
 * dashboard — bearer-token-in-header so IDEs can hold them in their own
 * secret store.
 *
 * Security model:
 *   - Raw key is shown exactly once, at creation. We store sha256(raw || pepper).
 *   - The first 8 chars of the raw key are kept as `key_prefix` so the UI
 *     can show "dxm_live_a1b2c3…" without re-exposing the secret.
 *   - Revocation is synchronous: requireApiKey does a fresh DB lookup on
 *     every call, so setting revoked_at takes effect on the very next request.
 *   - Only owners/admins can create or revoke keys. Viewers can list (prefix +
 *     last-used only) so they can see what's been issued without being able to
 *     rotate.
 */
import { Router } from 'express';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { db } from '../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { hashApiKey } from '../middleware/apiKeyAuth.js';
import { validate } from '../middleware/validate.js';

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

interface KeyRow {
  id: string;
  workspace_id: string;
  name: string;
  key_prefix: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

const formatKey = (row: KeyRow) => ({
  id: row.id,
  name: row.name,
  prefix: row.key_prefix,
  lastUsedAt: row.last_used_at,
  revokedAt: row.revoked_at,
  createdAt: row.created_at,
});

// GET /api-keys — list keys for the workspace. Never returns raw or hashed
// secrets. Revoked keys are kept in the list so the audit trail is visible.
router.get('/', (req, res) => {
  const rows = db
    .prepare<[string], KeyRow>(
      `SELECT id, workspace_id, name, key_prefix, last_used_at, revoked_at, created_at
       FROM workspace_api_keys
       WHERE workspace_id = ?
       ORDER BY created_at DESC`,
    )
    .all(req.user!.workspaceId);
  return res.json({ keys: rows.map(formatKey) });
});

// POST /api-keys — generate a new key. Returns the raw secret ONCE.
router.post(
  '/',
  requireRole('owner', 'admin'),
  validate(createSchema),
  (req, res) => {
    const { name } = req.body as z.infer<typeof createSchema>;

    // 32 random bytes → 64 hex chars. `dxm_live_` prefix makes leaks easy to
    // grep for in logs / GitHub scans. Length fits under the 200-char cap in
    // requireApiKey comfortably.
    const raw = `dxm_live_${randomBytes(32).toString('hex')}`;
    const hash = hashApiKey(raw);
    const prefix = raw.slice(0, 12); // "dxm_live_a1b" — enough to disambiguate
    const id = `wak_${randomBytes(12).toString('hex')}`;

    db.prepare(
      `INSERT INTO workspace_api_keys (id, workspace_id, name, key_hash, key_prefix)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(id, req.user!.workspaceId, name.slice(0, 80), hash, prefix);

    const row = db
      .prepare<[string], KeyRow>(
        `SELECT id, workspace_id, name, key_prefix, last_used_at, revoked_at, created_at
         FROM workspace_api_keys WHERE id = ?`,
      )
      .get(id);

    return res.status(201).json({
      key: row ? formatKey(row) : null,
      // This is the only time the raw token is ever returned over the wire.
      // Client must display it and warn the user it cannot be retrieved again.
      rawKey: raw,
    });
  },
);

// POST /api-keys/:id/revoke — mark a key as revoked. Idempotent; re-revoking
// leaves the original revoked_at timestamp untouched.
router.post('/:id/revoke', requireRole('owner', 'admin'), (req, res) => {
  const keyId = req.params.id;
  if (!keyId || keyId.length > 80) {
    return res.status(400).json({ error: 'Invalid key id' });
  }

  // Scope by workspace so one workspace can't revoke another's keys even if
  // they guess the id.
  const row = db
    .prepare<[string, string], KeyRow>(
      `SELECT id, workspace_id, name, key_prefix, last_used_at, revoked_at, created_at
       FROM workspace_api_keys WHERE id = ? AND workspace_id = ?`,
    )
    .get(keyId, req.user!.workspaceId);

  if (!row) return res.status(404).json({ error: 'Key not found' });

  if (!row.revoked_at) {
    db.prepare(
      'UPDATE workspace_api_keys SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?',
    ).run(keyId);
  }

  const updated = db
    .prepare<[string], KeyRow>(
      `SELECT id, workspace_id, name, key_prefix, last_used_at, revoked_at, created_at
       FROM workspace_api_keys WHERE id = ?`,
    )
    .get(keyId);

  return res.json({ key: updated ? formatKey(updated) : null });
});

export default router;
