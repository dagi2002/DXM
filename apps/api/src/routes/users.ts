import { Router } from 'express';
import { randomBytes, createHash } from 'node:crypto';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { db } from '../db/index.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { sendInviteEmail } from '../lib/mailer.js';
import { logger } from '../lib/logger.js';

const router = Router();
router.use(requireAuth);

type ApiUserRole = 'owner' | 'admin' | 'viewer';

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar: string | null;
  lastLogin: string | null;
}

function normalizeUserRole(role: string): ApiUserRole {
  if (role === 'owner') {
    return 'owner';
  }

  if (role === 'admin') {
    return 'admin';
  }

  return 'viewer';
}

router.get('/', (req, res) => {
  const users = db.prepare<[string], UserRow>(`
    SELECT id, name, email, role, avatar, last_login AS lastLogin
    FROM users
    WHERE workspace_id = ?
    ORDER BY COALESCE(last_login, created_at) DESC, name COLLATE NOCASE ASC
  `).all(req.user!.workspaceId);

  return res.json(users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: normalizeUserRole(user.role),
    ...(user.avatar ? { avatar: user.avatar } : {}),
    lastLogin: user.lastLogin,
  })));
});

// ─── Workspace invites ───────────────────────────────────────────────────────
// Same token discipline as password reset: raw token only ever travels in the
// invite email; the DB stores sha256(raw). 7-day expiry, single-use, revocable.

const createInviteSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['admin', 'viewer']),
});

interface InviteRow {
  id: string;
  email: string;
  role: string;
  expires_at: string;
  created_at: string;
}

const formatInvite = (row: InviteRow) => ({
  id: row.id,
  email: row.email,
  role: row.role,
  expiresAt: row.expires_at,
  createdAt: row.created_at,
});

// GET /users/invites — pending invites only (accepted/revoked/expired drop out).
router.get('/invites', requireRole('owner', 'admin'), (req, res) => {
  const rows = db.prepare(`
    SELECT id, email, role, expires_at, created_at
    FROM workspace_invites
    WHERE workspace_id = ?
      AND accepted_at IS NULL
      AND revoked_at IS NULL
      AND expires_at > datetime('now')
    ORDER BY created_at DESC
  `).all(req.user!.workspaceId) as InviteRow[];

  return res.json({ invites: rows.map(formatInvite) });
});

// POST /users/invites — create an invite and email the accept link.
router.post('/invites', requireRole('owner', 'admin'), validate(createInviteSchema), async (req, res) => {
  const { email, role } = req.body as z.infer<typeof createInviteSchema>;
  const workspaceId = req.user!.workspaceId;
  const normalizedEmail = email.trim().toLowerCase();

  // users.email is globally UNIQUE — one workspace per account for now.
  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existingUser) {
    return res.status(409).json({ error: 'That email already has a DXM Pulse account' });
  }

  const rawToken = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  const inviteId = 'inv_' + nanoid(16);

  db.transaction(() => {
    // Replace any pending invite for the same address — latest invite wins.
    db.prepare(`
      UPDATE workspace_invites SET revoked_at = CURRENT_TIMESTAMP
      WHERE workspace_id = ? AND email = ? AND accepted_at IS NULL AND revoked_at IS NULL
    `).run(workspaceId, normalizedEmail);

    db.prepare(`
      INSERT INTO workspace_invites (id, workspace_id, email, role, token_hash, invited_by, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+7 days'))
    `).run(inviteId, workspaceId, normalizedEmail, role, tokenHash, req.user!.id);
  })();

  const workspace = db.prepare('SELECT name FROM workspaces WHERE id = ?')
    .get(workspaceId) as { name: string } | undefined;
  const inviteUrl = `${process.env.WEB_ORIGIN || 'http://localhost:5173'}/accept-invite?token=${rawToken}`;

  sendInviteEmail(normalizedEmail, workspace?.name ?? 'your workspace', req.user!.name, role, inviteUrl)
    .catch((err) => logger.error('Invite email failed', {
      route: 'users',
      error: err instanceof Error ? err.message : String(err),
    }));

  const row = db.prepare(`
    SELECT id, email, role, expires_at, created_at FROM workspace_invites WHERE id = ?
  `).get(inviteId) as InviteRow;

  // The raw token is deliberately NOT in this response — email is the channel.
  return res.status(201).json({ invite: formatInvite(row) });
});

// POST /users/invites/:id/revoke — idempotent, workspace-scoped.
router.post('/invites/:id/revoke', requireRole('owner', 'admin'), (req, res) => {
  const row = db.prepare(`
    SELECT id, revoked_at FROM workspace_invites WHERE id = ? AND workspace_id = ?
  `).get(req.params.id, req.user!.workspaceId) as { id: string; revoked_at: string | null } | undefined;

  if (!row) return res.status(404).json({ error: 'Invite not found' });

  if (!row.revoked_at) {
    db.prepare('UPDATE workspace_invites SET revoked_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(row.id);
  }

  return res.json({ ok: true });
});

export default router;
