package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/api"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/commands"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/jobs"
)

const testCatalog = `
- id: tool.copy
  name: { en: Copy, fr: Copier, es: Copiar }
  description: { en: x, fr: x, es: x }
  binary: cp
  mode: advanced
  params:
    - { name: source, type: path, access: read, required: true, label: { en: S, fr: S, es: S } }
    - { name: target, type: path, access: create, required: true, label: { en: T, fr: T, es: T } }
    - { name: level, type: enum, values: [a, b], label: { en: L, fr: L, es: L } }
    - { name: verbose, type: bool, flag: "-v", default: false, secret: false, label: { en: V, fr: V, es: V } }
  args: ["{flags}", "{source}", "{target}"]
  progressParser: none
  dryRun: { flag: "--dry-run" }
  timeout: 1m
- id: tool.list
  name: { en: List, fr: Lister, es: Listar }
  description: { en: x, fr: x, es: x }
  binary: ls
  mode: basic
  params: []
  args: ["-l"]
  progressParser: line-count
  timeout: 1m
`

func catalogForTest(t *testing.T) *commands.Available {
	t.Helper()
	entries, err := commands.Parse([]byte(testCatalog))
	if err != nil {
		t.Fatal(err)
	}
	return commands.NewAvailable(entries, func(name string) (string, error) { return "/bin/" + name, nil })
}

