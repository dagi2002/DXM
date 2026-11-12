CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"number" integer NOT NULL,
	"plan" text NOT NULL,
	"interval" text NOT NULL,
	"amount_santim" integer NOT NULL,
	"currency" text DEFAULT 'ETB' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_usage" (
	"org_id" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"sessions" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "org_usage_org_id_period_start_pk" PRIMARY KEY("org_id","period_start")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"invoice_id" text NOT NULL,
	"tx_ref" text NOT NULL,
	"amount_santim" integer NOT NULL,
	"currency" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"checkout_url" text,
	"provider_reference" text,
	"method" text,
	"mode" text,
	"verify_result" jsonb,
	"verified_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"org_id" text PRIMARY KEY NOT NULL,
	"plan" text NOT NULL,
	"interval" text DEFAULT 'month' NOT NULL,
	"status" text NOT NULL,
	"current_period_start" timestamp with time zone NOT NULL,
	"current_period_end" timestamp with time zone NOT NULL,
	"grace_ends_at" timestamp with time zone,
	"comp" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_usage" ADD CONSTRAINT "org_usage_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_org_number_uq" ON "invoices" USING btree ("org_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_org_open_uq" ON "invoices" USING btree ("org_id") WHERE "invoices"."status" = 'open';--> statement-breakpoint
CREATE INDEX "invoices_org_created_idx" ON "invoices" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_tx_ref_uq" ON "payments" USING btree ("tx_ref");--> statement-breakpoint
CREATE INDEX "payments_invoice_idx" ON "payments" USING btree ("invoice_id");--> statement-breakpoint
-- Billing ledger: row-level security, integrity checks, and the narrow cross-org helpers the
-- webhook, the collector and the renewal job need.

ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "subscriptions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "subscriptions_org_isolation" ON "subscriptions"
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));--> statement-breakpoint

ALTER TABLE "invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invoices" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "invoices_org_read" ON "invoices" FOR SELECT
  USING ("org_id" = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "invoices_org_insert" ON "invoices" FOR INSERT
  WITH CHECK ("org_id" = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "invoices_org_update" ON "invoices" FOR UPDATE
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));--> statement-breakpoint
-- No DELETE policy: invoices are voided, never deleted.

ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "payments_org_read" ON "payments" FOR SELECT
  USING ("org_id" = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "payments_org_insert" ON "payments" FOR INSERT
  WITH CHECK ("org_id" = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "payments_org_update" ON "payments" FOR UPDATE
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));--> statement-breakpoint
-- No DELETE policy: the ledger keeps every attempt.

ALTER TABLE "org_usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "org_usage" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "org_usage_org_isolation" ON "org_usage"
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));--> statement-breakpoint

-- Billing now owns org_plans: the app keeps it in step with the subscription, inside the org scope.
CREATE POLICY "org_plans_org_insert" ON "org_plans" FOR INSERT
  WITH CHECK ("org_id" = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "org_plans_org_update" ON "org_plans" FOR UPDATE
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));--> statement-breakpoint
ALTER TABLE "org_plans" ADD CONSTRAINT "org_plans_plan_ck"
  CHECK ("plan" IN ('free', 'business', 'growth', 'agency'));--> statement-breakpoint

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_ck"
  CHECK ("plan" IN ('business', 'growth', 'agency'));--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_interval_ck" CHECK ("interval" IN ('month', 'year'));--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_status_ck"
  CHECK ("status" IN ('trialing', 'active', 'past_due', 'restricted'));--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_period_ck"
  CHECK ("current_period_end" > "current_period_start");--> statement-breakpoint

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_plan_ck" CHECK ("plan" IN ('business', 'growth', 'agency'));--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_interval_ck" CHECK ("interval" IN ('month', 'year'));--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_status_ck" CHECK ("status" IN ('open', 'paid', 'void'));--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_amount_ck" CHECK ("amount_santim" > 0);--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_currency_ck" CHECK ("currency" = 'ETB');--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_period_ck" CHECK ("period_end" > "period_start");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_paid_ck"
  CHECK (("status" = 'paid') = ("paid_at" IS NOT NULL));--> statement-breakpoint

ALTER TABLE "payments" ADD CONSTRAINT "payments_status_ck"
  CHECK ("status" IN ('pending', 'paid', 'failed', 'mismatch'));--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_ck" CHECK ("amount_santim" > 0);--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_tx_ref_ck" CHECK ("tx_ref" ~ '^[A-Za-z0-9-]{12,64}$');--> statement-breakpoint
