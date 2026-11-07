CREATE TABLE "audit"."events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" text,
	"actor_ip" "inet",
	"action" text NOT NULL,
	"target" text,
	"result" text NOT NULL,
	"request_id" text NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "events_occurred_at_idx" ON "audit"."events" USING btree ("occurred_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "events_actor_id_idx" ON "audit"."events" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "events_action_idx" ON "audit"."events" USING btree ("action");--> statement-breakpoint
CREATE INDEX "events_result_idx" ON "audit"."events" USING btree ("result");--> statement-breakpoint
ALTER TABLE "audit"."events" ADD CONSTRAINT "events_result_check" CHECK ("result" IN ('success', 'denied', 'error'));--> statement-breakpoint
-- Append-only guard: no UPDATE ever; DELETE only from the retention purge, which runs
-- `SET LOCAL canopy.audit_purge = 'on'` in its transaction.
CREATE FUNCTION "audit"."events_append_only"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('canopy.audit_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit.events is append-only (% rejected)', TG_OP USING ERRCODE = 'insufficient_privilege';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "events_append_only" BEFORE UPDATE OR DELETE ON "audit"."events"
  FOR EACH ROW EXECUTE FUNCTION "audit"."events_append_only"();--> statement-breakpoint
CREATE TRIGGER "events_no_truncate" BEFORE TRUNCATE ON "audit"."events"
  FOR EACH STATEMENT EXECUTE FUNCTION "audit"."events_append_only"();
