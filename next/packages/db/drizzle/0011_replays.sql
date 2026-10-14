CREATE TABLE "replay_chunks" (
	"site_id" text NOT NULL,
	"visit_id" text NOT NULL,
	"seq" integer NOT NULL,
	"org_id" text NOT NULL,
	"bytes" integer NOT NULL,
	"object_key" text NOT NULL,
	"events" integer NOT NULL,
	"first_ts" timestamp with time zone NOT NULL,
	"last_ts" timestamp with time zone NOT NULL,
	"has_snapshot" boolean DEFAULT false NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "replay_chunks_site_id_visit_id_seq_pk" PRIMARY KEY("site_id","visit_id","seq")
);
--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "replay_sample_rate" real DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "replay_chunks" ADD CONSTRAINT "replay_chunks_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "replay_chunks" ADD CONSTRAINT "replay_chunks_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "replay_chunks_org_received_idx" ON "replay_chunks" USING btree ("org_id","received_at");--> statement-breakpoint
CREATE INDEX "replay_chunks_org_visit_idx" ON "replay_chunks" USING btree ("org_id","visit_id");--> statement-breakpoint
-- Replay chunks: tenant isolation, integrity checks, and the cross-org helpers ingest and retention need.

ALTER TABLE "replay_chunks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "replay_chunks" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "replay_chunks_org_isolation" ON "replay_chunks"
  USING ("org_id" = current_setting('app.org_id', true))
  WITH CHECK ("org_id" = current_setting('app.org_id', true));--> statement-breakpoint

-- A chunk's site must belong to the chunk's org (RLS checks org_id; this checks the pair).
ALTER TABLE "replay_chunks" ADD CONSTRAINT "replay_chunks_site_org_fk" FOREIGN KEY ("site_id", "org_id")
  REFERENCES "sites" ("id", "org_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "replay_chunks" ADD CONSTRAINT "replay_chunks_seq_ck" CHECK ("seq" >= 0 AND "seq" <= 100000);--> statement-breakpoint
ALTER TABLE "replay_chunks" ADD CONSTRAINT "replay_chunks_bytes_ck" CHECK ("bytes" > 0 AND "bytes" <= 524288);--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_replay_sample_rate_ck"
  CHECK ("replay_sample_rate" >= 0 AND "replay_sample_rate" <= 1);--> statement-breakpoint

-- The collector's lookup now also returns the replay sampling rate (return type changes → drop first).
DROP FUNCTION IF EXISTS pulse_site_by_public_key(text);--> statement-breakpoint
CREATE FUNCTION pulse_site_by_public_key(p_key text)
RETURNS TABLE (id text, org_id text, allowed_origins text[], status text, replay_sample_rate real)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.org_id, s.allowed_origins, s.status, s.replay_sample_rate
  FROM sites s
  WHERE s.public_key = p_key AND s.deleted_at IS NULL
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION pulse_site_by_public_key(text) FROM PUBLIC;--> statement-breakpoint

/**
 * Retention: deletes up to `max_rows` replay chunks received more than `keep_days` ago, across
 * orgs, and returns their object keys so the worker can delete the blobs.
 */
CREATE OR REPLACE FUNCTION pulse_purge_replay_chunks(keep_days integer, max_rows integer DEFAULT 5000)
RETURNS TABLE (object_key text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF keep_days < 1 OR keep_days > 3650 THEN RAISE EXCEPTION 'keep_days out of range'; END IF;
  IF max_rows < 1 OR max_rows > 100000 THEN RAISE EXCEPTION 'max_rows out of range'; END IF;
  RETURN QUERY
    DELETE FROM replay_chunks r
     WHERE (r.site_id, r.visit_id, r.seq) IN (
       SELECT c.site_id, c.visit_id, c.seq FROM replay_chunks c
        WHERE c.received_at < now() - make_interval(days => keep_days)
        ORDER BY c.received_at
        LIMIT max_rows)
    RETURNING r.object_key;
END $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION pulse_purge_replay_chunks(integer, integer) FROM PUBLIC;
