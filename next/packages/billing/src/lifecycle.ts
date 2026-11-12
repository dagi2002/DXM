import {
  BILLING_CURRENCY,
  GRACE_DAYS,
  PLANS,
  PLAN_IDS,
  RENEWAL_LEAD_DAYS,
  TRIAL_DAYS,
  entitlementsFor,
  planPriceSantim,
  type BillingInterval,
  type BillingInvoice,
  type BillingOverride,
  type BillingOverview,
  type PaidPlanId,
  type PlanId,
} from '@pulse/contracts';
import {
  and,
  auditLog,
  count,
  desc,
  eq,
  invoices,
  isNull,
  max,
  newId,
  orgPlans,
  organization,
  payments,
  randomBase62,
  sites,
  sql,
  subscriptions,
  withOrg,
  type Db,
  type InvoiceRow,
  type SubscriptionRow,
  type Tx,
} from '@pulse/db';
import { judgeVerification, type ChapaClient, type ChapaMode } from './chapa';
import { ingestState } from './ingest';

const DAY_MS = 24 * 3600 * 1000;
export const addDays = (d: Date, days: number) => new Date(d.getTime() + days * DAY_MS);

/** Adds calendar months in UTC, clamping the day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(d: Date, months: number): Date {
  const out = new Date(d.getTime());
  const day = out.getUTCDate();
  out.setUTCDate(1);
  out.setUTCMonth(out.getUTCMonth() + months);
  const last = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate();
  out.setUTCDate(Math.min(day, last));
  return out;
}
export const addInterval = (d: Date, interval: BillingInterval) => addMonths(d, interval === 'year' ? 12 : 1);

/** A request the caller got wrong (unknown invoice, nothing to pay…). The API maps it to 404/409. */
export class BillingError extends Error {
  constructor(
    readonly code: 'not_found' | 'conflict',
    message: string,
  ) {
    super(message);
    this.name = 'BillingError';
  }
}

export interface Actor {
  /** Null = the system or Pulse staff. */
  userId: string | null;
  ip?: string | null;
}

function audit(
  tx: Tx,
  orgId: string,
  actor: Actor,
  action: string,
  target: { type: string; id: string | null },
  metadata: Record<string, unknown> = {},
) {
  return tx.insert(auditLog).values({
    id: newId('aud'),
    orgId,
    actorUserId: actor.userId,
    action,
    targetType: target.type,
    targetId: target.id,
    metadata,
    ip: actor.ip ?? null,
  });
}

const lockSubscription = async (tx: Tx, orgId: string): Promise<SubscriptionRow | undefined> =>
  (await tx.select().from(subscriptions).where(eq(subscriptions.orgId, orgId)).for('update'))[0];

const setPlan = (tx: Tx, orgId: string, plan: PlanId) =>
  tx
    .insert(orgPlans)
    .values({ orgId, plan })
    .onConflictDoUpdate({ target: orgPlans.orgId, set: { plan, updatedAt: new Date() } });

const findOpenInvoice = async (tx: Tx): Promise<InvoiceRow | undefined> =>
  (await tx.select().from(invoices).where(eq(invoices.status, 'open')).limit(1))[0];

const voidOpenInvoice = (tx: Tx) =>
  tx.update(invoices).set({ status: 'void' }).where(eq(invoices.status, 'open'));

async function createInvoice(
  tx: Tx,
  orgId: string,
  v: { plan: PaidPlanId; interval: BillingInterval; periodStart: Date; dueAt: Date },
): Promise<InvoiceRow> {
  const [last] = await tx.select({ n: max(invoices.number) }).from(invoices);
  const [row] = await tx
    .insert(invoices)
    .values({
      id: newId('inv'),
      orgId,
      number: (last?.n ?? 0) + 1,
      plan: v.plan,
      interval: v.interval,
      amountSantim: planPriceSantim(v.plan, v.interval),
      currency: BILLING_CURRENCY,
      periodStart: v.periodStart,
      periodEnd: addInterval(v.periodStart, v.interval),
      dueAt: v.dueAt,
    })
    .returning();
  return row!;
}

