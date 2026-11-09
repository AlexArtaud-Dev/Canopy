package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"os/exec"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/appsettings"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/commands"
)

// loadCommands reads the built-in catalog and keeps what is installed on this host.
func loadCommands(logger *slog.Logger) (*commands.Available, commands.Launcher, error) {
	entries, err := commands.Builtin()
	if err != nil {
		return nil, commands.Launcher{}, err
	}
	available := commands.NewAvailable(entries, exec.LookPath)
	logger.Info("command catalog ready", slog.Int("entries", len(entries)), slog.Int("installed", len(available.List(true))))
	return available, commands.NewLauncher(exec.LookPath), nil
}

// advancedMode reads the web app's `commands.advancedMode` setting (off when unreadable).
func advancedMode(pool appsettings.Querier, logger *slog.Logger) func(context.Context) bool {
	return func(ctx context.Context) bool {
		values, err := appsettings.Load(ctx, pool, "commands")
		if err != nil {
			logger.WarnContext(ctx, "command settings unreadable", slog.Any("error", err))
			return false
		}
		var enabled bool
		return values["advancedMode"] != nil && json.Unmarshal(values["advancedMode"], &enabled) == nil && enabled
	}
}
