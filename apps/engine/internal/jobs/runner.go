package jobs

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/riverqueue/river"
	"github.com/riverqueue/river/riverdriver/riverpgxv5"
	"github.com/riverqueue/river/rivermigrate"
	"github.com/riverqueue/river/rivertype"
)

// riverSchema holds River's own tables (created for the engine role by docker/postgres/init).
const riverSchema = "river"

// ErrNotCancellable is returned when cancelling a job that already finished.
var ErrNotCancellable = errors.New("job already finished")

// errCancelledBeforeStart stops River from running a job cancelled while it was queued.
var errCancelledBeforeStart = errors.New("cancelled before start")

// Args are River job arguments that know their engine.jobs row.
type Args interface {
	river.JobArgs
	JobID() string
}

// Handler does the work of one kind and returns its human-readable result. It must stop promptly
// once ctx is cancelled.
type Handler[A Args] func(ctx context.Context, args A, report *Reporter) (map[string]any, error)

// Failure is a job error carrying a code the web app translates.
type Failure struct {
	Code string
	Err  error
}

func (f *Failure) Error() string { return f.Code + ": " + f.Err.Error() }
func (f *Failure) Unwrap() error { return f.Err }

// Outcome maps how a handler ended to the job's terminal state and error code.
func Outcome(runErr, ctxErr error) (state, code string) {
	switch {
	case runErr == nil:
		return StateSucceeded, ""
	case ctxErr != nil:
		return StateCancelled, ""
	}
	var failure *Failure
	if errors.As(runErr, &failure) {
		return StateFailed, failure.Code
	}
	return StateFailed, CodeFailed
}

// Registry collects the job kinds before the runner starts.
type Registry struct {
	workers *river.Workers
	store   *Store
	logger  *slog.Logger
	now     func() time.Time
}

// NewRegistry prepares kind registration against the pool-backed store.
func NewRegistry(pool *pgxpool.Pool, logger *slog.Logger, now func() time.Time) *Registry {
	return &Registry{workers: river.NewWorkers(), store: NewStore(pool), logger: logger, now: now}
}

// Register makes a kind runnable.
func Register[A Args](registry *Registry, handle Handler[A]) {
	river.AddWorker(registry.workers, &worker[A]{store: registry.store, logger: registry.logger, now: registry.now, handle: handle})
}

type worker[A Args] struct {
	river.WorkerDefaults[A]
	store  *Store
	logger *slog.Logger
	now    func() time.Time
	handle Handler[A]
}

// Timeout disables River's default per-job timeout: copies of large trees legitimately take hours.
func (w *worker[A]) Timeout(*river.Job[A]) time.Duration { return -1 }

func (w *worker[A]) Work(ctx context.Context, job *river.Job[A]) error {
	id := job.Args.JobID()
	started := w.now()
	running, err := w.store.MarkRunning(ctx, id, started)
	if err != nil {
		return err
	}
	if !running {
		return river.JobCancel(errCancelledBeforeStart) //nolint:wrapcheck // River must see its own sentinel
	}
	reporter := NewReporter(w.store, id, started, w.now)
	result, runErr := w.handle(ctx, job.Args, reporter)

	// The final writes must land even when the job's context was cancelled.
	final := context.WithoutCancel(ctx)
	if err := reporter.Flush(final); err != nil {
		w.logger.Warn("job progress flush failed", slog.String("jobId", id), slog.Any("error", err))
	}
	state, code := Outcome(runErr, ctx.Err())
	if state == StateFailed {
		w.logger.Error("job failed", slog.String("jobId", id), slog.String("code", code), slog.Any("error", runErr))
	}
	if err := w.store.Finish(final, id, state, result, code, w.now()); err != nil {
		return err
	}
	if runErr != nil {
		// Never retried: replaying a half-done file operation blindly is unsafe.
		return river.JobCancel(runErr) //nolint:wrapcheck // River must see its own sentinel
	}
	return nil
}

