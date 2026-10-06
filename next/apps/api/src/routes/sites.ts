import {
  PLAN_LIMITS,
  SiteCreate,
  SiteDelete,
  SiteUpdate,
  allowedOriginsFor,
  type PlanId,
  type Site,
  InstallEmail,
  buildSnippet,
  type SiteInstall,
} from '@pulse/contracts';
import { isLocale } from '@pulse/i18n';
import { t as translate } from '@pulse/i18n/messages';
import {
  auditLog,
  newId,
  newPublicKey,
  orgPlans,
  sites,
  visits,
  withOrg,
  type SiteRow,
  type Tx,
  and,
  asc,
  count,
  eq,
  isNull,
  max,
  ne,
} from '@pulse/db';
import { Hono, type Context } from 'hono';
import type { AppDeps } from '../app';
import { requireManager, requireOrg, requireSession } from '../guards';
import { ApiError, notFound, type AppEnv } from '../http';

export const toSiteDto = (row: SiteRow): Site => ({
  id: row.id,
  orgId: row.orgId,
  name: row.name,
  domain: row.domain,
  platform: row.platform,
  status: row.status,
  publicKey: row.publicKey,
  createdAt: row.createdAt.toISOString(),
  verifiedAt: row.verifiedAt?.toISOString() ?? null,
});

async function planFor(tx: Tx, orgId: string): Promise<PlanId> {
  const [row] = await tx
    .select({ plan: orgPlans.plan })
    .from(orgPlans)
    .where(eq(orgPlans.orgId, orgId))
    .limit(1);
  return row?.plan ?? 'free';
}

async function assertDomainFree(tx: Tx, domain: string, exceptId?: string) {
  const [dupe] = await tx
    .select({ id: sites.id })
    .from(sites)
    .where(
      and(eq(sites.domain, domain), isNull(sites.deletedAt), exceptId ? ne(sites.id, exceptId) : undefined),
    )
    .limit(1);
  if (dupe)
    throw new ApiError(409, 'conflict', 'This domain is already in your organization', { field: 'domain' });
}

async function findActive(tx: Tx, id: string): Promise<SiteRow> {
  const [row] = await tx
    .select()
    .from(sites)
    .where(and(eq(sites.id, id), isNull(sites.deletedAt)))
    .limit(1);
  if (!row) throw notFound('Site');
  return row;
}