/** The renewal invoice for the period after the current one (made early, due when it starts). */
const createRenewalInvoice = (tx: Tx, sub: SubscriptionRow) =>
  createInvoice(tx, sub.orgId, {
    plan: sub.plan,
    interval: sub.interval,
    periodStart: sub.currentPeriodEnd,
    dueAt: sub.currentPeriodEnd,
  });

export type PlanRequestResult =
  | { outcome: 'trial_started' }
  | { outcome: 'plan_changed' }
  | { outcome: 'invoice'; invoiceId: string; created: boolean };

/**
 * The owner picks a plan. First time: a 14-day trial starts, nothing to pay yet. During a trial:
 * a different plan just switches; the same plan asks for the first invoice now. Otherwise an
 * invoice is made (or the open one returned) and the plan changes when it is paid.
 */
export async function requestPlan(
  db: Db,
  orgId: string,
  input: { plan: PaidPlanId; interval: BillingInterval },
  actor: Actor,
  now = new Date(),
): Promise<PlanRequestResult> {
  return withOrg(db, orgId, async (tx) => {
    const started = await tx
      .insert(subscriptions)
      .values({
        orgId,
        plan: input.plan,
        interval: input.interval,
        status: 'trialing',
        currentPeriodStart: now,
        currentPeriodEnd: addDays(now, TRIAL_DAYS),
      })
      .onConflictDoNothing()
      .returning({ orgId: subscriptions.orgId });
    if (started.length) {
      await setPlan(tx, orgId, input.plan);
      await audit(tx, orgId, actor, 'billing.trial_started', { type: 'subscription', id: orgId }, input);
      return { outcome: 'trial_started' };
    }

    const sub = (await lockSubscription(tx, orgId))!;
    const same = sub.plan === input.plan && sub.interval === input.interval;
    const open = await findOpenInvoice(tx);
    if (open && open.plan === input.plan && open.interval === input.interval) {
      return { outcome: 'invoice', invoiceId: open.id, created: false };
    }
    if (open) await voidOpenInvoice(tx);

    if (sub.status === 'trialing' && !same) {
      await tx
        .update(subscriptions)
        .set({ plan: input.plan, interval: input.interval })
        .where(eq(subscriptions.orgId, orgId));
      await setPlan(tx, orgId, input.plan);
      await audit(
        tx,
        orgId,
        actor,
        'billing.plan_changed',
        { type: 'subscription', id: orgId },
        {
          from: sub.plan,
          to: input.plan,
          interval: input.interval,
        },
      );
      return { outcome: 'plan_changed' };
    }

    // Same plan while trialing/active = pay the next period early. Anything else starts a new
    // period on the day it is paid (no proration).
    const renewal = same && (sub.status === 'trialing' || sub.status === 'active');
    const invoice = renewal
      ? await createRenewalInvoice(tx, sub)
      : await createInvoice(tx, orgId, { ...input, periodStart: now, dueAt: addDays(now, GRACE_DAYS) });
    await audit(
      tx,
      orgId,
      actor,
      'billing.invoice_created',
      { type: 'invoice', id: invoice.id },
      {
        plan: invoice.plan,
        interval: invoice.interval,
        amountSantim: invoice.amountSantim,
      },
    );
    return { outcome: 'invoice', invoiceId: invoice.id, created: true };
  });
}

/** A pending attempt younger than this is reused instead of making another pay link. */
const PAY_LINK_REUSE_MS = 20 * 60 * 1000;

export interface Payer {
  userId: string;
  email: string;
  name: string;
  ip?: string | null;
}

/**
 * Makes a hosted Chapa checkout for an open invoice. Every attempt is its own `payments` row with
 * a fresh, unique tx_ref, written before Chapa is called so a fast webhook always finds it.
 */
