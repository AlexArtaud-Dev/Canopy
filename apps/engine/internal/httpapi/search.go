package httpapi

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/api"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/authz"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/enginetoken"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/listing"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/logging"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/search"
)

// codeInvalidQuery: the search words are too short or too long.
const codeInvalidQuery = "files.invalid_query"

// SearchFiles walks the folder within the search limits. Reading names changes nothing, so it is
// not audited.
func (s *server) SearchFiles(ctx context.Context, request api.SearchFilesRequestObject) (api.SearchFilesResponseObject, error) {
	principal, ok := enginetoken.FromContext(ctx)
	if !ok {
		return api.SearchFiles401JSONResponse(newError(ctx, codeUnauthorized)), nil
	}
	dir, err := fsx.Clean(request.Params.Path)
	if err != nil {
		return api.SearchFiles400JSONResponse(newError(ctx, fsx.CodeInvalidPath)), nil
	}
	terms, err := search.Terms(request.Params.Q)
	if err != nil {
		return api.SearchFiles400JSONResponse(newError(ctx, codeInvalidQuery)), nil
	}
	subject := subjectOf(principal)
	grants, err := s.grantsOf(ctx, subject)
	if err != nil {
		return nil, err
	}
	if !authz.MayTraverse(grants, subject, dir) {
		return api.SearchFiles403JSONResponse(newError(ctx, codeForbidden)), nil
	}
	visible := func(path string, isDir bool) bool { return listing.Visible(grants, subject, path, isDir) }
	found, err := search.Run(ctx, s.deps.Files, dir, terms, visible, search.DefaultLimits, time.Now)
	switch {
	case errors.Is(err, fsx.ErrNotDir):
		return api.SearchFiles404JSONResponse(newError(ctx, fsx.CodeNotDir)), nil
	case errors.Is(err, fsx.ErrNotFound):
		return api.SearchFiles404JSONResponse(newError(ctx, fsx.CodeNotFound)), nil
	case err != nil:
		logging.FromContext(ctx, s.deps.Logger).Error("search failed", slog.Any("error", err))
		return nil, err //nolint:wrapcheck // answered as system.internal
	}

	body := api.SearchFiles200JSONResponse{Path: dir, Entries: make([]api.DirectoryEntry, 0, len(found.Matches))}
	if found.Truncated != "" {
		reason := api.SearchResultsTruncated(found.Truncated)
		body.Truncated = &reason
	}
	thumbnailed := s.thumbnailRule(ctx)
	for _, match := range found.Matches {
		body.Entries = append(body.Entries, toDirectoryEntry(listing.Item{
			Name: match.Entry.Name, Path: match.Path, IsDir: match.Entry.IsDir, Size: match.Entry.Size,
			Modified: match.Entry.Modified, Actions: authz.Capabilities(grants, subject, match.Path),
		}, thumbnailed))
	}
	return body, nil
}

// grantsOf loads the grants that may apply; administrators bypass grants, so none are loaded.
func (s *server) grantsOf(ctx context.Context, subject authz.Subject) ([]authz.Grant, error) {
	if subject.Admin {
		return nil, nil
	}
	grants, err := s.deps.Grants.GrantsFor(ctx, subject)
	if err != nil {
		return nil, err //nolint:wrapcheck // the strict handler logs it and answers system.internal
	}
	return grants, nil
}
