package httpapi

import (
	"context"
	"errors"
	"io/fs"
	"mime"
	"path"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/api"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/authz"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/enginetoken"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/listing"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/preview"
)

// visibleEntry describes one entry as a listing would. Hidden and missing look alike from
// outside the caller's grants (fsx.ErrNotFound); a bad path is fsx.ErrInvalidPath.
func (s *server) visibleEntry(ctx context.Context, principal enginetoken.Principal, raw string) (api.DirectoryEntry, error) {
	clean, err := fsx.Clean(raw)
	if err != nil {
		return api.DirectoryEntry{}, fsx.ErrInvalidPath
	}
	subject := subjectOf(principal)
	grants, err := s.grantsOf(ctx, subject)
	if err != nil {
		return api.DirectoryEntry{}, err
	}
	entry, err := s.deps.Files.Stat(clean)
	if err != nil {
		return api.DirectoryEntry{}, err //nolint:wrapcheck // classified by the caller
	}
	if !listing.Visible(grants, subject, clean, entry.IsDir) {
		return api.DirectoryEntry{}, fsx.ErrNotFound
	}
	return toDirectoryEntry(listing.Item{
		Name: path.Base(clean), Path: clean, IsDir: entry.IsDir, Size: entry.Size,
		Modified: entry.Modified, Actions: authz.Capabilities(grants, subject, clean),
	}, s.thumbnailRule(ctx)), nil
}

// StatEntry describes one entry as a listing would, if the caller may see it.
func (s *server) StatEntry(ctx context.Context, request api.StatEntryRequestObject) (api.StatEntryResponseObject, error) {
	principal, ok := enginetoken.FromContext(ctx)
	if !ok {
		return api.StatEntry401JSONResponse(newError(ctx, codeUnauthorized)), nil
	}
	entry, err := s.visibleEntry(ctx, principal, request.Params.Path)
	switch {
	case errors.Is(err, fsx.ErrInvalidPath):
		return api.StatEntry400JSONResponse(newError(ctx, fsx.CodeInvalidPath)), nil
	case errors.Is(err, fsx.ErrNotFound):
		return api.StatEntry404JSONResponse(newError(ctx, fsx.CodeNotFound)), nil
	case err != nil:
		return nil, err
	}
	return api.StatEntry200JSONResponse(entry), nil
}

// GetEntryProperties adds what the host knows about a visible entry, for the Properties dialog.
func (s *server) GetEntryProperties(ctx context.Context, request api.GetEntryPropertiesRequestObject) (api.GetEntryPropertiesResponseObject, error) {
	principal, ok := enginetoken.FromContext(ctx)
	if !ok {
		return api.GetEntryProperties401JSONResponse(newError(ctx, codeUnauthorized)), nil
	}
	entry, err := s.visibleEntry(ctx, principal, request.Params.Path)
	var details fsx.Details
	if err == nil {
		details, err = s.deps.Ops.Describe(entry.Path)
	}
	switch {
	case errors.Is(err, fsx.ErrInvalidPath):
		return api.GetEntryProperties400JSONResponse(newError(ctx, fsx.CodeInvalidPath)), nil
	case errors.Is(err, fsx.ErrNotFound):
		return api.GetEntryProperties404JSONResponse(newError(ctx, fsx.CodeNotFound)), nil
	case err != nil:
		return nil, err //nolint:wrapcheck // answered as system.internal
	}
	body := api.GetEntryProperties200JSONResponse{
		Entry: entry, Link: details.Mode&fs.ModeSymlink != 0,
		Mode: lsMode(details.Mode), Permissions: int(details.Mode.Perm()),
	}
	if entry.Kind == api.File {
		body.MimeType = mimeTypeOf(entry.Path)
	}
	if details.LinkTarget != "" {
		body.LinkTarget = &details.LinkTarget
	}
	if details.Owner != nil {
		uid, gid := int64(details.Owner.UID), int64(details.Owner.GID)
		body.Uid, body.Gid = &uid, &gid
	}
	if !details.Changed.IsZero() {
		body.Changed = &details.Changed
	}
	return body, nil
}

// lsMode prints a mode like `ls -l`: a type letter, then rwx for owner, group and others.
func lsMode(mode fs.FileMode) string {
	kind := "-"
	switch {
	case mode.IsDir():
		kind = "d"
	case mode&fs.ModeSymlink != 0:
		kind = "l"
	case !mode.IsRegular():
		kind = "?"
	}
	return kind + mode.Perm().String()[1:]
}

// mimeTypeOf names a file's media type from its extension: the previewer's table first, then
// the platform's; nil when unknown.
func mimeTypeOf(name string) *string {
	if _, contentType := preview.Classify(name); contentType != "" {
		return &contentType
	}
	if guessed := mime.TypeByExtension(path.Ext(name)); guessed != "" {
		return &guessed
	}
	return nil
}
