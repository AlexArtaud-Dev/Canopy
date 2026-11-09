// Package thumbs makes small previews of images (decoded in Go) and videos (one frame from ffmpeg,
// when installed), cached on disk and indexed in engine.thumbnails for size-bounded eviction.
package thumbs

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"path"
	"slices"
	"strconv"
	"strings"
	"time"
)

// Edge is the longest side of a thumbnail: sharp on high-density screens for grid tiles.
const Edge = 320

// Guards against decompression bombs and pathological files.
const (
	MaxPixels      = 64_000_000
	MaxSourceBytes = 200 << 20
)

// keyVersion changes whenever rendering changes, so old cached thumbnails are never served.
const keyVersion = "1"

// Fit scales width × height down to fit in edge × edge, keeping the ratio; never up, never zero.
func Fit(width, height, edge int) (int, int) {
	if width <= edge && height <= edge {
		return max(width, 1), max(height, 1)
	}
	if width >= height {
		return edge, max(height*edge/width, 1)
	}
	return max(width*edge/height, 1), edge
}

// Key names a thumbnail: any change to the file (content, so size or time) gives a new key.
func Key(virtual string, size int64, modified time.Time) string {
	sum := sha256.Sum256([]byte(keyVersion + "\x00" + virtual + "\x00" +
		strconv.FormatInt(size, 10) + "\x00" + strconv.FormatInt(modified.UnixNano(), 10)))
	return hex.EncodeToString(sum[:])
}

// Source is how a thumbnail is made for a file.
type Source int

const (
	// SourceNone means no thumbnail: the icon is shown.
	SourceNone Source = iota
	// SourceImage is decoded and scaled in the engine.
	SourceImage
	// SourceVideo gives one representative frame, from ffmpeg.
	SourceVideo
)

var imageExtensions = []string{".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tif", ".tiff"}

var videoExtensions = []string{".mp4", ".m4v", ".mov", ".webm", ".mkv", ".avi", ".ogv", ".wmv", ".mpg", ".mpeg", ".ts"}

// SourceOf picks the source from the file name (extensions only, like previews).
func SourceOf(name string) Source {
	extension := strings.ToLower(path.Ext(name))
	switch {
	case slices.Contains(imageExtensions, extension):
		return SourceImage
	case slices.Contains(videoExtensions, extension):
		return SourceVideo
	default:
		return SourceNone
	}
}

// Settings mirror the web app's `thumbnails` settings.
type Settings struct {
	Enabled       bool
	MaxCacheBytes int64
}

// DefaultSettings apply when nothing is stored.
var DefaultSettings = Settings{Enabled: true, MaxCacheBytes: 1 << 30}

// Upper bound of the cache setting (MB), as in the web app's schema.
const maxCacheMbCeiling = 1 << 20

// SettingsFrom parses stored values; anything invalid keeps its default.
func SettingsFrom(values map[string]json.RawMessage) Settings {
	settings := DefaultSettings
	var enabled bool
	if raw, ok := values["enabled"]; ok && json.Unmarshal(raw, &enabled) == nil {
		settings.Enabled = enabled
	}
	var megabytes int64
	if raw, ok := values["maxCacheMb"]; ok && json.Unmarshal(raw, &megabytes) == nil &&
		megabytes >= 1 && megabytes <= maxCacheMbCeiling {
		settings.MaxCacheBytes = megabytes << 20
	}
	return settings
}

// Cached is one stored thumbnail, as indexed.
type Cached struct {
	Key    string
	Bytes  int64
	UsedAt time.Time
}

// Evictions picks the least recently used thumbnails to remove until the cache fits maxBytes.
func Evictions(entries []Cached, maxBytes int64) []string {
	var total int64
	for _, entry := range entries {
		total += entry.Bytes
	}
	sorted := slices.Clone(entries)
	slices.SortFunc(sorted, func(a, b Cached) int { return a.UsedAt.Compare(b.UsedAt) })
	var evicted []string
	for _, entry := range sorted {
		if total <= maxBytes {
			break
		}
		evicted = append(evicted, entry.Key)
		total -= entry.Bytes
	}
	return evicted
}
