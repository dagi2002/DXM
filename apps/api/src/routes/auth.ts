import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';
import { db } from '../db/index.js';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { signupSchema, loginSchema } from '../schemas/authSchemas.js';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_in_production_32chars';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret_32chars';
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || 'localhost';
const IS_PROD = process.env.NODE_ENV === 'production';

function makeTokens(payload: object) {
  const access = jwt.sign(payload, JWT_SECRET, { expiresIn: '15m' });
  const refresh = jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: '7d' });
  return { access, refresh };
}

function getCookieBase() {
  const normalizedDomain = COOKIE_DOMAIN.trim().toLowerCase();
  const shouldSetDomain =
    normalizedDomain.length > 0 &&
    normalizedDomain !== 'localhost' &&
    normalizedDomain !== '127.0.0.1';

  return {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: IS_PROD ? 'strict' : 'lax',
    path: '/',
    ...(shouldSetDomain ? { domain: COOKIE_DOMAIN } : {}),
  } as const;
}

function setTokenCookies(res: any, access: string, refresh: string) {
  const cookieBase = getCookieBase();
  res.cookie('dxm_access', access, { ...cookieBase, maxAge: 15 * 60 * 1000 });
  res.cookie('dxm_refresh', refresh, { ...cookieBase, maxAge: 7 * 24 * 60 * 60 * 1000 });
}

function clearTokenCookies(res: any) {
  const cookieBase = getCookieBase();

  res.clearCookie('dxm_access', cookieBase);
  res.clearCookie('dxm_refresh', cookieBase);

  // Clear legacy localhost cookies if they were previously written with a domain.
  res.clearCookie('dxm_access', { ...cookieBase, domain: COOKIE_DOMAIN, path: '/' });
  res.clearCookie('dxm_refresh', { ...cookieBase, domain: COOKIE_DOMAIN, path: '/' });
}

// POST /auth/signup
router.post('/signup', authLimiter, validate(signupSchema), async (req, res) => {
  const { name, email, password, workspaceName } = req.body;
  try {
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return res.status(409).json({ message: 'An account with that email already exists' });

    const workspaceId = 'ws_' + nanoid(16);
    const userId = 'usr_' + nanoid(16);
    const passwordHash = await bcrypt.hash(password, 10);

    db.transaction(() => {
      db.prepare('INSERT INTO workspaces (id, name) VALUES (?, ?)').run(workspaceId, workspaceName);
      db.prepare(`
        INSERT INTO users (id, workspace_id, name, email, password_hash, role)
        VALUES (?, ?, ?, ?, ?, 'owner')
      `).run(userId, workspaceId, name, email, passwordHash);
    })();

    const payload = { userId, email, name, role: 'owner', workspaceId };
    const { access, refresh } = makeTokens(payload);
    const refreshHash = await bcrypt.hash(refresh, 6);
    db.prepare('UPDATE users SET refresh_token_hash = ? WHERE id = ?').run(refreshHash, userId);
    setTokenCookies(res, access, refresh);

    return res.status(201).json({
      user: { id: userId, name, email, role: 'owner' },
      workspace: { id: workspaceId, name: workspaceName, plan: 'free', billingStatus: 'active' },
    });
  } catch (err) {
    console.error('[auth/signup]', err);
    return res.status(500).json({ message: 'Server error during signup' });
  }
});

// POST /auth/login
router.post('/login', authLimiter, validate(loginSchema), async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = db.prepare(`
      SELECT u.*, w.name as workspace_name, w.plan, w.billing_status
      FROM users u LEFT JOIN workspaces w ON w.id = u.workspace_id
      WHERE u.email = ?
    `).get(email) as any;

    if (!user) return res.status(401).json({ message: 'Invalid email or password' });
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ message: 'Invalid email or password' });

    db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

    const payload = { userId: user.id, email: user.email, name: user.name, role: user.role, workspaceId: user.workspace_id };
    const { access, refresh } = makeTokens(payload);
    const refreshHash = await bcrypt.hash(refresh, 6);
    db.prepare('UPDATE users SET refresh_token_hash = ? WHERE id = ?').run(refreshHash, user.id);
    setTokenCookies(res, access, refresh);

    return res.json({
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      workspace: user.workspace_id ? {
        id: user.workspace_id, name: user.workspace_name,
        plan: user.plan, billingStatus: user.billing_status,
      } : null,
    });
  } catch (err) {
    console.error('[auth/login]', err);
    return res.status(500).json({ message: 'Server error during login' });
  }
});

// POST /auth/logout
router.post('/logout', (req, res) => {
  clearTokenCookies(res);
  return res.json({ ok: true });
});

// GET /auth/me
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare(`
    SELECT u.id, u.name, u.email, u.role, u.avatar,
           w.id as workspace_id, w.name as workspace_name, w.plan, w.billing_status
    FROM users u LEFT JOIN workspaces w ON w.id = u.workspace_id
    WHERE u.id = ?
  `).get(req.user!.id) as any;

  if (!user) return res.status(404).json({ error: 'User not found' });

  return res.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role, avatar: user.avatar },
    workspace: user.workspace_id ? {
      id: user.workspace_id, name: user.workspace_name,
      plan: user.plan, billingStatus: user.billing_status,
    } : null,
  });
});

export default router;
