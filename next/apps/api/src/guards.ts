import { canManage, Role } from '@pulse/contracts';
import { member, and, eq } from '@pulse/db';
import { createMiddleware } from 'hono/factory';
import type { AppDeps } from './app';
import { ApiError, forbidden, type AppEnv, type SessionUser } from './http';

/** Loads the Better Auth session; 401 envelope when absent. */
export const requireSession = (deps: Pick<AppDeps, 'auth'>) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const result = await deps.auth.api.getSession({ headers: c.req.raw.headers });
    if (!result) throw new ApiError(401, 'unauthenticated', 'Sign in to continue');
    const u = result.user as typeof result.user & { locale?: string; calendar?: string };
    const user: SessionUser = {
      id: u.id,
      name: u.name,
      email: u.email,
      emailVerified: u.emailVerified,
      locale: u.locale ?? 'en',
      calendar: u.calendar ?? 'gregorian',
    };
    c.set('user', user);
    c.set('sessionId', result.session.id);
    c.set('activeOrgId', (result.session as { activeOrganizationId?: string | null }).activeOrganizationId ?? null);
    await next();
  });

/**
 * Resolves the active organization and the caller's role from the membership table on every
 * request — never from a cached claim — so role changes and removals apply immediately.
 */
export const requireOrg = (deps: Pick<AppDeps, 'db'>) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const orgId = c.get('activeOrgId');
    const user = c.get('user');
    if (!user) throw new ApiError(401, 'unauthenticated', 'Sign in to continue');
    if (!orgId) throw new ApiError(409, 'no_active_org', 'Create or select an organization first');
    const [row] = await deps.db
      .select({ role: member.role })
      .from(member)
      .where(and(eq(member.organizationId, orgId), eq(member.userId, user.id)))
      .limit(1);
    const role = Role.safeParse(row?.role);
    if (!role.success) throw new ApiError(403, 'forbidden', 'You are not a member of this organization');
    c.set('orgId', orgId);
    c.set('role', role.data);
    await next();
  });

export const requireManager = createMiddleware<AppEnv>(async (c, next) => {
  if (!canManage(c.get('role'))) throw forbidden();
  await next();
});
