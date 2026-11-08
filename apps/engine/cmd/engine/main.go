// Command engine runs the Canopy filesystem and jobs engine.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/audit"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/config"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/database"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/enginetoken"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/foldersize"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/grantstore"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/healthcheck"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/httpapi"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/jobs"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/logging"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/transfer"
)

const (
	shutdownGrace     = 15 * time.Second
	readHeaderTimeout = 10 * time.Second
	startupTimeout    = 30 * time.Second
)

// version is set at build time (-ldflags "-X main.version=...").
var version = "dev"

func main() {
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		os.Exit(runHealthcheck())
	}
	if err := run(); err != nil {
		slog.Error("engine stopped", slog.Any("error", err))
		os.Exit(1)
	}
}

// runHealthcheck is the container HEALTHCHECK entry point: exit 0 when the engine is live.
func runHealthcheck() int {
	addr := os.Getenv("CANOPY_ENGINE_ADDR")
	if addr == "" {
		addr = ":8080"
	}
	url, err := healthcheck.LocalURL(addr)
	if err == nil {
		err = healthcheck.Probe(context.Background(), http.DefaultClient, url)
	}
	if err != nil {
		slog.Error("healthcheck failed", slog.Any("error", err))
		return 1
	}
	return 0
}

func run() error {
	cfg, err := config.Load(os.Getenv)
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}
	logger := logging.New(os.Stdout, cfg.LogLevel)
	applyUmask(cfg.Umask)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	startupCtx, cancelStartup := context.WithTimeout(ctx, startupTimeout)
	defer cancelStartup()

	pool, err := database.Open(startupCtx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()

	if err := database.Migrate(startupCtx, pool, logger); err != nil {
		return err
	}

	resolver, err := fsx.OpenResolver(cfg.Root)
	if err != nil {
		return err
	}
	defer func() { _ = resolver.Close() }()

	verifier, err := newVerifier(cfg.PublicKey, logger)
	if err != nil {
		return err
	}

	grants := grantstore.NewStore(pool)
	jobService, err := startJobs(startupCtx, pool, resolver, grants, logger)
	if err != nil {
		return err
	}
	go jobService.hub.Listen(ctx, pool, logger)

	streamsDone := make(chan struct{})
	server := &http.Server{
		Addr: cfg.Addr,
		Handler: httpapi.NewRouter(httpapi.Deps{
			Logger:      logger,
			Database:    pool,
			Files:       resolver,
			Ops:         resolver,
			Grants:      grants,
			Verifier:    verifier,
			Jobs:        jobService,
			Audit:       audit.NewWriter(pool),
			StreamsDone: streamsDone,
		}),
		ReadHeaderTimeout: readHeaderTimeout,
		// No read/write timeouts: multi-GB transfers and SSE streams are legitimately long.
	}

	serverErr := make(chan error, 1)
	go func() {
		logger.Info("engine listening", slog.String("addr", cfg.Addr), slog.String("version", version))
		serverErr <- server.ListenAndServe()
	}()

	select {
	case err := <-serverErr:
		if !errors.Is(err, http.ErrServerClosed) {
			return fmt.Errorf("serve: %w", err)
		}
	case <-ctx.Done():
		logger.Info("shutting down")
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownGrace)
	defer cancel()
	close(streamsDone)
	if err := server.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("shutdown: %w", err)
	}
	if err := jobService.runner.Stop(shutdownCtx); err != nil {
		return err
	}
	return nil
}

// startJobs registers every job kind and starts the runner with the configured concurrency.
func startJobs(ctx context.Context, pool *pgxpool.Pool, files *fsx.Resolver, grants *grantstore.Store, logger *slog.Logger) (*jobService, error) {
	limits, err := jobs.LoadLimits(ctx, pool)
	if err != nil {
		return nil, err
	}
	registry := jobs.NewRegistry(pool, logger, time.Now)
	jobs.Register(registry, foldersize.Handler(files, grants))
	jobs.Register(registry, transfer.Handler(files, grants))
	runner, err := jobs.Start(ctx, registry, pool, limits)
	if err != nil {
		return nil, err
	}
	return &jobService{runner: runner, hub: jobs.NewHub()}, nil
}

// newVerifier parses the public key; without one the engine still starts (health checks work)
// but refuses every /v1 request.
func newVerifier(encoded string, logger *slog.Logger) (*enginetoken.Verifier, error) {
	if encoded == "" {
		logger.Warn("CANOPY_ENGINE_PUBLIC_KEY not set: the file API is disabled")
		return nil, nil
	}
	key, err := enginetoken.ParsePublicKey(encoded)
	if err != nil {
		return nil, fmt.Errorf("CANOPY_ENGINE_PUBLIC_KEY: %w", err)
	}
	return enginetoken.NewVerifier(key, time.Now), nil
}
