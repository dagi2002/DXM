/**
 * Zod-free constants and helpers, safe for the browser bundle. The schemas in ./index.ts
 * re-export these; front-end code should import from '@pulse/contracts/constants'.
 */
export const ERROR_CODES = [
  'bad_request',
  'validation_failed',
  'unauthenticated',
  'forbidden',
  'not_found',
  'conflict',
  'rate_limited',
  'plan_limit_reached',
  'feature_not_in_plan',
  'no_active_org',
  'internal',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const ROLES = ['owner', 'admin', 'member', 'client_viewer'] as const;
export type Role = (typeof ROLES)[number];
export const MANAGER_ROLES: readonly Role[] = ['owner', 'admin'];
/** Roles allowed to change sites, team and settings. */
export const canManage = (role: Role | null | undefined): boolean => !!role && MANAGER_ROLES.includes(role);

export const PLATFORMS = [
  'html',
  'wordpress',
  'woocommerce',
  'shopify',
  'react',
  'nextjs',
  'telegram_mini_app',
  'other',
] as const;
export type Platform = (typeof PLATFORMS)[number];

export const SITE_STATUSES = ['install', 'live', 'paused'] as const;
export type SiteStatus = (typeof SITE_STATUSES)[number];

export const PLAN_IDS = ['free', 'business', 'growth', 'agency'] as const;
export type PlanId = (typeof PLAN_IDS)[number];
export const PLAN_LIMITS: Record<PlanId, { sites: number }> = {
  free: { sites: 1 },
  business: { sites: 1 },
  growth: { sites: 3 },
  agency: { sites: 10 },
};