export async function createPayLink(
  db: Db,
  chapa: ChapaClient,
  orgId: string,
  invoiceId: string,
  payer: Payer,
  returnUrl: string,
  now = new Date(),
): Promise<{ checkoutUrl: string; txRef: string }> {
  const attempt = await withOrg(db, orgId, async (tx) => {
    const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, invoiceId)).for('update');
    if (!invoice) throw new BillingError('not_found', 'Invoice not found');
    if (invoice.status !== 'open') throw new BillingError('conflict', 'This invoice is not open');
    const [recent] = await tx
      .select()
      .from(payments)
      .where(and(eq(payments.invoiceId, invoiceId), eq(payments.status, 'pending')))
      .orderBy(desc(payments.createdAt))
      .limit(1);
    if (recent?.checkoutUrl && now.getTime() - recent.createdAt.getTime() < PAY_LINK_REUSE_MS) {
      return { reuse: { checkoutUrl: recent.checkoutUrl, txRef: recent.txRef } };
    }
    const txRef = `pulse-${randomBase62(24)}`;
    await tx.insert(payments).values({
      id: newId('pay'),
      orgId,
      invoiceId,
      txRef,
      amountSantim: invoice.amountSantim,
      currency: invoice.currency,
      createdBy: payer.userId,
      createdAt: now,
    });
    return { txRef, amountSantim: invoice.amountSantim, currency: invoice.currency };
  });
  if ('reuse' in attempt) return attempt.reuse!;

  const [firstName, ...rest] = payer.name.trim().split(/\s+/);
  try {
    const { checkoutUrl } = await chapa.initialize({
      txRef: attempt.txRef,
      amountSantim: attempt.amountSantim,
      currency: attempt.currency,
      email: payer.email,
      firstName: firstName || 'Pulse',
      lastName: rest.join(' ') || 'Customer',
      returnUrl,
    });
    await withOrg(db, orgId, (tx) =>
      tx.update(payments).set({ checkoutUrl }).where(eq(payments.txRef, attempt.txRef)),
    );
    return { checkoutUrl, txRef: attempt.txRef };
  } catch (err) {
    await withOrg(db, orgId, (tx) =>
      tx
        .update(payments)
        .set({ status: 'failed', verifyResult: { error: 'initialize_failed' } })
        .where(eq(payments.txRef, attempt.txRef)),
    );
    throw err;
  }
}

export type SettleResult =
  | { outcome: 'unknown' }
  | { outcome: 'already_paid'; orgId: string }
  | { outcome: 'pending' | 'failed' | 'mismatch'; orgId: string; reason?: string }
  /** `applied` is false when the invoice was no longer open (paid twice, or voided): staff review. */
  | { outcome: 'paid'; orgId: string; invoiceId: string; applied: boolean };

/**
 * Settles one tx_ref after a signed webhook. Asks Chapa's verify endpoint, then, holding a lock on
 * the payment row, marks it paid only if Chapa confirms the same tx_ref, amount, currency and
 * mode. Idempotent: a paid row is never touched again, so replays and concurrent deliveries are
 * harmless and the plan is applied exactly once.
 */
