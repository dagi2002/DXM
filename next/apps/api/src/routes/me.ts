import { CalendarPref, Locale, PreferencesUpdate, Role, type Me } from '@pulse/contracts';
import { member, organization, user, asc, eq } from '@pulse/db';
import { Hono } from 'hono';
import type { AppDeps } from '../app';
import { requireSession } from '../guards';
import type { AppEnv } from '../http';

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
      await deps.db.update(user).set({ ...input, updatedAt: new Date() }).where(eq(user.id, c.get('user')!.id));
    }
    return c.json(await load(c.get('user')!.id, c.get('activeOrgId') ?? null));
  });

  return r;
}
