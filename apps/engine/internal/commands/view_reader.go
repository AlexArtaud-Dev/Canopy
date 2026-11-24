package commands

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"time"
)

// Plugin view errors.
var (
	ErrNoView     = errors.New("no such plugin view")
	ErrViewFailed = errors.New("plugin view source failed")
)

// Limits on a view's source run: it is read every few seconds, so it must be quick and small.
const (
	viewTimeout   = 15 * time.Second
	maxViewOutput = 2 << 20
)

// ViewReader runs plugin views' source commands on demand, outside the job queue: reading a view
// is frequent and changes nothing, so it is neither queued nor listed in Operations.
type ViewReader struct {
	Available *Available
	Launcher  Launcher
}

// Find returns a view and its plugin's source entry and binary.
func (r ViewReader) Find(pluginID, viewID string) (PluginView, Entry, string, bool) {
	for _, entry := range r.Available.List(true) {
		if entry.Plugin == nil || entry.Plugin.ID != pluginID {
			continue
		}
		for _, view := range entry.Plugin.Views {
			if view.ID != viewID {
				continue
			}
			source, binary, ok := r.Available.Get(view.Source, true)
			return view, source, binary, ok
		}
	}
	return PluginView{}, Entry{}, "", false
}

func noPaths(param Param, _ string) (string, error) {
	return "", fmt.Errorf("%w: %s takes no path in a view", ErrBadValue, param.Name)
}

// Read runs the view's source (its params at their defaults) and returns the JSON object it
// printed.
func (r ViewReader) Read(ctx context.Context, pluginID, viewID string) (map[string]any, error) {
	_, source, binary, ok := r.Find(pluginID, viewID)
	if !ok {
		return nil, ErrNoView
	}
	plan, err := Build(source, nil, noPaths, false)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrViewFailed, err)
	}
	limited, cancel := context.WithTimeout(ctx, viewTimeout)
	defer cancel()
	data := PluginDataDir(binary)
	if err := os.MkdirAll(data, 0o700); err != nil {
		return nil, fmt.Errorf("%w: plugin data folder: %w", ErrViewFailed, err)
	}
	command := r.Launcher.command(limited, binary, plan.Argv, data)
	command.Env = append(append([]string{}, command.Env...), PluginDataEnv+"="+data)
	var output bytes.Buffer
	command.Stdout = &cappedWriter{buffer: &output, limit: maxViewOutput + 1}
	command.Stderr = io.Discard
	if err := command.Run(); err != nil {
		return nil, fmt.Errorf("%w: %w", ErrViewFailed, err)
	}
	return ParseViewOutput(output.Bytes())
}

// ParseViewOutput reads what a view's source printed: one JSON object, at most 2 MiB.
func ParseViewOutput(output []byte) (map[string]any, error) {
	if len(output) > maxViewOutput {
		return nil, fmt.Errorf("%w: output over %d bytes", ErrViewFailed, maxViewOutput)
	}
	var data map[string]any
	if err := json.Unmarshal(bytes.TrimSpace(output), &data); err != nil || data == nil {
		return nil, fmt.Errorf("%w: output is not a JSON object", ErrViewFailed)
	}
	return data, nil
}

// cappedWriter keeps the first limit bytes and drops the rest (the process is not blocked).
type cappedWriter struct {
	buffer *bytes.Buffer
	limit  int
}

func (w *cappedWriter) Write(data []byte) (int, error) {
	if room := w.limit - w.buffer.Len(); room > 0 {
		w.buffer.Write(data[:min(room, len(data))])
	}
	return len(data), nil
}
