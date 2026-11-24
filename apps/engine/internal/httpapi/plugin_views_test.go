package httpapi

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/api"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/commands"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/enginetoken"
)

type fakeViews struct {
	data map[string]any
	err  error
}

func (f fakeViews) Find(pluginID, viewID string) (commands.PluginView, commands.Entry, string, bool) {
	return commands.PluginView{ID: viewID}, commands.Entry{}, "", pluginID == "jd" && viewID == "downloads"
}

func (f fakeViews) Read(context.Context, string, string) (map[string]any, error) {
	return f.data, f.err
}

func TestReadPluginView(t *testing.T) {
	public, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	h := jobsHarness{t: t, verify: enginetoken.NewVerifier(public, time.Now)}
	viewer := signToken(t, private, []string{commands.ViewPermission("jd", "downloads")})
	stranger := signToken(t, private, nil)
	admin := signToken(t, private, []string{enginetoken.AdminPermission})
	ok := fakeViews{data: map[string]any{"version": float64(1)}}

	cases := []struct {
		name   string
		views  PluginViews
		target string
		token  string
		status int
		code   string
	}{
		{"holder reads", ok, "/v1/plugins/jd/views/downloads", viewer, http.StatusOK, ""},
		{"administrator reads", ok, "/v1/plugins/jd/views/downloads", admin, http.StatusOK, ""},
		{"no permission", ok, "/v1/plugins/jd/views/downloads", stranger, http.StatusForbidden, codeViewDenied},
		{"unknown view", ok, "/v1/plugins/jd/views/queue", admin, http.StatusNotFound, codeViewNotFound},
		{"no views at all", nil, "/v1/plugins/jd/views/downloads", admin, http.StatusNotFound, codeViewNotFound},
		{"source fails", fakeViews{err: commands.ErrViewFailed}, "/v1/plugins/jd/views/downloads", admin, http.StatusBadGateway, codeViewFailed},
		{"gone meanwhile", fakeViews{err: commands.ErrNoView}, "/v1/plugins/jd/views/downloads", admin, http.StatusNotFound, codeViewNotFound},
		{"no token", ok, "/v1/plugins/jd/views/downloads", "", http.StatusUnauthorized, ""},
	}
	for _, c := range cases {
		deps := Deps{}
		if c.views != nil {
			deps.Views = c.views
		}
		recorder, failure := h.call(deps, http.MethodGet, c.target, c.token, "")
		if recorder.Code != c.status || (c.code != "" && failure.Code != c.code) {
			t.Errorf("%s: %d %q", c.name, recorder.Code, failure.Code)
		}
		if c.status == http.StatusOK {
			var data api.PluginViewData
			if json.Unmarshal(recorder.Body.Bytes(), &data) != nil || data.Data["version"] != float64(1) {
				t.Errorf("%s: body %s", c.name, recorder.Body.String())
			}
		}
	}
}

func TestMayUseEntry(t *testing.T) {
	plugin := &commands.PluginRef{ID: "jd", Views: []commands.PluginView{{
		ID: "downloads", Source: "jd.state",
		Actions: []commands.ViewAction{{ID: "pause", Command: "jd.pause", On: commands.OnView}},
	}}}
	pause := commands.Entry{ID: "jd.pause", Plugin: plugin}
	connect := commands.Entry{ID: "jd.connect", Plugin: plugin}
	holder := enginetoken.Principal{Permissions: []string{commands.ViewPermission("jd", "downloads")}}
	admin := enginetoken.Principal{Permissions: []string{enginetoken.AdminPermission}}
	stranger := enginetoken.Principal{}
	if !mayUseEntry(holder, pause) || !mayUseEntry(admin, pause) || mayUseEntry(stranger, pause) {
		t.Fatal("a view's command needs the view's permission")
	}
	if !mayUseEntry(stranger, connect) || !mayUseEntry(stranger, commands.Entry{ID: "rsync.sync"}) {
		t.Fatal("other commands follow the usual rules")
	}
}
