import { describe, expect, it } from 'vitest';
import {
  FakeChapaClient,
  HttpChapaClient,
  ChapaError,
  judgeVerification,
  signChapaBody,
  signChapaSecret,
  verifyChapaSignature,
} from './chapa';
import { addInterval, addMonths } from './lifecycle';
import { birrToSantim, santimToBirr } from './money';

describe('money (integer santim, no floats)', () => {
  it('formats santim as birr with two decimals', () => {
    expect(santimToBirr(240_000)).toBe('2400.00');
    expect(santimToBirr(5)).toBe('0.05');
    expect(santimToBirr(99)).toBe('0.99');
    expect(santimToBirr(100)).toBe('1.00');
    expect(santimToBirr(1_999_999_999)).toBe('19999999.99');
    expect(() => santimToBirr(1.5)).toThrow();
    expect(() => santimToBirr(-1)).toThrow();
  });

  it('parses what Chapa sends back, exactly', () => {
    expect(birrToSantim('2400.00')).toBe(240_000);
    expect(birrToSantim('2400')).toBe(240_000);
    expect(birrToSantim('2400.5')).toBe(240_050);
    expect(birrToSantim(2400)).toBe(240_000);
    expect(birrToSantim(0.29)).toBe(29); // 0.29 * 100 is 28.999999999999996 in floating point
    expect(birrToSantim('1.15')).toBe(115); // so is 1.15 * 100 (114.99999999999999)
    expect(birrToSantim(4.35)).toBe(435);
  });

  it('refuses anything that is not a plain amount', () => {
    for (const bad of [
      '2400.001',
      '-1',
      '1e3',
      '2,400',
      '',
      ' ',
      'abc',
      null,
      undefined,
      {},
      NaN,
      Infinity,
      -5,
      1e21,
    ]) {
      expect(birrToSantim(bad), String(bad)).toBeNull();
    }
  });

  it('round-trips every santim value it formats', () => {
    for (const n of [0, 1, 9, 10, 99, 100, 101, 240_000, 990_000, 9_900_000, 123_456_789]) {
      expect(birrToSantim(santimToBirr(n))).toBe(n);
    }
  });
});

describe('webhook signature', () => {
  const secret = 'whsec-0123456789';
  const body = '{"event":"charge.success","tx_ref":"pulse-abc"}';

  it('accepts either documented header and nothing else', () => {
    expect(verifyChapaSignature(body, { xChapaSignature: signChapaBody(body, secret) }, secret)).toBe(true);
    expect(verifyChapaSignature(body, { chapaSignature: signChapaSecret(secret) }, secret)).toBe(true);
    expect(
      verifyChapaSignature(body, { xChapaSignature: signChapaBody(body, secret).toUpperCase() }, secret),
    ).toBe(true);
    expect(verifyChapaSignature(body, {}, secret)).toBe(false);
    expect(verifyChapaSignature(body, { xChapaSignature: '', chapaSignature: null }, secret)).toBe(false);
    expect(verifyChapaSignature(body, { xChapaSignature: signChapaBody(body, 'other') }, secret)).toBe(false);
    expect(verifyChapaSignature(`${body} `, { xChapaSignature: signChapaBody(body, secret) }, secret)).toBe(
      false,
    );
    // The body signature is not valid in the other header, or the reverse.
    expect(verifyChapaSignature(body, { chapaSignature: signChapaBody(body, secret) }, secret)).toBe(false);
    expect(verifyChapaSignature(body, { xChapaSignature: signChapaSecret(secret) }, secret)).toBe(false);
    expect(verifyChapaSignature(body, { xChapaSignature: signChapaBody(body, '') }, '')).toBe(false);
  });
});

describe('judgeVerification', () => {
  const expected = { txRef: 'pulse-abc', amountSantim: 240_000, currency: 'ETB', mode: 'test' as const };
  const ok = {
    status: 'success' as const,
    txRef: 'pulse-abc',
    amount: '2400.00',
    currency: 'ETB',
    mode: 'test',
  };

  it('is paid only when everything matches', () => {
    expect(judgeVerification(expected, ok)).toEqual({ verdict: 'paid' });
    expect(judgeVerification(expected, { ...ok, amount: 2400 })).toEqual({ verdict: 'paid' });
  });
  it('names what differs', () => {
    expect(judgeVerification(expected, { ...ok, amount: '2400.01' })).toEqual({
      verdict: 'mismatch',
      reason: 'amount',
    });
    expect(judgeVerification(expected, { ...ok, amount: undefined })).toEqual({
      verdict: 'mismatch',
      reason: 'amount',
    });
    expect(judgeVerification(expected, { ...ok, currency: 'USD' })).toEqual({
      verdict: 'mismatch',
      reason: 'currency',
    });
    expect(judgeVerification(expected, { ...ok, mode: 'live' })).toEqual({
      verdict: 'mismatch',
      reason: 'mode',
    });
    expect(judgeVerification(expected, { ...ok, mode: undefined })).toEqual({
      verdict: 'mismatch',
      reason: 'mode',
    });
    expect(judgeVerification(expected, { ...ok, txRef: 'pulse-xyz' })).toEqual({
      verdict: 'mismatch',
      reason: 'tx_ref',
    });
    expect(judgeVerification({ ...expected, mode: 'live' }, ok)).toEqual({
      verdict: 'mismatch',
      reason: 'mode',
    });
  });
  it('treats not-success as not paid', () => {
    expect(judgeVerification(expected, { ...ok, status: 'pending' })).toEqual({ verdict: 'pending' });
    expect(judgeVerification(expected, { status: 'not_found' })).toEqual({ verdict: 'pending' });
    expect(judgeVerification(expected, { ...ok, status: 'failed' })).toEqual({ verdict: 'failed' });
  });
});

