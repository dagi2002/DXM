import { FixEvidence, type FixKind, type FixSeverity } from '@pulse/contracts';
import { isLocale, type Locale } from '@pulse/i18n';
import { t } from '@pulse/i18n/messages';
import { and, eq, inArray, issues, sites, telegramLinks, withOrg, type Db } from '@pulse/db';
import type { AlertReason, TelegramAlertJob } from '@pulse/jobs';
import { TelegramError, quietUntil, type TelegramClient } from '@pulse/mail/telegram';

/** Most fixes one message lists; the rest are one tap away in Today. */
export const MAX_ALERTS_PER_MESSAGE = 5;

export interface AlertItem {
  number: number;
  kind: FixKind;
  severity: FixSeverity;
  reason: AlertReason;
  evidence: FixEvidence;
  url: string;
}

const short = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** What the title names besides the page: the element, form, metric — per detector. */
function target(e: FixEvidence): string {
  switch (e.type) {
    case 'click':
      return short(e.selector, 48);
    case 'form':
      return short(e.form, 40);
    case 'slow_page':
      return e.metric;
    case 'js_error':
      return short(e.message);
    case 'u_turn':
    case 'tracking':
      return '';
    default:
      return e satisfies never;
  }
}

/**
 * One plain-text Telegram message for a detection run's news on one site, in the chat's language:
 * a header, then per fix its severity, why it's news, what's wrong, how many visitors, and a link.
 */
export function formatAlert(
  locale: Locale,
  site: string,
  items: readonly AlertItem[],
  todayUrl: string,
): string {
  const shown = items.slice(0, MAX_ALERTS_PER_MESSAGE);
  const lines = [t(locale, 'telegram.alert.header', { site, count: items.length })];
  for (const item of shown) {
    const e = item.evidence;
    const page = 'path' in e ? e.path : '';
    const title = t(locale, `telegram.title.${item.kind}`, { target: target(e), page, site });
    const detail =
      e.type === 'tracking'
        ? t(locale, 'telegram.silent', { hours: Math.round(e.silentHours) })
        : t(locale, 'telegram.visits', { count: e.visits, hours: e.windowHours });
    lines.push(
      '',
      `${t(locale, `telegram.severity.${item.severity}`)} · ${t(locale, `telegram.reason.${item.reason}`)} · #${item.number}`,
      title,
      detail,
      t(locale, 'telegram.open', { url: item.url }),
    );
  }
  if (items.length > shown.length) lines.push('', t(locale, 'telegram.open', { url: todayUrl }));
  return lines.join('\n');
}

export type AlertResult =
  | { status: 'sent'; count: number }
  | { status: 'deferred'; until: Date }
  | { status: 'no_link' | 'nothing' | 'unlinked' };

/**
 * Sends one `alert.telegram` job: loads the org's linked chat and the fixes (inside the org's
 * scope), drops fixes nobody needs to hear about anymore (fixed or dismissed since), and either
 * sends now or reports when quiet hours end so the caller can re-queue it. A chat that blocked or
 * removed the bot is unlinked instead of retried.
 */
export async function sendTelegramAlert(
  db: Db,
  client: TelegramClient,
  appUrl: string,
  job: TelegramAlertJob,
  now: Date = new Date(),
): Promise<AlertResult> {
  const loaded = await withOrg(db, job.orgId, async (tx) => {
    const [link] = await tx.select().from(telegramLinks).limit(1);
    if (!link) return null;
    const ids = job.alerts.map((a) => a.issueId);
    const rows = ids.length
      ? await tx
          .select({ issue: issues, siteName: sites.name })
          .from(issues)
          .innerJoin(sites, eq(sites.id, issues.siteId))
          .where(and(inArray(issues.id, ids), eq(issues.siteId, job.siteId)))
      : [];
    return { link, rows };
  });
  if (!loaded) return { status: 'no_link' };
  const { link, rows } = loaded;

  const until = quietUntil(now, link);
  if (until) return { status: 'deferred', until };

  const reasons = new Map(job.alerts.map((a) => [a.issueId, a.reason]));
  const items: AlertItem[] = rows
    .filter((r) => r.issue.status === 'open' || r.issue.status === 'fixing')
    .map((r) => ({
      number: r.issue.number,
      kind: r.issue.kind,
      severity: r.issue.severity,
      reason: reasons.get(r.issue.id)!,
      evidence: FixEvidence.parse(r.issue.evidence),
      url: `${appUrl}/fixes/${r.issue.id}`,
    }))
    .sort((a, b) => (a.severity === b.severity ? a.number - b.number : a.severity === 'critical' ? -1 : 1));
  if (!items.length) return { status: 'nothing' };

  const locale = isLocale(link.locale) ? link.locale : 'en';
  const text = formatAlert(locale, rows[0]!.siteName, items, `${appUrl}/today`);
  try {
    await client.sendMessage(link.chatId, text);
  } catch (err) {
    if (err instanceof TelegramError && err.permanent) {
      await withOrg(db, job.orgId, (tx) => tx.delete(telegramLinks).where(eq(telegramLinks.id, link.id)));
      return { status: 'unlinked' };
    }
    throw err;
  }
  return { status: 'sent', count: items.length };
}

/** Builds the alert job for a detection result, or null when nothing is news. */
export function alertJobFor(
  site: { siteId: string; orgId: string },
  result: { created: string[]; escalated: string[]; reopened: string[] },
): TelegramAlertJob | null {
  const alerts = [
    ...result.created.map((issueId) => ({ issueId, reason: 'created' as const })),
    ...result.escalated.map((issueId) => ({ issueId, reason: 'escalated' as const })),
    ...result.reopened.map((issueId) => ({ issueId, reason: 'reopened' as const })),
  ];
  return alerts.length ? { ...site, alerts } : null;
}