export function siteRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>();
  r.use('*', requireSession(deps), requireOrg(deps));

  const audit = (
    tx: Tx,
    c: Context<AppEnv>,
    action: string,
    targetId: string,
    metadata: Record<string, unknown> = {},
  ) =>
    tx.insert(auditLog).values({
      id: newId('aud'),
      orgId: c.get('orgId')!,
      actorUserId: c.get('user')?.id ?? null,
      action,
      targetType: 'site',
      targetId,
      metadata,
      ip: c.get('clientIp'),
    });

  r.get('/', async (c) => {
    // Client viewers see only explicitly shared sites; sharing arrives with the agency layer (slice 6).
    if (c.get('role') === 'client_viewer') return c.json({ sites: [] });
    const rows = await withOrg(deps.db, c.get('orgId')!, (tx) =>
      tx.select().from(sites).where(isNull(sites.deletedAt)).orderBy(asc(sites.createdAt)),
    );
    return c.json({ sites: rows.map(toSiteDto) });
  });

  r.get('/:id', async (c) => {
    if (c.get('role') === 'client_viewer') throw notFound('Site');
    const row = await withOrg(deps.db, c.get('orgId')!, (tx) => findActive(tx, c.req.param('id')));
    return c.json({ site: toSiteDto(row) });
  });

  r.post('/', requireManager, async (c) => {
    const input = SiteCreate.parse(await c.req.json());
    const orgId = c.get('orgId')!;
    const row = await withOrg(deps.db, orgId, async (tx) => {
      const plan = await planFor(tx, orgId);
      const [{ n } = { n: 0 }] = await tx.select({ n: count() }).from(sites).where(isNull(sites.deletedAt));
      const limit = PLAN_LIMITS[plan].sites;
      if (n >= limit) {
        throw new ApiError(409, 'plan_limit_reached', `Your plan allows ${limit} site(s)`, {
          currentPlan: plan,
          limitType: 'sites',
          limit,
          currentCount: n,
        });
      }
      await assertDomainFree(tx, input.domain);
      const [created] = await tx
        .insert(sites)
        .values({
          id: newId('site'),
          orgId,
          name: input.name,
          domain: input.domain,
          platform: input.platform,
          publicKey: newPublicKey(),
          allowedOrigins: allowedOriginsFor(input.domain),
          createdBy: c.get('user')!.id,
        })
        .returning();
      await audit(tx, c, 'site.created', created!.id, { domain: input.domain });
      return created!;
    });
    return c.json({ site: toSiteDto(row) }, 201);
  });

  r.patch('/:id', requireManager, async (c) => {
    const input = SiteUpdate.parse(await c.req.json());
    const id = c.req.param('id');
    const row = await withOrg(deps.db, c.get('orgId')!, async (tx) => {
      if (input.domain) await assertDomainFree(tx, input.domain, id);
      const current = await findActive(tx, id);
      const domain = input.domain ?? current.domain;
      const extra = input.extraOrigins ?? current.extraOrigins;
      const [updated] = await tx
        .update(sites)
        .set({
          ...input,
          extraOrigins: extra,
          // The collector only accepts data from these origins.
          allowedOrigins: [...new Set([...allowedOriginsFor(domain), ...extra])],
        })
        .where(eq(sites.id, id))
        .returning();
      await audit(tx, c, 'site.updated', id, { fields: Object.keys(input) });
      return updated!;
    });
    return c.json({ site: toSiteDto(row) });
  });

  const scriptUrl = `${deps.env.COLLECTOR_PUBLIC_URL.replace(/\/$/, '')}/sdk/p.js`;
  const installFor = async (orgId: string, row: SiteRow): Promise<SiteInstall> => {
    const last = await withOrg(deps.db, orgId, (tx) =>
      tx
        .select({ last: max(visits.lastSeenAt) })
        .from(visits)
        .where(eq(visits.siteId, row.id)),
    );
    return {
      snippet: buildSnippet(scriptUrl, row.publicKey),
      scriptUrl,
      status: row.status,
      verifiedAt: row.verifiedAt?.toISOString() ?? null,
      lastEventAt: last[0]?.last?.toISOString() ?? null,
      allowedOrigins: row.allowedOrigins,
      extraOrigins: row.extraOrigins,
    };
  };

  /** Install instructions + live verification status (polled by the install screen). */
  r.get('/:id/install', async (c) => {
    if (c.get('role') === 'client_viewer') throw notFound('Site');
    const row = await withOrg(deps.db, c.get('orgId')!, (tx) => findActive(tx, c.req.param('id')));
    return c.json(await installFor(c.get('orgId')!, row));
  });

  /** Sends the snippet and guides to whoever builds the site (owners often aren't developers). */
  const emailsSent = new Map<string, number[]>();
  r.post('/:id/install/email', requireManager, async (c) => {
    const { email } = InstallEmail.parse(await c.req.json());
    const orgId = c.get('orgId')!;
    const row = await withOrg(deps.db, orgId, (tx) => findActive(tx, c.req.param('id')));
    const now = Date.now();
    const recent = (emailsSent.get(row.id) ?? []).filter((t) => now - t < 3_600_000);
    if (recent.length >= 5)
      throw new ApiError(429, 'rate_limited', 'Too many emails for this site — try again later');
    emailsSent.set(row.id, [...recent, now]);
    const user = c.get('user')!;
    const locale = isLocale(user.locale) ? user.locale : 'en';
    await deps.mailer.send({
      to: email,
      subject: translate(locale, 'email.install.subject', { domain: row.domain }),
      text: translate(locale, 'email.install.body', {
        inviter: user.name,
        domain: row.domain,
        snippet: buildSnippet(scriptUrl, row.publicKey),
        url: `${deps.env.APP_URL}/docs/install`,
      }),
    });
    await withOrg(deps.db, orgId, (tx) => audit(tx, c, 'site.install_emailed', row.id, { to: email }));
    return c.json({ ok: true });
  });

  /** Soft delete; a purge job removes the site and its data after 7 days (worker, slice 2+). */
  r.delete('/:id', requireManager, async (c) => {
    const { confirmDomain } = SiteDelete.parse(await c.req.json().catch(() => ({})));
    const id = c.req.param('id');
    await withOrg(deps.db, c.get('orgId')!, async (tx) => {
      const site = await findActive(tx, id);
      if (confirmDomain.trim().toLowerCase() !== site.domain) {
        throw new ApiError(400, 'validation_failed', 'Type the site domain to confirm deletion', {
          field: 'confirmDomain',
        });
      }
      await tx.update(sites).set({ deletedAt: new Date(), status: 'paused' }).where(eq(sites.id, id));
      await audit(tx, c, 'site.deleted', id, { domain: site.domain });
    });
    return c.body(null, 204);
  });

  return r;
}
