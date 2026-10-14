import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
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
    /** Share of visits recorded as session replays, 0–1 (slice 4). The SDK and collector both honour it. */
    replaySampleRate: real('replay_sample_rate').notNull().default(1),
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

const FIX_KINDS = ['rage_click', 'dead_click'] as const;
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
    /** Why the system changed it: detected | regressed. Null for people. */
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('issue_events_issue_idx').on(t.issueId, t.createdAt)],
);

export type IssueRow = typeof issues.$inferSelect;
export type IssueEventRow = typeof issueEvents.$inferSelect;

/**
 * Session replay chunks (slice 4): metadata only. The gzip'd rrweb events live in the blob store
 * (`@pulse/storage`) at `object_key`. Like visits, the visit id comes from the browser, so rows are
 * keyed per site. Retention deletes rows and blobs together (maintenance.replay-retention).
 */
export const replayChunks = pgTable(
  'replay_chunks',
  {
    siteId: text('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    visitId: text('visit_id').notNull(),
    seq: integer('seq').notNull(),
    orgId: text('org_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    /** Compressed size as stored. */
    bytes: integer('bytes').notNull(),
    objectKey: text('object_key').notNull(),
    /** rrweb event count and the first/last event times (browser clock) inside the chunk. */
    events: integer('events').notNull(),
    firstTs: timestamp('first_ts', { withTimezone: true }).notNull(),
    lastTs: timestamp('last_ts', { withTimezone: true }).notNull(),
    /** The chunk starts with a full DOM snapshot, so playback can begin here. */
    hasSnapshot: boolean('has_snapshot').notNull().default(false),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.siteId, t.visitId, t.seq] }),
    index('replay_chunks_org_received_idx').on(t.orgId, t.receivedAt),
    index('replay_chunks_org_visit_idx').on(t.orgId, t.visitId),
  ],
);

export type ReplayChunkRow = typeof replayChunks.$inferSelect;
