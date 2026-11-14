CREATE TABLE "app"."device_runs" (
	"job_id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"plugin_id" text NOT NULL,
	"kind" text NOT NULL,
	"locator" text NOT NULL,
	"file" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app"."device_runs" ADD CONSTRAINT "device_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_runs_user_idx" ON "app"."device_runs" USING btree ("user_id","created_at");