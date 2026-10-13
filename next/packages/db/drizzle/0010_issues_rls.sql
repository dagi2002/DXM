-- Fix cards: row-level security, integrity checks, and the cross-org helper the detection sweep needs.

ALTER TABLE "issues" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "issues" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "issues_org_isolation" ON "issues"
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));--> statement-breakpoint

ALTER TABLE "issue_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "issue_events" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "issue_events_org_read" ON "issue_events" FOR SELECT
  USING ("org_id" = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "issue_events_org_insert" ON "issue_events" FOR INSERT
  WITH CHECK ("org_id" = current_setting('app.org_id', true));--> statement-breakpoint
-- No UPDATE/DELETE policies: status history is append-only for the app role.

ALTER TABLE "issues" ADD CONSTRAINT "issues_status_ck"
  CHECK ("status" IN ('open', 'fixing', 'fixed', 'verified', 'dismissed'));--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_severity_ck" CHECK ("severity" IN ('critical', 'watch'));--> statement-breakpoint

-- An issue's site must belong to the issue's org (RLS checks org_id; this checks the pair).
CREATE UNIQUE INDEX "sites_id_org_uq" ON "sites" ("id", "org_id");--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_site_org_fk" FOREIGN KEY ("site_id", "org_id")
  REFERENCES "sites" ("id", "org_id") ON DELETE CASCADE;--> statement-breakpoint

/**
 * Sites with visitor activity in the last `lookback_minutes`, for the detection sweep.
 * Returns ids only — the per-site detection then runs inside that site's org scope.
 */
CREATE OR REPLACE FUNCTION pulse_sites_with_recent_activity(lookback_minutes integer DEFAULT 10)
RETURNS TABLE (site_id text, org_id text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF lookback_minutes < 1 OR lookback_minutes > 1440 THEN
    RAISE EXCEPTION 'lookback_minutes out of range';
  END IF;
  RETURN QUERY
    SELECT DISTINCT v.site_id, v.org_id
      FROM visits v
      JOIN sites s ON s.id = v.site_id AND s.org_id = v.org_id
     WHERE v.ended_at IS NULL
       AND v.last_seen_at > now() - make_interval(mins => lookback_minutes)
       AND s.deleted_at IS NULL;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION pulse_sites_with_recent_activity(integer) FROM PUBLIC;
