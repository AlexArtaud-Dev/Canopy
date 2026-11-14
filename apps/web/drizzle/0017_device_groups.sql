CREATE TABLE "app"."device_groups" (
	"device_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	CONSTRAINT "device_groups_device_id_group_id_pk" PRIMARY KEY("device_id","group_id")
);
--> statement-breakpoint
ALTER TABLE "app"."device_groups" ADD CONSTRAINT "device_groups_device_id_plugin_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "app"."plugin_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."device_groups" ADD CONSTRAINT "device_groups_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "auth"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "device_groups_group_idx" ON "app"."device_groups" USING btree ("group_id");