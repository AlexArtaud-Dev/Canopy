#!/bin/sh
# Bootstraps the per-app roles and schemas described in docs/dev/architecture.md (Data ownership).
# Runs once, on an empty data directory, through the official image's docker-entrypoint-initdb.d.
set -eu

: "${CANOPY_WEB_DB_PASSWORD:?CANOPY_WEB_DB_PASSWORD is required}"
: "${CANOPY_ENGINE_DB_PASSWORD:?CANOPY_ENGINE_DB_PASSWORD is required}"

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v web_password="$CANOPY_WEB_DB_PASSWORD" \
  -v engine_password="$CANOPY_ENGINE_DB_PASSWORD" <<'SQL'
CREATE ROLE canopy_web LOGIN PASSWORD :'web_password';
CREATE ROLE canopy_engine LOGIN PASSWORD :'engine_password';

-- Nobody but the owners may create objects in public.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- Web-owned schemas (Drizzle migrations).
CREATE SCHEMA auth AUTHORIZATION canopy_web;
CREATE SCHEMA app AUTHORIZATION canopy_web;
CREATE SCHEMA audit AUTHORIZATION canopy_web;

-- Engine-owned schemas (goose and River migrations).
CREATE SCHEMA engine AUTHORIZATION canopy_engine;
CREATE SCHEMA river AUTHORIZATION canopy_engine;

-- Engine reads grants and settings from app, read-only.
GRANT USAGE ON SCHEMA app TO canopy_engine;
ALTER DEFAULT PRIVILEGES FOR ROLE canopy_web IN SCHEMA app GRANT SELECT ON TABLES TO canopy_engine;

-- Engine appends audit events and can never read, update or delete them.
GRANT USAGE ON SCHEMA audit TO canopy_engine;
ALTER DEFAULT PRIVILEGES FOR ROLE canopy_web IN SCHEMA audit GRANT INSERT ON TABLES TO canopy_engine;
ALTER DEFAULT PRIVILEGES FOR ROLE canopy_web IN SCHEMA audit GRANT USAGE ON SEQUENCES TO canopy_engine;

ALTER ROLE canopy_web SET search_path = app, auth, audit;
ALTER ROLE canopy_engine SET search_path = engine, river;
SQL
