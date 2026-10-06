CREATE TABLE "ingest_dedupe" (
	"site_id" text NOT NULL,
	"visit_id" text NOT NULL,
	"seq" integer NOT NULL,
	"org_id" text NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingest_dedupe_site_id_visit_id_seq_pk" PRIMARY KEY("site_id","visit_id","seq")
);
--> statement-breakpoint
CREATE TABLE "visits" (
	"site_id" text NOT NULL,
	"id" text NOT NULL,
	"org_id" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"entry_path" text,
	"exit_path" text,
	"referrer_host" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"device" text DEFAULT 'desktop' NOT NULL,
	"browser" text,
	"os" text,
	"language" text,
	"network" text,
	"platform" text DEFAULT 'web' NOT NULL,
	"country" text,
	"sdk_version" text,
	"pageviews" integer DEFAULT 0 NOT NULL,
	"events_count" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"errors" integer DEFAULT 0 NOT NULL,
	"max_scroll_pct" smallint DEFAULT 0 NOT NULL,
	"bounced" boolean,
	CONSTRAINT "visits_site_id_id_pk" PRIMARY KEY("site_id","id")
);
--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ingest_dedupe_received_idx" ON "ingest_dedupe" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "visits_org_site_started_idx" ON "visits" USING btree ("org_id","site_id","started_at");--> statement-breakpoint
CREATE INDEX "visits_open_idx" ON "visits" USING btree ("last_seen_at") WHERE "visits"."ended_at" is null;