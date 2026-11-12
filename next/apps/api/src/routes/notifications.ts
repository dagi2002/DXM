import {
  DigestUpdate,
  PushSubscriptionInput,
  PushUnsubscribe,
  QuietHoursUpdate,
  canManage,
  canWorkOnFixes,
  type NotificationSettings,
} from '@pulse/contracts';
import { pushConfigured } from '@pulse/config';
import {
  and,
  auditLog,
  count,
  eq,
  newId,
  notificationPrefs,
  notificationSettings,
  organization,
  pushSubscriptions,
  randomBase62,
  sql,
  withOrg,
  type Tx,
} from '@pulse/db';
import { isLocale } from '@pulse/i18n';
import { t } from '@pulse/i18n/messages';
import { PushError, isAllowedPushEndpoint } from '@pulse/mail/push';
import { Hono, type Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { AppDeps } from '../app';
import { requireOrg, requireSession } from '../guards';
import { ApiError, forbidden, notFound, type AppEnv } from '../http';
import { createRateLimiter } from '../rate-limit';
import { saveQuietHours } from './telegram';

const DEFAULT_TIME_ZONE = 'Africa/Addis_Ababa';
/** Browsers per member per org: enough for a phone, a laptop and a work machine. */
export const MAX_PUSH_DEVICES = 10;

const requireTeam = createMiddleware<AppEnv>(async (c, next) => {
  if (!canWorkOnFixes(c.get('role'))) throw forbidden();
  await next();
});

function audit(tx: Tx, c: Context<AppEnv>, action: string, metadata: Record<string, unknown> = {}) {
  return tx.insert(auditLog).values({
    id: newId('aud'),
    orgId: c.get('orgId')!,
    actorUserId: c.get('user')?.id ?? null,
    action,
    targetType: 'notification_settings',
    targetId: c.get('orgId')!,
    metadata,
    ip: c.get('clientIp'),
  });
}

/**
 * Settings → Notifications for the signed-in member and active org: the org's shared quiet hours
 * (owners/admins change them), this member's Monday digest, and web push on this browser.
 * Subscriptions are the member's own: nobody can list, add or remove another member's browsers.
 */
export function notificationRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>();
  const configured = pushConfigured(deps.env) && Boolean(deps.push);
  r.use('*', requireSession(deps), requireOrg(deps), requireTeam);

  const settings = async (orgId: string, userId: string): Promise<NotificationSettings> =>
    withOrg(deps.db, orgId, async (tx) => {
      const [quiet] = await tx.select().from(notificationSettings).limit(1);
      const [pref] = await tx
        .select({ weeklyDigest: notificationPrefs.weeklyDigest })
        .from(notificationPrefs)
        .where(eq(notificationPrefs.userId, userId));
      const [devices] = await tx
        .select({ n: count() })
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, userId));
      return {
        quietHours: {
          quietStart: quiet?.quietStart ?? null,
          quietEnd: quiet?.quietEnd ?? null,
          timeZone: quiet?.timeZone ?? DEFAULT_TIME_ZONE,
        },
        weeklyDigest: pref?.weeklyDigest ?? true,
        push: {
          configured,
          publicKey: configured ? deps.env.VAPID_PUBLIC_KEY! : null,
          devices: Number(devices?.n ?? 0),
        },
      };
    });

  r.get('/', async (c) => c.json(await settings(c.get('orgId')!, c.get('user')!.id)));

  r.put('/quiet-hours', async (c) => {
    if (!canManage(c.get('role'))) throw forbidden();
    const input = QuietHoursUpdate.parse(await c.req.json());
    await withOrg(deps.db, c.get('orgId')!, async (tx) => {
      await saveQuietHours(tx, c.get('orgId')!, input);
      await audit(tx, c, 'notifications.quiet_hours', input);
    });
    return c.json(await settings(c.get('orgId')!, c.get('user')!.id));
  });

  r.put('/digest', async (c) => {
    const input = DigestUpdate.parse(await c.req.json());
    const orgId = c.get('orgId')!;
    const userId = c.get('user')!.id;
    await withOrg(deps.db, orgId, (tx) =>
      tx
        .insert(notificationPrefs)
        .values({ orgId, userId, weeklyDigest: input.weeklyDigest, unsubscribeToken: randomBase62(32) })
        .onConflictDoUpdate({
          target: [notificationPrefs.orgId, notificationPrefs.userId],
          set: { weeklyDigest: input.weeklyDigest, updatedAt: new Date() },
        }),
    );
    return c.json(await settings(orgId, userId));
  });

  r.post('/push', async (c) => {
    if (!configured) throw new ApiError(409, 'conflict', 'Push notifications are not set up on this server');
    const input = PushSubscriptionInput.parse(await c.req.json());
    if (!isAllowedPushEndpoint(input.endpoint))
      throw new ApiError(400, 'bad_request', 'This browser’s push service is not supported');
    const orgId = c.get('orgId')!;
    const userId = c.get('user')!.id;
    await withOrg(deps.db, orgId, async (tx) => {
      const [mine] = await tx
        .select({ n: count() })
        .from(pushSubscriptions)
        .where(
          and(eq(pushSubscriptions.userId, userId), sql`${pushSubscriptions.endpoint} <> ${input.endpoint}`),
        );
      if (Number(mine?.n ?? 0) >= MAX_PUSH_DEVICES)
        throw new ApiError(409, 'conflict', 'Too many devices — turn push off on one you no longer use');
      // One row per browser per org. The same browser signed in as someone else takes it over.
      await tx
        .insert(pushSubscriptions)
        .values({
          id: newId('psub'),
          orgId,
          userId,
          endpoint: input.endpoint,
          p256dh: input.keys.p256dh,
          auth: input.keys.auth,
          userAgent: c.req.header('user-agent')?.slice(0, 300) ?? null,
        })
        .onConflictDoUpdate({
          target: [pushSubscriptions.orgId, pushSubscriptions.endpoint],
          set: { userId, p256dh: input.keys.p256dh, auth: input.keys.auth },
        });
    });
    return c.json(await settings(orgId, userId), 201);
  });

  r.delete('/push', async (c) => {
    const input = PushUnsubscribe.parse(await c.req.json());
    const orgId = c.get('orgId')!;
    const userId = c.get('user')!.id;
    await withOrg(deps.db, orgId, (tx) =>
      tx
        .delete(pushSubscriptions)
        .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, input.endpoint))),
    );
    return c.json(await settings(orgId, userId));
  });

  r.post('/push/test', async (c) => {
    if (!configured || !deps.push)
      throw new ApiError(409, 'conflict', 'Push notifications are not set up on this server');
    const orgId = c.get('orgId')!;
    const user = c.get('user')!;
    const { subs, org } = await withOrg(deps.db, orgId, async (tx) => ({
      subs: await tx.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, user.id)),
      org: (await tx.select({ name: organization.name }).from(organization).limit(1))[0],
    }));
    if (!subs.length) throw notFound('Push subscription');
    const locale = isLocale(user.locale) ? user.locale : 'en';
    let sent = 0;
    for (const sub of subs) {
      try {
        await deps.push.send(
          sub,
          {
            title: t(locale, 'push.test.title'),
            body: t(locale, 'push.test.body', { org: org?.name ?? '' }),
            url: `${deps.env.APP_URL}/settings#settings-notifications`,
            tag: 'test',
          },
          { ttl: 600 },
        );
        sent++;
      } catch (err) {
        if (err instanceof PushError && err.gone)
          await withOrg(deps.db, orgId, (tx) =>
            tx.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id)),
          );
        else c.get('log').warn({ status: err instanceof PushError ? err.status : 'error' }, 'push test failed');
      }
    }
    if (!sent) throw new ApiError(502, 'internal', 'The push service did not accept the message');
    return c.json({ sent });
  });

  return r;
}

