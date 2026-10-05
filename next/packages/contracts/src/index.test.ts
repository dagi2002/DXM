import { describe, expect, it } from 'vitest';
import { SiteCreate, SiteUpdate, allowedOriginsFor, canManage, normalizeDomain } from './index';

describe('normalizeDomain', () => {
  it.each([
    ['abebefurniture.et', 'abebefurniture.et'],
    ['https://www.Shop.ET/path?x=1#y', 'www.shop.et'],
    ['  http://sub.domain.com.et/  ', 'sub.domain.com.et'],
    ['example.et.', 'example.et'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeDomain(input)).toBe(expected);
  });

  it.each([
    '',
    'localhost',
    '127.0.0.1',
    'example.et:8080',
    'user@example.et',
    '-bad.et',
    'no_underscores.et',
    'a..b.et',
  ])('rejects %j', (input) => {
    expect(normalizeDomain(input)).toBeNull();
  });
});

describe('allowedOriginsFor', () => {
  it('covers apex and www over https', () => {
    expect(allowedOriginsFor('www.shop.et')).toEqual(['https://shop.et', 'https://www.shop.et']);
    expect(allowedOriginsFor('shop.et')).toEqual(['https://shop.et', 'https://www.shop.et']);
  });
});

describe('SiteCreate', () => {
  it('normalizes domain and defaults platform', () => {
    expect(SiteCreate.parse({ name: ' Shop ', domain: 'https://Shop.et/' })).toEqual({
      name: 'Shop',
      domain: 'shop.et',
      platform: 'html',
    });
  });
  it('reports invalid domains with a stable message', () => {
    const r = SiteCreate.safeParse({ name: 'x', domain: 'localhost' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('invalid_domain');
  });
});

describe('SiteUpdate', () => {
  it('rejects empty updates', () => {
    expect(SiteUpdate.safeParse({}).success).toBe(false);
    expect(SiteUpdate.safeParse({ name: 'New' }).success).toBe(true);
  });
});

describe('canManage', () => {
  it('allows owners and admins only', () => {
    expect(canManage('owner')).toBe(true);
    expect(canManage('admin')).toBe(true);
    expect(canManage('member')).toBe(false);
    expect(canManage('client_viewer')).toBe(false);
    expect(canManage(null)).toBe(false);
  });
});