// Runner queues and cancels jobs and executes them through River.
type Runner struct {
	pool   *pgxpool.Pool
	client *river.Client[pgx.Tx]
	store  *Store
	now    func() time.Time
}

// Start migrates River's schema, fails jobs a previous process left running, and starts working
// with at most limits.MaxConcurrent jobs at once.
func Start(ctx context.Context, registry *Registry, pool *pgxpool.Pool, limits Limits) (*Runner, error) {
	driver := riverpgxv5.New(pool)
	migrator, err := rivermigrate.New(driver, &rivermigrate.Config{Schema: riverSchema, Logger: registry.logger})
	if err != nil {
		return nil, fmt.Errorf("river migrator: %w", err)
	}
	if _, err := migrator.Migrate(ctx, rivermigrate.DirectionUp, nil); err != nil {
		return nil, fmt.Errorf("river migrate: %w", err)
	}
	interrupted, err := registry.store.FailInterrupted(ctx, registry.now())
	if err != nil {
		return nil, err
	}
	if interrupted > 0 {
		registry.logger.Warn("jobs interrupted by the last shutdown", slog.Int64("count", interrupted))
	}
	client, err := river.NewClient(driver, &river.Config{
		Schema:  riverSchema,
		Logger:  registry.logger,
		Queues:  map[string]river.QueueConfig{river.QueueDefault: {MaxWorkers: limits.MaxConcurrent}},
		Workers: registry.workers,
	})
	if err != nil {
		return nil, fmt.Errorf("river client: %w", err)
	}
	// River stops when its start context ends; it must outlive startup and only stop via Stop.
	if err := client.Start(context.WithoutCancel(ctx)); err != nil {
		return nil, fmt.Errorf("river start: %w", err)
	}
	return &Runner{pool: pool, client: client, store: registry.store, now: registry.now}, nil
}

// Stop cancels running jobs (they end as cancelled) and waits for workers to return.
func (r *Runner) Stop(ctx context.Context) error {
	if err := r.client.StopAndCancel(ctx); err != nil {
		return fmt.Errorf("river stop: %w", err)
	}
	return nil
}

// Store gives read access to jobs (listing, logs).
func (r *Runner) Store() *Store { return r.store }

// Enqueue records a job and queues it in one transaction, refusing it when the owner already has
// as many active jobs as the per-user setting allows. build receives the new job's id.
func Enqueue[A Args](ctx context.Context, r *Runner, owner, target string, build func(id string) A) (string, error) {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return "", fmt.Errorf("begin: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	store := NewStore(tx)
	if err := store.LockOwner(ctx, owner); err != nil {
		return "", err
	}
	limits, err := LoadLimits(ctx, tx)
	if err != nil {
		return "", err
	}
	active, err := store.CountActive(ctx, owner)
	if err != nil {
		return "", err
	}
	if err := CheckPerUser(active, limits); err != nil {
		return "", err
	}
	var zero A
	id, err := store.Create(ctx, zero.Kind(), owner, target)
	if err != nil {
		return "", err
	}
	inserted, err := r.client.InsertTx(ctx, tx, build(id), &river.InsertOpts{MaxAttempts: 1})
	if err != nil {
		return "", fmt.Errorf("queue job: %w", err)
	}
	if err := store.SetRiverID(ctx, id, inserted.Job.ID); err != nil {
		return "", err
	}
	if err := tx.Commit(ctx); err != nil {
		return "", fmt.Errorf("commit: %w", err)
	}
	return id, nil
}

// Cancel stops a queued job at once, or asks a running one to stop.
func (r *Runner) Cancel(ctx context.Context, job Job) error {
	if IsTerminal(job.State) {
		return ErrNotCancellable
	}
	if _, err := r.store.CancelQueued(ctx, job.ID, r.now()); err != nil {
		return err
	}
	if job.RiverID == nil {
		return nil
	}
	if _, err := r.client.JobCancel(ctx, *job.RiverID); err != nil && !errors.Is(err, rivertype.ErrNotFound) {
		return fmt.Errorf("cancel river job: %w", err)
	}
	return nil
}
