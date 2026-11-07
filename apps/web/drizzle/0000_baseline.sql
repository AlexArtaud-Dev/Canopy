-- Baseline: the schemas themselves are created by the database bootstrap (owned by canopy_web).
COMMENT ON SCHEMA auth IS 'Canopy web: users, sessions, two-factor';
--> statement-breakpoint
COMMENT ON SCHEMA app IS 'Canopy web: groups, roles, grants, settings, plugins registry';
--> statement-breakpoint
COMMENT ON SCHEMA audit IS 'Canopy web: append-only audit events';
