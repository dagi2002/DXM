import { createHash, timingSafeEqual } from 'node:crypto';
import { billingConfigured } from '@pulse/config';
import {
  BillingOverride,
  BillingSubscribe,
  canManageBilling,
  canWorkOnFixes,
  type BillingPayLink,
  type BillingStatus,
} from '@pulse/contracts';
import {
  BillingError,
  ChapaError,
  applyOverride,
  createPayLink,
  ingestState,
  loadOverview,
  requestPlan,
  sendBillingEmail,
  settlePayment,
  verifyChapaSignature,
  type ChapaClient,
} from '@pulse/billing';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createMiddleware } from 'hono/factory';
import type { AppDeps } from '../app';
import { requireOrg, requireSession } from '../guards';
import { ApiError, forbidden, notFound, type AppEnv } from '../http';

type BillingDeps = AppDeps & { chapa?: ChapaClient };

const requireOwner = createMiddleware<AppEnv>(async (c, next) => {
  if (!canManageBilling(c.get('role'))) throw forbidden();
  await next();
});

const mapBillingError = (err: unknown): never => {
  if (err instanceof BillingError) {
    throw err.code === 'not_found' ? notFound('Invoice') : new ApiError(409, 'conflict', err.message);
  }
  if (err instanceof ChapaError) {
    throw new ApiError(
      502,
      'payment_provider_error',
      'The payment provider could not be reached. Try again.',
    );
  }
  throw err;
};

/**
 * What the whole team may see: whether new sessions are being stored and whether the plan records
 * replays, so Today and Replays can say so plainly. No prices, invoices or payment details.
 */
export function billingStatusRoute(deps: BillingDeps) {
  const r = new Hono<AppEnv>();
  r.use('*', requireSession(deps), requireOrg(deps));
  r.get('/', async (c) => {
    if (!canWorkOnFixes(c.get('role'))) throw forbidden();
    const state = await ingestState(deps.db, c.get('orgId')!);
    return c.json({
      plan: state.plan,
      blocked: state.blocked,
      restricted: state.status === 'restricted',
      replay: state.replay,
      sessions: state.sessions,
      sessionLimit: state.sessionLimit,
    } satisfies BillingStatus);
  });
  return r;
}

/** Settings → Billing for the active org. Owner only: plan, usage, invoices, pay links. */
export function billingRoutes(deps: BillingDeps) {
  const r = new Hono<AppEnv>();
  const configured = Boolean(deps.chapa) && billingConfigured(deps.env);
  const config = { configured, mode: deps.env.CHAPA_MODE };
  r.use('*', requireSession(deps), requireOrg(deps), requireOwner);

  r.get('/', async (c) => c.json(await loadOverview(deps.db, c.get('orgId')!, config)));

  /** Start the trial, switch plan during it, or ask for an invoice. */
  r.post('/subscribe', async (c) => {
    const input = BillingSubscribe.parse(await c.req.json());
    const orgId = c.get('orgId')!;
    const result = await requestPlan(
      deps.db,
      orgId,
      { plan: input.plan, interval: input.interval },
      { userId: c.get('user')!.id, ip: c.get('clientIp') },
    ).catch(mapBillingError);
    return c.json({ result, billing: await loadOverview(deps.db, orgId, config) });
  });

  /** A hosted Chapa checkout for one open invoice. 503 when Chapa isn't configured. */
  r.post('/invoices/:id/pay', async (c) => {
    if (!configured || !deps.chapa) {
      throw new ApiError(503, 'billing_not_configured', 'Online payment is not set up on this server');
    }
    const user = c.get('user')!;
    const link = await createPayLink(
      deps.db,
      deps.chapa,
      c.get('orgId')!,
      c.req.param('id'),
      { userId: user.id, email: user.email, name: user.name, ip: c.get('clientIp') },
      `${deps.env.APP_URL}/settings?tab=billing&paid=${encodeURIComponent(c.req.param('id'))}`,
    ).catch(mapBillingError);
    return c.json(link satisfies BillingPayLink, 201);
  });

  return r;
}

