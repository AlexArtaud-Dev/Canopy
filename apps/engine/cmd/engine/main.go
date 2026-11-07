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

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/config"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/database"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/httpapi"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/logging"
)

const (
	shutdownGrace     = 15 * time.Second
	readHeaderTimeout = 10 * time.Second
	startupTimeout    = 30 * time.Second
)

func main() {
	if err := run(); err != nil {
		slog.Error("engine stopped", slog.Any("error", err))
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load(os.Getenv)
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}
	logger := logging.New(os.Stdout, cfg.LogLevel)

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

	server := &http.Server{
		Addr:              cfg.Addr,
		Handler:           httpapi.NewRouter(httpapi.Deps{Logger: logger, Database: pool}),
		ReadHeaderTimeout: readHeaderTimeout,
		// No read/write timeouts: multi-GB transfers and SSE streams are legitimately long.
	}

	serverErr := make(chan error, 1)
	go func() {
		logger.Info("engine listening", slog.String("addr", cfg.Addr))
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
	if err := server.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("shutdown: %w", err)
	}
	return nil
}
