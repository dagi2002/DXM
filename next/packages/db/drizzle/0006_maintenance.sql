-- Cross-org maintenance runs as narrow SECURITY DEFINER functions instead of giving the worker
-- BYPASSRLS. Each does exactly one thing and returns a count.

/** Closes visits idle for `idle_minutes` and decides whether each was a bounce (one page, no click). */
CREATE OR REPLACE FUNCTION pulse_close_idle_visits(idle_minutes integer DEFAULT 30) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF idle_minutes < 5 OR idle_minutes > 240 THEN RAISE EXCEPTION 'idle_minutes out of range'; END IF;
  UPDATE visits
     SET ended_at = last_seen_at,
         bounced = (pageviews <= 1 AND clicks = 0)
   WHERE ended_at IS NULL
     AND last_seen_at < now() - make_interval(mins => idle_minutes);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION pulse_close_idle_visits(integer) FROM PUBLIC;--> statement-breakpoint

/** Deletes de-duplication markers older than `keep_hours`. */
CREATE OR REPLACE FUNCTION pulse_purge_ingest_dedupe(keep_hours integer DEFAULT 48) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  IF keep_hours < 1 THEN RAISE EXCEPTION 'keep_hours out of range'; END IF;
  DELETE FROM ingest_dedupe WHERE received_at < now() - make_interval(hours => keep_hours);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION pulse_purge_ingest_dedupe(integer) FROM PUBLIC;
