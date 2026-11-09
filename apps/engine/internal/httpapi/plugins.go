package httpapi

import (
	"context"
	"errors"
	"fmt"
	"io"
	"mime/multipart"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/api"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/enginetoken"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/plugins"
)

// codeAdminOnly: plugins are managed by administrators only.
const codeAdminOnly = "auth.forbidden"

// maxPluginText bounds the manifest and the checksum file.
const maxPluginText = 64 << 10

// Plugins manages installed plugins.
type Plugins interface {
	List(ctx context.Context) ([]plugins.Installed, error)
	Inspect(manifest []byte) (plugins.Release, error)
	Install(ctx context.Context, manifest, checksums []byte, binary io.Reader, by string) (plugins.Manifest, error)
	SetFlags(ctx context.Context, id string, enabled, pinned bool) error
	Uninstall(ctx context.Context, id string) error
}

var errPluginParts = errors.New("expected manifest, checksums, then binary")

func toPlugin(item plugins.Installed) api.Plugin {
	return api.Plugin{
		Id: item.ID, Version: item.Version, Repo: item.Repo, Enabled: item.Enabled, Pinned: item.Pinned,
		InstalledAt: item.InstalledAt.UTC(), Name: localized(item.Name), Description: localized(item.Description),
		Commands: item.Commands,
	}
}

// adminPrincipal returns the caller when they are an administrator.
func adminPrincipal(ctx context.Context) (enginetoken.Principal, bool, bool) {
	principal, ok := enginetoken.FromContext(ctx)
	return principal, ok, ok && principal.IsAdmin()
}

func (s *server) pluginByID(ctx context.Context, id string) (api.Plugin, error) {
	items, err := s.deps.Plugins.List(ctx)
	if err != nil {
		return api.Plugin{}, err //nolint:wrapcheck // answered as system.internal
	}
	for _, item := range items {
		if item.ID == id {
			return toPlugin(item), nil
		}
	}
	return api.Plugin{Id: id}, nil
}

func (s *server) ListPlugins(ctx context.Context, _ api.ListPluginsRequestObject) (api.ListPluginsResponseObject, error) {
	_, ok, admin := adminPrincipal(ctx)
	switch {
	case !ok:
		return api.ListPlugins401JSONResponse(newError(ctx, codeUnauthorized)), nil
	case !admin:
		return api.ListPlugins403JSONResponse(newError(ctx, codeAdminOnly)), nil
	}
	items, err := s.deps.Plugins.List(ctx)
	if err != nil {
		return nil, err //nolint:wrapcheck // answered as system.internal
	}
	body := api.ListPlugins200JSONResponse{Platform: plugins.Platform(), Items: make([]api.Plugin, 0, len(items))}
	for _, item := range items {
		body.Items = append(body.Items, toPlugin(item))
	}
	return body, nil
}

func (s *server) InspectPlugin(ctx context.Context, request api.InspectPluginRequestObject) (api.InspectPluginResponseObject, error) {
	_, ok, admin := adminPrincipal(ctx)
	switch {
	case !ok:
		return api.InspectPlugin401JSONResponse(newError(ctx, codeUnauthorized)), nil
	case !admin:
		return api.InspectPlugin403JSONResponse(newError(ctx, codeAdminOnly)), nil
	}
	release, err := s.deps.Plugins.Inspect([]byte(request.Body.Manifest))
	if errors.Is(err, plugins.ErrPlatform) {
		return api.InspectPlugin400JSONResponse(newError(ctx, plugins.CodePlatform)), nil
	}
	if err != nil {
		return api.InspectPlugin400JSONResponse(newError(ctx, plugins.CodeManifest)), nil
	}
	manifest := release.Manifest
	return api.InspectPlugin200JSONResponse{
		Id: manifest.ID, Version: manifest.Version, Repo: manifest.Source.Repo,
		Name: localized(manifest.Name), Description: localized(manifest.Description), Commands: len(manifest.Commands),
		BinaryAsset: release.BinaryAsset, ChecksumsAsset: release.ChecksumsAsset,
	}, nil
}

