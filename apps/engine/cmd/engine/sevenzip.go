package main

import (
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/archive"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
)

// sevenZip finds 7-Zip; its file lists go to a folder of the cache (the engine's own file system
// is read-only). Without it, 7z, RAR and ISO archives are refused with a clear error.
func sevenZip(cacheDir string, resolver *fsx.Resolver, logger *slog.Logger) *archive.SevenZip {
	temp := filepath.Join(cacheDir, "tmp")
	if err := os.MkdirAll(temp, 0o700); err != nil {
		logger.Warn("7-Zip turned off: no temporary folder", slog.Any("error", err))
		return nil
	}
	tool := archive.FindSevenZip(exec.LookPath, resolver.HostPath, temp)
	logger.Info("7-Zip", slog.Bool("available", tool != nil))
	return tool
}
