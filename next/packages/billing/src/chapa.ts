import { createHmac, timingSafeEqual } from 'node:crypto';
import { birrToSantim, santimToBirr } from './money';

/**
 * Chapa (https://developer.chapa.co): hosted checkout, which covers telebirr, cards and bank
 * apps. Field names follow Chapa's docs as read on 2026-11-12:
 *   - initialize: POST /v1/transaction/initialize → data.checkout_url
 *   - verify:     GET  /v1/transaction/verify/<tx_ref> → data.{status, amount, currency, tx_ref, mode, reference, method}
 *   - webhook:    POST with `x-chapa-signature` = HMAC-SHA256(body, secret hash), hex;
 *                 `chapa-signature` = HMAC-SHA256(secret hash, secret hash), hex
 * The client is an interface so tests (and anything that must never move money) use the fake.
 */

export type ChapaMode = 'test' | 'live';

export interface ChapaInitInput {
  txRef: string;
  amountSantim: number;
  currency: string;
  email: string;
  firstName: string;
  lastName: string;
  /** Where Chapa sends the payer back after checkout. */
  returnUrl: string;
}

/** What Chapa's verify endpoint says about a tx_ref, as received (amount is not yet trusted). */
export interface ChapaVerification {
  /** `not_found` covers an unknown ref and a checkout that hasn't been paid yet (both HTTP 404). */
  status: 'success' | 'failed' | 'pending' | 'not_found';
  txRef?: string;
  amount?: unknown;
  currency?: string;
  mode?: string;
  reference?: string;
  method?: string;
}

export interface ChapaClient {
  initialize(input: ChapaInitInput): Promise<{ checkoutUrl: string }>;
  verify(txRef: string): Promise<ChapaVerification>;
}

/** Chapa was unreachable or answered with an error. Never carries the secret key. */
export class ChapaError extends Error {
  constructor(
    message: string,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'ChapaError';
  }
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

export class HttpChapaClient implements ChapaClient {
  constructor(
    private readonly secretKey: string,
    private readonly baseUrl = 'https://api.chapa.co',
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async call(path: string, init: RequestInit = {}) {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        headers: { authorization: `Bearer ${this.secretKey}`, 'content-type': 'application/json' },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new ChapaError('Chapa could not be reached');
    }
    const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    return { res, body };
  }

  async initialize(input: ChapaInitInput) {
    const { res, body } = await this.call('/v1/transaction/initialize', {
      method: 'POST',
      body: JSON.stringify({
        amount: santimToBirr(input.amountSantim),
        currency: input.currency,
        email: input.email,
        first_name: input.firstName,
        last_name: input.lastName,
        tx_ref: input.txRef,
        return_url: input.returnUrl,
      }),
    });
    const url = str((body?.data as Record<string, unknown> | null | undefined)?.checkout_url);
    if (!res.ok || !url || !/^https:\/\//.test(url)) {
      throw new ChapaError(`Chapa initialize failed (${res.status})`, res.status);
    }
    return { checkoutUrl: url };
  }

  async verify(txRef: string): Promise<ChapaVerification> {
    const { res, body } = await this.call(`/v1/transaction/verify/${encodeURIComponent(txRef)}`);
    if (res.status === 404) return { status: 'not_found' };
    if (!res.ok || !body) throw new ChapaError(`Chapa verify failed (${res.status})`, res.status);
    const d = (body.data ?? {}) as Record<string, unknown>;
    const status = str(d.status)?.toLowerCase();
    return {
      status: status === 'success' || status === 'failed' ? status : 'pending',
      txRef: str(d.tx_ref),
      amount: d.amount,
      currency: str(d.currency),
      mode: str(d.mode),
      reference: str(d.reference),
      method: str(d.method) ?? str(d.payment_method),
    };
  }
}

/**
 * In-memory Chapa for tests: no network, no money. `pay()` is the customer paying; `tamper()`
 * makes verify answer something else for a ref (the mismatch cases).
 */
export class FakeChapaClient implements ChapaClient {
  readonly initialized: ChapaInitInput[] = [];
  private readonly results = new Map<string, ChapaVerification>();
  verifyCalls = 0;
  failInitialize = false;
  failVerify = false;
  /** Awaited inside verify(), so a test can hold two concurrent webhooks at the same point. */
  beforeVerify?: () => Promise<void>;