-- A payment can only be paid with a verification on record.
ALTER TABLE "payments" ADD CONSTRAINT "payments_paid_verified_ck"
  CHECK ("status" <> 'paid' OR ("verified_at" IS NOT NULL AND "verify_result" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "org_usage" ADD CONSTRAINT "org_usage_sessions_ck" CHECK ("sessions" >= 0);--> statement-breakpoint

-- A payment's invoice must belong to the payment's org.
CREATE UNIQUE INDEX "invoices_id_org_uq" ON "invoices" ("id", "org_id");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_org_fk" FOREIGN KEY ("invoice_id", "org_id")
  REFERENCES "invoices" ("id", "org_id") ON DELETE CASCADE;--> statement-breakpoint

/**
 * The Chapa webhook arrives with no org: this maps a tx_ref to its org so the rest of the work
 * runs inside that org's scope. Returns nothing for an unknown ref.
 */
CREATE OR REPLACE FUNCTION pulse_payment_org(p_tx_ref text)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT org_id FROM payments WHERE tx_ref = p_tx_ref LIMIT 1
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION pulse_payment_org(text) FROM PUBLIC;--> statement-breakpoint

/**
 * What the ingest path needs to enforce the session quota, for one org at a point in time:
 * its plan, subscription status (null = free), the start of the current usage period, and the
 * sessions stored in it. Usage periods are months: calendar months (UTC) for free and restricted
 * orgs, and months counted from the start of the billing period for subscribers.
 */
CREATE OR REPLACE FUNCTION pulse_org_ingest_state(p_org_id text, p_at timestamptz DEFAULT now())
RETURNS TABLE (plan text, status text, period_start timestamptz, sessions integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  s subscriptions%ROWTYPE;
  v_plan text;
  v_start timestamptz;
  v_months integer;
BEGIN
  SELECT * INTO s FROM subscriptions WHERE org_id = p_org_id;
  SELECT p.plan INTO v_plan FROM org_plans p WHERE p.org_id = p_org_id;
  IF s.org_id IS NULL OR s.status = 'restricted' OR p_at < s.current_period_start THEN
    v_start := date_trunc('month', p_at AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  ELSE
    v_months := (extract(year FROM age(p_at, s.current_period_start)) * 12
               + extract(month FROM age(p_at, s.current_period_start)))::integer;
    v_start := s.current_period_start + make_interval(months => greatest(v_months, 0));
  END IF;
  RETURN QUERY
    SELECT coalesce(s.plan, v_plan, 'free'), s.status, v_start,
           coalesce((SELECT u.sessions FROM org_usage u
                      WHERE u.org_id = p_org_id AND u.period_start = v_start), 0);
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION pulse_org_ingest_state(text, timestamptz) FROM PUBLIC;--> statement-breakpoint

/** Collector: is this visit already stored? (Existing sessions keep being accepted over quota.) */
CREATE OR REPLACE FUNCTION pulse_visit_exists(p_site_id text, p_visit_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM visits WHERE site_id = p_site_id AND id = p_visit_id)
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION pulse_visit_exists(text, text) FROM PUBLIC;--> statement-breakpoint

/**
 * Orgs whose subscription needs the renewal job at p_now: a period that ends within p_lead_days
 * (invoice it) or has ended (past due), or a grace period that has run out (restrict).
 */
CREATE OR REPLACE FUNCTION pulse_billing_due(p_now timestamptz, p_lead_days integer)
RETURNS TABLE (org_id text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_lead_days < 0 OR p_lead_days > 60 THEN RAISE EXCEPTION 'p_lead_days out of range'; END IF;
  RETURN QUERY
    SELECT s.org_id FROM subscriptions s
     WHERE (s.status IN ('trialing', 'active')
            AND s.current_period_end <= p_now + make_interval(days => p_lead_days))
        OR (s.status = 'past_due' AND s.grace_ends_at <= p_now);
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION pulse_billing_due(timestamptz, integer) FROM PUBLIC;--> statement-breakpoint

/**
 * Replay retention by plan. p_days maps plan → days kept, with a "restricted" entry for orgs past
 * their grace period, e.g. {"free":7,"business":30,"growth":90,"agency":90,"restricted":7}.
 * p_max_days caps every plan (the server-wide REPLAY_RETENTION_DAYS). Returns the deleted blobs.
 */
CREATE OR REPLACE FUNCTION pulse_purge_replay_chunks_by_plan(
  p_days jsonb, p_max_days integer, max_rows integer DEFAULT 5000)
RETURNS TABLE (object_key text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_max_days < 1 OR p_max_days > 3650 THEN RAISE EXCEPTION 'p_max_days out of range'; END IF;
  IF max_rows < 1 OR max_rows > 100000 THEN RAISE EXCEPTION 'max_rows out of range'; END IF;
  IF coalesce((p_days->>'free')::integer, 0) < 1 THEN RAISE EXCEPTION 'p_days needs a free entry'; END IF;
  RETURN QUERY
    DELETE FROM replay_chunks r
     WHERE (r.site_id, r.visit_id, r.seq) IN (
       SELECT c.site_id, c.visit_id, c.seq
         FROM replay_chunks c
         LEFT JOIN org_plans p ON p.org_id = c.org_id
         LEFT JOIN subscriptions s ON s.org_id = c.org_id
        WHERE c.received_at < now() - make_interval(days => least(p_max_days, greatest(1, coalesce(
                (p_days->>(CASE WHEN s.status = 'restricted' THEN 'restricted'
                                ELSE coalesce(p.plan, 'free') END))::integer,
                (p_days->>'free')::integer))))
        ORDER BY c.received_at
        LIMIT max_rows)
    RETURNING r.object_key;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION pulse_purge_replay_chunks_by_plan(jsonb, integer, integer) FROM PUBLIC;
