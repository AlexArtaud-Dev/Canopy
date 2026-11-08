// Package audit records engine-side state changes in the shared, append-only audit log.
package audit

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5/pgconn"
)

// Results of an audited action, as the web app's audit viewer expects them.
const (
	ResultSuccess = "success"
	ResultDenied  = "denied"
	ResultError   = "error"
)

// Event is one audit row. ActorID is the web user id; the engine never sees client addresses.
type Event struct {
	ActorID   string
	Action    string
	Target    string
	Result    string
	RequestID string
	Meta      map[string]any
}

// Execer is the slice of pgx the writer needs.
type Execer interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

// Writer inserts into audit.events (INSERT is the engine role's only privilege there).
type Writer struct {
	db Execer
}

// NewWriter wraps a pool or transaction.
func NewWriter(db Execer) *Writer {
	return &Writer{db: db}
}

// Record writes one event.
func (w *Writer) Record(ctx context.Context, event Event) error {
	meta := event.Meta
	if meta == nil {
		meta = map[string]any{}
	}
	encoded, err := json.Marshal(meta)
	if err != nil {
		return fmt.Errorf("encode audit meta: %w", err)
	}
	_, err = w.db.Exec(ctx, `INSERT INTO audit.events (actor_id, action, target, result, request_id, meta)
VALUES ($1, $2, NULLIF($3, ''), $4, $5, $6)`,
		event.ActorID, event.Action, event.Target, event.Result, event.RequestID, encoded)
	if err != nil {
		return fmt.Errorf("record audit event: %w", err)
	}
	return nil
}
