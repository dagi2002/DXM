import { isLocale } from '@pulse/i18n';
import { t } from '@pulse/i18n/messages';
import type { Mailer } from '@pulse/mail';
import { and, eq, inArray, member, sites, user, withOrg, type Db } from '@pulse/db';

/** Emails the org's owners and admins (in their own language) when a site receives its first data. */
export async function notifySiteLive(
  db: Db,
  mailer: Mailer,
  appUrl: string,
  job: { siteId: string; orgId: string },
) {
  const site = await withOrg(db, job.orgId, async (tx) => {
    const [row] = await tx
      .select({ name: sites.name, domain: sites.domain })
      .from(sites)
      .where(eq(sites.id, job.siteId))
      .limit(1);
    return row;
  });
  if (!site) return 0;
  const recipients = await db
    .select({ email: user.email, locale: user.locale })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.organizationId, job.orgId), inArray(member.role, ['owner', 'admin'])));
  const url = `${appUrl}/sites/${job.siteId}`;
  for (const r of recipients) {
    const locale = isLocale(r.locale) ? r.locale : 'en';
    await mailer.send({
      to: r.email,
      subject: t(locale, 'email.siteLive.subject', { site: site.name }),
      text: t(locale, 'email.siteLive.body', { domain: site.domain, url }),
    });
  }
  return recipients.length;
}