  constructor(readonly mode: ChapaMode = 'test') {}

  async initialize(input: ChapaInitInput) {
    if (this.failInitialize) throw new ChapaError('Chapa initialize failed (500)', 500);
    this.initialized.push(input);
    return { checkoutUrl: `https://checkout.chapa.test/pay/${input.txRef}` };
  }

  /** The customer completes checkout: verify now reports success with the initialized amount. */
  pay(txRef: string, over: Partial<ChapaVerification> = {}) {
    const init = this.initialized.find((i) => i.txRef === txRef);
    if (!init) throw new Error(`unknown tx_ref ${txRef}`);
    this.results.set(txRef, {
      status: 'success',
      txRef,
      amount: santimToBirr(init.amountSantim),
      currency: init.currency,
      mode: this.mode,
      reference: `CH${txRef.slice(-8)}`,
      method: 'telebirr',
      ...over,
    });
  }

  tamper(txRef: string, result: ChapaVerification) {
    this.results.set(txRef, result);
  }

  async verify(txRef: string): Promise<ChapaVerification> {
    this.verifyCalls++;
    await this.beforeVerify?.();
    if (this.failVerify) throw new ChapaError('Chapa verify failed (500)', 500);
    return this.results.get(txRef) ?? { status: 'not_found' };
  }
}

const hmacHex = (key: string, data: string | Uint8Array) =>
  createHmac('sha256', key).update(data).digest('hex');

function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a.trim().toLowerCase(), 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
}

/** The value Chapa sends in `x-chapa-signature` for this body. */
export const signChapaBody = (rawBody: string, secret: string) => hmacHex(secret, rawBody);
/** The value Chapa sends in `chapa-signature`. */
export const signChapaSecret = (secret: string) => hmacHex(secret, secret);

/**
 * Checks a webhook's signature headers against the raw request body, in constant time. Per
 * Chapa's docs a request is genuine when either header is valid; a request with neither header,
 * or with only wrong ones, is rejected. This authenticates the sender only: the payment is still
 * confirmed with the verify endpoint before anything is marked paid.
 */
export function verifyChapaSignature(
  rawBody: string,
  headers: { xChapaSignature?: string | null; chapaSignature?: string | null },
  secret: string,
): boolean {
  if (!secret) return false;
  const body = headers.xChapaSignature ? safeEqualHex(headers.xChapaSignature, signChapaBody(rawBody, secret)) : false;
  const self = headers.chapaSignature ? safeEqualHex(headers.chapaSignature, signChapaSecret(secret)) : false;
  return body || self;
}

export type VerifyVerdict =
  | { verdict: 'paid' }
  | { verdict: 'pending' }
  | { verdict: 'failed' }
  | { verdict: 'mismatch'; reason: 'tx_ref' | 'amount' | 'currency' | 'mode' };

/**
 * Compares Chapa's verify answer with our ledger row. `paid` only when Chapa says success for the
 * same tx_ref, the same amount (to the santim), the same currency, and the mode this server
 * accepts (a test-mode payment never counts on a live server, or the other way round).
 */
export function judgeVerification(
  expected: { txRef: string; amountSantim: number; currency: string; mode: ChapaMode },
  got: ChapaVerification,
): VerifyVerdict {
  if (got.status === 'failed') return { verdict: 'failed' };
  if (got.status !== 'success') return { verdict: 'pending' };
  if (got.txRef !== expected.txRef) return { verdict: 'mismatch', reason: 'tx_ref' };
  if (birrToSantim(got.amount) !== expected.amountSantim) return { verdict: 'mismatch', reason: 'amount' };
  if ((got.currency ?? '').toUpperCase() !== expected.currency) return { verdict: 'mismatch', reason: 'currency' };
  if ((got.mode ?? '').toLowerCase() !== expected.mode) return { verdict: 'mismatch', reason: 'mode' };
  return { verdict: 'paid' };
}