describe('HttpChapaClient (against a stub fetch, never the network)', () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const stub = (status: number, body: unknown) =>
    (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify(body), { status });
    }) as typeof fetch;
  const input = {
    txRef: 'pulse-abc',
    amountSantim: 240_000,
    currency: 'ETB',
    email: 'o@example.et',
    firstName: 'Tigist',
    lastName: 'Bekele',
    returnUrl: 'https://app.example.et/settings?tab=billing',
  };

  it('initializes with the documented field names and a birr string amount', async () => {
    calls.length = 0;
    const client = new HttpChapaClient(
      'CHASECK_TEST-x',
      'https://api.chapa.co',
      stub(200, {
        status: 'success',
        data: { checkout_url: 'https://checkout.chapa.co/checkout/payment/abc' },
      }),
    );
    expect(await client.initialize(input)).toEqual({
      checkoutUrl: 'https://checkout.chapa.co/checkout/payment/abc',
    });
    expect(calls[0]!.url).toBe('https://api.chapa.co/v1/transaction/initialize');
    expect(calls[0]!.init.method).toBe('POST');
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe('Bearer CHASECK_TEST-x');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      amount: '2400.00',
      currency: 'ETB',
      email: 'o@example.et',
      first_name: 'Tigist',
      last_name: 'Bekele',
      tx_ref: 'pulse-abc',
      return_url: 'https://app.example.et/settings?tab=billing',
    });
  });

  it('throws a ChapaError (without the key) on failure or a missing checkout link', async () => {
    const failing = new HttpChapaClient(
      'CHASECK_TEST-secret',
      undefined,
      stub(400, { status: 'failed', data: null }),
    );
    const err = await failing.initialize(input).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChapaError);
    expect(String((err as Error).message)).not.toContain('secret');
    const odd = new HttpChapaClient(
      'k',
      undefined,
      stub(200, { status: 'success', data: { checkout_url: 'javascript:alert(1)' } }),
    );
    await expect(odd.initialize(input)).rejects.toBeInstanceOf(ChapaError);
    const down = new HttpChapaClient('k', undefined, (async () => {
      throw new Error('ECONNRESET');
    }) as typeof fetch);
    await expect(down.verify('pulse-abc')).rejects.toBeInstanceOf(ChapaError);
  });

  it('reads verify data and maps 404 to not_found', async () => {
    calls.length = 0;
    const data = {
      status: 'success',
      tx_ref: 'pulse-abc',
      amount: 2400,
      currency: 'ETB',
      mode: 'test',
      reference: '6jnheVKQEmy',
      method: 'telebirr',
    };
    const client = new HttpChapaClient('k', undefined, stub(200, { status: 'success', data }));
    expect(await client.verify('pulse-abc')).toEqual({
      status: 'success',
      txRef: 'pulse-abc',
      amount: 2400,
      currency: 'ETB',
      mode: 'test',
      reference: '6jnheVKQEmy',
      method: 'telebirr',
    });
    expect(calls[0]!.url).toBe('https://api.chapa.co/v1/transaction/verify/pulse-abc');
    const missing = new HttpChapaClient(
      'k',
      undefined,
      stub(404, { message: 'Payment not paid yet', status: null, data: null }),
    );
    expect(await missing.verify('pulse-abc')).toEqual({ status: 'not_found' });
    const broken = new HttpChapaClient('k', undefined, stub(500, {}));
    await expect(broken.verify('pulse-abc')).rejects.toBeInstanceOf(ChapaError);
    const empty = new HttpChapaClient('k', undefined, stub(200, { status: 'success', data: null }));
    expect((await empty.verify('pulse-abc')).status).toBe('pending');
  });
});

describe('FakeChapaClient', () => {
  it('only reports success after pay(), with the initialized amount', async () => {
    const fake = new FakeChapaClient();
    const { checkoutUrl } = await fake.initialize({
      txRef: 'pulse-abc',
      amountSantim: 590_000,
      currency: 'ETB',
      email: 'a@b.et',
      firstName: 'A',
      lastName: 'B',
      returnUrl: 'https://x',
    });
    expect(checkoutUrl).toContain('chapa.test');
    expect(await fake.verify('pulse-abc')).toEqual({ status: 'not_found' });
    fake.pay('pulse-abc');
    expect(await fake.verify('pulse-abc')).toMatchObject({
      status: 'success',
      amount: '5900.00',
      currency: 'ETB',
      mode: 'test',
    });
  });
});

describe('billing periods', () => {
  const d = (s: string) => new Date(s);
  it('adds calendar months in UTC and clamps the day', () => {
    expect(addMonths(d('2026-01-31T10:00:00Z'), 1).toISOString()).toBe('2026-02-28T10:00:00.000Z');
    expect(addMonths(d('2028-01-31T10:00:00Z'), 1).toISOString()).toBe('2028-02-29T10:00:00.000Z');
    expect(addMonths(d('2026-12-15T00:00:00Z'), 1).toISOString()).toBe('2027-01-15T00:00:00.000Z');
    expect(addInterval(d('2026-11-12T08:00:00Z'), 'month').toISOString()).toBe('2026-12-12T08:00:00.000Z');
    expect(addInterval(d('2028-02-29T08:00:00Z'), 'year').toISOString()).toBe('2029-02-28T08:00:00.000Z');
  });
});
