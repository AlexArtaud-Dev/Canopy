-- +goose Up
-- The schema itself is created by the database bootstrap (owned by the engine role);
-- this first migration only records the baseline so later migrations have a starting point.
COMMENT ON SCHEMA engine IS 'Canopy engine: jobs, job logs, trash index, thumbnails cache';

-- +goose Down
COMMENT ON SCHEMA engine IS NULL;
