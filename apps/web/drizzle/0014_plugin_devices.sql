CREATE TABLE "app"."plugin_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plugin_id" text NOT NULL,
	"kind" text NOT NULL,
	"locator" text NOT NULL,
	"detected_name" text NOT NULL,
	"custom_name" text,
	"type" text,
	"model" text,
	"needs_pairing" boolean DEFAULT false NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"added_by_hand" boolean DEFAULT false NOT NULL,
	"first_seen" timestamp with time zone,
	"last_seen" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plugin_devices_locator_unique" UNIQUE("plugin_id","kind","locator")
);
--> statement-breakpoint
CREATE INDEX "plugin_devices_kind_idx" ON "app"."plugin_devices" USING btree ("plugin_id","kind");