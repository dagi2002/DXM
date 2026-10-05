-- org_plans is tenant data: readable within the org scope. Plan changes go through the
-- owner role (billing worker / staff console), so the app role gets no write policies here.
ALTER TABLE "org_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "org_plans" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "org_plans_org_read" ON "org_plans" FOR SELECT
  USING ("org_id" = current_setting('app.org_id', true));
