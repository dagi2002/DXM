import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { organization, user } from './auth';

const PLATFORMS = [
  'html',
  'wordpress',
  'woocommerce',
  'shopify',
  'react',
  'nextjs',
  'telegram_mini_app',
  'other',
] as const;
const SITE_STATUSES = ['install', 'live', 'paused'] as const;

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/**
 * Tenant tables carry org_id and are protected by row-level security
 * (see drizzle/0001_rls.sql). Always query them through `withOrg`.
 */
export const sites = pgTable(
  'sites',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    domain: text('domain').notNull(),
    platform: text('platform', { enum: PLATFORMS }).notNull().default('html'),
    status: text('status', { enum: SITE_STATUSES }).notNull().default('install'),
    publicKey: text('public_key').notNull().unique(),
    allowedOrigins: text('allowed_origins')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    index('sites_org_idx').on(t.orgId),
    uniqueIndex('sites_org_domain_active_uq')
      .on(t.orgId, t.domain)
      .where(sql`${t.deletedAt} is null`),
  ],
);

export const auditLog = pgTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    actorUserId: text('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    ip: text('ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_log_org_created_idx').on(t.orgId, t.createdAt)],
);

/** Current plan per org. Billing (slice 7) will own this via subscriptions; until then everyone is on free. */
export const orgPlans = pgTable('org_plans', {
  orgId: text('org_id')
    .primaryKey()
    .references(() => organization.id, { onDelete: 'cascade' }),
  plan: text('plan', { enum: ['free', 'business', 'growth', 'agency'] })
    .notNull()
    .default('free'),
  ...timestamps,
});

export type SiteRow = typeof sites.$inferSelect;
export type AuditLogRow = typeof auditLog.$inferSelect;
