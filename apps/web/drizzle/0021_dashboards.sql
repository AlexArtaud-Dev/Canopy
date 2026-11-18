CREATE TABLE "app"."dashboards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"is_home" boolean DEFAULT false NOT NULL,
	"range" text DEFAULT '24h' NOT NULL,
	"refresh_seconds" integer DEFAULT 60 NOT NULL,
	"panels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."dashboards" ADD CONSTRAINT "dashboards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dashboards_user_idx" ON "app"."dashboards" USING btree ("user_id","name");