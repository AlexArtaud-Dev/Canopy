package httpapi

import (
	"context"
	"errors"
	"path"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/api"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/authz"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/enginetoken"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/listing"
)

// StatEntry describes one entry as a listing would, if the caller may see it.
func (s *server) StatEntry(ctx context.Context, request api.StatEntryRequestObject) (api.StatEntryResponseObject, error) {
	principal, ok := enginetoken.FromContext(ctx)
	if !ok {
		return api.StatEntry401JSONResponse(newError(ctx, codeUnauthorized)), nil
	}
	clean, err := fsx.Clean(request.Params.Path)
	if err != nil {
		return api.StatEntry400JSONResponse(newError(ctx, fsx.CodeInvalidPath)), nil
	}
	subject := subjectOf(principal)
	grants, err := s.grantsOf(ctx, subject)
	if err != nil {
		return nil, err
	}
	entry, err := s.deps.Files.Stat(clean)
	if errors.Is(err, fsx.ErrNotFound) {
		return api.StatEntry404JSONResponse(newError(ctx, fsx.CodeNotFound)), nil
	}
	if err != nil {
		return nil, err //nolint:wrapcheck // answered as system.internal
	}
	// Hidden and missing look alike from outside the caller's grants.
	if !listing.Visible(grants, subject, clean, entry.IsDir) {
		return api.StatEntry404JSONResponse(newError(ctx, fsx.CodeNotFound)), nil
	}
	return api.StatEntry200JSONResponse(toDirectoryEntry(listing.Item{
		Name: path.Base(clean), Path: clean, IsDir: entry.IsDir, Size: entry.Size,
		Modified: entry.Modified, Actions: authz.Capabilities(grants, subject, clean),
	}, s.thumbnailRule(ctx))), nil
}
