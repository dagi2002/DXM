CREATE TABLE "rollup_funnel_day" (
	"site_id" text NOT NULL,
	"org_id" text NOT NULL,
	"day" date NOT NULL,
	"hash" text NOT NULL,
	"counts" integer[] NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rollup_funnel_day_site_id_day_pk" PRIMARY KEY("site_id","day")
);
--> statement-breakpoint
CREATE TABLE "rollup_page_day" (
	"site_id" text NOT NULL,
	"org_id" text NOT NULL,
	"day" date NOT NULL,
	"path" text NOT NULL,
	"visits" integer DEFAULT 0 NOT NULL,
	"pageviews" integer DEFAULT 0 NOT NULL,
	"entries" integer DEFAULT 0 NOT NULL,
	"bounces" integer DEFAULT 0 NOT NULL,
	"friction_visits" integer DEFAULT 0 NOT NULL,
	"error_visits" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rollup_page_day_site_id_day_path_pk" PRIMARY KEY("site_id","day","path")
);
--> statement-breakpoint
CREATE TABLE "rollup_site_day" (
	"site_id" text NOT NULL,
	"org_id" text NOT NULL,
	"day" date NOT NULL,
	"visits" integer DEFAULT 0 NOT NULL,
	"pageviews" integer DEFAULT 0 NOT NULL,
	"closed_visits" integer DEFAULT 0 NOT NULL,
	"bounced_visits" integer DEFAULT 0 NOT NULL,
	"friction_visits" integer DEFAULT 0 NOT NULL,
	"error_visits" integer DEFAULT 0 NOT NULL,
	"rage_clicks" integer DEFAULT 0 NOT NULL,
	"dead_clicks" integer DEFAULT 0 NOT NULL,
	"errors" integer DEFAULT 0 NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rollup_site_day_site_id_day_pk" PRIMARY KEY("site_id","day")
);
--> statement-breakpoint
CREATE TABLE "rollup_vitals_day" (
	"site_id" text NOT NULL,
	"org_id" text NOT NULL,
	"day" date NOT NULL,
	"metric" text NOT NULL,
	"device" text NOT NULL,
	"network" text NOT NULL,
	"path" text NOT NULL,
	"values" real[] NOT NULL,
	CONSTRAINT "rollup_vitals_day_site_id_day_metric_device_network_path_pk" PRIMARY KEY("site_id","day","metric","device","network","path")
);
--> statement-breakpoint
CREATE TABLE "site_funnels" (
	"site_id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"template" text NOT NULL,
	"steps" jsonb NOT NULL,
	"hash" text NOT NULL,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rollup_funnel_day" ADD CONSTRAINT "rollup_funnel_day_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rollup_funnel_day" ADD CONSTRAINT "rollup_funnel_day_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rollup_page_day" ADD CONSTRAINT "rollup_page_day_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rollup_page_day" ADD CONSTRAINT "rollup_page_day_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rollup_site_day" ADD CONSTRAINT "rollup_site_day_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rollup_site_day" ADD CONSTRAINT "rollup_site_day_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rollup_vitals_day" ADD CONSTRAINT "rollup_vitals_day_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rollup_vitals_day" ADD CONSTRAINT "rollup_vitals_day_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_funnels" ADD CONSTRAINT "site_funnels_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_funnels" ADD CONSTRAINT "site_funnels_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_funnels" ADD CONSTRAINT "site_funnels_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rollup_site_day_org_day_idx" ON "rollup_site_day" USING btree ("org_id","day");--> statement-breakpoint

-- Site insights: row-level security, tenant integrity, and the cross-org helper the rollup sweep needs.

ALTER TABLE "site_funnels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "site_funnels" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "site_funnels_org_isolation" ON "site_funnels"
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));--> statement-breakpoint
ALTER TABLE "rollup_site_day" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rollup_site_day" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "rollup_site_day_org_isolation" ON "rollup_site_day"
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));--> statement-breakpoint
ALTER TABLE "rollup_page_day" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rollup_page_day" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "rollup_page_day_org_isolation" ON "rollup_page_day"
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));--> statement-breakpoint
ALTER TABLE "rollup_vitals_day" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rollup_vitals_day" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "rollup_vitals_day_org_isolation" ON "rollup_vitals_day"
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));--> statement-breakpoint
ALTER TABLE "rollup_funnel_day" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rollup_funnel_day" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "rollup_funnel_day_org_isolation" ON "rollup_funnel_day"
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));--> statement-breakpoint

-- Each row's site must belong to the row's org (RLS checks org_id; these check the pair).
ALTER TABLE "site_funnels" ADD CONSTRAINT "site_funnels_site_org_fk" FOREIGN KEY ("site_id", "org_id")
  REFERENCES "sites" ("id", "org_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "rollup_site_day" ADD CONSTRAINT "rollup_site_day_site_org_fk" FOREIGN KEY ("site_id", "org_id")
  REFERENCES "sites" ("id", "org_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "rollup_page_day" ADD CONSTRAINT "rollup_page_day_site_org_fk" FOREIGN KEY ("site_id", "org_id")
  REFERENCES "sites" ("id", "org_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "rollup_vitals_day" ADD CONSTRAINT "rollup_vitals_day_site_org_fk" FOREIGN KEY ("site_id", "org_id")
  REFERENCES "sites" ("id", "org_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "rollup_funnel_day" ADD CONSTRAINT "rollup_funnel_day_site_org_fk" FOREIGN KEY ("site_id", "org_id")
  REFERENCES "sites" ("id", "org_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "site_funnels" ADD CONSTRAINT "site_funnels_template_ck"
  CHECK ("template" IN ('telebirr_checkout', 'chapa_checkout', 'lead_form', 'telegram_handoff', 'custom'));--> statement-breakpoint
ALTER TABLE "rollup_vitals_day" ADD CONSTRAINT "rollup_vitals_day_metric_ck"
  CHECK ("metric" IN ('LCP', 'INP', 'CLS'));--> statement-breakpoint

/**
 * Sites whose rollups need refreshing, for the insights sweep: visitor activity in the last
 * `lookback_minutes`, or a funnel whose current step list hasn't been rolled up for a recent day
 * with visits (a new or edited funnel). Ids only — the rollup itself runs inside the org's scope.
 */
CREATE OR REPLACE FUNCTION pulse_sites_for_insights(lookback_minutes integer DEFAULT 30)
RETURNS TABLE (site_id text, org_id text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF lookback_minutes < 1 OR lookback_minutes > 2880 THEN
    RAISE EXCEPTION 'lookback_minutes out of range';
  END IF;
  RETURN QUERY
    SELECT s.id, s.org_id
      FROM sites s
     WHERE s.deleted_at IS NULL
       AND (
         EXISTS (SELECT 1 FROM visits v
                  WHERE v.site_id = s.id
                    AND v.last_seen_at > now() - make_interval(mins => lookback_minutes))
         OR EXISTS (SELECT 1 FROM site_funnels f
                      JOIN rollup_site_day r ON r.site_id = f.site_id
                     WHERE f.site_id = s.id
                       AND r.day > (now() AT TIME ZONE 'UTC')::date - 30
                       AND r.visits > 0
                       AND NOT EXISTS (SELECT 1 FROM rollup_funnel_day fd
                                        WHERE fd.site_id = r.site_id AND fd.day = r.day AND fd.hash = f.hash))
       );
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION pulse_sites_for_insights(integer) FROM PUBLIC;
