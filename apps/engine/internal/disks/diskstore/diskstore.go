// Package diskstore keeps the disks' latest reading and pending alerts in Postgres
// (engine.disk_readings, engine.disk_alerts).
package diskstore

import (
	"cmp"
	"context"
	"encoding/json"
	"fmt"
	"slices"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/disks"
)

// Store is a disks.Store on a pool.
type Store struct {
	Pool *pgxpool.Pool
	Now  func() time.Time
}

// Load reads the latest reading, in the order the disks were found.
func (s Store) Load(ctx context.Context) (disks.State, error) {
	rows, err := s.Pool.Query(ctx, `SELECT disk, checked_at FROM engine.disk_readings ORDER BY position`)
	if err != nil {
		return disks.State{}, fmt.Errorf("read disks: %w", err)
	}
	state := disks.State{Disks: []disks.Disk{}}
	var raw []byte
	var checkedAt time.Time
	_, err = pgx.ForEachRow(rows, []any{&raw, &checkedAt}, func() error {
		var disk disks.Disk
		if err := json.Unmarshal(raw, &disk); err != nil {
			return fmt.Errorf("decode disk: %w", err)
		}
		state.Disks = append(state.Disks, disk)
		at := checkedAt
		state.CheckedAt = &at
		return nil
	})
	if err != nil {
		return disks.State{}, fmt.Errorf("read disks: %w", err)
	}
	return state, nil
}

// Save replaces the reading and queues the alerts in one transaction.
func (s Store) Save(ctx context.Context, state disks.State, alerts []disks.Alert) error {
	checkedAt := s.Now()
	if state.CheckedAt != nil {
		checkedAt = *state.CheckedAt
	}
	ids := make([]string, len(state.Disks))
	encoded := make([][]byte, len(state.Disks))
	for index, disk := range state.Disks {
		data, err := json.Marshal(disk)
		if err != nil {
			return fmt.Errorf("encode disk: %w", err)
		}
		ids[index], encoded[index] = disk.ID, data
	}
	queued := make([][]byte, len(alerts))
	for index, alert := range alerts {
		data, err := json.Marshal(alert)
		if err != nil {
			return fmt.Errorf("encode alert: %w", err)
		}
		queued[index] = data
	}
	err := pgx.BeginFunc(ctx, s.Pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `DELETE FROM engine.disk_readings`); err != nil {
			return fmt.Errorf("clear disks: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO engine.disk_readings (id, position, disk, checked_at)
			SELECT id, position, disk, $3
			FROM unnest($1::text[], $2::jsonb[]) WITH ORDINALITY AS reading(id, disk, position)`,
			ids, encoded, checkedAt); err != nil {
			return fmt.Errorf("save disks: %w", err)
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO engine.disk_alerts (alert, created_at) SELECT alert, $2 FROM unnest($1::jsonb[]) AS a(alert)`,
			queued, checkedAt); err != nil {
			return fmt.Errorf("queue disk alerts: %w", err)
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("save disks: %w", err)
	}
	return nil
}

// Claim hands out queued alerts once, even with several engines (SKIP LOCKED).
func (s Store) Claim(ctx context.Context, limit int) ([]disks.Alert, error) {
	rows, err := s.Pool.Query(ctx, `
		UPDATE engine.disk_alerts SET claimed_at = $2
		WHERE id IN (
			SELECT id FROM engine.disk_alerts WHERE claimed_at IS NULL ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED
		)
		RETURNING id, alert`, limit, s.Now())
	if err != nil {
		return nil, fmt.Errorf("claim disk alerts: %w", err)
	}
	type claimed struct {
		id    int64
		alert disks.Alert
	}
	var all []claimed
	var id int64
	var raw []byte
	_, err = pgx.ForEachRow(rows, []any{&id, &raw}, func() error {
		var alert disks.Alert
		if err := json.Unmarshal(raw, &alert); err != nil {
			return fmt.Errorf("decode alert: %w", err)
		}
		all = append(all, claimed{id: id, alert: alert})
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("claim disk alerts: %w", err)
	}
	// RETURNING has no order: oldest first, as queued.
	slices.SortFunc(all, func(a, b claimed) int { return cmp.Compare(a.id, b.id) })
	alerts := make([]disks.Alert, len(all))
	for index, entry := range all {
		alerts[index] = entry.alert
	}
	return alerts, nil
}

// Purge forgets alerts delivered before a time.
func (s Store) Purge(ctx context.Context, before time.Time) error {
	if _, err := s.Pool.Exec(ctx, `DELETE FROM engine.disk_alerts WHERE claimed_at < $1`, before); err != nil {
		return fmt.Errorf("purge disk alerts: %w", err)
	}
	return nil
}
