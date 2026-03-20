/**
 * DXM Pulse — Weekly Digest Route
 * POST /digest/send-all — sends weekly digest to all workspaces with Telegram configured.
 * Protected by x-digest-key header.
 */
import { timingSafeEqual } from 'crypto';
import { Router, Request, Response } from 'express';
import { db } from '../db/index.js';
import { compileDigest, formatDigestEN, formatDigestAM } from '../services/weeklyDigest.js';
import { BILLING_FEATURES, planSupportsFeature } from '../lib/billing.js';

const router = Router();

const TELEGRAM_API = 'https://api.telegram.org/bot';

const normalizeSecret = (raw?: string): string | null => {
  if (typeof raw !== 'string') {
    return null;
  }

  const normalized = raw.trim();
  return normalized.length > 0 ? normalized : null;
};

const readDigestKeyHeader = (req: Request): string | null => {
  const digestKey = req.headers['x-digest-key'];
  return typeof digestKey === 'string' ? digestKey : null;
};

const resolveAcceptedDigestSecret = (): string | null => {
  const digestSecret = normalizeSecret(process.env.DIGEST_CRON_SECRET);
  if (process.env.NODE_ENV === 'production') {
    return digestSecret;
  }

  return digestSecret ?? normalizeSecret(process.env.JWT_SECRET);
};

const digestKeysMatch = (provided: string | null, accepted: string | null): boolean => {
  if (!provided || !accepted) {
    return false;
  }

  const providedBuffer = Buffer.from(provided);
  const acceptedBuffer = Buffer.from(accepted);

  if (providedBuffer.length !== acceptedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, acceptedBuffer);
};

async function sendTelegramMessage(botToken: string, chatId: string, text: string): Promise<boolean> {
  try {
    const resp = await fetch(`${TELEGRAM_API}${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      console.warn(`[digest] Telegram delivery failed (${resp.status}): ${body}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[digest] Telegram network error:', err);
    return false;
  }
}

router.post('/send-all', async (req: Request, res: Response) => {
  const digestKey = readDigestKeyHeader(req);
  const secret = resolveAcceptedDigestSecret();

  if (!digestKeysMatch(digestKey, secret)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Get all workspaces with Telegram configured and digest enabled
    const workspaces = db.prepare(`
      SELECT id, plan, telegram_bot_token, telegram_chat_id, digest_language
      FROM workspaces
      WHERE telegram_chat_id IS NOT NULL
        AND telegram_bot_token IS NOT NULL
        AND digest_enabled = 1
    `).all() as {
      id: string;
      plan: string;
      telegram_bot_token: string;
      telegram_chat_id: string;
      digest_language: string | null;
    }[];

    const eligibleWorkspaces = workspaces.filter((workspace) =>
      planSupportsFeature(workspace.plan, BILLING_FEATURES.digest),
    );

    console.info(`[digest] Starting digest run for ${eligibleWorkspaces.length} eligible workspaces`);

    let sent = 0;
    let failed = 0;

    for (const ws of eligibleWorkspaces) {
      const data = compileDigest(ws.id);
      const lang = (ws.digest_language || 'en').toLowerCase();
      const message = lang === 'am' ? formatDigestAM(data) : formatDigestEN(data);

      const ok = await sendTelegramMessage(ws.telegram_bot_token, ws.telegram_chat_id, message);
      if (ok) {
        sent++;
        continue;
      }

      failed++;
      console.warn(`[digest] Delivery failed for workspace ${ws.id}`);
    }

    console.info(`[digest] Completed digest run: eligible=${eligibleWorkspaces.length} sent=${sent} failed=${failed}`);

    return res.json({ sent });
  } catch (err) {
    console.error('[digest] Error sending digests:', err);
    return res.status(500).json({ error: 'Failed to send digests' });
  }
});

export default router;
