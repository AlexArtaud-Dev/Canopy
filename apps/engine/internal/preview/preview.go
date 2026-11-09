// Package preview decides how a file may be shown in the browser. The list is an allowlist by
// extension: content is never sniffed, so an unknown file is never rendered, only downloaded.
package preview

import (
	"path"
	"strings"
)

// Kind is the viewer the web app uses for a file.
type Kind string

// Viewers, mirrored by the `PreviewKind` enum of the API contract.
const (
	None  Kind = "none"
	Image Kind = "image"
	PDF   Kind = "pdf"
	Text  Kind = "text"
	Audio Kind = "audio"
	Video Kind = "video"
	// HTML is rendered in a sandbox: no scripts, no same-origin access.
	HTML Kind = "html"
)

type format struct {
	kind        Kind
	contentType string
}

const plain = "text/plain; charset=utf-8"

var formats = map[string]format{
	".png": {Image, "image/png"}, ".jpg": {Image, "image/jpeg"}, ".jpeg": {Image, "image/jpeg"},
	".gif": {Image, "image/gif"}, ".webp": {Image, "image/webp"}, ".avif": {Image, "image/avif"},
	".bmp": {Image, "image/bmp"}, ".ico": {Image, "image/x-icon"},
	// SVG can carry scripts: shown through <img> and served under a sandbox policy.
	".svg": {Image, "image/svg+xml"},

	".pdf": {PDF, "application/pdf"},

	".mp3": {Audio, "audio/mpeg"}, ".m4a": {Audio, "audio/mp4"}, ".aac": {Audio, "audio/aac"},
	".ogg": {Audio, "audio/ogg"}, ".oga": {Audio, "audio/ogg"}, ".opus": {Audio, "audio/ogg"},
	".wav": {Audio, "audio/wav"}, ".flac": {Audio, "audio/flac"},

	".mp4": {Video, "video/mp4"}, ".m4v": {Video, "video/mp4"}, ".webm": {Video, "video/webm"},
	".ogv": {Video, "video/ogg"}, ".mov": {Video, "video/quicktime"},

	".html": {HTML, "text/html; charset=utf-8"}, ".htm": {HTML, "text/html; charset=utf-8"},
}

// Text formats are all served as plain text: the browser never interprets them.
var textExtensions = []string{
	".txt", ".md", ".markdown", ".log", ".csv", ".tsv", ".json", ".jsonc", ".yaml", ".yml",
	".toml", ".ini", ".cfg", ".conf", ".env", ".xml", ".css", ".scss", ".less",
	".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".go", ".py", ".rb", ".rs", ".java", ".kt",
	".c", ".h", ".cpp", ".hpp", ".cs", ".php", ".swift", ".sh", ".bash", ".zsh", ".ps1",
	".sql", ".lua", ".dart", ".vue", ".svelte", ".srt", ".vtt", ".nfo", ".gitignore",
	".dockerfile",
}

// Files known by their whole name rather than an extension.
var textNames = map[string]bool{
	"dockerfile": true, "makefile": true, "readme": true, "license": true, "changelog": true,
}

func init() {
	for _, extension := range textExtensions {
		formats[extension] = format{Text, plain}
	}
}

// Classify returns the viewer and Content-Type for a file name ("" when it has no preview).
func Classify(name string) (Kind, string) {
	lower := strings.ToLower(path.Base(name))
	if textNames[lower] {
		return Text, plain
	}
	found, ok := formats[path.Ext(lower)]
	if !ok {
		return None, ""
	}
	return found.kind, found.contentType
}

// Sandboxed tells whether the browser must render the file without scripts or origin. Only PDF
// is exempt: browsers refuse to run their PDF viewer in a sandboxed document.
func Sandboxed(kind Kind) bool {
	return kind != PDF
}
