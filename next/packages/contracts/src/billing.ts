import { z } from 'zod';
import {
  BILLING_INTERVALS,
  INVOICE_STATUSES,
  PAID_PLAN_IDS,
  PLAN_IDS,
  SUBSCRIPTION_STATUSES,
} from './constants';

/**
 * Billing (slice 7). Money is integer santim everywhere (1 birr = 100 santim); the only currency
 * is ETB. Plans are defined in code (`PLANS` in ./constants).
 */

export const PlanIdSchema = z.enum(PLAN_IDS);
export const PaidPlanIdSchema = z.enum(PAID_PLAN_IDS);
export const BillingIntervalSchema = z.enum(BILLING_INTERVALS);

export const BillingInvoice = z.object({
  id: z.string(),
  /** Per-organization running number. */
  number: z.number().int(),
  plan: PaidPlanIdSchema,
  interval: BillingIntervalSchema,
  amountSantim: z.number().int(),
  currency: z.string(),
  status: z.enum(INVOICE_STATUSES),
  periodStart: z.string(),
  periodEnd: z.string(),
  dueAt: z.string(),
  createdAt: z.string(),
  /** Receipt details, present once paid. */
  paidAt: z.string().nullable(),
  paymentMethod: z.string().nullable(),
  paymentReference: z.string().nullable(),
});
export type BillingInvoice = z.infer<typeof BillingInvoice>;

export const BillingPlan = z.object({
  id: PlanIdSchema,
  monthSantim: z.number().int(),
  yearSantim: z.number().int(),
  sites: z.number().int(),
  sessions: z.number().int(),
  retentionDays: z.number().int(),
  replay: z.boolean(),
});

export const BillingOverview = z.object({
  /** False when this deployment has no Chapa keys: no pay links can be made. */
  configured: z.boolean(),
  /** Chapa mode the server accepts payments in. `test` = no real money moves. */
  mode: z.enum(['test', 'live']),
  plan: PlanIdSchema,
  /** Null on the free plan (no subscription). */
  subscription: z
    .object({
      status: z.enum(SUBSCRIPTION_STATUSES),
      interval: BillingIntervalSchema,
      currentPeriodStart: z.string(),
      currentPeriodEnd: z.string(),
      graceEndsAt: z.string().nullable(),
      /** A period granted by Pulse staff rather than paid for. */
      comp: z.boolean(),
    })
    .nullable(),
  /** False once the organization has had its one free trial. */
  trialAvailable: z.boolean(),
  usage: z.object({
    periodStart: z.string(),
    sessions: z.number().int(),
    sessionLimit: z.number().int(),
    /** New sessions are not being stored (quota used up, or the org is restricted). */
    blocked: z.boolean(),
    sites: z.number().int(),
    siteLimit: z.number().int(),
  }),
  entitlements: z.object({ retentionDays: z.number().int(), replay: z.boolean() }),
  invoices: z.array(BillingInvoice),
  plans: z.array(BillingPlan),
});
export type BillingOverview = z.infer<typeof BillingOverview>;

/** The little every team member may know: is data being stored, and is replay on this plan? */
export const BillingStatus = z.object({
  plan: PlanIdSchema,
  /** New sessions are not being stored (quota used up, or the org is restricted). */
  blocked: z.boolean(),
  /** Unpaid past the grace period. */
  restricted: z.boolean(),
  replay: z.boolean(),
  sessions: z.number().int(),
  sessionLimit: z.number().int(),
});
export type BillingStatus = z.infer<typeof BillingStatus>;

/** Start a trial (first time) or ask for an invoice for a plan. */
export const BillingSubscribe = z.object({
  plan: PaidPlanIdSchema,
  interval: BillingIntervalSchema.default('month'),
});
export type BillingSubscribe = z.input<typeof BillingSubscribe>;

/** A hosted Chapa checkout for one invoice. Each one is a separate payment attempt. */
export const BillingPayLink = z.object({ checkoutUrl: z.string(), txRef: z.string() });
export type BillingPayLink = z.infer<typeof BillingPayLink>;

/** Staff override: comp a plan until a date, or push the current period out by some days. */
export const BillingOverride = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('comp'),
    plan: PaidPlanIdSchema,
    /** ISO date-time the comped period ends. */
    until: z.iso.datetime(),
    note: z.string().trim().min(3).max(300),
  }),
  z.object({
    action: z.literal('extend'),
    days: z.number().int().min(1).max(366),
    note: z.string().trim().min(3).max(300),
  }),
]);
export type BillingOverride = z.infer<typeof BillingOverride>;
