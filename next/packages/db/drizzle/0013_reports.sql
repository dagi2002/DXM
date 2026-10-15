CREATE TABLE "report_shares" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"report_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"site_id" text NOT NULL,
	"period" text NOT NULL,
	"source" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "report_shares" ADD CONSTRAINT "report_shares_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_shares" ADD CONSTRAINT "report_shares_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_shares" ADD CONSTRAINT "report_shares_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "report_shares_token_hash_uq" ON "report_shares" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "report_shares_report_idx" ON "report_shares" USING btree ("report_id");--> statement-breakpoint
CREATE INDEX "reports_org_site_period_idx" ON "reports" USING btree ("org_id","site_id","period");--> statement-breakpoint
CREATE UNIQUE INDEX "reports_site_period_auto_uq" ON "reports" USING btree ("site_id","period") WHERE "reports"."source" = 'auto';--> statement-breakpoint
-- Client reports: row-level security, integrity checks, and the two narrow cross-org helpers
-- (the public share-link lookup and the monthly job's site list).

ALTER TABLE "reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reports" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "reports_org_isolation" ON "reports"
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));--> statement-breakpoint

ALTER TABLE "report_shares" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "report_shares" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "report_shares_org_read" ON "report_shares" FOR SELECT
  USING ("org_id" = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "report_shares_org_insert" ON "report_shares" FOR INSERT
  WITH CHECK ("org_id" = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "report_shares_org_update" ON "report_shares" FOR UPDATE
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));--> statement-breakpoint
-- No DELETE policy: links are revoked (revoked_at), never deleted, so the history stays.

ALTER TABLE "reports" ADD CONSTRAINT "reports_period_ck"
  CHECK ("period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_source_ck" CHECK ("source" IN ('auto', 'manual'));--> statement-breakpoint
ALTER TABLE "report_shares" ADD CONSTRAINT "report_shares_token_hash_ck"
  CHECK ("token_hash" ~ '^[0-9a-f]{64}$');--> statement-breakpoint

-- A report's site must belong to the report's org, and a share's report to the share's org.
ALTER TABLE "reports" ADD CONSTRAINT "reports_site_org_fk" FOREIGN KEY ("site_id", "org_id")
  REFERENCES "sites" ("id", "org_id") ON DELETE CASCADE;--> statement-breakpoint
CREATE UNIQUE INDEX "reports_id_org_uq" ON "reports" ("id", "org_id");--> statement-breakpoint
ALTER TABLE "report_shares" ADD CONSTRAINT "report_shares_report_org_fk" FOREIGN KEY ("report_id", "org_id")
  REFERENCES "reports" ("id", "org_id") ON DELETE CASCADE;--> statement-breakpoint

/**
 * The public share link. Takes the SHA-256 hex of a token and returns that one report's frozen
 * snapshot — only while the link is unexpired, unrevoked and its site not deleted. Unknown,
 * expired and revoked tokens all return nothing, so a caller can't tell them apart.
 */
CREATE OR REPLACE FUNCTION pulse_shared_report(p_token_hash text)
RETURNS TABLE (report_id text, period text, snapshot jsonb, expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.period, r.snapshot, s.expires_at
    FROM report_shares s
    JOIN reports r ON r.id = s.report_id AND r.org_id = s.org_id
    JOIN sites st ON st.id = r.site_id AND st.org_id = r.org_id
   WHERE s.token_hash = p_token_hash
     AND s.revoked_at IS NULL
     AND s.expires_at > now()
     AND st.deleted_at IS NULL
   LIMIT 1
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION pulse_shared_report(text) FROM PUBLIC;--> statement-breakpoint

/**
 * Sites the monthly report job should snapshot: not deleted, and visited in [p_from, p_to).
 * Returns ids only — each report is then built inside that site's org scope.
 */
CREATE OR REPLACE FUNCTION pulse_report_candidates(p_from timestamptz, p_to timestamptz)
RETURNS TABLE (site_id text, org_id text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_to <= p_from OR p_to - p_from > interval '32 days' THEN
    RAISE EXCEPTION 'report period out of range';
  END IF;
  RETURN QUERY
    SELECT s.id, s.org_id
      FROM sites s
     WHERE s.deleted_at IS NULL
       AND EXISTS (SELECT 1 FROM visits v
                    WHERE v.site_id = s.id AND v.org_id = s.org_id
                      AND v.started_at >= p_from AND v.started_at < p_to);
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION pulse_report_candidates(timestamptz, timestamptz) FROM PUBLIC;
