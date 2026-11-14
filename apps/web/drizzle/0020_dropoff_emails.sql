ALTER TABLE "app"."share_drop_offs" ADD COLUMN "emailed_file_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."shares" ADD COLUMN "notify_by_email" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "share_drop_offs_last_upload_idx" ON "app"."share_drop_offs" USING btree ("last_upload_at");