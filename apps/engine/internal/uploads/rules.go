// Package uploads receives files with the tus resumable protocol (tusd): uploads are staged inside
// the root, checked when they start and again when they finish, then moved into place.
package uploads

import (
	"context"
	"encoding/json"
	"errors"
	"path"
	"strings"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/appsettings"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/enginetoken"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/transfer"
)

// Error codes (translated by the web app); tus clients receive them as "code: message".
const (
	CodeTooLarge     = "files.too_large"
	CodeBlockedType  = "files.blocked_type"
	CodeBadMetadata  = "files.invalid_upload"
	CodeNotUploading = "files.upload_not_found"
	// CodeNoStaging means the engine cannot write where the volume stages its uploads.
	CodeNoStaging = "files.volume_not_writable"
)

var (
	// ErrBadMetadata rejects an upload whose metadata is missing or invalid.
	ErrBadMetadata = errors.New("invalid upload metadata")
	// ErrTooLarge rejects an upload over the size limit.
	ErrTooLarge = errors.New("upload too large")
	// ErrBlockedType rejects an extension the administrator blocked.
	ErrBlockedType = errors.New("file type blocked")
)

// Request is what an upload targets, read from its tus metadata.
type Request struct {
	// Folder is the destination the person picked; RelativeDir the sub-folders of a folder
	// upload ("" for a single file). Target is the final path.
	Folder      string
	RelativeDir string
	Name        string
	Target      string
	Strategy    string
}

// ParentDir is the folder the file lands in (created for folder uploads).
func (r Request) ParentDir() string {
	return path.Dir(r.Target)
}

// ParseRequest validates tus metadata: destination folder, file name, optional relative folder
// (folder uploads) and the conflict strategy. Every segment is a valid name.
func ParseRequest(meta map[string]string) (Request, error) {
	folder, err := fsx.Clean(meta["destination"])
	if err != nil {
		return Request{}, ErrBadMetadata
	}
	name := meta["filename"]
	if !fsx.ValidName(name) {
		return Request{}, ErrBadMetadata
	}
	strategy := meta["strategy"]
	if strategy == "" {
		strategy = transfer.StrategySkip
	}
	if !transfer.ValidStrategy(strategy) {
		return Request{}, ErrBadMetadata
	}
	relative := strings.Trim(meta["relativeDir"], "/")
	if relative != "" {
		for _, segment := range strings.Split(relative, "/") {
			if !fsx.ValidName(segment) {
				return Request{}, ErrBadMetadata
			}
		}
	}
	target, err := fsx.Clean(path.Join(folder, relative, name))
	if err != nil {
		return Request{}, ErrBadMetadata
	}
	return Request{Folder: folder, RelativeDir: relative, Name: name, Target: target, Strategy: strategy}, nil
}

// Limits are the administrator's upload settings.
type Limits struct {
	// MaxBytes per file; 0 means no limit.
	MaxBytes int64
	// Blocked extensions, lower case without the dot.
	Blocked []string
}

// Check refuses a file over the size limit or with a blocked extension.
func (l Limits) Check(name string, size int64) error {
	if l.MaxBytes > 0 && size > l.MaxBytes {
		return ErrTooLarge
	}
	dot := strings.LastIndex(name, ".")
	if dot < 0 {
		return nil
	}
	extension := strings.ToLower(name[dot+1:])
	for _, blocked := range l.Blocked {
		if extension == blocked {
			return ErrBlockedType
		}
	}
	return nil
}

const megabyte = 1 << 20

// LimitsFrom reads the stored `uploads` settings (only values differing from defaults exist).
func LimitsFrom(values map[string]json.RawMessage) Limits {
	limits := Limits{}
	var maxMB int64
	if raw, ok := values["maxFileSizeMb"]; ok && json.Unmarshal(raw, &maxMB) == nil && maxMB > 0 {
		limits.MaxBytes = maxMB * megabyte
	}
	// One text setting, "exe, bat" (the settings page has no list field).
	var blocked string
	if raw, ok := values["blockedExtensions"]; ok && json.Unmarshal(raw, &blocked) == nil {
		for _, extension := range strings.FieldsFunc(blocked, func(r rune) bool { return r == ',' || r == ' ' || r == ';' }) {
			cleaned := strings.ToLower(strings.TrimPrefix(strings.TrimSpace(extension), "."))
			if cleaned != "" {
				limits.Blocked = append(limits.Blocked, cleaned)
			}
		}
	}
	return limits
}

// LoadLimits reads the uploads settings written by the web app; none stored means no limit.
func LoadLimits(ctx context.Context, db appsettings.Querier) (Limits, error) {
	values, err := appsettings.Load(ctx, db, "uploads")
	if err != nil {
		return Limits{}, err
	}
	return LimitsFrom(values), nil
}

// ErrLinkTicket refuses an upload link ticket used for anything but the one file it was issued
// for: that file, in the shared folder itself, kept as a copy on a name conflict.
var ErrLinkTicket = errors.New("upload link ticket does not match the upload")

// CheckLinkUpload checks an upload started with an upload link (scoped) ticket; other uploads pass.
func CheckLinkUpload(principal enginetoken.Principal, request Request, size int64) error {
	if principal.Scope == "" {
		return nil
	}
	grant := principal.Upload
	if grant == nil || principal.TicketID == "" || principal.Mode != enginetoken.ModeUpload ||
		request.Folder != principal.Scope || request.RelativeDir != "" ||
		request.Strategy != transfer.StrategyKeepBoth || grant.Name != request.Name || grant.Size != size {
		return ErrLinkTicket
	}
	return nil
}