/**
 * Chapa calls this. No session: the signature proves the sender, and nothing is marked paid until
 * Chapa's verify endpoint confirms the same tx_ref, amount, currency and mode. Answers 200 for
 * anything it has dealt with (including refs it doesn't know), so Chapa stops retrying.
 */
export function chapaWebhook(deps: BillingDeps) {
  const r = new Hono<AppEnv>();
  r.post(
    '/',
    bodyLimit({
      maxSize: 64 * 1024,
      onError: () => {
        throw new ApiError(413, 'bad_request', 'Payload too large');
      },
    }),
    async (c) => {
      const secret = deps.env.CHAPA_WEBHOOK_SECRET;
      if (!deps.chapa || !secret || !billingConfigured(deps.env)) {
        throw new ApiError(503, 'billing_not_configured', 'Online payment is not set up on this server');
      }
      const raw = await c.req.text();
      const ok = verifyChapaSignature(
        raw,
        {
          xChapaSignature: c.req.header('x-chapa-signature'),
          chapaSignature: c.req.header('chapa-signature'),
        },
        secret,
      );
      if (!ok) throw new ApiError(401, 'unauthenticated', 'Bad signature');

      let txRef: unknown;
      try {
        txRef = (JSON.parse(raw) as { tx_ref?: unknown } | null)?.tx_ref;
      } catch {
        throw new ApiError(400, 'bad_request', 'Malformed JSON body');
      }
      // Payout and other events carry no tx_ref of ours: acknowledge and ignore.
      if (typeof txRef !== 'string' || !/^[A-Za-z0-9-]{12,64}$/.test(txRef)) return c.json({ ok: true });

      let result;
      try {
        result = await settlePayment(deps.db, deps.chapa, txRef, { mode: deps.env.CHAPA_MODE });
      } catch (err) {
        // Chapa retries on a non-200, which is what we want when verify is unreachable.
        if (err instanceof ChapaError) {
          throw new ApiError(502, 'payment_provider_error', 'Could not confirm the payment with Chapa');
        }
        throw err;
      }
      c.get('log').info(
        { outcome: result.outcome, orgId: 'orgId' in result ? result.orgId : undefined },
        'chapa webhook',
      );
      if (result.outcome === 'paid' && result.applied) {
        await sendBillingEmail(
          deps.db,
          deps.mailer,
          deps.env.APP_URL,
          result.orgId,
          'receipt',
          result.invoiceId,
        ).catch((err: unknown) => c.get('log').error({ err }, 'receipt email failed'));
      }
      return c.json({ ok: true });
    },
  );
  return r;
}

const sha256 = (s: string) => createHash('sha256').update(s).digest();

/**
 * Staff override (comp a plan, extend a period). Guarded by BILLING_ADMIN_TOKEN, compared in
 * constant time; unset → 503. Every override writes an audit-log entry in the org it changes.
 */
export function billingAdminRoutes(deps: BillingDeps) {
  const r = new Hono<AppEnv>();
  r.use('*', async (c, next) => {
    const expected = deps.env.BILLING_ADMIN_TOKEN;
    if (!expected) throw new ApiError(503, 'billing_not_configured', 'The staff override is not set up');
    const got = /^Bearer (.+)$/.exec(c.req.header('authorization') ?? '')?.[1] ?? '';
    if (!timingSafeEqual(sha256(got), sha256(expected))) {
      throw new ApiError(401, 'unauthenticated', 'Staff credential required');
    }
    await next();
  });

  r.post('/orgs/:orgId/override', async (c) => {
    const input = BillingOverride.parse(await c.req.json());
    const orgId = c.req.param('orgId');
    try {
      const sub = await applyOverride(deps.db, orgId, input, { userId: null, ip: c.get('clientIp') });
      return c.json({
        orgId,
        plan: sub.plan,
        status: sub.status,
        comp: sub.comp,
        currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
      });
    } catch (err) {
      if (err instanceof BillingError && err.code === 'not_found') throw notFound('Organization');
      return mapBillingError(err);
    }
  });
  return r;
}
