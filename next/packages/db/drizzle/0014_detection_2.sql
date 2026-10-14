CREATE TABLE "ai_artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"issue_id" text NOT NULL,
	"kind" text NOT NULL,
	"input_hash" text NOT NULL,
	"model" text NOT NULL,
	"content" jsonb NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_link_codes" (
	"code_hash" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"created_by_user_id" text,
	"locale" text DEFAULT 'en' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_links" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"chat_id" text NOT NULL,
	"chat_title" text,
	"linked_by_user_id" text,
	"quiet_start" smallint,
	"quiet_end" smallint,
	"time_zone" text DEFAULT 'Africa/Addis_Ababa' NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "verification" jsonb;--> statement-breakpoint
ALTER TABLE "ai_artifacts" ADD CONSTRAINT "ai_artifacts_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_artifacts" ADD CONSTRAINT "ai_artifacts_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_link_codes" ADD CONSTRAINT "telegram_link_codes_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_link_codes" ADD CONSTRAINT "telegram_link_codes_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_linked_by_user_id_user_id_fk" FOREIGN KEY ("linked_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ai_artifacts_issue_kind_input_uq" ON "ai_artifacts" USING btree ("issue_id","kind","input_hash");--> statement-breakpoint
CREATE INDEX "ai_artifacts_org_created_idx" ON "ai_artifacts" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "telegram_link_codes_org_idx" ON "telegram_link_codes" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_links_org_uq" ON "telegram_links" USING btree ("org_id");--> statement-breakpoint
-- Slice 3, part 2: row-level security, integrity checks and the narrow cross-org helpers for
-- verification, tracking-broken detection and Telegram chat linking.

ALTER TABLE "telegram_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "telegram_links" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "telegram_links_org_isolation" ON "telegram_links"
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));--> statement-breakpoint

ALTER TABLE "telegram_link_codes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "telegram_link_codes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "telegram_link_codes_org_isolation" ON "telegram_link_codes"
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));--> statement-breakpoint

ALTER TABLE "ai_artifacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_artifacts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "ai_artifacts_org_isolation" ON "ai_artifacts"
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));--> statement-breakpoint

ALTER TABLE "issues" ADD CONSTRAINT "issues_kind_ck" CHECK ("kind" IN
  ('rage_click', 'dead_click', 'form_abandon', 'slow_page', 'js_error', 'u_turn', 'tracking_broken'));--> statement-breakpoint
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_quiet_ck" CHECK (
  ("quiet_start" IS NULL AND "quiet_end" IS NULL)
  OR ("quiet_start" BETWEEN 0 AND 23 AND "quiet_end" BETWEEN 0 AND 23 AND "quiet_start" <> "quiet_end"));--> statement-breakpoint
ALTER TABLE "telegram_links" ADD CONSTRAINT "telegram_links_locale_ck" CHECK ("locale" IN ('en', 'am'));--> statement-breakpoint
ALTER TABLE "telegram_link_codes" ADD CONSTRAINT "telegram_link_codes_locale_ck" CHECK ("locale" IN ('en', 'am'));--> statement-breakpoint

-- An AI artifact's issue must belong to the artifact's org.
CREATE UNIQUE INDEX "issues_id_org_uq" ON "issues" ("id", "org_id");--> statement-breakpoint
ALTER TABLE "ai_artifacts" ADD CONSTRAINT "ai_artifacts_issue_org_fk" FOREIGN KEY ("issue_id", "org_id")
  REFERENCES "issues" ("id", "org_id") ON DELETE CASCADE;--> statement-breakpoint

-- Evidence became a tagged union; every existing row came from the click detectors.
UPDATE "issues" SET "evidence" = "evidence" || '{"type":"click"}'::jsonb
 WHERE NOT ("evidence" ? 'type');--> statement-breakpoint

/**
 * Fixed issues whose after-window is complete and that haven't been given up on, for the
 * `issue.verify` sweep. Ids only — each check then runs inside its org's scope.
 */
CREATE OR REPLACE FUNCTION pulse_issues_due_for_verification(
  min_age_hours integer DEFAULT 168,
  tracking_min_age_hours integer DEFAULT 24,
  max_age_days integer DEFAULT 28
)
RETURNS TABLE (issue_id text, org_id text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF min_age_hours < 1 OR tracking_min_age_hours < 1 OR max_age_days < 1 OR max_age_days > 90 THEN
    RAISE EXCEPTION 'argument out of range';
  END IF;
  RETURN QUERY
    SELECT i.id, i.org_id
      FROM issues i
      JOIN sites s ON s.id = i.site_id AND s.org_id = i.org_id
     WHERE i.status = 'fixed'
       AND i.fixed_at IS NOT NULL
       AND s.deleted_at IS NULL
       AND i.fixed_at > now() - make_interval(days => max_age_days)
       AND i.fixed_at <= now() - make_interval(hours =>
             CASE WHEN i.kind = 'tracking_broken' THEN tracking_min_age_hours ELSE min_age_hours END)
     ORDER BY i.fixed_at
     LIMIT 500;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION pulse_issues_due_for_verification(integer, integer, integer) FROM PUBLIC;--> statement-breakpoint

/** Live, not-deleted sites, for the schedule-driven tracking-broken check. Ids only. */
CREATE OR REPLACE FUNCTION pulse_live_sites()
RETURNS TABLE (site_id text, org_id text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.org_id FROM sites s WHERE s.status = 'live' AND s.deleted_at IS NULL ORDER BY s.id;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION pulse_live_sites() FROM PUBLIC;--> statement-breakpoint

/**
 * Called by the Telegram webhook (no session, no org): consumes a one-time link code and links
 * the chat to that code's org, replacing any previous chat. Returns the org and the language the
 * code was created in, or nothing for an unknown/expired code. Expired codes are purged.
 */
CREATE OR REPLACE FUNCTION pulse_claim_telegram_link(
  p_code_hash text,
  p_link_id text,
  p_chat_id text,
  p_chat_title text
)
RETURNS TABLE (org_id text, org_name text, locale text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c telegram_link_codes%ROWTYPE;
BEGIN
  IF p_code_hash !~ '^[0-9a-f]{64}$' OR p_chat_id !~ '^-?[0-9]{1,20}$' THEN
    RETURN;
  END IF;
  DELETE FROM telegram_link_codes WHERE expires_at < now();
  DELETE FROM telegram_link_codes WHERE code_hash = p_code_hash RETURNING * INTO c;
  IF c.code_hash IS NULL THEN RETURN; END IF;
  INSERT INTO telegram_links (id, org_id, chat_id, chat_title, linked_by_user_id, locale)
  VALUES (p_link_id, c.org_id, p_chat_id, left(p_chat_title, 200), c.created_by_user_id, c.locale)
  ON CONFLICT ("org_id") DO UPDATE
    SET chat_id = excluded.chat_id,
        chat_title = excluded.chat_title,
        linked_by_user_id = excluded.linked_by_user_id,
        updated_at = now();
  RETURN QUERY SELECT o.id, o.name, c.locale FROM organization o WHERE o.id = c.org_id;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION pulse_claim_telegram_link(text, text, text, text) FROM PUBLIC;
