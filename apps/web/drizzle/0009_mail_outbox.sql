CREATE TABLE "app"."mail_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"recipient" text NOT NULL,
	"subject" text NOT NULL,
	"html" text NOT NULL,
	"text" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "mail_outbox_status_check" CHECK ("app"."mail_outbox"."status" IN ('queued', 'sent', 'failed'))
);
--> statement-breakpoint
CREATE INDEX "mail_outbox_due_idx" ON "app"."mail_outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "mail_outbox_created_idx" ON "app"."mail_outbox" USING btree ("created_at" DESC NULLS LAST);