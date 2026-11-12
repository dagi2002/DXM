import { formatDate, isLocale } from '@pulse/i18n';
import { t, type MessageKey } from '@pulse/i18n/messages';
import type { Mailer } from '@pulse/mail';
import { formatMoney } from '@pulse/metrics';
import { and, eq, invoices, member, organization, user, withOrg, type Db } from '@pulse/db';

export type BillingEmailKind = 'invoice' | 'pastDue' | 'restricted' | 'receipt';

/**
 * Emails the organization's owners about billing, each in their own language. The link goes to
 * Settings → Billing, where the owner opens a fresh Chapa pay link (links are never emailed
 * directly: each one is a single payment attempt and they expire).
 */
export async function sendBillingEmail(
  db: Db,
  mailer: Mailer,
  appUrl: string,
  orgId: string,
  kind: BillingEmailKind,
  invoiceId?: string,
): Promise<number> {
  const invoice = invoiceId
    ? await withOrg(db, orgId, async (tx) => (await tx.select().from(invoices).where(eq(invoices.id, invoiceId)))[0])
    : undefined;
  if (invoiceId && !invoice) return 0;
  const [org] = await db.select({ name: organization.name }).from(organization).where(eq(organization.id, orgId));
  const owners = await db
    .select({ email: user.email, locale: user.locale })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(and(eq(member.organizationId, orgId), eq(member.role, 'owner')));
  const url = `${appUrl}/settings?tab=billing`;
  for (const o of owners) {
    const locale = isLocale(o.locale) ? o.locale : 'en';
    const values = {
      org: org?.name ?? '',
      url,
      number: invoice?.number ?? 0,
      amount: invoice ? formatMoney(invoice.amountSantim, locale) : '',
      plan: invoice ? t(locale, `billing.plan.${invoice.plan}` as MessageKey) : '',
      due: invoice ? formatDate(invoice.dueAt, { locale }) : '',
      until: invoice ? formatDate(invoice.periodEnd, { locale }) : '',
    };
    await mailer.send({
      to: o.email,
      subject: t(locale, `email.billing.${kind}.subject` as MessageKey, values),
      text: t(locale, `email.billing.${kind}.body` as MessageKey, values),
    });
  }
  return owners.length;
}