func TestCommandEndpoints(t *testing.T) {
	h := newJobsHarness(t)
	resolver, _ := opsTree(t)
	catalog := catalogForTest(t)
	auditLog := &fakeAudit{}
	deps := func(mode bool, jobsService *fakeJobs, grants Grants) Deps {
		return Deps{
			Ops: resolver, HostPaths: resolver, Grants: grants, Jobs: jobsService, Audit: auditLog,
			Commands: catalog, AdvancedMode: func(context.Context) bool { return mode },
		}
	}

	recorder, _ := h.call(deps(false, nil, bobCanWork), http.MethodGet, "/v1/commands", h.user, "")
	var listed api.CommandCatalog
	_ = json.Unmarshal(recorder.Body.Bytes(), &listed)
	if listed.Advanced || len(listed.Entries) != 1 || listed.Entries[0].Id != "tool.list" {
		t.Fatalf("basic only: %+v", listed)
	}
	recorder, _ = h.call(deps(true, nil, bobCanWork), http.MethodGet, "/v1/commands", h.admin, "")
	_ = json.Unmarshal(recorder.Body.Bytes(), &listed)
	if !listed.Advanced || len(listed.Entries) != 2 || !listed.Entries[0].DryRun || listed.Entries[0].Params[0].Access == nil {
		t.Fatalf("advanced for administrators in advanced mode: %+v", listed)
	}
	recorder, _ = h.call(deps(true, nil, bobCanWork), http.MethodGet, "/v1/commands", h.user, "")
	_ = json.Unmarshal(recorder.Body.Bytes(), &listed)
	if listed.Advanced {
		t.Fatal("mode on but no commands:advanced permission")
	}

	body := `{"entry":"tool.copy","params":{"source":"/docs/a.txt","target":"/other/new","verbose":true,"level":"b"},"dryRun":true}`
	recorder, failure := h.call(deps(true, nil, bobCanWork), http.MethodPost, "/v1/commands/preview", h.admin, body)
	var preview api.CommandPreview
	_ = json.Unmarshal(recorder.Body.Bytes(), &preview)
	if recorder.Code != http.StatusOK || preview.Binary != "cp" || preview.Argv[0] != "--dry-run" || preview.Argv[1] != "-v" ||
		!strings.HasSuffix(preview.Argv[2], "a.txt") {
		t.Fatalf("preview: %d %q %+v", recorder.Code, failure.Code, preview)
	}

	fake := &fakeJobs{job: sampleJob()}
	recorder, _ = h.call(deps(true, fake, bobCanWork), http.MethodPost, "/v1/jobs/command", h.admin, body)
	if recorder.Code != http.StatusAccepted || fake.command.Entry != "tool.copy" || !fake.command.DryRun || fake.command.WorkDir == "" {
		t.Fatalf("start: %d %+v", recorder.Code, fake.command)
	}

	refusals := []struct {
		name   string
		route  string
		body   string
		token  string
		mode   bool
		jobs   *fakeJobs
		grants Grants
		status int
		code   string
	}{
		{"advanced off", "/v1/commands/preview", body, h.admin, false, fake, bobCanWork, http.StatusNotFound, commands.CodeUnavailable},
		{"unknown entry", "/v1/jobs/command", `{"entry":"rm.all","params":{}}`, h.admin, true, fake, bobCanWork, http.StatusNotFound, commands.CodeUnavailable},
		{"unknown param", "/v1/commands/preview", `{"entry":"tool.list","params":{"x":1}}`, h.user, false, fake, bobCanWork, http.StatusBadRequest, commands.CodeUnknownParam},
		{"missing", "/v1/jobs/command", `{"entry":"tool.copy","params":{"source":"/docs/a.txt"}}`, h.admin, true, fake, bobCanWork, http.StatusBadRequest, commands.CodeMissing},
		{"bad value", "/v1/commands/preview", `{"entry":"tool.copy","params":{"source":"/docs/a.txt","target":"/other/x","level":"z"}}`, h.admin, true, fake, bobCanWork, http.StatusBadRequest, commands.CodeBadValue},
		{"no dry run", "/v1/jobs/command", `{"entry":"tool.list","params":{},"dryRun":true}`, h.user, false, fake, bobCanWork, http.StatusBadRequest, commands.CodeNoDryRun},
		{"bad path", "/v1/commands/preview", `{"entry":"tool.copy","params":{"source":"docs","target":"/other/x"}}`, h.admin, true, fake, bobCanWork, http.StatusBadRequest, fsx.CodeInvalidPath},
		{"no right", "/v1/jobs/command", `{"entry":"tool.copy","params":{"source":"/locked/d.txt","target":"/other/x"}}`, h.userAdvanced, true, fake, bobCanWork, http.StatusForbidden, codeForbidden},
		{"too many", "/v1/jobs/command", `{"entry":"tool.list","params":{}}`, h.user, false, &fakeJobs{startErr: jobs.ErrTooMany}, bobCanWork, http.StatusTooManyRequests, jobs.CodeTooMany},
		{"grants down", "/v1/jobs/command", `{"entry":"tool.list","params":{}}`, h.user, false, fake, fakeGrants{err: errors.New("db")}, http.StatusInternalServerError, codeInternal},
		{"grants down preview", "/v1/commands/preview", `{"entry":"tool.list","params":{}}`, h.user, false, fake, fakeGrants{err: errors.New("db")}, http.StatusInternalServerError, codeInternal},
	}
	for _, tc := range refusals {
		recorder, failure := h.call(deps(tc.mode, tc.jobs, tc.grants), http.MethodPost, tc.route, tc.token, tc.body)
		if recorder.Code != tc.status || failure.Code != tc.code {
			t.Errorf("%s: %d %q, want %d %q", tc.name, recorder.Code, failure.Code, tc.status, tc.code)
		}
	}

	// Without a catalog nothing is offered.
	recorder, _ = h.call(Deps{Grants: bobCanWork}, http.MethodGet, "/v1/commands", h.user, "")
	_ = json.Unmarshal(recorder.Body.Bytes(), &listed)
	if len(listed.Entries) != 0 {
		t.Fatal("no catalog")
	}
	if recorder, _ := h.call(Deps{Grants: bobCanWork}, http.MethodPost, "/v1/commands/preview", h.user, `{"entry":"tool.list","params":{}}`); recorder.Code != http.StatusNotFound {
		t.Fatalf("no catalog preview: %d", recorder.Code)
	}

	s := &server{deps: Deps{Logger: slog.New(slog.NewTextHandler(io.Discard, nil))}}
	ctx := context.Background()
	list, _ := s.ListCommands(ctx, api.ListCommandsRequestObject{})
	preview2, _ := s.PreviewCommand(ctx, api.PreviewCommandRequestObject{})
	start, _ := s.StartCommand(ctx, api.StartCommandRequestObject{})
	_, a := list.(api.ListCommands401JSONResponse)
	_, b := preview2.(api.PreviewCommand401JSONResponse)
	_, c := start.(api.StartCommand401JSONResponse)
	if !a || !b || !c {
		t.Fatal("no principal")
	}
	_ = time.Second
}