/** Per client IP: a burst of 20 unsubscribes, then one every 3 seconds. */
export const UNSUBSCRIBE_RATE_LIMIT = { capacity: 20, refillPerSecond: 1 / 3 };
const TOKEN_RE = /^[A-Za-z0-9]{32,64}$/;

/**
 * `POST /api/v1/public/digest/unsubscribe/:token` — the digest's one-click unsubscribe (RFC 8058;
 * also used by the /unsubscribe page). No session: the random token is the capability, and it can
 * only switch that one member's digest off. GET does nothing, so link scanners can't unsubscribe.
 */
export function publicDigestRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>();
  const limiter = createRateLimiter(UNSUBSCRIBE_RATE_LIMIT);
  r.post('/unsubscribe/:token', async (c) => {
    const limit = limiter.take(c.get('clientIp'));
    if (!limit.ok) {
      c.header('retry-after', String(limit.retryAfter));
      throw new ApiError(429, 'rate_limited', 'Too many requests — try again shortly');
    }
    c.header('cache-control', 'no-store');
    const token = c.req.param('token');
    if (!TOKEN_RE.test(token)) throw notFound('Subscription');
    const res = await deps.db.execute<{ ok: boolean }>(sql`select pulse_digest_unsubscribe(${token}) as ok`);
    if (!res.rows[0]?.ok) throw notFound('Subscription');
    return c.json({ unsubscribed: true });
  });
  return r;
}
