CREATE TABLE "app"."share_drop_off_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"drop_off_id" uuid NOT NULL,
	"name" text NOT NULL,
	"bytes" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."share_drop_offs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"share_id" uuid NOT NULL,
	"name" text,
	"email" text,
	"verified_at" timestamp with time zone,
	"code_hash" text,
	"code_expires_at" timestamp with time zone,
	"code_attempts" integer DEFAULT 0 NOT NULL,
	"file_count" integer DEFAULT 0 NOT NULL,
	"byte_count" bigint DEFAULT 0 NOT NULL,
	"last_upload_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."shares" ADD COLUMN "identity" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."share_drop_off_files" ADD CONSTRAINT "share_drop_off_files_drop_off_id_share_drop_offs_id_fk" FOREIGN KEY ("drop_off_id") REFERENCES "app"."share_drop_offs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."share_drop_offs" ADD CONSTRAINT "share_drop_offs_share_id_shares_id_fk" FOREIGN KEY ("share_id") REFERENCES "app"."shares"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "share_drop_off_files_drop_off_idx" ON "app"."share_drop_off_files" USING btree ("drop_off_id");--> statement-breakpoint
CREATE INDEX "share_drop_offs_share_idx" ON "app"."share_drop_offs" USING btree ("share_id","created_at");--> statement-breakpoint
CREATE INDEX "share_drop_offs_created_idx" ON "app"."share_drop_offs" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "app"."shares" ADD CONSTRAINT "shares_identity_check" CHECK ("app"."shares"."identity" IN ('none', 'declared', 'verified'));