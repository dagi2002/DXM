import {
  CalendarPref,
  Locale,
  PreferencesUpdate,
  Role,
  type ActiveSessions,
  type Me,
} from '@pulse/contracts';
import { member, organization, session, user, and, asc, desc, eq, gt, ne } from '@pulse/db';
import { Hono } from 'hono';
import type { AppDeps } from '../app';
import { requireSession } from '../guards';
import { ApiError, type AppEnv } from '../http';

export function meRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>();
  r.use('*', requireSession(deps));

  const load = async (userId: string, activeOrgId: string | null): Promise<Me> => {
    const [u] = await deps.db.select().from(user).where(eq(user.id, userId)).limit(1);
    const orgs = await deps.db
      .select({ id: organization.id, name: organization.name, slug: organization.slug, role: member.role })
      .from(member)
      .innerJoin(organization, eq(organization.id, member.organizationId))
      .where(eq(member.userId, userId))
      .orderBy(asc(member.createdAt));
    const memberships = orgs.flatMap((o) => {
      const role = Role.safeParse(o.role);
      return role.success ? [{ ...o, role: role.data }] : [];
    });
    return {
      user: {
        id: u!.id,
        name: u!.name,
        email: u!.email,
        emailVerified: u!.emailVerified,
        twoFactorEnabled: u!.twoFactorEnabled,
        locale: Locale.catch('en').parse(u!.locale),
        calendar: CalendarPref.catch('gregorian').parse(u!.calendar),
      },
      orgs: memberships,
      // Only report an active org the user still belongs to.
      activeOrgId: memberships.some((o) => o.id === activeOrgId) ? activeOrgId : null,
    };
  };

  r.get('/', async (c) => c.json(await load(c.get('user')!.id, c.get('activeOrgId') ?? null)));

  r.patch('/preferences', async (c) => {
    const input = PreferencesUpdate.parse(await c.req.json());
    if (Object.keys(input).length > 0) {
      await deps.db
        .update(user)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(user.id, c.get('user')!.id));
    }
    return c.json(await load(c.get('user')!.id, c.get('activeOrgId') ?? null));
  });

  /*
   * Active sessions. Better Auth's own /list-sessions returns every session token to the
   * browser, which would let one XSS steal all of a user's devices, so we expose ids only and
   * always scope by the caller's user id.
   */
  r.get('/sessions', async (c) => {
    const userId = c.get('user')!.id;
    const currentId = c.get('sessionId');
    const rows = await deps.db
      .select({
        id: session.id,
        userAgent: session.userAgent,
        ipAddress: session.ipAddress,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      })
      .from(session)
      .where(and(eq(session.userId, userId), gt(session.expiresAt, new Date())))
      .orderBy(desc(session.updatedAt));
    const body: ActiveSessions = {
      sessions: rows
        .map((s) => ({
          id: s.id,
          userAgent: s.userAgent || null,
          ipAddress: s.ipAddress || null,
          createdAt: s.createdAt.toISOString(),
          lastActiveAt: s.updatedAt.toISOString(),
          current: s.id === currentId,
        }))
        // Current device first, then most recently used.
        .sort((a, b) => Number(b.current) - Number(a.current)),
    };
    return c.json(body);
  });

  /** Signs out every other device. The current session stays. */
  r.post('/sessions/revoke-others', async (c) => {
    const revoked = await deps.db
      .delete(session)
      .where(and(eq(session.userId, c.get('user')!.id), ne(session.id, c.get('sessionId')!)))
      .returning({ id: session.id });
    return c.json({ revoked: revoked.length });
  });

  /** Signs out one device. Revoking the current session is allowed and acts like sign-out. */
  r.delete('/sessions/:id', async (c) => {
    const revoked = await deps.db
      .delete(session)
      .where(and(eq(session.id, c.req.param('id')), eq(session.userId, c.get('user')!.id)))
      .returning({ id: session.id });
    // Another user's session id looks exactly like a missing one.
    if (revoked.length === 0) throw new ApiError(404, 'not_found', 'Session not found');
    return c.json({ revoked: 1, current: revoked[0]!.id === c.get('sessionId') });
  });

  return r;
}
