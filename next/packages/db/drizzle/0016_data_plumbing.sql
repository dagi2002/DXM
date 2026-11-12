ALTER TABLE "rollup_page_day" ADD COLUMN "uturn_reached" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rollup_page_day" ADD COLUMN "uturn_turned" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rollup_site_day" ADD COLUMN "pv_visits" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rollup_site_day" ADD COLUMN "version" smallint DEFAULT 1 NOT NULL;--> statement-breakpoint

-- Data plumbing (task 14): rollup backfill, retention. Cross-org work goes through narrow
-- SECURITY DEFINER functions that return ids only; the deleting itself happens per org under RLS.

/**
 * Sites and UTC days that still have raw events but whose daily rollup is missing, was made by an
 * older rollup version, or was computed before the day had settled (`settle_hours` after midnight).
 * Only days up to `last_day` (the caller passes the last settled day). Ids and days only.
 */
CREATE OR REPLACE FUNCTION pulse_rollup_backfill_candidates(
  last_day date, settle_hours integer, min_version integer, max_rows integer DEFAULT 500)
RETURNS TABLE (site_id text, org_id text, day date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF settle_hours < 0 OR settle_hours > 48 THEN RAISE EXCEPTION 'settle_hours out of range'; END IF;
  IF max_rows < 1 OR max_rows > 10000 THEN RAISE EXCEPTION 'max_rows out of range'; END IF;
  RETURN QUERY
    WITH raw_days AS (
      SELECT DISTINCT e.site_id AS sid, (e.ts_server AT TIME ZONE 'UTC')::date AS d
        FROM events e
       WHERE e.ts_server < ((last_day + 1)::text || ' 00:00:00+00')::timestamptz
    )
    SELECT s.id, s.org_id, rd.d
      FROM raw_days rd
      JOIN sites s ON s.id = rd.sid AND s.deleted_at IS NULL
      LEFT JOIN rollup_site_day r ON r.site_id = rd.sid AND r.day = rd.d
     WHERE r.site_id IS NULL
        OR r.version < min_version
        OR r.computed_at < ((rd.d + 1)::text || ' 00:00:00+00')::timestamptz + make_interval(hours => settle_hours)
     ORDER BY rd.d, s.id
     LIMIT max_rows;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION pulse_rollup_backfill_candidates(date, integer, integer, integer) FROM PUBLIC;--> statement-breakpoint

/** Every organization with its current plan, for the retention job (which then works per org under RLS). */
CREATE OR REPLACE FUNCTION pulse_orgs_for_retention()
RETURNS TABLE (org_id text, plan text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id, p.plan FROM organization o LEFT JOIN org_plans p ON p.org_id = o.id ORDER BY o.id;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION pulse_orgs_for_retention() FROM PUBLIC;--> statement-breakpoint

/**
 * Drops daily event partitions (`events_YYYYMMDD`) that end more than `keep_days` ago and hold no
 * rows. Rows are deleted per org by the retention job first; a partition that still holds anyone's
 * rows is never dropped, so this can't remove another org's data. Returns how many were dropped.
 */
CREATE OR REPLACE FUNCTION pulse_drop_empty_event_partitions(keep_days integer) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  part record;
  d date;
  has_rows boolean;
  dropped integer := 0;
BEGIN
  IF keep_days < 1 OR keep_days > 3660 THEN RAISE EXCEPTION 'keep_days out of range'; END IF;
  FOR part IN
    SELECT c.relname FROM pg_inherits i
      JOIN pg_class c ON c.oid = i.inhrelid
      JOIN pg_class p ON p.oid = i.inhparent
     WHERE p.relname = 'events' AND c.relname ~ '^events_[0-9]{8}$'
  LOOP
    d := to_date(substr(part.relname, 8), 'YYYYMMDD');
    CONTINUE WHEN d + 1 > (now() AT TIME ZONE 'UTC')::date - keep_days;
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I)', part.relname) INTO has_rows;
    CONTINUE WHEN has_rows;
    EXECUTE format('DROP TABLE %I', part.relname);
    dropped := dropped + 1;
  END LOOP;
  RETURN dropped;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION pulse_drop_empty_event_partitions(integer) FROM PUBLIC;