export async function settlePayment(
  db: Db,
  chapa: ChapaClient,
  txRef: string,
  opts: { mode: ChapaMode; now?: Date },
): Promise<SettleResult> {
  const now = opts.now ?? new Date();
  const found = await db.execute<{ org_id: string | null }>(
    sql`select pulse_payment_org(${txRef}) as org_id`,
  );
  const orgId = found.rows[0]?.org_id;
  if (!orgId) return { outcome: 'unknown' };

  const got = await chapa.verify(txRef); // outside the transaction: never hold a lock over HTTP

  return withOrg(db, orgId, async (tx): Promise<SettleResult> => {
    const [payment] = await tx.select().from(payments).where(eq(payments.txRef, txRef)).for('update');
    if (!payment) return { outcome: 'unknown' };
    if (payment.status === 'paid') return { outcome: 'already_paid', orgId };

    const judged = judgeVerification(
      { txRef, amountSantim: payment.amountSantim, currency: payment.currency, mode: opts.mode },
      got,
    );
    const verifyResult = {
      status: got.status,
      amount: typeof got.amount === 'string' || typeof got.amount === 'number' ? got.amount : null,
      currency: got.currency ?? null,
      mode: got.mode ?? null,
      txRef: got.txRef ?? null,
      verdict: judged.verdict,
      ...(judged.verdict === 'mismatch' ? { reason: judged.reason } : {}),
    };
    if (judged.verdict !== 'paid') {
      await tx
        .update(payments)
        .set({ status: judged.verdict, verifyResult, mode: got.mode ?? null })
        .where(eq(payments.id, payment.id));
      if (judged.verdict === 'mismatch') {
        await audit(
          tx,
          orgId,
          { userId: null },
          'billing.payment_mismatch',
          { type: 'payment', id: payment.id },
          {
            txRef,
            reason: judged.reason,
          },
        );
      }
      return {
        outcome: judged.verdict,
        orgId,
        ...(judged.verdict === 'mismatch' ? { reason: judged.reason } : {}),
      };
    }

    await tx
      .update(payments)
      .set({
        status: 'paid',
        verifyResult,
        verifiedAt: now,
        providerReference: got.reference ?? null,
        method: got.method ?? null,
        mode: got.mode ?? null,
      })
      .where(eq(payments.id, payment.id));

    // Lock order is always subscription → invoice.
    const sub = await lockSubscription(tx, orgId);
    const [invoice] = await tx
      .select()
      .from(invoices)
      .where(eq(invoices.id, payment.invoiceId))
      .for('update');
    if (!invoice || invoice.status !== 'open' || !sub) {
      await audit(
        tx,
        orgId,
        { userId: null },
        'billing.payment_needs_review',
        { type: 'payment', id: payment.id },
        {
          txRef,
          invoiceStatus: invoice?.status ?? null,
        },
      );
      return { outcome: 'paid', orgId, invoiceId: payment.invoiceId, applied: false };
    }

    await tx.update(invoices).set({ status: 'paid', paidAt: now }).where(eq(invoices.id, invoice.id));
    const renewal =
      sub.status !== 'restricted' && sub.plan === invoice.plan && sub.interval === invoice.interval;
    // A renewal continues the paid-for period; a plan change or a comeback starts one today.
    const period = renewal
      ? {
          currentPeriodStart: now >= invoice.periodStart ? invoice.periodStart : sub.currentPeriodStart,
          currentPeriodEnd: invoice.periodEnd,
        }
      : { currentPeriodStart: now, currentPeriodEnd: addInterval(now, invoice.interval) };
    await tx
      .update(subscriptions)
      .set({
        plan: invoice.plan,
        interval: invoice.interval,
        status: 'active',
        graceEndsAt: null,
        comp: false,
        ...period,
      })
      .where(eq(subscriptions.orgId, orgId));
    await setPlan(tx, orgId, invoice.plan);
    await audit(
      tx,
      orgId,
      { userId: null },
      'billing.invoice_paid',
      { type: 'invoice', id: invoice.id },
      {
        txRef,
        plan: invoice.plan,
        amountSantim: invoice.amountSantim,
        currency: invoice.currency,
        mode: got.mode ?? null,
      },
    );
    return { outcome: 'paid', orgId, invoiceId: invoice.id, applied: true };
  });
}

export type LifecycleEvent =
  | { type: 'invoice_created'; invoiceId: string }
  | { type: 'past_due'; invoiceId: string }
  | { type: 'restricted' };

/**
 * Moves one subscription along its clock at `now`:
 *   - within RENEWAL_LEAD_DAYS of the period end → make the renewal invoice;
 *   - period ended and still unpaid → past due, with GRACE_DAYS of grace;
 *   - grace over → restricted (read-only: no new sessions are stored).
 * Idempotent; returns what happened so the caller can email the owners.
 */
