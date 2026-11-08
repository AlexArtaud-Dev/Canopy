package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// Channel is the Postgres NOTIFY channel carrying `{"id","owner"}` on every job change (sent by
// a trigger, migration 00002).
const Channel = "canopy_jobs"

// ErrNotFound means the job does not exist (or is hidden from the caller).
var ErrNotFound = errors.New("job not found")

// Job is one row of engine.jobs.
type Job struct {
	ID         string
	RiverID    *int64
	Kind       string
	OwnerID    string
	State      string
	Target     *string
	Snapshot   Snapshot
	Result     map[string]any
	ErrorCode  *string
	CreatedAt  time.Time
	StartedAt  *time.Time
	FinishedAt *time.Time
}

// LogLine is one captured output line.
type LogLine struct {
	Seq   int
	At    time.Time
	Level string
	Line  string
}

// DB is the slice of pgx the store needs (a pool or a transaction).
type DB interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

// Store persists jobs and announces every change on Channel.
type Store struct {
	db DB
}

// NewStore wraps a pool or transaction.
func NewStore(db DB) *Store {
	return &Store{db: db}
}

const jobColumns = `id::text, river_id, kind, owner_id, state, target, bytes_done, bytes_total,
items_done, items_total, current_path, rate_bps, eta_seconds, result, error_code, created_at,
started_at, finished_at`

func scanJob(row pgx.Row) (Job, error) {
	var job Job
	var eta *int32
	var current *string
	var result []byte
	err := row.Scan(&job.ID, &job.RiverID, &job.Kind, &job.OwnerID, &job.State, &job.Target,
		&job.Snapshot.BytesDone, &job.Snapshot.BytesTotal, &job.Snapshot.ItemsDone,
		&job.Snapshot.ItemsTotal, &current, &job.Snapshot.RateBps, &eta, &result,
		&job.ErrorCode, &job.CreatedAt, &job.StartedAt, &job.FinishedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Job{}, ErrNotFound
	}
	if err != nil {
		return Job{}, fmt.Errorf("scan job: %w", err)
	}
	job.Snapshot.EtaSeconds = eta
	if current != nil {
		job.Snapshot.CurrentPath = *current
	}
	if len(result) > 0 {
		if err := json.Unmarshal(result, &job.Result); err != nil {
			return Job{}, fmt.Errorf("decode job result: %w", err)
		}
	}
	return job, nil
}

// CountActive counts the owner's queued and running jobs.
func (s *Store) CountActive(ctx context.Context, owner string) (int, error) {
	var count int
	err := s.db.QueryRow(ctx,
		`SELECT count(*) FROM engine.jobs WHERE owner_id = $1 AND state IN ('queued', 'running')`,
		owner).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("count active jobs: %w", err)
	}
	return count, nil
}

// LockOwner serialises job creation per owner until the transaction ends, so the per-user cap
// cannot be raced by parallel requests.
func (s *Store) LockOwner(ctx context.Context, owner string) error {
	if _, err := s.db.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtext('jobs:' || $1))`, owner); err != nil {
		return fmt.Errorf("lock job owner: %w", err)
	}
	return nil
}

// Create inserts a queued job and returns its id.
func (s *Store) Create(ctx context.Context, kind, owner, target string) (string, error) {
	var id string
	err := s.db.QueryRow(ctx, `INSERT INTO engine.jobs (kind, owner_id, target)
VALUES ($1, $2, $3) RETURNING id::text`,
		kind, owner, target).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("create job: %w", err)
	}
	return id, nil
}

// SetRiverID links the job to the River row executing it.
func (s *Store) SetRiverID(ctx context.Context, id string, riverID int64) error {
	if _, err := s.db.Exec(ctx, `UPDATE engine.jobs SET river_id = $2 WHERE id = $1`, id, riverID); err != nil {
		return fmt.Errorf("link river job: %w", err)
	}
	return nil
}

// MarkRunning moves a queued job to running; false when it was cancelled meanwhile.
func (s *Store) MarkRunning(ctx context.Context, id string, at time.Time) (bool, error) {
	return s.transition(ctx, `UPDATE engine.jobs SET state = 'running', started_at = $2, updated_at = $2
WHERE id = $1 AND state = 'queued' `, id, at)
}

// CancelQueued cancels a job that has not started; false when it is no longer queued.
func (s *Store) CancelQueued(ctx context.Context, id string, at time.Time) (bool, error) {
	return s.transition(ctx, `UPDATE engine.jobs SET state = 'cancelled', finished_at = $2, updated_at = $2
