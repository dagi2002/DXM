import { z } from 'zod';

/**
 * Report branding (task 13): the agency name and logo on client reports and their share links.
 * Logos are raster only — SVG can carry script, so it is refused — and checked by their bytes,
 * not by what the browser says they are.
 */
export const LOGO_MAX_BYTES = 256 * 1024;
export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type LogoType = (typeof LOGO_TYPES)[number];

/** Detects a logo's real type from its first bytes; null when it is none of LOGO_TYPES. */
export function sniffLogoType(bytes: Uint8Array): LogoType | null {
  const b = (i: number) => bytes[i] ?? -1;
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47 && b(4) === 0x0d && b(5) === 0x0a)
    return 'image/png';
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return 'image/jpeg';
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}

export const OrgBranding = z.object({
  agencyName: z.string().nullable(),
  logo: z
    .object({
      /** Same-origin URL, versioned so a new logo is never served from cache. */
      url: z.string(),
      type: z.enum(LOGO_TYPES),
      bytes: z.number().int().min(1).max(LOGO_MAX_BYTES),
    })
    .nullable(),
});
export type OrgBranding = z.infer<typeof OrgBranding>;

/** `PUT /api/v1/branding`: null (or blank) clears the name, and reports fall back to the org name. */
export const BrandingUpdate = z.object({
  agencyName: z
    .string()
    .trim()
    .max(80)
    .nullable()
    .transform((v) => (v ? v : null)),
});
export type BrandingUpdate = z.input<typeof BrandingUpdate>;

/** What a report shows for branding. `logoUrl` is same-origin (the app or the share link). */
export const ReportBrand = z.object({
  agencyName: z.string().nullable(),
  logoUrl: z.string().nullable(),
});
export type ReportBrand = z.infer<typeof ReportBrand>;
