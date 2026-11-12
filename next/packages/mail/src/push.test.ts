import { createDecipheriv, createECDH, createHmac, createPublicKey, randomBytes, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  HttpPushClient,
  PushError,
  encryptPayload,
  generateVapidKeys,
  isAllowedPushEndpoint,
  validVapidKeys,
} from './push';

const hmac = (k: Buffer, d: Buffer) => createHmac('sha256', k).update(d).digest();

/** A browser's side of a subscription, and an independent RFC 8291 decryption. */
function browser() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = randomBytes(16);
  const sub = { p256dh: ecdh.getPublicKey().toString('base64url'), auth: auth.toString('base64url') };
  const decrypt = (msg: Buffer) => {
    const salt = msg.subarray(0, 16);
    const rs = msg.readUInt32BE(16);
    const idlen = msg.readUInt8(20);
    const asPublic = msg.subarray(21, 21 + idlen);
    const rest = msg.subarray(21 + idlen);
    const secret = ecdh.computeSecret(asPublic);
    const ikm = hmac(
      hmac(auth, secret),
      Buffer.concat([Buffer.from('WebPush: info\0'), ecdh.getPublicKey(), asPublic, Buffer.from([1])]),
    );
    const prk = hmac(salt, ikm);
    const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
    const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
    const d = createDecipheriv('aes-128-gcm', cek, nonce);
    d.setAuthTag(rest.subarray(rest.length - 16));
    const plain = Buffer.concat([d.update(rest.subarray(0, rest.length - 16)), d.final()]);
    expect(rs).toBe(4096);
    expect(plain[plain.length - 1]).toBe(2);
    return plain.subarray(0, plain.length - 1).toString();
  };
  return { sub, decrypt };
}

describe('web push encryption (RFC 8291)', () => {
  it('round-trips through an independent decryption', () => {
    const b = browser();
    const out = encryptPayload(b.sub, Buffer.from('{"title":"ሰላም"}'));
    expect(b.decrypt(out)).toBe('{"title":"ሰላም"}');
  });

  it('uses a fresh key and salt for every message', () => {
    const b = browser();
    const one = encryptPayload(b.sub, Buffer.from('x'));
    const two = encryptPayload(b.sub, Buffer.from('x'));
    expect(one.subarray(0, 86).equals(two.subarray(0, 86))).toBe(false);
  });

  it('rejects bad subscription keys and oversized payloads', () => {
    const b = browser();
    expect(() => encryptPayload({ ...b.sub, p256dh: 'AAAA' }, Buffer.from('x'))).toThrow();
    expect(() => encryptPayload(b.sub, Buffer.alloc(5000))).toThrow(/too large/);
  });
});

describe('VAPID', () => {
  it('generates valid key pairs and rejects mismatched ones', () => {
    const a = generateVapidKeys();
    const b = generateVapidKeys();
    expect(validVapidKeys(a.publicKey, a.privateKey)).toBe(true);
    expect(validVapidKeys(a.publicKey, b.privateKey)).toBe(false);
    expect(validVapidKeys(undefined, a.privateKey)).toBe(false);
    expect(validVapidKeys('short', 'short')).toBe(false);
  });

  it('sends an encrypted, signed request to the push service', async () => {
    const keys = generateVapidKeys();
    const b = browser();
    const calls: { url: string; init: RequestInit }[] = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(null, { status: 201 });
    }) as unknown as typeof fetch;
    const client = new HttpPushClient({ ...keys, subject: 'mailto:ops@example.et' }, fake);
    const endpoint = 'https://fcm.googleapis.com/fcm/send/abc123';
    await client.send({ endpoint, ...b.sub }, { title: 'T', body: 'B', url: '/fixes/1' }, { ttl: 60 });

    const { url, init } = calls[0]!;
    expect(url).toBe(endpoint);
    const h = init.headers as Record<string, string>;
    expect(h['content-encoding']).toBe('aes128gcm');
    expect(h.ttl).toBe('60');
    expect(JSON.parse(b.decrypt(init.body as Buffer))).toEqual({ title: 'T', body: 'B', url: '/fixes/1' });

    // The JWT is signed by our key, scoped to the push service's origin, and carries the public key.
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(h.authorization!)!;
    expect(m[4]).toBe(keys.publicKey);
    const claims = JSON.parse(Buffer.from(m[2]!, 'base64url').toString());
    expect(claims.aud).toBe('https://fcm.googleapis.com');
    expect(claims.sub).toBe('mailto:ops@example.et');
    const pub = Buffer.from(keys.publicKey, 'base64url');
    const key = createPublicKey({
      key: {
        kty: 'EC',
        crv: 'P-256',
        x: pub.subarray(1, 33).toString('base64url'),
        y: pub.subarray(33).toString('base64url'),
      },
      format: 'jwk',
    });
    const ok = verify(
      'sha256',
      Buffer.from(`${m[1]}.${m[2]}`),
      { key, dsaEncoding: 'ieee-p1363' },
      Buffer.from(m[3]!, 'base64url'),
    );
    expect(ok).toBe(true);
    // The private key never appears in what goes over the wire.
    expect(JSON.stringify(h)).not.toContain(keys.privateKey);
  });

  it('reports gone subscriptions and refuses endpoints that are not push services', async () => {
    const keys = generateVapidKeys();
    const b = browser();
    let called = 0;
    const fake = (async () => {
      called++;
      return new Response(null, { status: 410 });
    }) as unknown as typeof fetch;
    const client = new HttpPushClient({ ...keys, subject: 'mailto:a@b.et' }, fake);
    const err = await client
      .send(
        { endpoint: 'https://fcm.googleapis.com/fcm/send/x', ...b.sub },
        { title: '', body: '', url: '/' },
      )
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PushError);
    expect((err as PushError).gone).toBe(true);
    await expect(
      client.send(
        { endpoint: 'https://169.254.169.254/latest', ...b.sub },
        { title: '', body: '', url: '/' },
      ),
    ).rejects.toBeInstanceOf(PushError);
    expect(called).toBe(1);
  });
});

describe('isAllowedPushEndpoint', () => {
  it.each([
    ['https://fcm.googleapis.com/fcm/send/abc', true],
    ['https://updates.push.services.mozilla.com/wpush/v2/abc', true],
    ['https://web.push.apple.com/QGx', true],
    ['https://db5p.notify.windows.com/w/?token=x', true],
    ['http://fcm.googleapis.com/fcm/send/abc', false],
    ['https://fcm.googleapis.com.evil.et/x', false],
    ['https://user:pw@fcm.googleapis.com/x', false],
    ['https://fcm.googleapis.com:8443/x', false],
    ['https://localhost/x', false],
    ['not a url', false],
  ])('%s → %s', (url, ok) => expect(isAllowedPushEndpoint(url)).toBe(ok));
});
