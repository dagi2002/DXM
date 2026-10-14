import { createHash, timingSafeEqual } from 'node:crypto';
import {
  TelegramSettingsUpdate,
  canManage,
  canWorkOnFixes,
  type TelegramLinkCode,
  type TelegramStatus,
} from '@pulse/contracts';
import {
  auditLog,
  newId,
  organization,
  randomBase62,
  sql,
  telegramLinkCodes,
  telegramLinks,
  withOrg,
  type Tx,
} from '@pulse/db';
import { isLocale } from '@pulse/i18n';
import { t } from '@pulse/i18n/messages';
import { parseStartCode } from '@pulse/mail/telegram';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createMiddleware } from 'hono/factory';
import type { AppDeps } from '../app';
import { requireOrg, requireSession } from '../guards';
import { ApiError, forbidden, notFound, type AppEnv } from '../http';

/** Link codes are single-use and short-lived: long enough to switch to Telegram and tap Start. */
export const LINK_CODE_TTL_MINUTES = 15;

export const hashCode = (code: string) => createHash('sha256').update(code).digest('hex');

const requireTeam = createMiddleware<AppEnv>(async (c, next) => {
  if (!canWorkOnFixes(c.get('role'))) throw forbidden();
  await next();
});
const requireManage = createMiddleware<AppEnv>(async (c, next) => {
  if (!canManage(c.get('role'))) throw forbidden();
  await next();
});

function audit(
  tx: Tx,
  c: Context<AppEnv>,
  action: string,
  targetId: string,
  metadata: Record<string, unknown> = {},
) {
  return tx.insert(auditLog).values({
    id: newId('aud'),
    orgId: c.get('orgId')!,
    actorUserId: c.get('user')?.id ?? null,
    action,
    targetType: 'telegram_link',
    targetId,
    metadata,
    ip: c.get('clientIp'),
  });
}

/**
 * Telegram alerts settings for the active org. Anyone on the team can see whether alerts are on;
 * owners and admins link, change and unlink the chat.
 */
export function telegramRoutes(deps: AppDeps) {
  const r = new Hono<AppEnv>();
  const configured = Boolean(deps.env.TELEGRAM_BOT_TOKEN && deps.env.TELEGRAM_BOT_USERNAME);
  r.use('*', requireSession(deps), requireOrg(deps), requireTeam);

  const status = async (orgId: string): Promise<TelegramStatus> => {
    const [link] = await withOrg(deps.db, orgId, (tx) => tx.select().from(telegramLinks).limit(1));
    return {
      configured,
      botUsername: configured ? deps.env.TELEGRAM_BOT_USERNAME! : null,
      link: link
        ? {
            chatTitle: link.chatTitle,
            linkedAt: link.updatedAt.toISOString(),
            quietStart: link.quietStart,
            quietEnd: link.quietEnd,
            timeZone: link.timeZone,
            locale: isLocale(link.locale) ? link.locale : 'en',
          }
        : null,
    };
  };

  r.get('/', async (c) => c.json(await status(c.get('orgId')!)));

  r.post('/link-code', requireManage, async (c) => {
    if (!configured) throw new ApiError(409, 'conflict', 'Telegram alerts are not set up on this server');
    const code = randomBase62(24);
    const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MINUTES * 60_000);
    const user = c.get('user')!;
    await withOrg(deps.db, c.get('orgId')!, async (tx) => {
      await tx.insert(telegramLinkCodes).values({
        codeHash: hashCode(code),
        orgId: c.get('orgId')!,
        createdByUserId: user.id,
        locale: isLocale(user.locale) ? user.locale : 'en',
        expiresAt,
      });
    });
    const body: TelegramLinkCode = {
      code,
      url: `https://t.me/${deps.env.TELEGRAM_BOT_USERNAME}?start=${code}`,
      expiresAt: expiresAt.toISOString(),
    };
    return c.json(body, 201);
  });

  r.patch('/', requireManage, async (c) => {
    const input = TelegramSettingsUpdate.parse(await c.req.json());
    await withOrg(deps.db, c.get('orgId')!, async (tx) => {
      const updated = await tx
        .update(telegramLinks)
        .set({ quietStart: input.quietStart, quietEnd: input.quietEnd, locale: input.locale })
        .returning({ id: telegramLinks.id });
      if (!updated.length) throw notFound('Telegram chat');
      await audit(tx, c, 'telegram.updated', updated[0]!.id, input);
    });
    return c.json(await status(c.get('orgId')!));
  });

  r.delete('/', requireManage, async (c) => {
    await withOrg(deps.db, c.get('orgId')!, async (tx) => {
      const removed = await tx.delete(telegramLinks).returning({ id: telegramLinks.id });
      if (!removed.length) throw notFound('Telegram chat');
      await audit(tx, c, 'telegram.unlinked', removed[0]!.id);
    });
    return c.json(await status(c.get('orgId')!));
  });

  r.post('/test', requireManage, async (c) => {
    if (!configured || !deps.telegram)
      throw new ApiError(409, 'conflict', 'Telegram alerts are not set up on this server');
    const found = await withOrg(deps.db, c.get('orgId')!, async (tx) => {
      const [link] = await tx.select().from(telegramLinks).limit(1);
      const [org] = await tx.select({ name: organization.name }).from(organization).limit(1);
      return link ? { link, org } : null;
    });
    if (!found) throw notFound('Telegram chat');
    const locale = isLocale(found.link.locale) ? found.link.locale : 'en';
    try {
      await deps.telegram.sendMessage(
        found.link.chatId,
        t(locale, 'telegram.test', { org: found.org?.name ?? '' }),
      );
    } catch (err) {
      c.get('log').warn({ err: err instanceof Error ? err.message : 'unknown' }, 'telegram test failed');
      throw new ApiError(
        502,
        'internal',
        'Telegram did not accept the message. Check that the bot is still in the chat.',
      );
    }
    return c.json({ sent: true });
  });

  return r;
}

