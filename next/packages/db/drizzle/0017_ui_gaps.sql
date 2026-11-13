CREATE TABLE "org_branding" (
	"org_id" text PRIMARY KEY NOT NULL,
	"agency_name" text,
	"logo_key" text,
	"logo_type" text,
	"logo_bytes" integer,
	"logo_updated_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_artifacts" ALTER COLUMN "issue_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_artifacts" ADD COLUMN "site_id" text;--> statement-breakpoint
ALTER TABLE "ai_artifacts" ADD COLUMN "visit_id" text;--> statement-breakpoint
ALTER TABLE "org_branding" ADD CONSTRAINT "org_branding_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_artifacts" ADD CONSTRAINT "ai_artifacts_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_artifacts_visit_kind_input_uq" ON "ai_artifacts" USING btree ("site_id","visit_id","kind","input_hash") WHERE "ai_artifacts"."visit_id" is not null;--> statement-breakpoint
-- Task 13: AI replay recaps live next to fix suggestions (same budget), and report branding.

-- An artifact is about exactly one subject: an issue (fix suggestion) or a visit (replay recap).
ALTER TABLE "ai_artifacts" ADD CONSTRAINT "ai_artifacts_kind_ck" CHECK ("kind" IN ('fix_suggestion', 'replay_recap'));--> statement-breakpoint
ALTER TABLE "ai_artifacts" ADD CONSTRAINT "ai_artifacts_subject_ck" CHECK (
  ("kind" = 'fix_suggestion' AND "issue_id" IS NOT NULL AND "site_id" IS NULL AND "visit_id" IS NULL)
  OR ("kind" = 'replay_recap' AND "issue_id" IS NULL AND "site_id" IS NOT NULL AND "visit_id" IS NOT NULL)
);--> statement-breakpoint
-- A recap's site must belong to the recap's org.
ALTER TABLE "ai_artifacts" ADD CONSTRAINT "ai_artifacts_site_org_fk" FOREIGN KEY ("site_id", "org_id")
  REFERENCES "sites" ("id", "org_id") ON DELETE CASCADE;--> statement-breakpoint

ALTER TABLE "org_branding" ADD CONSTRAINT "org_branding_agency_name_ck"
  CHECK ("agency_name" IS NULL OR char_length("agency_name") BETWEEN 1 AND 80);--> statement-breakpoint
ALTER TABLE "org_branding" ADD CONSTRAINT "org_branding_logo_type_ck"
  CHECK ("logo_type" IS NULL OR "logo_type" IN ('image/png', 'image/jpeg', 'image/webp'));--> statement-breakpoint
ALTER TABLE "org_branding" ADD CONSTRAINT "org_branding_logo_ck" CHECK (
  ("logo_key" IS NULL AND "logo_type" IS NULL AND "logo_bytes" IS NULL)
  OR ("logo_key" IS NOT NULL AND "logo_type" IS NOT NULL AND "logo_bytes" BETWEEN 1 AND 262144)
);--> statement-breakpoint

ALTER TABLE "org_branding" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "org_branding" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "org_branding_org_isolation" ON "org_branding"
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));--> statement-breakpoint

/**
 * The branding for one share link's report, for the public page and its logo route. Same rules as
 * pulse_shared_report: unknown, expired, revoked and deleted-site links return nothing. Returns
 * the name and logo of that report's org only.
 */
CREATE OR REPLACE FUNCTION pulse_shared_report_brand(p_token_hash text)
RETURNS TABLE (agency_name text, logo_key text, logo_type text, logo_updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT b.agency_name, b.logo_key, b.logo_type, b.logo_updated_at
    FROM report_shares s
    JOIN reports r ON r.id = s.report_id AND r.org_id = s.org_id
    JOIN sites st ON st.id = r.site_id AND st.org_id = r.org_id
    JOIN org_branding b ON b.org_id = s.org_id
   WHERE s.token_hash = p_token_hash
     AND s.revoked_at IS NULL
     AND s.expires_at > now()
     AND st.deleted_at IS NULL
   LIMIT 1
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION pulse_shared_report_brand(text) FROM PUBLIC;
--> statement-breakpoint

/** Replay retention: AI recaps whose recording is gone (all chunks purged) are deleted too. */
CREATE OR REPLACE FUNCTION pulse_purge_orphan_replay_recaps()
RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH d AS (
    DELETE FROM ai_artifacts a
     WHERE a.kind = 'replay_recap'
       AND NOT EXISTS (SELECT 1 FROM replay_chunks c WHERE c.site_id = a.site_id AND c.visit_id = a.visit_id)
    RETURNING 1)
  SELECT count(*)::int FROM d
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION pulse_purge_orphan_replay_recaps() FROM PUBLIC;
