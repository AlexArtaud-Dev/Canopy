package commands

import (
	"embed"
	"fmt"
	"io/fs"
	"slices"
	"strings"
	"sync"
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
// Plugins add and remove their entries while the engine runs.
type Available struct {
	mu      sync.RWMutex
	builtin []Entry
	entries []Entry
	binary  map[string]string
}

// Located is an entry whose program is already known (a plugin's own binary).
type Located struct {
	Entry  Entry
	Binary string
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
	available.builtin = slices.Clone(available.entries)
	available.sort()
	return available
}

func (a *Available) sort() {
	slices.SortFunc(a.entries, func(x, y Entry) int { return strings.Compare(x.ID, y.ID) })
}

// SetPlugins replaces the plugins' entries (built-in entries stay). An id already used by the
// built-in catalog is ignored: plugins cannot replace a built-in command.
func (a *Available) SetPlugins(located []Located) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.entries = slices.Clone(a.builtin)
	binary := map[string]string{}
	for _, entry := range a.builtin {
		binary[entry.ID] = a.binary[entry.ID]
	}
	for _, item := range located {
		if _, taken := binary[item.Entry.ID]; taken {
			continue
		}
		a.entries = append(a.entries, item.Entry)
		binary[item.Entry.ID] = item.Binary
	}
	a.binary = binary
	a.sort()
}

// List returns the entries a person may see: basic ones, and advanced ones in advanced mode.
func (a *Available) List(advanced bool) []Entry {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.visible(advanced)
}

func (a *Available) visible(advanced bool) []Entry {
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
	a.mu.RLock()
	defer a.mu.RUnlock()
	for _, entry := range a.visible(advanced) {
		if entry.ID == id {
			return entry, a.binary[id], true
		}
	}
	return Entry{}, "", false
}
