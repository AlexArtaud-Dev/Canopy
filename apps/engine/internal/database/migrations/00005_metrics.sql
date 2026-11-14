-- +goose Up
-- Values the engine samples for dashboards: raw samples for a short window, hourly rollups for a
-- longer one (both purged by the metrics service, durations set by administrators).
CREATE TABLE engine.metric_samples (
    metric  text NOT NULL,
    -- One series of a metric (a volume's name), '' when the metric has a single series.
    series  text NOT NULL DEFAULT '',
    at      timestamptz NOT NULL,
    value   double precision NOT NULL,
    PRIMARY KEY (metric, series, at)
);
CREATE INDEX metric_samples_at_idx ON engine.metric_samples (at);

CREATE TABLE engine.metric_hourly (
    metric   text NOT NULL,
    series   text NOT NULL DEFAULT '',
    hour     timestamptz NOT NULL,
    avg      double precision NOT NULL,
    min      double precision NOT NULL,
    max      double precision NOT NULL,
    samples  integer NOT NULL,
    PRIMARY KEY (metric, series, hour)
);
CREATE INDEX metric_hourly_hour_idx ON engine.metric_hourly (hour);

-- +goose Down
DROP TABLE engine.metric_hourly;
DROP TABLE engine.metric_samples;
