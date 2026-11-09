package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/setup"
)

// Users of the images: the web image runs as `node` (1000), Postgres alpine as `postgres` (70).
const (
	webUID      = 1000
	postgresUID = 70
	// The database may still be starting when setup-db runs.
	databaseWait = 2 * time.Minute
)

func setupHome() string {
	if home := os.Getenv("CANOPY_HOME"); home != "" {
		return home
	}
	return "/canopy"
}

func setupDBHost() string {
	if host := os.Getenv("CANOPY_DB_HOST"); host != "" {
		return host
	}
	return "postgres"
}

func idFromEnv(name string, fallback int) (int, error) {
	value := os.Getenv(name)
	if value == "" {
		return fallback, nil
	}
	id, err := strconv.Atoi(value)
	if err != nil || id < 0 {
		return 0, fmt.Errorf("%s must be a number", name)
	}
	return id, nil
}

// runSetup prepares CANOPY_HOME: folders, owners and the secrets (generated when missing).
func runSetup() int {
	puid, err := idFromEnv("PUID", 1000)
	if err == nil {
		var pgid int
		pgid, err = idFromEnv("PGID", 1000)
		if err == nil {
			var report setup.Report
			report, err = setup.Prepare(setup.Options{
				Home: setupHome(), PUID: puid, PGID: pgid, WebUID: webUID, PostgresUID: postgresUID,
				DBHost: setupDBHost(), Chown: os.Lchown, Random: setup.DefaultRandom,
			})
			if err == nil {
				slog.Info("setup done", slog.String("home", setupHome()),
					slog.Any("createdFolders", report.CreatedFolders), slog.Any("createdSecrets", report.CreatedSecrets))
				return 0
			}
		}
	}
	slog.Error("setup failed", slog.Any("error", err))
	return 1
}

func readSecret(name string) (string, error) {
	data, err := os.ReadFile(filepath.Join(setupHome(), setup.SecretsDir, name)) //nolint:gosec // inside CANOPY_HOME
	if err != nil {
		return "", fmt.Errorf("read %s (run the setup step first): %w", name, err)
	}
	return strings.TrimSpace(string(data)), nil
}

type pgxExecutor struct{ conn *pgx.Conn }

func (p pgxExecutor) Exec(ctx context.Context, sql string) error {
	_, err := p.conn.Exec(ctx, sql)
	return err //nolint:wrapcheck // wrapped by setup.EnsureDatabase
}

// runSetupDB creates or updates the app roles and schemas as the database administrator.
func runSetupDB() int {
	if err := setupDatabase(); err != nil {
		slog.Error("database setup failed", slog.Any("error", err))
		return 1
	}
	slog.Info("database ready")
	return 0
}

func setupDatabase() error {
	secrets := map[string]string{}
	for _, name := range []string{setup.DBAdminPassword, setup.WebDBPassword, setup.EngineDBPassword} {
		value, err := readSecret(name)
		if err != nil {
			return err
		}
		secrets[name] = value
	}
	ctx, cancel := context.WithTimeout(context.Background(), databaseWait)
	defer cancel()
	url := setup.DatabaseURL("canopy_admin", secrets[setup.DBAdminPassword], setupDBHost())
	var conn *pgx.Conn
	for {
		var err error
		conn, err = pgx.Connect(ctx, url)
		if err == nil {
			break
		}
		select {
		case <-ctx.Done():
			return fmt.Errorf("connect to the database: %w", err)
		case <-time.After(2 * time.Second):
		}
	}
	defer func() { _ = conn.Close(context.Background()) }()
	return setup.EnsureDatabase(ctx, pgxExecutor{conn}, secrets[setup.WebDBPassword], secrets[setup.EngineDBPassword])
}
