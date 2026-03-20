import { Router } from 'express';
import { db } from '../db/index.js';
import { requireAuth } from '../middleware/auth.js';

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

export default router;
