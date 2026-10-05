CREATE TABLE "org_plans" (
	"org_id" text PRIMARY KEY NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "org_plans" ADD CONSTRAINT "org_plans_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;