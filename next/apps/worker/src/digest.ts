import { FixEvidence, type FixKind, type FixSeverity } from '@pulse/contracts';
import { formatDate, isLocale, type Locale } from '@pulse/i18n';
import { t } from '@pulse/i18n/messages';
import {
  and,
  eq,
  inArray,
  member,
  notificationPrefs,
  or,
  randomBase62,
  sql,
  isNull,
  lt,
  user,
  withOrg,
  type Db,
  type Tx,
} from '@pulse/db';
import { loadSiteInsights } from '@pulse/insights/db';
import type { Boss, DigestJob } from '@pulse/jobs';
import { sendJob } from '@pulse/jobs';
import type { Mail, Mailer } from '@pulse/mail';
import { target } from './alerts';

const DAY = 24 * 3600_000;
/** Roles that get the digest (client viewers don't see fixes). */
const TEAM_ROLES = ['owner', 'admin', 'member'];

/** The reported week: the 7 UTC days before the most recent Monday 00:00 UTC (≤ now). */
export function digestWeek(now: Date): { week: string; start: Date; end: Date } {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const sinceMonday = (new Date(today).getUTCDay() + 6) % 7;
  const end = new Date(today - sinceMonday * DAY);
  const start = new Date(end.getTime() - 7 * DAY);
  return { week: start.toISOString().slice(0, 10), start, end };
}

export function weekBounds(week: string): { start: Date; end: Date } {
  const start = new Date(`${week}T00:00:00Z`);
  return { start, end: new Date(start.getTime() + 7 * DAY) };
}

export interface DigestData {
  org: string;
  opened: number;
  fixed: number;
  verified: number;
  topFix: {
    id: string;
    number: number;
    kind: FixKind;
    severity: FixSeverity;
    evidence: FixEvidence;
    site: string;
  } | null;
  sites: { name: string; score: number | null; previous: number | null; visits: number }[];
}

/** Anything happened that week? An org with no fixes moving and no visits gets no email. */
export const hasActivity = (d: DigestData) =>
  d.opened + d.fixed + d.verified > 0 || d.sites.some((s) => s.visits > 0);

const ts = (d: Date) => d.toISOString();

/** Last week's numbers for the org in scope (run inside `withOrg`). */
export async function loadDigestData(tx: Tx, start: Date, end: Date): Promise<DigestData> {
  const counts = await tx.execute<{ opened: number; fixed: number; verified: number }>(sql`
    select count(*) filter (where i.created_at >= ${ts(start)} and i.created_at < ${ts(end)})::int as opened,
           count(*) filter (where i.fixed_at >= ${ts(start)} and i.fixed_at < ${ts(end)})::int as fixed,
           count(*) filter (where i.status = 'verified'
                              and i.verified_at >= ${ts(start)} and i.verified_at < ${ts(end)})::int as verified
      from issues i join sites s on s.id = i.site_id and s.deleted_at is null`);
  const top = await tx.execute<{
    id: string;
    number: number;
    kind: FixKind;
    severity: FixSeverity;
    evidence: unknown;
    site: string;
  }>(sql`
    select i.id, i.number, i.kind, i.severity, i.evidence, s.name as site
      from issues i join sites s on s.id = i.site_id and s.deleted_at is null
     where i.status in ('open', 'fixing')
     order by (i.severity = 'critical') desc,
              coalesce((i.evidence->>'visits')::int, 0) desc,
              i.last_seen desc
     limit 1`);
  const org = await tx.execute<{ name: string }>(sql`select name from organization limit 1`);
  const siteRows = await tx.execute<{ id: string; name: string }>(sql`
    select id, name from sites where deleted_at is null order by created_at`);
  // The insights range ends "today": ask as of the week's last moment.
  const asOf = new Date(end.getTime() - 1);
  const sites = [];
  for (const s of siteRows.rows) {
    const insights = await loadSiteInsights(tx, s.id, '7d', asOf);
    sites.push({
      name: s.name,
      score: insights.health.score,
      previous: insights.health.previous,
      visits: insights.visits.value,
    });
  }
  const c = counts.rows[0]!;
  const fix = top.rows[0];
  const evidence = fix ? FixEvidence.safeParse(fix.evidence) : null;
  return {
    org: org.rows[0]?.name ?? '',
    opened: Number(c.opened),
    fixed: Number(c.fixed),
    verified: Number(c.verified),
    topFix:
      fix && evidence?.success
        ? {
            id: fix.id,
            number: Number(fix.number),
            kind: fix.kind,
            severity: fix.severity,
            evidence: evidence.data,
            site: fix.site,
          }
        : null,
    sites,
  };
}

