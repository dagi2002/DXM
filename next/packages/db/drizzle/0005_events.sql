-- Events, ingest isolation, and the two SECURITY DEFINER helpers the collector/worker need.
-- NOTE: SECURITY DEFINER functions run as the migration owner, which must be a superuser or have
-- BYPASSRLS (true for the docker-compose postgres user). The app role stays NOBYPASSRLS.

-- ── RLS for visits & dedupe ──────────────────────────────────────────────────
ALTER TABLE "visits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "visits" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "visits_org_isolation" ON "visits"
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));--> statement-breakpoint
ALTER TABLE "ingest_dedupe" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ingest_dedupe" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "ingest_dedupe_org_isolation" ON "ingest_dedupe"
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));--> statement-breakpoint

-- ── Events: range-partitioned by day (UTC) ───────────────────────────────────
CREATE TABLE "events" (
  "id" bigint GENERATED ALWAYS AS IDENTITY,
  "org_id" text NOT NULL,
  "site_id" text NOT NULL,
  "visit_id" text NOT NULL,
  "ts_server" timestamptz NOT NULL,
  "ts_client" timestamptz,
  "type" text NOT NULL,
  "path" text,
  "props" jsonb NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY ("ts_server", "id")
) PARTITION BY RANGE ("ts_server");--> statement-breakpoint
CREATE INDEX "events_site_ts_idx" ON "events" ("site_id", "ts_server");--> statement-breakpoint
CREATE INDEX "events_site_visit_idx" ON "events" ("site_id", "visit_id");--> statement-breakpoint
CREATE INDEX "events_site_type_ts_idx" ON "events" ("site_id", "type", "ts_server");--> statement-breakpoint
ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "events_org_isolation" ON "events"
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));--> statement-breakpoint

-- Partitions get their own RLS too, so querying a partition directly can never bypass isolation.
CREATE OR REPLACE FUNCTION pulse_protect_partition(p_name text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', p_name);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', p_name);
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = p_name AND policyname = 'org_isolation') THEN
    EXECUTE format(
      'CREATE POLICY org_isolation ON %I USING (org_id = current_setting(''app.org_id'', true)) WITH CHECK (org_id = current_setting(''app.org_id'', true))',
      p_name);
  END IF;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION pulse_protect_partition(text) FROM PUBLIC;--> statement-breakpoint

-- Catch-all so ingestion never fails for lack of a partition; the worker keeps daily partitions ahead.
CREATE TABLE "events_default" PARTITION OF "events" DEFAULT;--> statement-breakpoint
SELECT pulse_protect_partition('events_default');--> statement-breakpoint

/** Creates daily partitions from yesterday to `days_ahead` days out. Returns how many were created. */
CREATE OR REPLACE FUNCTION pulse_ensure_event_partitions(days_ahead integer DEFAULT 3) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d date;
  p_name text;
  created integer := 0;
BEGIN
  IF days_ahead < 0 OR days_ahead > 31 THEN
    RAISE EXCEPTION 'days_ahead must be between 0 and 31';
  END IF;
  FOR i IN -1..days_ahead LOOP
    d := (now() AT TIME ZONE 'UTC')::date + i;
    p_name := 'events_' || to_char(d, 'YYYYMMDD');
    IF to_regclass('public.' || p_name) IS NULL THEN
      BEGIN
        EXECUTE format(
          'CREATE TABLE %I PARTITION OF events FOR VALUES FROM (%L) TO (%L)',
          p_name, (d::text || ' 00:00:00+00')::timestamptz, ((d + 1)::text || ' 00:00:00+00')::timestamptz);
        PERFORM pulse_protect_partition(p_name);
        created := created + 1;
      EXCEPTION WHEN check_violation THEN
        -- Rows for this day already landed in events_default; leave them there.
        RAISE NOTICE 'skipping %: default partition holds rows for this range', p_name;
      END;
    END IF;
  END LOOP;
  RETURN created;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION pulse_ensure_event_partitions(integer) FROM PUBLIC;--> statement-breakpoint
SELECT pulse_ensure_event_partitions(3);--> statement-breakpoint

/** Collector lookup across orgs by public key — returns only what ingestion needs. */
CREATE OR REPLACE FUNCTION pulse_site_by_public_key(p_key text)
RETURNS TABLE (id text, org_id text, allowed_origins text[], status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.org_id, s.allowed_origins, s.status
  FROM sites s
  WHERE s.public_key = p_key AND s.deleted_at IS NULL
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION pulse_site_by_public_key(text) FROM PUBLIC;
