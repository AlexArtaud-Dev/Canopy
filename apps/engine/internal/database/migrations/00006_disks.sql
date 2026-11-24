-- +goose Up
-- The latest reading of each disk (smartctl, through the disks service) and the alerts it raised.
CREATE TABLE engine.disk_readings (
    id          text PRIMARY KEY,
    position    integer NOT NULL,
    disk        jsonb NOT NULL,
    checked_at  timestamptz NOT NULL
);

-- Alerts wait here until the web app claims them (once) and notifies the people concerned.
CREATE TABLE engine.disk_alerts (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    alert       jsonb NOT NULL,
    created_at  timestamptz NOT NULL,
    claimed_at  timestamptz
);
CREATE INDEX disk_alerts_unclaimed_idx ON engine.disk_alerts (id) WHERE claimed_at IS NULL;
CREATE INDEX disk_alerts_claimed_at_idx ON engine.disk_alerts (claimed_at);

-- +goose Down
DROP TABLE engine.disk_alerts;
DROP TABLE engine.disk_readings;
