# Background jobs

Every operation that can take more than a second runs as a job in the engine: live progress,
cancel, a human-readable result. River (Postgres queue, schema `river`) executes jobs;
`engine.jobs` is Canopy's own view of them and `engine.job_logs` keeps their output.

## Lifecycle

`queued → running → succeeded | failed | cancelled`

- A job is created and queued in one transaction, after checking the per-user cap
  (`jobs.perUser`, serialised per person with an advisory lock). Over the cap: `429 jobs.too_many`.
- Jobs are never retried: replaying a half-done file operation blindly is unsafe.
- Cancel: a queued job is cancelled at once; a running one has its context cancelled and ends as
  `cancelled` as soon as its handler notices. Cancelling a finished job: `409 jobs.not_cancellable`.
- On engine shutdown running jobs are cancelled; jobs a crashed process left `running` are marked
  `failed` (`jobs.interrupted`) at the next start.
- Failures carry a code (`jobs.Failure`) the web app translates; unknown errors become `jobs.failed`.

## Progress and events

- Handlers report through `jobs.Reporter`: progress is persisted at most once a second (rate and
  ETA derived), output lines are capped at 1000 per job.
- A trigger on `engine.jobs` sends `NOTIFY canopy_jobs` with `{id, owner}` on every change; one
  listener in the engine fans notices out to subscribers.
- `GET /v1/jobs/events` streams them as Server-Sent Events (`event: job`, data is a `Job`), with a
  heartbeat every 25 s. It is a plain chi handler (strict handlers cannot flush), documented here
  rather than in the OpenAPI spec.

## Visibility and audit

People see and cancel their own jobs; administrators (`system:admin`) see every job. The engine
writes `jobs.start` and `jobs.cancel` to the audit log.

## Kinds

| Kind          | Endpoint                    | Does                                                                                                        |
| ------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `folder_size` | `POST /v1/jobs/folder-size` | Adds up files the person may read under a folder; folders they may not enter are skipped and counted apart. |

Adding a kind: an args type (`Kind()`, `JobID()`), a `jobs.Handler`, `jobs.Register` in
`cmd/engine`, and an endpoint calling `jobs.Enqueue`.

## Settings (Administration › Settings › Background jobs)

| Key                  | Default | Notes                                  |
| -------------------- | ------- | -------------------------------------- |
| `jobs.maxConcurrent` | 4       | Jobs running at once; needs a restart. |
| `jobs.perUser`       | 3       | Queued or running jobs per person.     |
