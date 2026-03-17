/**
 * DXM Pulse — Weekly Digest Route
 * POST /digest/send-all — sends weekly digest to all workspaces with Telegram configured.
 * Protected by x-digest-key header (matches JWT_SECRET).
 */
import { Router, Request, Response } from 'express';
import { db } from '../db/index.js';
import { compileDigest, formatDigestEN, formatDigestAM } from '../services/weeklyDigest.js';

const router = Router();

const TELEGRAM_API = 'https://api.telegram.org/bot';

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
  // Lightweight auth guard — check x-digest-key header
  const digestKey = req.headers['x-digest-key'];
  const secret = process.env.JWT_SECRET;

  if (!secret || digestKey !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Get all workspaces with Telegram configured and digest enabled
    const workspaces = db.prepare(`
      SELECT id, telegram_bot_token, telegram_chat_id, digest_language
      FROM workspaces
      WHERE telegram_chat_id IS NOT NULL
        AND telegram_bot_token IS NOT NULL
        AND digest_enabled = 1
    `).all() as {
      id: string;
      telegram_bot_token: string;
      telegram_chat_id: string;
      digest_language: string | null;
    }[];

    let sent = 0;

    for (const ws of workspaces) {
      const data = compileDigest(ws.id);
      const lang = (ws.digest_language || 'en').toLowerCase();
      const message = lang === 'am' ? formatDigestAM(data) : formatDigestEN(data);

      const ok = await sendTelegramMessage(ws.telegram_bot_token, ws.telegram_chat_id, message);
      if (ok) sent++;
    }

    return res.json({ sent });
  } catch (err) {
    console.error('[digest] Error sending digests:', err);
    return res.status(500).json({ error: 'Failed to send digests' });
  }
});

export default router;
