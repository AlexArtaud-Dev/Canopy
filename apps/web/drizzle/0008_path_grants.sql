CREATE TABLE "app"."path_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"path" text NOT NULL,
	"actions" text[] NOT NULL,
	"effect" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "path_grants_subject_type_check" CHECK ("app"."path_grants"."subject_type" IN ('user', 'group')),
	CONSTRAINT "path_grants_effect_check" CHECK ("app"."path_grants"."effect" IN ('allow', 'deny')),
	CONSTRAINT "path_grants_path_check" CHECK ("app"."path_grants"."path" LIKE '/%')
);
--> statement-breakpoint
CREATE INDEX "path_grants_subject_idx" ON "app"."path_grants" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "path_grants_path_idx" ON "app"."path_grants" USING btree ("path");