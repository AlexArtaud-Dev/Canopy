CREATE TABLE "app"."default_devices" (
	"user_id" text NOT NULL,
	"plugin_id" text NOT NULL,
	"kind" text NOT NULL,
	"device_id" uuid NOT NULL,
	CONSTRAINT "default_devices_user_id_plugin_id_kind_pk" PRIMARY KEY("user_id","plugin_id","kind")
);
--> statement-breakpoint
ALTER TABLE "app"."default_devices" ADD CONSTRAINT "default_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."default_devices" ADD CONSTRAINT "default_devices_device_id_plugin_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "app"."plugin_devices"("id") ON DELETE cascade ON UPDATE no action;