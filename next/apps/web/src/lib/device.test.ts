import { describe, expect, it } from 'vitest';
import { groupKey, parseUserAgent, secretFromOtpauth } from './device';

describe('parseUserAgent', () => {
  it.each([
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
      { browser: 'Chrome', os: 'Windows', kind: 'desktop' },
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0',
      { browser: 'Edge', os: 'Windows', kind: 'desktop' },
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36',
      { browser: 'Chrome', os: 'Android', kind: 'mobile' },
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      { browser: 'Safari', os: 'iOS', kind: 'mobile' },
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:130.0) Gecko/20100101 Firefox/130.0',
      { browser: 'Firefox', os: 'macOS', kind: 'desktop' },
    ],
    [
      'Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Safari/537.36',
      { browser: 'Samsung Internet', os: 'Android', kind: 'tablet' },
    ],
  ])('%s', (ua, expected) => {
    expect(parseUserAgent(ua)).toEqual(expected);
  });

  it('handles missing and unknown agents', () => {
    expect(parseUserAgent(null)).toEqual({ browser: null, os: null, kind: 'desktop' });
    expect(parseUserAgent('curl/8.5.0')).toEqual({ browser: null, os: null, kind: 'desktop' });
  });
});

describe('TOTP setup key helpers', () => {
  it('extracts and groups the base32 secret', () => {
    const uri =
      'otpauth://totp/DXM%20Pulse:a%40b.et?secret=JBSWY3DPEHPK3PXP&issuer=DXM+Pulse&digits=6&period=30';
    expect(secretFromOtpauth(uri)).toBe('JBSWY3DPEHPK3PXP');
    expect(groupKey('JBSWY3DPEHPK3PXP')).toBe('JBSW Y3DP EHPK 3PXP');
    expect(secretFromOtpauth('not a uri')).toBe('');
  });
});
