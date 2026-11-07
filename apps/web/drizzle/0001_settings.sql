-- Schemas are created by the database bootstrap, not by migrations.
CREATE TABLE "app"."settings" (
	"module" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_module_key_pk" PRIMARY KEY("module","key")
);
