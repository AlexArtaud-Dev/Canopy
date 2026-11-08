// Package transfer copies and moves entries inside the root: pure rules (validation, conflict
// strategies, "keep both" naming), a conflict pre-scan, and the transfer job.
package transfer

import (
	"errors"
	"fmt"
	"path"
	"strings"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
)

// Operations.
const (
	OpCopy = "copy"
	OpMove = "move"
)

// Conflict strategies: nothing is ever overwritten unless the person chose it.
const (
	StrategySkip      = "skip"
	StrategyOverwrite = "overwrite"
	StrategyKeepBoth  = "keep_both"
)

// Error codes (translated by the web app).
const (
	CodeIntoItself     = "files.into_itself"
	CodeSameLocation   = "files.same_location"
	CodeDuplicateNames = "files.duplicate_names"
	CodeNoSpace        = "files.no_space"
	CodeVerifyFailed   = "files.verify_failed"
)

var (
	// ErrIntoItself refuses copying or moving a folder inside itself.
	ErrIntoItself = errors.New("destination inside a source")
	// ErrSameLocation refuses moving entries to the folder they are already in.
	ErrSameLocation = errors.New("already in the destination")
	// ErrDuplicateNames refuses two sources that would land on the same name.
	ErrDuplicateNames = errors.New("sources share a name")
)

// ValidOperation guards an operation that arrives from a request.
func ValidOperation(op string) bool { return op == OpCopy || op == OpMove }

// ValidStrategy guards a conflict strategy that arrives from a request.
func ValidStrategy(strategy string) bool {
	return strategy == StrategySkip || strategy == StrategyOverwrite || strategy == StrategyKeepBoth
}

// TargetPath is where a source lands inside the destination folder.
func TargetPath(destination, source string) string {
	return path.Join(destination, path.Base(source))
}

// Validate cleans the request and refuses impossible transfers before anything is touched.
func Validate(op string, sources []string, destination string) ([]string, string, error) {
	dest, err := fsx.Clean(destination)
	if err != nil {
		return nil, "", fmt.Errorf("destination: %w", err)
	}
	cleaned := make([]string, 0, len(sources))
	names := map[string]bool{}
	for _, source := range sources {
		src, err := fsx.Clean(source)
		if err != nil || src == "/" {
			return nil, "", fsx.ErrInvalidPath
		}
		if fsx.IsWithin(dest, src) {
			return nil, "", ErrIntoItself
		}
		if op == OpMove && path.Dir(src) == dest {
			return nil, "", ErrSameLocation
		}
		name := path.Base(src)
		if names[name] {
			return nil, "", ErrDuplicateNames
		}
		names[name] = true
		cleaned = append(cleaned, src)
	}
	if len(cleaned) == 0 {
		return nil, "", fsx.ErrInvalidPath
	}
	return cleaned, dest, nil
}

// StrategyFor picks the person's per-item decision for a target, or the general strategy.
func StrategyFor(decisions map[string]string, fallback, target string) string {
	if decision, ok := decisions[target]; ok && ValidStrategy(decision) {
		return decision
	}
	return fallback
}

// KeepBothName finds a free "name (n).ext" next to a taken name; folders get "name (n)".
func KeepBothName(name string, isDir bool, taken func(string) bool) string {
	stem, ext := name, ""
	if !isDir {
		if dot := strings.LastIndex(name, "."); dot > 0 {
			stem, ext = name[:dot], name[dot:]
		}
	}
	for n := 1; ; n++ {
		candidate := fmt.Sprintf("%s (%d)%s", stem, n, ext)
		if !taken(candidate) {
			return candidate
		}
	}
}
