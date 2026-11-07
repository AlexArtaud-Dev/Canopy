// Package grantstore loads path grants for the pure authz package.
package grantstore

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/authz"
)

// Querier is the slice of pgx the store needs (a pool or a transaction).
type Querier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

// Store loads grants written by the web app (app.path_grants, read-only for the engine).
type Store struct {
	db Querier
}

// NewStore wraps a pool or transaction.
func NewStore(db Querier) *Store {
	return &Store{db: db}
}

const grantsQuery = `
SELECT id::text, subject_type, subject_id, path, actions, effect FROM app.path_grants
WHERE (subject_type = 'user' AND subject_id = $1)
   OR (subject_type = 'group' AND subject_id = ANY($2::text[]))`

// GrantsFor returns every grant that can apply to the subject (user and group rows).
func (s *Store) GrantsFor(ctx context.Context, subject authz.Subject) ([]authz.Grant, error) {
	groups := subject.Groups
	if groups == nil {
		groups = []string{}
	}
	rows, err := s.db.Query(ctx, grantsQuery, subject.UserID, groups)
	if err != nil {
		return nil, fmt.Errorf("query grants: %w", err)
	}
	grants, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (authz.Grant, error) {
		var grant authz.Grant
		scanErr := row.Scan(&grant.ID, &grant.SubjectType, &grant.SubjectID, &grant.Path, &grant.Actions, &grant.Effect)
		return grant, scanErr //nolint:wrapcheck // wrapped below with the query context
	})
	if err != nil {
		return nil, fmt.Errorf("scan grants: %w", err)
	}
	return grants, nil
}
