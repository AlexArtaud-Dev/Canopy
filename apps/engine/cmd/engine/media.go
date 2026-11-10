package main

import (
	"context"
	"log/slog"
	"os/exec"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/httpapi"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/media"
)

// conversions caps how many videos ffmpeg converts at once: each one keeps CPU cores busy.
const conversions = 2

// mediaPlayer converts videos browsers cannot play, when ffmpeg and ffprobe are installed, on
// the GPU when one works (see CANOPY_VIDEO_ENCODER). The interface is nil (not a nil *Player)
// without them, so the API knows there is none.
func mediaPlayer(ctx context.Context, encoder string, logger *slog.Logger) httpapi.Media {
	player := media.Find(exec.LookPath, conversions)
	if player == nil {
		logger.Info("video conversion", slog.Bool("available", false))
		return nil
	}
	chosen := player.ChooseEncoder(ctx, encoder)
	if encoder == string(media.NVENC) && chosen != media.NVENC {
		logger.Warn("NVENC asked for but not usable: videos are converted on the CPU")
	}
	logger.Info("video conversion", slog.Bool("available", true), slog.String("encoder", string(chosen)))
	return player
}
