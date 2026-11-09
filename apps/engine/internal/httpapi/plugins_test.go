package httpapi

import (
	"bytes"
	"context"
	"errors"
	"io"
	"log/slog"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/api"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/commands"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/plugins"
)

type fakePlugins struct {
	installed  []plugins.Installed
	listErr    error
	installErr error
	flagsErr   error
	removeErr  error
	received   string
}

func (f *fakePlugins) List(context.Context) ([]plugins.Installed, error) {
	return f.installed, f.listErr
}

func (f *fakePlugins) Install(_ context.Context, manifest, _ []byte, binary io.Reader, _ string) (plugins.Manifest, error) {
	data, _ := io.ReadAll(binary)
	f.received = string(manifest) + "|" + string(data)
	return plugins.Manifest{ID: "tool", Version: "1.0.0"}, f.installErr
}

func (f *fakePlugins) SetFlags(context.Context, string, bool, bool) error { return f.flagsErr }

func (f *fakePlugins) Uninstall(context.Context, string) error { return f.removeErr }

func pluginBody(t *testing.T, parts ...string) (string, string) {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for i := 0; i+1 < len(parts); i += 2 {
		field, err := writer.CreateFormField(parts[i])
		if err != nil {
			t.Fatal(err)
		}
		_, _ = field.Write([]byte(parts[i+1]))
	}
	_ = writer.Close()
	return body.String(), writer.FormDataContentType()
}

