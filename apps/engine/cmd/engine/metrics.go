package main

import (
	"context"
	"log/slog"
	"os"
	"path/filepath"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/authz"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/metrics"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/trash"
)

// startMetrics samples dashboards' values every 30 seconds until ctx ends: the system (from
// /proc, Linux only), each volume of the root, the operations, the trash and the thumbnails cache.
func startMetrics(ctx context.Context, root string, pool *pgxpool.Pool, trashService *trash.Service, logger *slog.Logger) *metrics.Service {
	store := metrics.Store{DB: pool}
	// The trash is read as an administrator would: its size is everyone's deletions.
	everyone := authz.Subject{Admin: true}
	sampler := metrics.NewSampler(metrics.Sources{
		ReadFile: os.ReadFile,
		Volumes: func(context.Context) ([]metrics.Volume, error) {
			entries, err := os.ReadDir(root)
			if err != nil {
				return nil, err //nolint:wrapcheck // logged by the sampler
			}
			volumes := make([]metrics.Volume, 0, len(entries))
			for _, entry := range entries {
				if entry.IsDir() {
					volumes = append(volumes, metrics.Volume{Name: entry.Name(), Path: filepath.Join(root, entry.Name())})
				}
			}
			return volumes, nil
		},
		DiskUsage: metrics.DiskUsage,
		Counts: func(ctx context.Context) (metrics.Counts, error) {
			counts, err := store.Counts(ctx, time.Now())
			if err != nil {
				return metrics.Counts{}, err //nolint:wrapcheck // logged by the sampler
			}
			if items, err := trashService.List(ctx, everyone); err == nil {
				for _, item := range items {
					counts.TrashBytes += item.Bytes
				}
			}
			return counts, nil
		},
	}, logger)
	service := &metrics.Service{
		Sampler: sampler,
		Store:   store,
		Retention: func(ctx context.Context) (metrics.Retention, error) {
			return metrics.LoadRetention(ctx, pool)
		},
		Logger: logger,
		Now:    time.Now,
	}
	go service.Run(ctx)
	return service
}
