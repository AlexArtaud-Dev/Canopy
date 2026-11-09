-- +goose Up
-- Index of cached thumbnails (files in the cache folder, named by key): lets the engine evict the
-- least recently used ones when the cache exceeds its size setting.
CREATE TABLE engine.thumbnails (
    key      text PRIMARY KEY,
    bytes    bigint NOT NULL,
    used_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX thumbnails_used_at_idx ON engine.thumbnails (used_at);

-- +goose Down
DROP TABLE engine.thumbnails;
