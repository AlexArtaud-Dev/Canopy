-- +goose Up
-- Our view of every long operation; River (schema `river`) executes them and keeps their
-- arguments.
CREATE TABLE engine.jobs (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    river_id      bigint,
    kind          text NOT NULL,
    owner_id      text NOT NULL,
    state         text NOT NULL DEFAULT 'queued'
                  CHECK (state IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
    target        text,
    bytes_done    bigint NOT NULL DEFAULT 0,
    bytes_total   bigint,
    items_done    bigint NOT NULL DEFAULT 0,
    items_total   bigint,
    current_path  text,
    rate_bps      bigint,
    eta_seconds   integer,
    result        jsonb,
    error_code    text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    started_at    timestamptz,
    finished_at   timestamptz,
    updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jobs_owner_created_idx ON engine.jobs (owner_id, created_at DESC);
CREATE INDEX jobs_state_idx ON engine.jobs (state);

-- Capped output of a job (external commands, warnings), shown live in the UI.
CREATE TABLE engine.job_logs (
    job_id  uuid NOT NULL REFERENCES engine.jobs (id) ON DELETE CASCADE,
    seq     integer NOT NULL,
    at      timestamptz NOT NULL DEFAULT now(),
    level   text NOT NULL CHECK (level IN ('info', 'warn', 'error')),
    line    text NOT NULL,
    PRIMARY KEY (job_id, seq)
);

-- Every change is announced so the event stream can push it to browsers at once.
-- +goose StatementBegin
CREATE FUNCTION engine.notify_job_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_notify('canopy_jobs', json_build_object('id', NEW.id, 'owner', NEW.owner_id)::text);
    RETURN NULL;
END;
$$;
-- +goose StatementEnd
CREATE TRIGGER jobs_notify AFTER INSERT OR UPDATE ON engine.jobs
    FOR EACH ROW EXECUTE FUNCTION engine.notify_job_change();

-- +goose Down
DROP TRIGGER jobs_notify ON engine.jobs;
DROP FUNCTION engine.notify_job_change();
DROP TABLE engine.job_logs;
DROP TABLE engine.jobs;
