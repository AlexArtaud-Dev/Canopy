ALTER TABLE "app"."shares" ADD COLUMN "kind" text DEFAULT 'download' NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."shares" ADD COLUMN "allowed_extensions" text[];--> statement-breakpoint
ALTER TABLE "app"."shares" ADD COLUMN "max_file_bytes" bigint;--> statement-breakpoint
ALTER TABLE "app"."shares" ADD COLUMN "max_total_bytes" bigint;--> statement-breakpoint
ALTER TABLE "app"."shares" ADD COLUMN "max_files" integer;--> statement-breakpoint
ALTER TABLE "app"."shares" ADD COLUMN "uploaded_bytes" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."shares" ADD COLUMN "uploaded_files" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."shares" ADD CONSTRAINT "shares_kind_check" CHECK ("app"."shares"."kind" IN ('download', 'upload'));