func (s *server) InstallPlugin(ctx context.Context, request api.InstallPluginRequestObject) (api.InstallPluginResponseObject, error) {
	principal, ok, admin := adminPrincipal(ctx)
	switch {
	case !ok:
		return api.InstallPlugin401JSONResponse(newError(ctx, codeUnauthorized)), nil
	case !admin:
		return api.InstallPlugin403JSONResponse(newError(ctx, codeAdminOnly)), nil
	}
	manifest, err := s.receivePlugin(ctx, request.Body, principal.UserID)
	switch {
	case errors.Is(err, plugins.ErrManifest), errors.Is(err, errPluginParts):
		return api.InstallPlugin400JSONResponse(newError(ctx, plugins.CodeManifest)), nil
	case errors.Is(err, plugins.ErrChecksum):
		return api.InstallPlugin400JSONResponse(newError(ctx, plugins.CodeChecksum)), nil
	case errors.Is(err, plugins.ErrPlatform):
		return api.InstallPlugin400JSONResponse(newError(ctx, plugins.CodePlatform)), nil
	case err != nil:
		return nil, err
	}
	s.record(ctx, principal, "plugins.install", manifest.ID, map[string]any{
		"version": manifest.Version, "repo": manifest.Source.Repo, "commands": len(manifest.Commands),
	})
	plugin, err := s.pluginByID(ctx, manifest.ID)
	if err != nil {
		return nil, err
	}
	return api.InstallPlugin201JSONResponse(plugin), nil
}

// receivePlugin reads the parts in order; the binary streams into the install, never whole in
// memory.
func (s *server) receivePlugin(ctx context.Context, body *multipart.Reader, by string) (plugins.Manifest, error) {
	if body == nil {
		return plugins.Manifest{}, errPluginParts
	}
	texts := map[string][]byte{}
	for _, name := range []string{"manifest", "checksums"} {
		part, err := body.NextPart()
		if err != nil || part.FormName() != name {
			return plugins.Manifest{}, errPluginParts
		}
		data, err := io.ReadAll(io.LimitReader(part, maxPluginText+1))
		if err != nil || len(data) > maxPluginText {
			return plugins.Manifest{}, errPluginParts
		}
		texts[name] = data
	}
	part, err := body.NextPart()
	if err != nil || part.FormName() != "binary" {
		return plugins.Manifest{}, errPluginParts
	}
	manifest, err := s.deps.Plugins.Install(ctx, texts["manifest"], texts["checksums"], part, by)
	if err != nil {
		return plugins.Manifest{}, fmt.Errorf("install plugin: %w", err)
	}
	return manifest, nil
}

func (s *server) UpdatePlugin(ctx context.Context, request api.UpdatePluginRequestObject) (api.UpdatePluginResponseObject, error) {
	principal, ok, admin := adminPrincipal(ctx)
	switch {
	case !ok:
		return api.UpdatePlugin401JSONResponse(newError(ctx, codeUnauthorized)), nil
	case !admin:
		return api.UpdatePlugin403JSONResponse(newError(ctx, codeAdminOnly)), nil
	}
	flags := *request.Body
	err := s.deps.Plugins.SetFlags(ctx, request.PluginId, flags.Enabled, flags.Pinned)
	if errors.Is(err, plugins.ErrNotFound) {
		return api.UpdatePlugin404JSONResponse(newError(ctx, plugins.CodeNotFound)), nil
	}
	if err != nil {
		return nil, err //nolint:wrapcheck // answered as system.internal
	}
	s.record(ctx, principal, "plugins.update", request.PluginId, map[string]any{
		"enabled": flags.Enabled, "pinned": flags.Pinned,
	})
	plugin, err := s.pluginByID(ctx, request.PluginId)
	if err != nil {
		return nil, err
	}
	return api.UpdatePlugin200JSONResponse(plugin), nil
}

func (s *server) UninstallPlugin(ctx context.Context, request api.UninstallPluginRequestObject) (api.UninstallPluginResponseObject, error) {
	principal, ok, admin := adminPrincipal(ctx)
	switch {
	case !ok:
		return api.UninstallPlugin401JSONResponse(newError(ctx, codeUnauthorized)), nil
	case !admin:
		return api.UninstallPlugin403JSONResponse(newError(ctx, codeAdminOnly)), nil
	}
	err := s.deps.Plugins.Uninstall(ctx, request.PluginId)
	if errors.Is(err, plugins.ErrNotFound) {
		return api.UninstallPlugin404JSONResponse(newError(ctx, plugins.CodeNotFound)), nil
	}
	if err != nil {
		return nil, err //nolint:wrapcheck // answered as system.internal
	}
	s.record(ctx, principal, "plugins.uninstall", request.PluginId, nil)
	return api.UninstallPlugin204Response{}, nil
}
