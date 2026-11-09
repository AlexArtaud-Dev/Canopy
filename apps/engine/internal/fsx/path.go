// Package fsx is the only way the engine touches the managed files: virtual paths are validated
// here, then every access goes through an os.Root so nothing can escape the configured root.
package fsx

import (
	"errors"
	"path"
	"strings"
	"unicode/utf8"
)

// Error codes shared with the web app (translated there).
const (
	CodeInvalidPath = "files.invalid_path"
	CodeNotFound    = "files.not_found"
	CodeNotDir      = "files.not_a_directory"
)

// ErrInvalidPath rejects a virtual path before any filesystem access.
var ErrInvalidPath = errors.New("invalid virtual path")

const maxPathBytes = 4096

// ReservedPrefix marks Canopy's own folders inside the root (upload staging, trash): never
// listed, never reachable through a client path.
const ReservedPrefix = ".canopy-"

// StagingDir holds uploads in progress, inside the root so a finished upload is renamed into
// place (instant on the same filesystem).
const StagingDir = ReservedPrefix + "uploads"

// Reserved reports whether a single name belongs to Canopy itself.
func Reserved(name string) bool {
	return strings.HasPrefix(name, ReservedPrefix)
}

// Clean validates a client-supplied virtual POSIX path ("/photos/2024") and returns its canonical
// form. Relative paths, NUL bytes, invalid UTF-8 and oversized paths are refused; "." and ".."
// are resolved lexically, never above "/".
func Clean(virtual string) (string, error) {
	switch {
	case virtual == "" || !strings.HasPrefix(virtual, "/"):
		return "", ErrInvalidPath
	case len(virtual) > maxPathBytes,
		strings.ContainsRune(virtual, 0),
		!utf8.ValidString(virtual):
		return "", ErrInvalidPath
	}
	clean := path.Clean(virtual)
	for _, segment := range strings.Split(clean, "/") {
		if Reserved(segment) {
			return "", ErrInvalidPath
		}
	}
	return clean, nil
}

// Relative turns a clean virtual path into the name os.Root expects ("." for the root).
func Relative(clean string) string {
	if clean == "/" {
		return "."
	}
	return strings.TrimPrefix(clean, "/")
}

// IsWithin reports whether a clean virtual path is base itself or below it.
func IsWithin(clean, base string) bool {
	if base == "/" || clean == base {
		return true
	}
	return strings.HasPrefix(clean, base+"/")
}

// Ancestors lists base paths from the root down to the path itself: "/a/b" → ["/", "/a", "/a/b"].
func Ancestors(clean string) []string {
	result := []string{"/"}
	if clean == "/" {
		return result
	}
	current := ""
	for part := range strings.SplitSeq(strings.TrimPrefix(clean, "/"), "/") {
		current += "/" + part
		result = append(result, current)
	}
	return result
}