WHERE id = $1 AND state = 'queued' `, id, at)
}

// SaveProgress records a running job's progress.
func (s *Store) SaveProgress(ctx context.Context, id string, snapshot Snapshot, at time.Time) error {
	_, err := s.transition(ctx, `UPDATE engine.jobs SET bytes_done = $3, bytes_total = $4,
items_done = $5, items_total = $6, current_path = $7, rate_bps = $8, eta_seconds = $9, updated_at = $2
WHERE id = $1 AND state = 'running' `, id, at,
		snapshot.BytesDone, snapshot.BytesTotal, snapshot.ItemsDone, snapshot.ItemsTotal,
		nullable(snapshot.CurrentPath), snapshot.RateBps, snapshot.EtaSeconds)
	return err
}

// Finish moves a job to a terminal state with its result or error code.
func (s *Store) Finish(ctx context.Context, id, state string, result map[string]any, errorCode string, at time.Time) error {
	var encoded []byte
	if result != nil {
		var err error
		if encoded, err = json.Marshal(result); err != nil {
			return fmt.Errorf("encode job result: %w", err)
		}
	}
	_, err := s.transition(ctx, `UPDATE engine.jobs SET state = $3, result = $4, error_code = $5,
current_path = NULL, rate_bps = NULL, eta_seconds = NULL, finished_at = $2, updated_at = $2
WHERE id = $1 AND state IN ('queued', 'running') `,
		id, at, state, encoded, nullable(errorCode))
	return err
}

// FailInterrupted fails jobs left running by a previous engine process (crash or restart).
func (s *Store) FailInterrupted(ctx context.Context, at time.Time) (int64, error) {
	tag, err := s.db.Exec(ctx, `UPDATE engine.jobs SET state = 'failed', error_code = $2,
finished_at = $1, updated_at = $1 WHERE state = 'running'`, at, CodeInterrupted)
	if err != nil {
		return 0, fmt.Errorf("fail interrupted jobs: %w", err)
	}
	return tag.RowsAffected(), nil
}

func (s *Store) transition(ctx context.Context, update, id string, args ...any) (bool, error) {
	tag, err := s.db.Exec(ctx, update, append([]any{id}, args...)...)
	if err != nil {
		return false, fmt.Errorf("update job: %w", err)
	}
	return tag.RowsAffected() > 0, nil
}

// Get loads one job; owner "" skips the ownership check (administrators).
func (s *Store) Get(ctx context.Context, id, owner string) (Job, error) {
	return scanJob(s.db.QueryRow(ctx, `SELECT `+jobColumns+` FROM engine.jobs
WHERE id::text = $1 AND ($2 = '' OR owner_id = $2)`, id, owner))
}

// List returns the newest jobs; owner "" lists everyone's (administrators).
func (s *Store) List(ctx context.Context, owner string, limit int) ([]Job, error) {
	rows, err := s.db.Query(ctx, `SELECT `+jobColumns+` FROM engine.jobs
WHERE $1 = '' OR owner_id = $1 ORDER BY created_at DESC LIMIT $2`, owner, limit)
	if err != nil {
		return nil, fmt.Errorf("list jobs: %w", err)
	}
	defer rows.Close()
	var jobs []Job
	for rows.Next() {
		job, err := scanJob(rows)
		if err != nil {
			return nil, err
		}
		jobs = append(jobs, job)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("list jobs: %w", err)
	}
	return jobs, nil
}

// AppendLog stores one output line and drops lines beyond MaxLogLines.
func (s *Store) AppendLog(ctx context.Context, id string, seq int, level, line string, at time.Time) error {
	_, err := s.db.Exec(ctx, `WITH added AS (
INSERT INTO engine.job_logs (job_id, seq, at, level, line) VALUES ($1, $2, $3, $4, $5))
DELETE FROM engine.job_logs WHERE job_id = $1 AND seq <= $2 - $6`, id, seq, at, level, line, MaxLogLines)
	if err != nil {
		return fmt.Errorf("append job log: %w", err)
	}
	return nil
}

// Logs returns the kept lines after a sequence number.
func (s *Store) Logs(ctx context.Context, id string, after int) ([]LogLine, error) {
	rows, err := s.db.Query(ctx, `SELECT seq, at, level, line FROM engine.job_logs
WHERE job_id = $1 AND seq > $2 ORDER BY seq`, id, after)
	if err != nil {
		return nil, fmt.Errorf("read job logs: %w", err)
	}
	lines, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (LogLine, error) {
		var line LogLine
		scanErr := row.Scan(&line.Seq, &line.At, &line.Level, &line.Line)
		return line, scanErr //nolint:wrapcheck // wrapped below
	})
	if err != nil {
		return nil, fmt.Errorf("read job logs: %w", err)
	}
	return lines, nil
}

func nullable(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}