/** The digest email in one language. Plain text: nothing from a site name can become markup. */
export function formatDigest(
  locale: Locale,
  data: DigestData,
  ctx: { start: Date; end: Date; appUrl: string; unsubscribeUrl: string },
): Pick<Mail, 'subject' | 'text'> {
  const day = (d: Date) => formatDate(d, { locale, timeZone: 'UTC' });
  const lines = [
    t(locale, 'email.digest.intro', {
      org: data.org,
      from: day(ctx.start),
      to: day(new Date(ctx.end.getTime() - DAY)),
    }),
    '',
    t(locale, 'email.digest.fixes', { opened: data.opened, fixed: data.fixed, verified: data.verified }),
    '',
  ];
  if (data.topFix) {
    const e = data.topFix.evidence;
    const page = 'path' in e ? e.path : '';
    lines.push(
      t(locale, 'email.digest.topFix'),
      `#${data.topFix.number} · ${t(locale, `telegram.severity.${data.topFix.severity}`)} · ${t(
        locale,
        `telegram.title.${data.topFix.kind}`,
        { target: target(e), page, site: data.topFix.site },
      )}`,
      t(locale, 'telegram.open', { url: `${ctx.appUrl}/fixes/${data.topFix.id}` }),
    );
  } else {
    lines.push(t(locale, 'email.digest.noOpen'));
  }
  if (data.sites.length) {
    lines.push('', t(locale, 'email.digest.sites'));
    for (const s of data.sites) {
      if (s.score === null) {
        lines.push(`• ${t(locale, 'email.digest.siteNoScore', { site: s.name, visits: s.visits })}`);
      } else if (s.previous === null) {
        lines.push(`• ${t(locale, 'email.digest.siteNew', { site: s.name, score: s.score })}`);
      } else {
        const change = s.score - s.previous;
        lines.push(
          `• ${t(locale, 'email.digest.siteHealth', {
            site: s.name,
            score: s.score,
            direction: change > 0 ? 'up' : change < 0 ? 'down' : 'same',
            change: Math.abs(change),
          })}`,
        );
      }
    }
  }
  lines.push(
    '',
    t(locale, 'email.digest.open', { url: `${ctx.appUrl}/today` }),
    '',
    t(locale, 'email.digest.unsubscribe', { url: ctx.unsubscribeUrl }),
  );
  return { subject: t(locale, 'email.digest.subject', { org: data.org }), text: lines.join('\n') };
}

/** Mondays: one digest job per org with sites, staggered over half an hour. */
export async function sweepDigest(db: Db, boss: Boss, now: Date = new Date()): Promise<number> {
  const { week } = digestWeek(now);
  const res = await db.execute<{ org_id: string }>(sql`select org_id from pulse_digest_orgs()`);
  let i = 0;
  for (const r of res.rows) {
    await sendJob(
      boss,
      'digest.org',
      { orgId: r.org_id, week },
      { singletonKey: `${r.org_id}:${week}`, startAfter: (i++ * 7) % 1800 },
    );
  }
  return res.rows.length;
}

export type DigestResult = { status: 'quiet' } | { status: 'sent'; sent: number; skipped: number };

/**
 * Sends one org's digest for `week` to every team member who hasn't switched it off, in their
 * language, with a one-click unsubscribe link. An org with no activity that week gets nothing.
 * Members already sent this week's digest (a retried job) are skipped.
 */
export async function sendWeeklyDigest(
  db: Db,
  mailer: Mailer,
  appUrl: string,
  job: DigestJob,
): Promise<DigestResult> {
  const { start, end } = weekBounds(job.week);
  const loaded = await withOrg(db, job.orgId, async (tx) => {
    const data = await loadDigestData(tx, start, end);
    if (!hasActivity(data)) return null;
    const people = await tx
      .select({ userId: user.id, email: user.email, locale: user.locale })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(and(eq(member.organizationId, job.orgId), inArray(member.role, TEAM_ROLES)));
    if (people.length) {
      await tx
        .insert(notificationPrefs)
        .values(
          people.map((p) => ({ orgId: job.orgId, userId: p.userId, unsubscribeToken: randomBase62(32) })),
        )
        .onConflictDoNothing();
    }
    const prefs = await tx
      .select()
      .from(notificationPrefs)
      .where(
        and(
          eq(notificationPrefs.weeklyDigest, true),
          or(isNull(notificationPrefs.lastDigestWeek), lt(notificationPrefs.lastDigestWeek, job.week)),
        ),
      );
    const byUser = new Map(prefs.map((p) => [p.userId, p]));
    return { data, recipients: people.filter((p) => byUser.has(p.userId)), byUser, total: people.length };
  });
  if (!loaded) return { status: 'quiet' };

  let sent = 0;
  for (const r of loaded.recipients) {
    const pref = loaded.byUser.get(r.userId)!;
    const locale = isLocale(r.locale) ? r.locale : 'en';
    const unsubscribeUrl = `${appUrl}/unsubscribe.html#${pref.unsubscribeToken}`;
    const mail = formatDigest(locale, loaded.data, { start, end, appUrl, unsubscribeUrl });
    await mailer.send({
      to: r.email,
      ...mail,
      headers: {
        'List-Unsubscribe': `<${appUrl}/api/v1/public/digest/unsubscribe/${pref.unsubscribeToken}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
    await withOrg(db, job.orgId, (tx) =>
      tx
        .update(notificationPrefs)
        .set({ lastDigestWeek: job.week })
        .where(and(eq(notificationPrefs.orgId, job.orgId), eq(notificationPrefs.userId, r.userId))),
    );
    sent++;
  }
  return { status: 'sent', sent, skipped: loaded.total - sent };
}
