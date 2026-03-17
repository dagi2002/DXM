/**
 * DXM Pulse — Telegram Alert Delivery
 * Primary alert channel for Ethiopian business owners.
 * Messages are sent in Markdown with severity emoji and a dashboard deep-link.
 */

const TELEGRAM_API = 'https://api.telegram.org/bot';

type Severity = 'critical' | 'high' | 'medium' | 'low';

const SEVERITY_EMOJI: Record<Severity, string> = {
  critical: '🔴',
  high:     '🟠',
  medium:   '🟡',
  low:      '🟢',
};

interface AlertPayload {
  title: string;
  description: string;
  severity: Severity | string;
  type: string;
  workspaceId: string;
  alertId: string;
}

export async function sendTelegramAlert(
  botToken: string,
  chatId: string,
  alert: AlertPayload,
  dashboardUrl = 'https://app.dxmpulse.com',
): Promise<boolean> {
  const emoji = SEVERITY_EMOJI[alert.severity as Severity] || '⚪';
  const deepLink = `${dashboardUrl}/alerts?workspace=${alert.workspaceId}`;

  const message = [
    `${emoji} *${escapeMarkdown(alert.title)}*`,
    '',
    escapeMarkdown(alert.description || ''),
    '',
    `🔗 [View in Dashboard](${deepLink})`,
  ].join('\n');

  try {
    const resp = await fetch(`${TELEGRAM_API}${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown',
        disable_web_page_preview: false,
      }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      console.warn(`[telegram] Delivery failed (${resp.status}): ${body}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[telegram] Network error:', err);
    return false;
  }
}

export async function sendTelegramTest(botToken: string, chatId: string): Promise<boolean> {
  return sendTelegramAlert(botToken, chatId, {
    title: 'DXM Pulse connected!',
    description: 'Telegram alerts are configured correctly. You will receive critical alerts here.',
    severity: 'low',
    type: 'test',
    workspaceId: 'test',
    alertId: 'test',
  });
}

// Escape Telegram Markdown v1 special characters
function escapeMarkdown(text: string): string {
  return text.replace(/([_*[\]()~`>#+\-=|{}.!])/g, '\\$1');
}
