package main

import (
	"log/slog"
	"os/exec"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/httpapi"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/media"
)

// conversions caps how many videos ffmpeg converts at once: each one keeps CPU cores busy.
const conversions = 2

// mediaPlayer converts videos browsers cannot play, when ffmpeg and ffprobe are installed. The
// interface is nil (not a nil *Player) without them, so the API knows there is none.
func mediaPlayer(logger *slog.Logger) httpapi.Media {
	player := media.Find(exec.LookPath, conversions)
	logger.Info("video conversion", slog.Bool("available", player != nil))
	if player == nil {
		return nil
	}
	return player
}
