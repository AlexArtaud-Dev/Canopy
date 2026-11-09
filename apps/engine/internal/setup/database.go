package setup

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"
)

// Executor runs SQL (a *pgx.Conn in production).
type Executor interface {
	Exec(ctx context.Context, sql string) error
}

// Role passwords are written into SQL (roles cannot take bind parameters): only characters that
// need no quoting are accepted. Generated passwords are hex.
var safePassword = regexp.MustCompile(`^[A-Za-z0-9._~+/=-]{16,128}$`)

// ErrUnsafePassword means a role password file holds characters Canopy will not put in SQL.
var ErrUnsafePassword = errors.New("database passwords must be 16-128 letters, digits or ._~+/=-")

// DatabaseSQL is the idempotent bootstrap: the two app roles (passwords set every run, so a
// changed secret file applies), the schemas each one owns, and the engine's narrow access to the
// web app's settings and audit log. See docs/dev/architecture.md (data ownership).
func DatabaseSQL(webPassword, enginePassword string) (string, error) {
	if !safePassword.MatchString(webPassword) || !safePassword.MatchString(enginePassword) {
		return "", ErrUnsafePassword
	}
	statements := []string{
		`DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'canopy_web') THEN CREATE ROLE canopy_web LOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'canopy_engine') THEN CREATE ROLE canopy_engine LOGIN; END IF;
END $$`,
		fmt.Sprintf(`ALTER ROLE canopy_web WITH LOGIN PASSWORD '%s'`, webPassword),
		fmt.Sprintf(`ALTER ROLE canopy_engine WITH LOGIN PASSWORD '%s'`, enginePassword),
		`REVOKE CREATE ON SCHEMA public FROM PUBLIC`,
		`CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION canopy_web`,
		`CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION canopy_web`,
		`CREATE SCHEMA IF NOT EXISTS audit AUTHORIZATION canopy_web`,
		`CREATE SCHEMA IF NOT EXISTS engine AUTHORIZATION canopy_engine`,
		`CREATE SCHEMA IF NOT EXISTS river AUTHORIZATION canopy_engine`,
		`GRANT USAGE ON SCHEMA app TO canopy_engine`,
		`ALTER DEFAULT PRIVILEGES FOR ROLE canopy_web IN SCHEMA app GRANT SELECT ON TABLES TO canopy_engine`,
		`GRANT USAGE ON SCHEMA audit TO canopy_engine`,
		`ALTER DEFAULT PRIVILEGES FOR ROLE canopy_web IN SCHEMA audit GRANT INSERT ON TABLES TO canopy_engine`,
		`ALTER DEFAULT PRIVILEGES FOR ROLE canopy_web IN SCHEMA audit GRANT USAGE ON SEQUENCES TO canopy_engine`,
		`ALTER ROLE canopy_web SET search_path = app, auth, audit`,
		`ALTER ROLE canopy_engine SET search_path = engine, river`,
	}
	return strings.Join(statements, ";\n") + ";", nil
}

// EnsureDatabase applies DatabaseSQL as the database administrator.
func EnsureDatabase(ctx context.Context, admin Executor, webPassword, enginePassword string) error {
	sql, err := DatabaseSQL(webPassword, enginePassword)
	if err != nil {
		return err
	}
	if err := admin.Exec(ctx, sql); err != nil {
		return fmt.Errorf("prepare the database: %w", err)
	}
	return nil
}