func TestPluginEndpoints(t *testing.T) {
	h := newJobsHarness(t)
	installed := []plugins.Installed{{
		Record: plugins.Record{ID: "tool", Version: "1.0.0", Repo: "o/tool", Enabled: true, InstalledAt: time.Unix(0, 0)},
		Name:   commands.Text{En: "Tool", Fr: "Outil", Es: "Herramienta"}, Commands: 2,
	}}
	auditLog := &fakeAudit{}
	call := func(service *fakePlugins, method, target, token, body, contentType string) *httptest.ResponseRecorder {
		deps := Deps{
			Plugins: service, Audit: auditLog, Grants: bobCanWork,
			Logger: slog.New(slog.NewTextHandler(io.Discard, nil)), Database: pingOK{}, Verifier: h.verify,
		}
		request := httptest.NewRequest(method, target, bytes.NewBufferString(body))
		request.Header.Set("Content-Type", contentType)
		request.Header.Set("Authorization", "Bearer "+token)
		recorder := httptest.NewRecorder()
		NewRouter(deps).ServeHTTP(recorder, request)
		return recorder
	}
	service := &fakePlugins{installed: installed}
	if got := call(service, http.MethodGet, "/v1/plugins", h.admin, "", ""); got.Code != http.StatusOK {
		t.Fatalf("list: %d", got.Code)
	}
	for _, route := range []struct{ method, target string }{
		{http.MethodGet, "/v1/plugins"},
		{http.MethodPatch, "/v1/plugins/tool"},
		{http.MethodDelete, "/v1/plugins/tool"},
	} {
		if got := call(service, route.method, route.target, h.user, `{"enabled":true,"pinned":false}`, "application/json"); got.Code != http.StatusForbidden {
			t.Errorf("%s %s by a user: %d", route.method, route.target, got.Code)
		}
	}

	body, contentType := pluginBody(t, "manifest", "id: tool", "checksums", "sums", "binary", "BIN")
	if got := call(service, http.MethodPost, "/v1/plugins", h.user, body, contentType); got.Code != http.StatusForbidden {
		t.Fatalf("install by a user: %d", got.Code)
	}
	if got := call(service, http.MethodPost, "/v1/plugins", h.admin, body, contentType); got.Code != http.StatusCreated || service.received != "id: tool|BIN" {
		t.Fatalf("install: %d %q", got.Code, service.received)
	}
	if last := auditLog.events[len(auditLog.events)-1]; last.Action != "plugins.install" {
		t.Fatalf("audit: %+v", last)
	}
	refusals := []struct {
		err  error
		code string
	}{
		{plugins.ErrManifest, plugins.CodeManifest},
		{plugins.ErrChecksum, plugins.CodeChecksum},
		{plugins.ErrPlatform, plugins.CodePlatform},
	}
	for _, tc := range refusals {
		body, contentType := pluginBody(t, "manifest", "m", "checksums", "c", "binary", "b")
		if got := call(&fakePlugins{installErr: tc.err}, http.MethodPost, "/v1/plugins", h.admin, body, contentType); got.Code != http.StatusBadRequest {
			t.Errorf("%v: %d", tc.err, got.Code)
		}
	}
	for _, parts := range [][]string{{"binary", "b"}, {"manifest", "m", "binary", "b"}, {"manifest", "m", "checksums", "c"}} {
		body, contentType := pluginBody(t, parts...)
		if got := call(service, http.MethodPost, "/v1/plugins", h.admin, body, contentType); got.Code != http.StatusBadRequest {
			t.Errorf("parts %v: %d", parts, got.Code)
		}
	}
	body, contentType = pluginBody(t, "manifest", "m", "checksums", "c", "binary", "b")
	if got := call(&fakePlugins{installErr: errors.New("disk")}, http.MethodPost, "/v1/plugins", h.admin, body, contentType); got.Code != http.StatusInternalServerError {
		t.Fatalf("disk: %d", got.Code)
	}

	flags := `{"enabled":false,"pinned":true}`
	if got := call(service, http.MethodPatch, "/v1/plugins/tool", h.admin, flags, "application/json"); got.Code != http.StatusOK {
		t.Fatalf("flags: %d", got.Code)
	}
	if got := call(&fakePlugins{flagsErr: plugins.ErrNotFound}, http.MethodPatch, "/v1/plugins/none", h.admin, flags, "application/json"); got.Code != http.StatusNotFound {
		t.Fatalf("flags missing: %d", got.Code)
	}
	if got := call(&fakePlugins{flagsErr: errors.New("db")}, http.MethodPatch, "/v1/plugins/tool", h.admin, flags, "application/json"); got.Code != http.StatusInternalServerError {
		t.Fatalf("flags db: %d", got.Code)
	}
	if got := call(service, http.MethodDelete, "/v1/plugins/tool", h.admin, "", ""); got.Code != http.StatusNoContent {
		t.Fatalf("uninstall: %d", got.Code)
	}
	if got := call(&fakePlugins{removeErr: plugins.ErrNotFound}, http.MethodDelete, "/v1/plugins/none", h.admin, "", ""); got.Code != http.StatusNotFound {
		t.Fatalf("uninstall missing: %d", got.Code)
	}
	if got := call(&fakePlugins{removeErr: errors.New("db")}, http.MethodDelete, "/v1/plugins/tool", h.admin, "", ""); got.Code != http.StatusInternalServerError {
		t.Fatalf("uninstall db: %d", got.Code)
	}
	if got := call(&fakePlugins{listErr: errors.New("db")}, http.MethodGet, "/v1/plugins", h.admin, "", ""); got.Code != http.StatusInternalServerError {
		t.Fatalf("list db: %d", got.Code)
	}
	if got := call(&fakePlugins{listErr: errors.New("db")}, http.MethodPatch, "/v1/plugins/tool", h.admin, flags, "application/json"); got.Code != http.StatusInternalServerError {
		t.Fatalf("reload db: %d", got.Code)
	}

	s := &server{deps: Deps{Logger: slog.New(slog.NewTextHandler(io.Discard, nil))}}
	ctx := context.Background()
	list, _ := s.ListPlugins(ctx, api.ListPluginsRequestObject{})
	install, _ := s.InstallPlugin(ctx, api.InstallPluginRequestObject{})
	update, _ := s.UpdatePlugin(ctx, api.UpdatePluginRequestObject{})
	remove, _ := s.UninstallPlugin(ctx, api.UninstallPluginRequestObject{})
	_, a := list.(api.ListPlugins401JSONResponse)
	_, b := install.(api.InstallPlugin401JSONResponse)
	_, c := update.(api.UpdatePlugin401JSONResponse)
	_, d := remove.(api.UninstallPlugin401JSONResponse)
	if !a || !b || !c || !d {
		t.Fatal("no principal")
	}
	if _, err := s.receivePlugin(ctx, nil, "root"); !errors.Is(err, errPluginParts) {
		t.Fatal("no body")
	}
}
