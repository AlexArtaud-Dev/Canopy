// Package appsettings reads the settings the web app stores in app.settings (read-only here).
// Only values that differ from the defaults are stored; each module parses its own.
package appsettings

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// undefinedTable is Postgres' code for a missing relation.
const undefinedTable = "42P01"

// Querier is the slice of pgx needed (a pool or a transaction).
type Querier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

// Values are a module's stored settings by key, still JSON-encoded.
type Values map[string]json.RawMessage

// Load reads one module's stored settings. On a fresh install the engine can start before the web
// app has created app.settings: that reads as nothing stored, so defaults apply.
func Load(ctx context.Context, db Querier, module string) (Values, error) {
	values := Values{}
	rows, err := db.Query(ctx, `SELECT key, value FROM app.settings WHERE module = $1`, module)
	if isUndefinedTable(err) {
		return values, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read %s settings: %w", module, err)
	}
	var key string
	var value []byte
	_, err = pgx.ForEachRow(rows, []any{&key, &value}, func() error {
		values[key] = append(json.RawMessage(nil), value...)
		return nil
	})
	if isUndefinedTable(err) {
		return Values{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read %s settings: %w", module, err)
	}
	return values, nil
}

func isUndefinedTable(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == undefinedTable
}
