package httpapi

import (
	"context"
	"errors"
	"log/slog"
	"slices"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/api"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/commands"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/enginetoken"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/logging"
)

const (
	codeViewNotFound = "plugins.view_not_found"
	codeViewFailed   = "plugins.view_failed"
	codeViewDenied   = "plugins.view_forbidden"
)

// PluginViews finds plugin views and runs their sources.
type PluginViews interface {
	Find(pluginID, viewID string) (commands.PluginView, commands.Entry, string, bool)
	Read(ctx context.Context, pluginID, viewID string) (map[string]any, error)
}

// mayReadView: administrators, and holders of the view's permission.
func mayReadView(principal enginetoken.Principal, pluginID, viewID string) bool {
	return principal.IsAdmin() || slices.Contains(principal.Permissions, commands.ViewPermission(pluginID, viewID))
}

// mayUseEntry: commands a plugin view runs need one of those views' permissions, whatever page
// starts them; other commands follow the catalog's usual rules.
func mayUseEntry(principal enginetoken.Principal, entry commands.Entry) bool {
	views := commands.ViewsUsing(entry)
	if len(views) == 0 {
		return true
	}
	return slices.ContainsFunc(views, func(view string) bool { return mayReadView(principal, entry.Plugin.ID, view) })
}

func (s *server) ReadPluginView(ctx context.Context, request api.ReadPluginViewRequestObject) (api.ReadPluginViewResponseObject, error) {
	principal, ok := enginetoken.FromContext(ctx)
	if !ok || principal.Scope != "" {
		return api.ReadPluginView401JSONResponse(newError(ctx, codeUnauthorized)), nil
	}
	if s.deps.Views == nil {
		return api.ReadPluginView404JSONResponse(newError(ctx, codeViewNotFound)), nil
	}
	if _, _, _, found := s.deps.Views.Find(request.Plugin, request.View); !found {
		return api.ReadPluginView404JSONResponse(newError(ctx, codeViewNotFound)), nil
	}
	if !mayReadView(principal, request.Plugin, request.View) {
		return api.ReadPluginView403JSONResponse(newError(ctx, codeViewDenied)), nil
	}
	data, err := s.deps.Views.Read(ctx, request.Plugin, request.View)
	switch {
	case errors.Is(err, commands.ErrNoView):
		return api.ReadPluginView404JSONResponse(newError(ctx, codeViewNotFound)), nil
	case err != nil:
		logging.FromContext(ctx, s.deps.Logger).Warn("plugin view failed",
			slog.String("plugin", request.Plugin), slog.String("view", request.View), slog.Any("error", err))
		return api.ReadPluginView502JSONResponse(newError(ctx, codeViewFailed)), nil
	}
	return api.ReadPluginView200JSONResponse{Data: data}, nil
}
