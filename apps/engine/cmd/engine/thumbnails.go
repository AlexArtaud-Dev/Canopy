package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/appsettings"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/thumbs"
)

// startThumbnails wires the thumbnail service. An unusable cache folder only disables caching,
// and a missing ffmpeg only leaves videos with their icon: neither stops the engine.
func startThumbnails(ctx context.Context, cacheDir string, files *fsx.Resolver, pool thumbs.DB, logger *slog.Logger) *thumbs.Service {
	dir := filepath.Join(cacheDir, "thumbnails")
	if err := checkWritable(dir); err != nil {
		logger.Warn("thumbnail cache disabled: folder not writable", slog.String("dir", dir), slog.Any("error", err))
		dir = ""
	}
	video := thumbs.FindFFmpeg(exec.LookPath)
	logger.Info("thumbnails ready", slog.Bool("cache", dir != ""), slog.Bool("video", video != nil))
	service := thumbs.NewService(thumbs.Deps{
		Files: files,
		Index: thumbs.PostgresIndex{DB: pool},
		Dir:   dir,
		Video: video,
		Settings: func(ctx context.Context) (thumbs.Settings, error) {
			values, err := appsettings.Load(ctx, pool, "thumbnails")
			if err != nil {
				return thumbs.Settings{}, err
			}
			return thumbs.SettingsFrom(values), nil
		},
		Logger: logger,
	})
	if dir != "" {
		go service.Keep(ctx, time.Hour)
	}
	return service
}

func checkWritable(dir string) error {
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return fmt.Errorf("create: %w", err)
	}
	probe, err := os.CreateTemp(dir, ".probe-*")
	if err != nil {
		return fmt.Errorf("write: %w", err)
	}
	_ = probe.Close()
	if err := os.Remove(probe.Name()); err != nil {
		return fmt.Errorf("clean up: %w", err)
	}
	return nil
}
