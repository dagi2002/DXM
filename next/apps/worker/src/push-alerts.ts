import { FixEvidence } from '@pulse/contracts';
import { isLocale, type Locale } from '@pulse/i18n';
import { t } from '@pulse/i18n/messages';
import {
  and,
  eq,
  inArray,
  issues,
  member,
  pushSubscriptions,
  sites,
  sql,
  user,
  withOrg,
  type Db,
} from '@pulse/db';
import type { AlertJob } from '@pulse/jobs';
import { quietUntil } from '@pulse/mail/quiet-hours';
import { PushError, type PushClient, type PushMessage } from '@pulse/mail/push';
import { target, type AlertItem } from './alerts';
import { loadQuietHours } from './quiet';

/** Roles that hear about fixes (client viewers don't see fixes). */
const TEAM_ROLES = ['owner', 'admin', 'member'];

/**
 * One notification for a detection run's news on one site, in the reader's language: the header
 * names the site and how many fixes, the body the most pressing one. Tapping opens that fix, or
 * Today when there are several.
 */
export function formatPush(
  locale: Locale,
  site: string,
  siteId: string,
  items: readonly Omit<AlertItem, 'url'>[],
  urls: { fix: (id: string) => string; today: string },
  ids: readonly string[],
): PushMessage {
  const first = items[0]!;
  const e = first.evidence;
  const page = 'path' in e ? e.path : '';
  const title = t(locale, `telegram.title.${first.kind}`, { target: target(e), page, site });
  const lines = [`${t(locale, `telegram.reason.${first.reason}`)} · ${title}`];
  if (items.length > 1) lines.push(t(locale, 'push.more', { count: items.length - 1 }));
  return {
    title: t(locale, 'telegram.alert.header', { site, count: items.length }),
    body: lines.join('\n'),
    url: items.length === 1 ? urls.fix(ids[0]!) : urls.today,
    tag: `site:${siteId}`,
  };
}

export type PushAlertResult =
  | { status: 'sent'; delivered: number; removed: number; failed: number }
  | { status: 'deferred'; until: Date }
  | { status: 'no_subscribers' | 'nothing' };

/**
 * Sends one `alert.push` job to every subscribed browser of the org's team, after the org's quiet
 * hours (the same rule as Telegram). Subscriptions the push service reports gone are deleted;
 * other failures are counted, not retried (a retry would repeat it to browsers that got it).
 */
export async function sendPushAlert(
  db: Db,
  client: PushClient,
  appUrl: string,
  job: AlertJob,
  now: Date = new Date(),
): Promise<PushAlertResult> {
  const loaded = await withOrg(db, job.orgId, async (tx) => {
    const subs = await tx
      .select({ sub: pushSubscriptions, locale: user.locale })
      .from(pushSubscriptions)
      .innerJoin(
        member,
        and(eq(member.organizationId, pushSubscriptions.orgId), eq(member.userId, pushSubscriptions.userId)),
      )
      .innerJoin(user, eq(user.id, pushSubscriptions.userId))
      .where(inArray(member.role, TEAM_ROLES));
    if (!subs.length) return null;
    const ids = job.alerts.map((a) => a.issueId);
    const rows = ids.length
      ? await tx
          .select({ issue: issues, siteName: sites.name })
          .from(issues)
          .innerJoin(sites, eq(sites.id, issues.siteId))
          .where(and(inArray(issues.id, ids), eq(issues.siteId, job.siteId)))
      : [];
    return { subs, rows, quiet: await loadQuietHours(tx) };
  });
  if (!loaded) return { status: 'no_subscribers' };
  const until = quietUntil(now, loaded.quiet);
  if (until) return { status: 'deferred', until };

  const reasons = new Map(job.alerts.map((a) => [a.issueId, a.reason]));
  const news = loaded.rows
    .filter((r) => r.issue.status === 'open' || r.issue.status === 'fixing')
    .sort((a, b) =>
      a.issue.severity === b.issue.severity
        ? a.issue.number - b.issue.number
        : a.issue.severity === 'critical'
          ? -1
          : 1,
    );
  if (!news.length) return { status: 'nothing' };
  const items = news.map((r) => ({
    number: r.issue.number,
    kind: r.issue.kind,
    severity: r.issue.severity,
    reason: reasons.get(r.issue.id)!,
    evidence: FixEvidence.parse(r.issue.evidence),
  }));
  const ids = news.map((r) => r.issue.id);
  const urls = { fix: (id: string) => `${appUrl}/fixes/${id}`, today: `${appUrl}/today` };
  const siteName = news[0]!.siteName;

  let delivered = 0;
  let failed = 0;
  const gone: string[] = [];
  const ok: string[] = [];
  for (const { sub, locale } of loaded.subs) {
    const message = formatPush(isLocale(locale) ? locale : 'en', siteName, job.siteId, items, urls, ids);
    try {
      await client.send(sub, message, { ttl: 24 * 3600, urgency: 'high' });
      delivered++;
      ok.push(sub.id);
    } catch (err) {
      if (err instanceof PushError && err.gone) gone.push(sub.id);
      else failed++;
    }
  }
  if (gone.length || ok.length) {
    await withOrg(db, job.orgId, async (tx) => {
      if (gone.length) await tx.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, gone));
      if (ok.length)
        await tx
          .update(pushSubscriptions)
          .set({ lastSuccessAt: sql`now()` })
          .where(inArray(pushSubscriptions.id, ok));
    });
  }
  return { status: 'sent', delivered, removed: gone.length, failed };
}
