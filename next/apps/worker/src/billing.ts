import { advanceSubscription, billingDueOrgs, sendBillingEmail, type BillingEmailKind } from '@pulse/billing';
import type { Db } from '@pulse/db';
import type { Mailer } from '@pulse/mail';

const EMAIL: Record<string, BillingEmailKind> = {
  invoice_created: 'invoice',
  past_due: 'pastDue',
  restricted: 'restricted',
};

/**
 * Hourly: moves every subscription that is due along its clock (renewal invoice → past due →
 * restricted) and emails the owners about each step. Each org is its own transaction, so one
 * failure doesn't hold the others back; the steps are idempotent, so a retry never double-sends
 * an invoice.
 */
export async function sweepBilling(
  db: Db,
  mailer: Mailer,
  appUrl: string,
  now = new Date(),
): Promise<{ orgs: number; events: number; failed: number }> {
  const out = { orgs: 0, events: 0, failed: 0 };
  for (const orgId of await billingDueOrgs(db, now)) {
    out.orgs++;
    try {
      for (const event of await advanceSubscription(db, orgId, now)) {
        out.events++;
        await sendBillingEmail(
          db,
          mailer,
          appUrl,
          orgId,
          EMAIL[event.type]!,
          'invoiceId' in event ? event.invoiceId : undefined,
        );
      }
    } catch {
      out.failed++;
    }
  }
  return out;
}