const secretMatches = (expected: string | undefined, got: string | undefined) => {
  if (!expected || !got) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
};

interface TelegramUpdate {
  message?: {
    text?: unknown;
    chat?: { id?: unknown; title?: unknown; username?: unknown; first_name?: unknown };
  };
}

/**
 * Telegram calls this (setWebhook with secret_token). No session: the secret header proves it's
 * Telegram, and a single-use code in `/start <code>` proves which org the chat belongs to.
 * Always answers 200 to a genuine call so Telegram doesn't retry.
 */
export function telegramWebhook(deps: AppDeps) {
  const r = new Hono<AppEnv>();
  r.post(
    '/',
    bodyLimit({
      maxSize: 64 * 1024,
      onError: () => {
        throw new ApiError(413, 'bad_request', 'Body too large');
      },
    }),
    async (c) => {
      if (!secretMatches(deps.env.TELEGRAM_WEBHOOK_SECRET, c.req.header('x-telegram-bot-api-secret-token'))) {
        throw new ApiError(401, 'unauthenticated', 'Unknown caller');
      }
      let update: TelegramUpdate;
      try {
        update = (await c.req.json()) as TelegramUpdate;
      } catch {
        return c.json({ ok: true });
      }
      const chat = update.message?.chat;
      const code = parseStartCode(update.message?.text);
      const chatId = typeof chat?.id === 'number' || typeof chat?.id === 'string' ? String(chat.id) : null;
      if (!code || !chatId || !/^-?\d{1,20}$/.test(chatId)) return c.json({ ok: true });
      const title =
        [chat?.title, chat?.username, chat?.first_name].find((v): v is string => typeof v === 'string') ??
        null;
      const res = await deps.db.execute<{ org_id: string; org_name: string; locale: string }>(
        sql`select org_id, org_name, locale from pulse_claim_telegram_link(${hashCode(code)}, ${newId('tgl')}, ${chatId}, ${title})`,
      );
      const claimed = res.rows[0];
      const locale = claimed && isLocale(claimed.locale) ? claimed.locale : 'en';
      const text = claimed
        ? t(locale, 'telegram.linked', { org: claimed.org_name })
        : t(locale, 'telegram.unknownCode');
      if (claimed) c.get('log').info({ orgId: claimed.org_id }, 'telegram chat linked');
      try {
        await deps.telegram?.sendMessage(chatId, text);
      } catch (err) {
        c.get('log').warn({ err: err instanceof Error ? err.message : 'unknown' }, 'telegram reply failed');
      }
      return c.json({ ok: true });
    },
  );
  return r;
}
