import { z } from 'zod';
import { ERROR_CODES, PLATFORMS, ROLES, SITE_STATUSES } from './constants';

export * from './constants';

/* ── Errors ─────────────────────────────────────────────────────────────────
 * One envelope for every API error (ADR-005). Codes are stable; messages are for humans.
 */

export const ErrorEnvelope = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string().optional(),
  }),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>;

/* ── Roles ─────────────────────────────────────────────────────────────────── */
export const Role = z.enum(ROLES);
export type Role = z.infer<typeof Role>;

/* ── Preferences ───────────────────────────────────────────────────────────── */
export const Locale = z.enum(['en', 'am']);
export const CalendarPref = z.enum(['gregorian', 'ethiopian']);

/* ── Domains ───────────────────────────────────────────────────────────────── */
const DOMAIN_RE = /^(?=.{1,253}$)(?!-)(?:[a-z0-9-]{1,63}(?<!-)\.)+[a-z]{2,63}$/;

/**
 * Normalizes user input like "https://www.Shop.ET/path?x=1" to "www.shop.et".
 * Returns null when the input isn't a public hostname (no IPs, no localhost, no ports).
 */
export function normalizeDomain(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  s = s.split(/[/?#]/)[0] ?? '';
  if (s.includes('@') || s.includes(':')) return null;
  s = s.replace(/\.$/, '');
  return DOMAIN_RE.test(s) ? s : null;
}

/** Origins a site's tracking script may send from: apex and www variants over https. */
export function allowedOriginsFor(domain: string): string[] {
  const apex = domain.replace(/^www\./, '');
  return [`https://${apex}`, `https://www.${apex}`];
}

/* ── Sites ─────────────────────────────────────────────────────────────────── */
export const Platform = z.enum(PLATFORMS);
export type Platform = z.infer<typeof Platform>;

export const SiteStatus = z.enum(SITE_STATUSES);

export const Domain = z
  .string()
  .max(300)
  .transform((v, ctx) => {
    const d = normalizeDomain(v);
    if (!d) {
      ctx.addIssue({ code: 'custom', message: 'invalid_domain' });
      return z.NEVER;
    }
    return d;
  });

export const SiteCreate = z.object({
  name: z.string().trim().min(1).max(80),
  domain: Domain,
  platform: Platform.default('html'),
});
export type SiteCreate = z.input<typeof SiteCreate>;

export const SiteUpdate = z
  .object({
    name: z.string().trim().min(1).max(80),
    domain: Domain,
    platform: Platform,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'nothing_to_update' });
export type SiteUpdate = z.input<typeof SiteUpdate>;

export const SiteDelete = z.object({ confirmDomain: z.string() });

export const Site = z.object({
  id: z.string(),
  orgId: z.string(),
  name: z.string(),
  domain: z.string(),
  platform: Platform,
  status: SiteStatus,
  publicKey: z.string(),
  createdAt: z.string(),
  verifiedAt: z.string().nullable(),
});
export type Site = z.infer<typeof Site>;

export const SiteList = z.object({ sites: z.array(Site) });

/* ── Session / me ──────────────────────────────────────────────────────────── */
export const MeOrg = z.object({ id: z.string(), name: z.string(), slug: z.string(), role: Role });

export const Me = z.object({
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    emailVerified: z.boolean(),
    locale: Locale,
    calendar: CalendarPref,
  }),
  orgs: z.array(MeOrg),
  activeOrgId: z.string().nullable(),
});
export type Me = z.infer<typeof Me>;

export const PreferencesUpdate = z
  .object({ name: z.string().trim().min(1).max(80), locale: Locale, calendar: CalendarPref })
  .partial();
