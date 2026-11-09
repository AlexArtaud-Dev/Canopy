CREATE TABLE "app"."shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"token_sealed" text NOT NULL,
	"owner_id" text NOT NULL,
	"path" text NOT NULL,
	"name" text NOT NULL,
	"is_directory" boolean NOT NULL,
	"password_hash" text,
	"expires_at" timestamp with time zone NOT NULL,
	"max_downloads" integer,
	"download_count" integer DEFAULT 0 NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_access_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shares_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "shares_path_check" CHECK ("app"."shares"."path" LIKE '/%'),
	CONSTRAINT "shares_max_downloads_check" CHECK ("app"."shares"."max_downloads" IS NULL OR "app"."shares"."max_downloads" > 0)
);
--> statement-breakpoint
ALTER TABLE "app"."shares" ADD CONSTRAINT "shares_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shares_owner_id_idx" ON "app"."shares" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "shares_expires_at_idx" ON "app"."shares" USING btree ("expires_at");