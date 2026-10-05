-- Row-level security for tenant tables (ADR-002).
-- The app role (pulse_app) is NOSUPERUSER NOBYPASSRLS, so these policies always apply to it.
-- `withOrg()` sets app.org_id per transaction; when it is unset, current_setting(..., true)
-- returns NULL and no rows match — queries outside an org scope see nothing.

ALTER TABLE "sites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sites" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "sites_org_isolation" ON "sites"
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));--> statement-breakpoint

ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_log" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "audit_log_org_read" ON "audit_log" FOR SELECT
  USING ("org_id" = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "audit_log_org_insert" ON "audit_log" FOR INSERT
  WITH CHECK ("org_id" = current_setting('app.org_id', true));--> statement-breakpoint
-- No UPDATE/DELETE policies: audit entries are append-only for the app role.
