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

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/appsettings"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/config"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/disks"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/disks/diskstore"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/httpapi"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/jobs"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/logging"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/metrics"
)

// selfTestPoll is how often a running self-test is followed.
const selfTestPoll = 20 * time.Second

// runDisks is the disks service (`engine disks`): smartctl behind a token, on the internal
// network. It is the only part of Canopy that sees the devices.
func runDisks() int {
	cfg, err := config.LoadDisks(config.WithFiles(os.Getenv, os.ReadFile))
	if err != nil {
		slog.Error("disks service stopped", slog.Any("error", err))
		return 1
	}
	logger := logging.New(os.Stdout, slog.LevelInfo)
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	server := &http.Server{
		Addr:              cfg.Addr,
		Handler:           disks.Handler(&disks.Smartctl{Exec: disks.SystemExec}, cfg.Token, logger),
		ReadHeaderTimeout: readHeaderTimeout,
	}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.WithoutCancel(ctx), shutdownGrace)
		defer cancel()
		_ = server.Shutdown(shutdown)
	}()
	logger.Info("disks service listening", slog.String("addr", cfg.Addr), slog.String("version", version))
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		logger.Error("disks service stopped", slog.Any("error", err))
		return 1
	}
	return 0
}

// startDisks watches the disks when the disks service is set up; nil otherwise.
func startDisks(ctx context.Context, cfg config.Config, pool *pgxpool.Pool, logger *slog.Logger) *disks.Watcher {
	if cfg.DisksURL == "" {
		return nil
	}
	watcher := &disks.Watcher{
		Reader: disks.NewClient(cfg.DisksURL, cfg.DisksToken),
		Store:  diskstore.Store{Pool: pool, Now: time.Now},
		Settings: func(ctx context.Context) (disks.Settings, error) {
			values, err := appsettings.Load(ctx, pool, disks.SettingsModule)
			if err != nil {
				return disks.Settings{}, fmt.Errorf("disks settings: %w", err)
			}
			return disks.SettingsFrom(values), nil
		},
		Logger: logger,
		Now:    time.Now,
	}
	go watcher.Run(ctx)
	return watcher
}

// registerDiskJobs adds the self-test job when disk health is on.
func registerDiskJobs(registry *jobs.Registry, watcher *disks.Watcher) {
	if watcher == nil {
		return
	}
	jobs.Register(registry, disks.SelfTestHandler(watcher.Reader, selfTestPoll, func(ctx context.Context) {
		_, _ = watcher.Check(ctx)
	}))
}

// diskHealth hands the watcher to the API, keeping "not set up" a nil interface.
func diskHealth(watcher *disks.Watcher) httpapi.DiskHealth {
	if watcher == nil {
		return nil
	}
	return watcher
}

// diskReadings feeds dashboards from the latest reading; a sleeping disk has no temperature now.
func diskReadings(watcher *disks.Watcher) func(ctx context.Context) ([]metrics.DiskReading, error) {
	if watcher == nil {
		return nil
	}
	return func(ctx context.Context) ([]metrics.DiskReading, error) {
		state, err := watcher.Current(ctx)
		if err != nil {
			return nil, err //nolint:wrapcheck // logged by the sampler
		}
		readings := make([]metrics.DiskReading, 0, len(state.Disks))
		for _, disk := range state.Disks {
			reading := metrics.DiskReading{
				Series: disks.SeriesName(disk), Wear: disk.WearPercent, Reallocated: disk.Reallocated, Pending: disk.Pending,
			}
			if !disk.Asleep {
				reading.Temperature = disk.Temperature
			}
			readings = append(readings, reading)
		}
		return readings, nil
	}
}
