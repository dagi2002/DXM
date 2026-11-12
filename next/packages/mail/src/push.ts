/**
 * Web push (RFC 8030) with VAPID (RFC 8292) and aes128gcm payload encryption (RFC 8188 / 8291),
 * on Node's crypto only — no third-party push library. The VAPID private key is a secret: it is
 * only used to sign, and never appears in errors or logs. Subscription endpoints and keys are
 * capabilities to message one browser; they stay on the server.
 */
import {
  createCipheriv,
  createECDH,
  createHmac,
  createPrivateKey,
  randomBytes,
  sign,
  type KeyObject,
} from 'node:crypto';

export interface PushSubscriptionKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushMessage {
  title: string;
  body: string;
  /** Opened when the notification is tapped (same-origin path or app URL). */
  url: string;
  /** Collapses repeats: a newer notification with the same tag replaces the older one. */
  tag?: string;
}

export interface PushSendOptions {
  /** Seconds the push service keeps it for an offline device. */
  ttl?: number;
  urgency?: 'very-low' | 'low' | 'normal' | 'high';
}

/** A push service error. `gone` = the subscription is dead (expired or revoked): delete it. */
export class PushError extends Error {
  constructor(readonly status: number) {
    super(`Push service responded ${status}`);
    this.name = 'PushError';
  }
  get gone() {
    return this.status === 404 || this.status === 410;
  }
}

export interface PushClient {
  send(sub: PushSubscriptionKeys, message: PushMessage, opts?: PushSendOptions): Promise<void>;
}

const b64u = (buf: Buffer | Uint8Array) => Buffer.from(buf).toString('base64url');
const fromB64u = (s: string) => Buffer.from(s, 'base64url');

/**
 * Only the browsers' real push services. The endpoint comes from the browser (via the client), so
 * the server must never POST to an arbitrary URL on someone's say-so.
 */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^[a-z0-9-]+\.push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/,
  /^[a-z0-9-]+\.push\.apple\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/,
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
  if (endpoint.length > 1024) return false;
  return PUSH_HOSTS.some((re) => re.test(url.hostname));
}

/** True when both keys decode to a P-256 key pair in the standard (web-push) format. */
export function validVapidKeys(publicKey: string | undefined, privateKey: string | undefined): boolean {
  if (!publicKey || !privateKey) return false;
  const pub = fromB64u(publicKey);
  const priv = fromB64u(privateKey);
  if (pub.length !== 65 || pub[0] !== 4 || priv.length !== 32) return false;
  try {
    const ecdh = createECDH('prime256v1');
    ecdh.setPrivateKey(priv);
    return ecdh.getPublicKey().equals(pub);
  } catch {
    return false;
  }
}

/** A fresh VAPID key pair (base64url, uncompressed public point / raw private scalar). */
export function generateVapidKeys(): { publicKey: string; privateKey: string } {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(ecdh.getPrivateKey()) };
}

function vapidKeyObject(publicKey: string, privateKey: string): KeyObject {
  const pub = fromB64u(publicKey);
  return createPrivateKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      d: privateKey,
      x: b64u(pub.subarray(1, 33)),
      y: b64u(pub.subarray(33, 65)),
    },
    format: 'jwk',
  });
}

/** The VAPID `Authorization` header value for one push service origin. */
export function vapidAuthorization(
  endpoint: string,
  keys: { publicKey: string; key: KeyObject; subject: string },
  now = Date.now(),
): string {
  const header = b64u(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u(
    Buffer.from(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(now / 1000) + 12 * 3600,
        sub: keys.subject,
      }),
    ),
  );
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), {
    key: keys.key,
    dsaEncoding: 'ieee-p1363',
  });
  return `vapid t=${header}.${claims}.${b64u(signature)}, k=${keys.publicKey}`;
}

const hmac = (key: Buffer, data: Buffer) => createHmac('sha256', key).update(data).digest();

/** Record size declared in the header; one record is enough for our small payloads. */
const RECORD_SIZE = 4096;

/**
 * Encrypts a payload for one subscription (RFC 8291, aes128gcm, single record).
 * `serverKeys` and `salt` are injectable for tests; production uses fresh random ones.
 */
export function encryptPayload(
  sub: { p256dh: string; auth: string },
  plaintext: Buffer,
  opts: { serverKeys?: ReturnType<typeof createECDH>; salt?: Buffer } = {},
): Buffer {
  const uaPublic = fromB64u(sub.p256dh);
  const authSecret = fromB64u(sub.auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error('invalid subscription key');
  if (authSecret.length < 16) throw new Error('invalid subscription auth secret');
  if (plaintext.length > RECORD_SIZE - 17 - 86) throw new Error('push payload too large');

  const server = opts.serverKeys ?? createECDH('prime256v1');
  if (!opts.serverKeys) server.generateKeys();
  const asPublic = server.getPublicKey();
  const ecdhSecret = server.computeSecret(uaPublic);
  const salt = opts.salt ?? randomBytes(16);

  // RFC 8291 §3.4: combine the ECDH secret with the subscription's auth secret.
  const prkKey = hmac(authSecret, ecdhSecret);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]);
  const ikm = hmac(prkKey, keyInfo);
  // RFC 8188 §2.2: content-encryption key and nonce.
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);

  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  // 0x02 = padding delimiter of the last (only) record.
  const body = Buffer.concat([cipher.update(Buffer.concat([plaintext, Buffer.from([2])])), cipher.final()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(RECORD_SIZE, 16);
  header.writeUInt8(asPublic.length, 20);
  return Buffer.concat([header, asPublic, body, cipher.getAuthTag()]);
}

export class HttpPushClient implements PushClient {
  private readonly key: KeyObject;
  constructor(
    private readonly vapid: { publicKey: string; privateKey: string; subject: string },
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    this.key = vapidKeyObject(vapid.publicKey, vapid.privateKey);
  }

  async send(sub: PushSubscriptionKeys, message: PushMessage, opts: PushSendOptions = {}) {
    if (!isAllowedPushEndpoint(sub.endpoint)) throw new PushError(410);
    const body = encryptPayload(sub, Buffer.from(JSON.stringify(message)));
    const res = await this.fetchImpl(sub.endpoint, {
      method: 'POST',
      headers: {
        authorization: vapidAuthorization(sub.endpoint, {
          publicKey: this.vapid.publicKey,
          key: this.key,
          subject: this.vapid.subject,
        }),
        'content-encoding': 'aes128gcm',
        'content-type': 'application/octet-stream',
        ttl: String(opts.ttl ?? 24 * 3600),
        urgency: opts.urgency ?? 'normal',
      },
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new PushError(res.status);
  }
}

/** Keeps pushes in memory — tests read `sent`. Never used in production. */
export class MemoryPushClient implements PushClient {
  readonly sent: { endpoint: string; message: PushMessage }[] = [];
  /** Endpoints the fake push service reports as gone (410). */
  readonly gone = new Set<string>();
  async send(sub: PushSubscriptionKeys, message: PushMessage) {
    if (this.gone.has(sub.endpoint)) throw new PushError(410);
    this.sent.push({ endpoint: sub.endpoint, message });
  }
}
