package httpapi

import (
	"context"
	"errors"
	"log/slog"
	"net/http"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/api"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/authz"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/enginetoken"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/listing"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/logging"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/preview"
)

const (
	codeForbidden    = "files.forbidden"
	codeUnauthorized = "auth.engine_token_invalid"
	defaultLimit     = 100
)

// Files reads the managed tree (an fsx.Resolver in production).
type Files interface {
	Stat(virtual string) (fsx.Entry, error)
	ReadDir(virtual string) ([]fsx.Entry, error)
	Walk(virtual string, visit func(path string, entry fsx.Entry) error) error
}

// Grants loads the path grants that may apply to a subject.
type Grants interface {
	GrantsFor(ctx context.Context, subject authz.Subject) ([]authz.Grant, error)
}

func subjectOf(principal enginetoken.Principal) authz.Subject {
	return authz.Subject{
		UserID: principal.UserID, Groups: principal.Groups, Admin: principal.IsAdmin(), Scope: principal.Scope,
	}
}

func toActions(actions []string) []api.PathAction {
	result := make([]api.PathAction, 0, len(actions))
	for _, action := range actions {
		result = append(result, api.PathAction(action))
	}
	return result
}

func (s *server) ListDirectory(ctx context.Context, request api.ListDirectoryRequestObject) (api.ListDirectoryResponseObject, error) {
	principal, ok := enginetoken.FromContext(ctx)
	if !ok {
		return api.ListDirectory401JSONResponse(newError(ctx, codeUnauthorized)), nil
	}
	dir, err := fsx.Clean(request.Params.Path)
	if err != nil {
		return api.ListDirectory400JSONResponse(newError(ctx, fsx.CodeInvalidPath)), nil
	}
	subject := subjectOf(principal)
	grants, err := s.grantsOf(ctx, subject)
	if err != nil {
		return nil, err
	}
	if !authz.MayTraverse(grants, subject, dir) {
		return api.ListDirectory403JSONResponse(newError(ctx, codeForbidden)), nil
	}

	entries, err := s.deps.Files.ReadDir(dir)
	switch {
	case errors.Is(err, fsx.ErrNotDir):
		return api.ListDirectory404JSONResponse(newError(ctx, fsx.CodeNotDir)), nil
	case errors.Is(err, fsx.ErrNotFound):
		return api.ListDirectory404JSONResponse(newError(ctx, fsx.CodeNotFound)), nil
	case err != nil:
		logging.FromContext(ctx, s.deps.Logger).Error("list failed", slog.Any("error", err))
		return nil, err //nolint:wrapcheck // answered as system.internal
	}

	page := listing.Build(dir, entries, grants, subject, optionsOf(request.Params))
	body := api.ListDirectory200JSONResponse{
		Path:    dir,
		Total:   page.Total,
		Actions: toActions(authz.Capabilities(grants, subject, dir)),
		Entries: make([]api.DirectoryEntry, 0, len(page.Items)),
	}
	thumbnailed := s.thumbnailRule(ctx)
	for _, item := range page.Items {
		body.Entries = append(body.Entries, toDirectoryEntry(item, thumbnailed))
	}
	return body, nil
}

// thumbnailRule reads the thumbnail settings once per listing.
func (s *server) thumbnailRule(ctx context.Context) func(name string, size int64) bool {
	if s.deps.Thumbs == nil {
		return func(string, int64) bool { return false }
	}
	settings := s.deps.Thumbs.Current(ctx)
	return func(name string, size int64) bool { return s.deps.Thumbs.Available(settings, name, size) }
}

func toDirectoryEntry(item listing.Item, thumbnailed func(name string, size int64) bool) api.DirectoryEntry {
	entry := api.DirectoryEntry{
		Name: item.Name, Path: item.Path, Kind: api.File, Size: item.Size,
		Modified: item.Modified, Actions: toActions(item.Actions), Preview: api.PreviewKind(preview.None),
	}
	if item.IsDir {
		entry.Kind = api.Directory
		return entry
	}
	kind, _ := preview.Classify(item.Name)
	entry.Preview = api.PreviewKind(kind)
	entry.Thumbnail = thumbnailed(item.Name, item.Size)
	return entry
}

func optionsOf(params api.ListDirectoryParams) listing.Options {
	opts := listing.Options{Sort: listing.SortName, Limit: defaultLimit}
	if params.DirsOnly != nil {
		opts.DirsOnly = *params.DirsOnly
	}
	if params.Sort != nil {
		opts.Sort = string(*params.Sort)
	}
	if params.Order != nil {
		opts.Order = string(*params.Order)
	}
	if params.Offset != nil {
		opts.Offset = *params.Offset
	}
	if params.Limit != nil {
		opts.Limit = *params.Limit
	}
	return opts
}

// requireToken guards every /v1 route with the engine token; health probes stay open.
func requireToken(verifier *enginetoken.Verifier, logger *slog.Logger) func(http.Handler) http.Handler {
	guard := enginetoken.Middleware(verifier, func(w http.ResponseWriter, r *http.Request, status int, code string) {
		errorHandler(logger, status, code)(w, r, errors.New(code))
	}, isStreamRoute, isScopedRoute)
	return func(next http.Handler) http.Handler {
		guarded := guard(next)
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if len(r.URL.Path) >= 4 && r.URL.Path[:4] == "/v1/" {
				guarded.ServeHTTP(w, r)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
