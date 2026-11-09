-- +goose Up
-- Installed plugins: their manifest (catalog commands), version and switches. Binaries live in
-- the plugins folder, checked against their release checksums before they were stored.
CREATE TABLE engine.plugins (
    id            text PRIMARY KEY,
    version       text NOT NULL,
    repo          text NOT NULL,
    manifest      bytea NOT NULL,
    enabled       boolean NOT NULL DEFAULT true,
    pinned        boolean NOT NULL DEFAULT false,
    installed_at  timestamptz NOT NULL DEFAULT now(),
    installed_by  text NOT NULL
);

-- +goose Down
DROP TABLE engine.plugins;
