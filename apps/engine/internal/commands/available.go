package commands

import (
	"embed"
	"fmt"
	"io/fs"
	"slices"
	"strings"
)

//go:embed builtin/*.yaml
var builtin embed.FS

// Builtin reads the catalog shipped with the engine.
func Builtin() ([]Entry, error) {
	var all []Entry
	err := fs.WalkDir(builtin, "builtin", func(name string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() {
			return err
		}
		data, err := builtin.ReadFile(name)
		if err != nil {
			return fmt.Errorf("read %s: %w", name, err)
		}
		entries, err := Parse(data)
		if err != nil {
			return fmt.Errorf("%s: %w", name, err)
		}
		all = append(all, entries...)
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("built-in catalog: %w", err)
	}
	return all, nil
}

// Available is the catalog restricted to installed programs, each with its resolved binary.
type Available struct {
	entries []Entry
	binary  map[string]string
}

// NewAvailable keeps the entries whose program is found by lookPath (once, at start).
func NewAvailable(entries []Entry, lookPath func(string) (string, error)) *Available {
	available := &Available{binary: map[string]string{}}
	for _, entry := range entries {
		path, err := lookPath(entry.Binary)
		if err != nil {
			continue
		}
		available.entries = append(available.entries, entry)
		available.binary[entry.ID] = path
	}
	slices.SortFunc(available.entries, func(a, b Entry) int { return strings.Compare(a.ID, b.ID) })
	return available
}

// List returns the entries a person may see: basic ones, and advanced ones in advanced mode.
func (a *Available) List(advanced bool) []Entry {
	var visible []Entry
	for _, entry := range a.entries {
		if entry.Mode == ModeBasic || advanced {
			visible = append(visible, entry)
		}
	}
	return visible
}

// Get returns one entry and its program, when installed and visible in this mode.
func (a *Available) Get(id string, advanced bool) (Entry, string, bool) {
	for _, entry := range a.List(advanced) {
		if entry.ID == id {
			return entry, a.binary[id], true
		}
	}
	return Entry{}, "", false
}
