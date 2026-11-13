import { describe, expect, it } from 'vitest';
import { BrandingUpdate, LOGO_MAX_BYTES, sniffLogoType } from './branding';

const bytes = (...v: number[]) => new Uint8Array(v);
const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));

describe('sniffLogoType', () => {
  it('recognises PNG, JPEG and WebP by their bytes', () => {
    expect(sniffLogoType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png');
    expect(sniffLogoType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(sniffLogoType(ascii('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
  });

  it('refuses SVG, HTML, GIF and empty input whatever they claim to be', () => {
    expect(sniffLogoType(ascii('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
    expect(sniffLogoType(ascii('<html><script>alert(1)</script>'))).toBeNull();
    expect(sniffLogoType(ascii('GIF89a'))).toBeNull();
    expect(sniffLogoType(ascii('RIFF\0\0\0\0WAVE'))).toBeNull();
    expect(sniffLogoType(new Uint8Array())).toBeNull();
  });

  it('caps logos at 256 KB', () => {
    expect(LOGO_MAX_BYTES).toBe(262_144);
  });
});

describe('BrandingUpdate', () => {
  it('trims the name and turns blank into null', () => {
    expect(BrandingUpdate.parse({ agencyName: '  Abay Digital ' })).toEqual({ agencyName: 'Abay Digital' });
    expect(BrandingUpdate.parse({ agencyName: '   ' })).toEqual({ agencyName: null });
    expect(BrandingUpdate.parse({ agencyName: null })).toEqual({ agencyName: null });
    expect(BrandingUpdate.safeParse({ agencyName: 'x'.repeat(81) }).success).toBe(false);
  });
});