export async function advanceSubscription(
  db: Db,
  orgId: string,
  now = new Date(),
): Promise<LifecycleEvent[]> {
  return withOrg(db, orgId, async (tx) => {
    const events: LifecycleEvent[] = [];
    let sub = await lockSubscription(tx, orgId);
    if (!sub) return events;
    const system: Actor = { userId: null };

    if (sub.status === 'trialing' || sub.status === 'active') {
      let open = await findOpenInvoice(tx);
      if (!open && now >= addDays(sub.currentPeriodEnd, -RENEWAL_LEAD_DAYS)) {
        open = await createRenewalInvoice(tx, sub);
        events.push({ type: 'invoice_created', invoiceId: open.id });
        await audit(
          tx,
          orgId,
          system,
          'billing.invoice_created',
          { type: 'invoice', id: open.id },
          {
            plan: open.plan,
            interval: open.interval,
            amountSantim: open.amountSantim,
            renewal: true,
          },
        );
      }
      if (now >= sub.currentPeriodEnd && open) {
        const graceEndsAt = addDays(sub.currentPeriodEnd, GRACE_DAYS);
        [sub] = await tx
          .update(subscriptions)
          .set({ status: 'past_due', graceEndsAt })
          .where(eq(subscriptions.orgId, orgId))
          .returning();
        events.push({ type: 'past_due', invoiceId: open.id });
        await audit(
          tx,
          orgId,
          system,
          'billing.past_due',
          { type: 'subscription', id: orgId },
          {
            graceEndsAt: graceEndsAt.toISOString(),
          },
        );
      }
    }
    if (sub!.status === 'past_due' && sub!.graceEndsAt && now >= sub!.graceEndsAt) {
      await tx.update(subscriptions).set({ status: 'restricted' }).where(eq(subscriptions.orgId, orgId));
      events.push({ type: 'restricted' });
      await audit(tx, orgId, system, 'billing.restricted', { type: 'subscription', id: orgId });
    }
    return events;
  });
}

/** Orgs the renewal job should look at now. */
export async function billingDueOrgs(db: Db, now = new Date()): Promise<string[]> {
  const res = await db.execute<{ org_id: string }>(
    sql`select org_id from pulse_billing_due(${now.toISOString()}::timestamptz, ${RENEWAL_LEAD_DAYS})`,
  );
  return res.rows.map((r) => r.org_id);
}

/**
 * Staff override. `comp` grants a plan until a date; `extend` pushes the current period out and
 * lifts past-due / restricted. Every override writes an audit-log entry with the note.
 */
export async function applyOverride(
  db: Db,
  orgId: string,
  input: BillingOverride,
  actor: Actor,
  now = new Date(),
): Promise<SubscriptionRow> {
  const [org] = await db.select({ id: organization.id }).from(organization).where(eq(organization.id, orgId));
  if (!org) throw new BillingError('not_found', 'Organization not found');
  return withOrg(db, orgId, async (tx) => {
    const sub = await lockSubscription(tx, orgId);
    if (input.action === 'comp') {
      const until = new Date(input.until);
      if (until <= now) throw new BillingError('conflict', '`until` must be in the future');
      const values = {
        plan: input.plan,
        status: 'active' as const,
        comp: true,
        currentPeriodStart: now,
        currentPeriodEnd: until,
        graceEndsAt: null,
      };
      await voidOpenInvoice(tx);
      const [row] = await tx
        .insert(subscriptions)
        .values({ orgId, interval: sub?.interval ?? 'month', ...values })
        .onConflictDoUpdate({ target: subscriptions.orgId, set: { ...values, updatedAt: now } })
        .returning();
      await setPlan(tx, orgId, input.plan);
      await audit(
        tx,
        orgId,
        actor,
        'billing.override.comp',
        { type: 'subscription', id: orgId },
        {
          plan: input.plan,
          until: until.toISOString(),
          note: input.note,
          previous: sub ? { plan: sub.plan, status: sub.status } : null,
        },
      );
      return row!;
    }

    if (!sub) throw new BillingError('conflict', 'This organization has no subscription to extend');
    const lapsed = sub.status === 'past_due' || sub.status === 'restricted';
    const base = lapsed || sub.currentPeriodEnd < now ? now : sub.currentPeriodEnd;
    const end = addDays(base, input.days);
    const [row] = await tx
      .update(subscriptions)
      .set({
        status: sub.status === 'trialing' ? 'trialing' : 'active',
        currentPeriodEnd: end,
        graceEndsAt: null,
      })
      .where(eq(subscriptions.orgId, orgId))
      .returning();
    // An unpaid invoice now buys the period after the extension.
    await tx
      .update(invoices)
      .set({ periodStart: end, periodEnd: addInterval(end, sub.interval), dueAt: end })
      .where(
        and(eq(invoices.status, 'open'), eq(invoices.plan, sub.plan), eq(invoices.interval, sub.interval)),
      );
    await audit(
      tx,
      orgId,
      actor,
      'billing.override.extend',
      { type: 'subscription', id: orgId },
      {
        days: input.days,
        until: end.toISOString(),
        note: input.note,
        previous: { status: sub.status, currentPeriodEnd: sub.currentPeriodEnd.toISOString() },
      },
    );
    return row!;
  });
}

