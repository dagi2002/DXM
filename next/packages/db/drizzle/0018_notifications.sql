CREATE TABLE "notification_prefs" (
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"weekly_digest" boolean DEFAULT true NOT NULL,
	"unsubscribe_token" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_prefs_org_id_user_id_pk" PRIMARY KEY("org_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "notification_settings" (
	"org_id" text PRIMARY KEY NOT NULL,
	"quiet_start" smallint,
	"quiet_end" smallint,
	"time_zone" text DEFAULT 'Africa/Addis_Ababa' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_success_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "notification_prefs" ADD CONSTRAINT "notification_prefs_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_prefs" ADD CONSTRAINT "notification_prefs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_prefs_unsubscribe_uq" ON "notification_prefs" USING btree ("unsubscribe_token");--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_org_endpoint_uq" ON "push_subscriptions" USING btree ("org_id","endpoint");--> statement-breakpoint
CREATE INDEX "push_subscriptions_org_user_idx" ON "push_subscriptions" USING btree ("org_id","user_id");--> statement-breakpoint
-- Task 15: notifications. Forced RLS on every new org table, one-click digest unsubscribe, the
-- digest sweep's org list, and quiet hours moved from the Telegram link to an org-wide setting
-- shared by Telegram and web push.

ALTER TABLE "notification_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notification_settings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "notification_settings_org_isolation" ON "notification_settings"
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));--> statement-breakpoint

ALTER TABLE "notification_prefs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "notification_prefs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "notification_prefs_org_isolation" ON "notification_prefs"
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));--> statement-breakpoint

ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "push_subscriptions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "push_subscriptions_org_isolation" ON "push_subscriptions"
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));--> statement-breakpoint

ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_quiet_ck" CHECK (
  ("quiet_start" IS NULL AND "quiet_end" IS NULL)
  OR ("quiet_start" BETWEEN 0 AND 23 AND "quiet_end" BETWEEN 0 AND 23 AND "quiet_start" <> "quiet_end"));--> statement-breakpoint
ALTER TABLE "notification_prefs" ADD CONSTRAINT "notification_prefs_token_ck"
  CHECK ("unsubscribe_token" ~ '^[A-Za-z0-9]{32,64}$');--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_endpoint_ck"
  CHECK ("endpoint" ~ '^https://' AND length("endpoint") <= 1024);--> statement-breakpoint

-- Preferences and subscriptions belong to a membership: leaving the org removes them.
ALTER TABLE "notification_prefs" ADD CONSTRAINT "notification_prefs_member_fk"
  FOREIGN KEY ("org_id", "user_id") REFERENCES "member" ("organization_id", "user_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_member_fk"
  FOREIGN KEY ("org_id", "user_id") REFERENCES "member" ("organization_id", "user_id") ON DELETE CASCADE;--> statement-breakpoint

-- Quiet hours become one org-wide rule: carry over what Telegram links had, then drop the old columns.
INSERT INTO "notification_settings" ("org_id", "quiet_start", "quiet_end", "time_zone")
  SELECT "org_id", "quiet_start", "quiet_end", "time_zone" FROM "telegram_links"
   WHERE "quiet_start" IS NOT NULL AND "quiet_end" IS NOT NULL
  ON CONFLICT ("org_id") DO NOTHING;--> statement-breakpoint
ALTER TABLE "telegram_links" DROP COLUMN "quiet_start";--> statement-breakpoint
ALTER TABLE "telegram_links" DROP COLUMN "quiet_end";--> statement-breakpoint

/**
 * One-click unsubscribe from the weekly digest (the link in the email; no session). Only ever
 * switches the digest off for the one membership the token belongs to. True when it matched.
 */
CREATE OR REPLACE FUNCTION pulse_digest_unsubscribe(p_token text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_token IS NULL OR p_token !~ '^[A-Za-z0-9]{32,64}$' THEN
    RETURN false;
  END IF;
  UPDATE notification_prefs SET weekly_digest = false, updated_at = now()
   WHERE unsubscribe_token = p_token;
  RETURN FOUND;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION pulse_digest_unsubscribe(text) FROM PUBLIC;--> statement-breakpoint

/** Organizations with at least one site, for the weekly digest sweep. Ids only. */
CREATE OR REPLACE FUNCTION pulse_digest_orgs()
RETURNS TABLE (org_id text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT s.org_id FROM sites s WHERE s.deleted_at IS NULL ORDER BY s.org_id;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION pulse_digest_orgs() FROM PUBLIC;
