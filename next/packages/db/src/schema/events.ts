/**
 * `events` is range-partitioned by day (ADR-002). Drizzle can't express partitioned tables, so
 * the DDL lives in drizzle/0005_events.sql and this file is excluded from drizzle-kit
 * (see drizzle.config.ts). It is still exported for typed queries.
 */
import { bigint, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const events = pgTable('events', {
  id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity(),
  orgId: text('org_id').notNull(),
  siteId: text('site_id').notNull(),
  visitId: text('visit_id').notNull(),
  tsServer: timestamp('ts_server', { withTimezone: true }).notNull(),
  tsClient: timestamp('ts_client', { withTimezone: true }),
  type: text('type').notNull(),
  path: text('path'),
  props: jsonb('props').$type<Record<string, unknown>>().notNull(),
});

export type EventRow = typeof events.$inferSelect;