/* ── Overview (Settings → Billing) ────────────────────────────────────────── */

export const toInvoiceDto = (
  row: InvoiceRow,
  paid?: { method: string | null; providerReference: string | null },
): BillingInvoice => ({
  id: row.id,
  number: row.number,
  plan: row.plan,
  interval: row.interval,
  amountSantim: row.amountSantim,
  currency: row.currency,
  status: row.status,
  periodStart: row.periodStart.toISOString(),
  periodEnd: row.periodEnd.toISOString(),
  dueAt: row.dueAt.toISOString(),
  createdAt: row.createdAt.toISOString(),
  paidAt: row.paidAt?.toISOString() ?? null,
  paymentMethod: paid?.method ?? null,
  paymentReference: paid?.providerReference ?? null,
});

export async function loadOverview(
  db: Db,
  orgId: string,
  config: { configured: boolean; mode: ChapaMode },
  now = new Date(),
): Promise<BillingOverview> {
  return withOrg(db, orgId, async (tx) => {
    const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.orgId, orgId)).limit(1);
    const state = await ingestState(tx, orgId, now);
    const [siteCount] = await tx.select({ n: count() }).from(sites).where(isNull(sites.deletedAt));
    const rows = await tx.select().from(invoices).orderBy(desc(invoices.number)).limit(24);
    const paid = await tx
      .select({
        invoiceId: payments.invoiceId,
        method: payments.method,
        providerReference: payments.providerReference,
      })
      .from(payments)
      .where(eq(payments.status, 'paid'));
    const paidBy = new Map(paid.map((p) => [p.invoiceId, p]));
    const ent = entitlementsFor(state.plan, state.status);
    return {
      configured: config.configured,
      mode: config.mode,
      plan: state.plan,
      subscription: sub
        ? {
            status: sub.status,
            interval: sub.interval,
            currentPeriodStart: sub.currentPeriodStart.toISOString(),
            currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
            graceEndsAt: sub.graceEndsAt?.toISOString() ?? null,
            comp: sub.comp,
          }
        : null,
      trialAvailable: !sub,
      usage: {
        periodStart: state.periodStart.toISOString(),
        sessions: state.sessions,
        sessionLimit: state.sessionLimit,
        blocked: state.blocked,
        sites: siteCount?.n ?? 0,
        siteLimit: ent.sites,
      },
      entitlements: { retentionDays: ent.retentionDays, replay: ent.replay },
      invoices: rows.map((r) => toInvoiceDto(r, paidBy.get(r.id))),
      plans: PLAN_IDS.map((id) => ({
        id,
        monthSantim: planPriceSantim(id, 'month'),
        yearSantim: planPriceSantim(id, 'year'),
        sites: PLANS[id].sites,
        sessions: PLANS[id].sessions,
        retentionDays: PLANS[id].retentionDays,
        replay: PLANS[id].replay,
      })),
    };
  });
}
