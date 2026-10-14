import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
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
    /** Origins added by the user (staging, second domain, localhost testing). allowed = domain ∪ extra. */
    extraOrigins: text('extra_origins')
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

/**
 * One visit = one browser tab session on a site (new id after 30 min idle). The visit id comes
 * from the browser, so it is only unique *per site*: the primary key is (site_id, id), which
 * makes cross-tenant injection impossible by construction (legacy bug, audit §7).
 */
export const visits = pgTable(
  'visits',
  {
    siteId: text('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    id: text('id').notNull(),
    orgId: text('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    entryPath: text('entry_path'),
    exitPath: text('exit_path'),
    referrerHost: text('referrer_host'),
    utmSource: text('utm_source'),
    utmMedium: text('utm_medium'),
    utmCampaign: text('utm_campaign'),
    device: text('device', { enum: ['desktop', 'mobile', 'tablet'] })
      .notNull()
      .default('desktop'),
    browser: text('browser'),
    os: text('os'),
    language: text('language'),
    network: text('network'),
    platform: text('platform', { enum: ['web', 'telegram_mini_app'] })
      .notNull()
      .default('web'),
    country: text('country'),
    sdkVersion: text('sdk_version'),
    pageviews: integer('pageviews').notNull().default(0),
    eventsCount: integer('events_count').notNull().default(0),
    clicks: integer('clicks').notNull().default(0),
    errors: integer('errors').notNull().default(0),
    maxScrollPct: smallint('max_scroll_pct').notNull().default(0),
    bounced: boolean('bounced'),
  },
  (t) => [
    primaryKey({ columns: [t.siteId, t.id] }),
    index('visits_org_site_started_idx').on(t.orgId, t.siteId, t.startedAt),
    index('visits_open_idx')
      .on(t.lastSeenAt)
      .where(sql`${t.endedAt} is null`),
  ],
);

/** Drops duplicate deliveries of the same batch (retries, beacon + fetch). Purged after 2 days. */
export const ingestDedupe = pgTable(
  'ingest_dedupe',
  {
    siteId: text('site_id').notNull(),
    visitId: text('visit_id').notNull(),
    seq: integer('seq').notNull(),
    orgId: text('org_id').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.siteId, t.visitId, t.seq] }),
    index('ingest_dedupe_received_idx').on(t.receivedAt),
  ],
);

export type VisitRow = typeof visits.$inferSelect;
export type SiteRow = typeof sites.$inferSelect;
export type AuditLogRow = typeof auditLog.$inferSelect;

const FIX_KINDS = [
  'rage_click',
  'dead_click',
  'form_abandon',
  'slow_page',
  'js_error',
  'u_turn',
  'tracking_broken',
] as const;
const FIX_SEVERITIES = ['critical', 'watch'] as const;
const FIX_STATUSES = ['open', 'fixing', 'fixed', 'verified', 'dismissed'] as const;

/**
 * Fix cards (slice 3). One row per (site, fingerprint): detectors upsert by fingerprint, so a
 * recurring problem refreshes its row instead of piling up duplicates. A fixed issue that comes
 * back after the cooldown is reopened on the same row.
 */
export const issues = pgTable(
  'issues',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    siteId: text('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    /** Per-org running number ("Fix #12"). */
    number: integer('number').notNull(),
    kind: text('kind', { enum: FIX_KINDS }).notNull(),
    fingerprint: text('fingerprint').notNull(),
    severity: text('severity', { enum: FIX_SEVERITIES }).notNull(),
    status: text('status', { enum: FIX_STATUSES }).notNull().default('open'),
    evidence: jsonb('evidence').$type<Record<string, unknown>>().notNull(),
    impact: jsonb('impact').$type<Record<string, unknown>>(),
    firstSeen: timestamp('first_seen', { withTimezone: true }).notNull(),
    lastSeen: timestamp('last_seen', { withTimezone: true }).notNull(),
    fixedAt: timestamp('fixed_at', { withTimezone: true }),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    /** Latest before/after check by `issue.verify` (FixVerification in @pulse/contracts). */
    verification: jsonb('verification').$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('issues_site_fingerprint_uq').on(t.siteId, t.fingerprint),
    uniqueIndex('issues_org_number_uq').on(t.orgId, t.number),
    index('issues_org_status_seen_idx').on(t.orgId, t.status, t.lastSeen),
  ],
);

/** Status history for the audit trail and reports. actor null = the system did it. */
export const issueEvents = pgTable(
  'issue_events',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    issueId: text('issue_id')
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    actorUserId: text('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
    fromStatus: text('from_status', { enum: FIX_STATUSES }),
    toStatus: text('to_status', { enum: FIX_STATUSES }).notNull(),
    /** Why the system changed it: detected | regressed | verified | not_verified | resumed. Null for people. */
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('issue_events_issue_idx').on(t.issueId, t.createdAt)],
);

export type IssueRow = typeof issues.$inferSelect;
export type IssueEventRow = typeof issueEvents.$inferSelect;

/**
 * Telegram alerts: one linked chat per organization. `chat_id` is Telegram's (64-bit) chat id,
 * kept as text. Quiet hours are whole local hours in `time_zone`; null/null = always send.
 */
export const telegramLinks = pgTable(
  'telegram_links',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    chatId: text('chat_id').notNull(),
    chatTitle: text('chat_title'),
    linkedByUserId: text('linked_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    quietStart: smallint('quiet_start'),
    quietEnd: smallint('quiet_end'),
    timeZone: text('time_zone').notNull().default('Africa/Addis_Ababa'),
    locale: text('locale', { enum: ['en', 'am'] })
      .notNull()
      .default('en'),
    ...timestamps,
  },
  (t) => [uniqueIndex('telegram_links_org_uq').on(t.orgId)],
);

/** One-time codes that link a chat (`/start <code>`). Only the SHA-256 of the code is stored. */
export const telegramLinkCodes = pgTable(
  'telegram_link_codes',
  {
    codeHash: text('code_hash').primaryKey(),
    orgId: text('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    createdByUserId: text('created_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    locale: text('locale', { enum: ['en', 'am'] })
      .notNull()
      .default('en'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('telegram_link_codes_org_idx').on(t.orgId)],
);

/**
 * Cached AI output (`ai.recommend`). One row per (issue, kind, input hash): the same evidence
 * never pays for a second call. Rows also count against the per-org monthly budget.
 */
export const aiArtifacts = pgTable(
  'ai_artifacts',
  {
    id: text('id').primaryKey(),
    orgId: text('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    issueId: text('issue_id')
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['fix_suggestion'] }).notNull(),
    inputHash: text('input_hash').notNull(),
    model: text('model').notNull(),
    content: jsonb('content').$type<Record<string, unknown>>().notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('ai_artifacts_issue_kind_input_uq').on(t.issueId, t.kind, t.inputHash),
    index('ai_artifacts_org_created_idx').on(t.orgId, t.createdAt),
  ],
);

export type TelegramLinkRow = typeof telegramLinks.$inferSelect;
export type AiArtifactRow = typeof aiArtifacts.$inferSelect;
