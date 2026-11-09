package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"testing"
	"time"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/api"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/jobs"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/trash"
)

func trashDeps(t *testing.T, grants Grants, limitsErr error) Deps {
	t.Helper()
	resolver, _ := opsTree(t)
	service := trash.New(trash.Config{
		Files: resolver, Grants: grants, Audit: &fakeAudit{},
		Limits: func(context.Context) (trash.Limits, error) { return trash.DefaultLimits, limitsErr },
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)), Now: time.Now,
	})
	return Deps{Ops: resolver, Grants: grants, Trash: service, Audit: &fakeAudit{}, Jobs: &fakeJobs{job: sampleJob()}}
}

func TestTrashEndpoints(t *testing.T) {
	h := newJobsHarness(t)
	deps := trashDeps(t, bobCanWork, nil)

	recorder, failure := h.call(deps, http.MethodPost, "/v1/fs/delete/plan", h.user, `{"paths":["/docs/sub"]}`)
	var plan api.DeletePlan
	_ = json.Unmarshal(recorder.Body.Bytes(), &plan)
	if recorder.Code != http.StatusOK || !plan.FitsTrash || plan.Files != 1 || plan.Limits.RetentionDays != 30 {
		t.Fatalf("plan: %d %q %+v", recorder.Code, failure.Code, plan)
	}

	recorder, _ = h.call(deps, http.MethodPost, "/v1/fs/trash", h.user, `{"paths":["/docs/a.txt"]}`)
	var moved api.TrashItemList
	_ = json.Unmarshal(recorder.Body.Bytes(), &moved)
	if recorder.Code != http.StatusOK || len(moved.Items) != 1 || moved.Items[0].OriginalPath != "/docs/a.txt" {
		t.Fatalf("trash: %d %s", recorder.Code, recorder.Body.String())
	}

	recorder, _ = h.call(deps, http.MethodGet, "/v1/trash", h.user, "")
	var listing api.TrashListing
	_ = json.Unmarshal(recorder.Body.Bytes(), &listing)
	if recorder.Code != http.StatusOK || len(listing.Items) != 1 {
		t.Fatalf("list: %d %s", recorder.Code, recorder.Body.String())
	}

	recorder, _ = h.call(deps, http.MethodPost, "/v1/trash/restore", h.user, `{"ids":["`+moved.Items[0].Id+`"]}`)
	if recorder.Code != http.StatusOK {
		t.Fatalf("restore: %d %s", recorder.Code, recorder.Body.String())
	}
	if recorder, failure = h.call(deps, http.MethodPost, "/v1/trash/restore", h.user, `{"ids":["`+moved.Items[0].Id+`"]}`); recorder.Code != http.StatusNotFound || failure.Code != trash.CodeNotFound {
		t.Fatalf("restore twice: %d %q", recorder.Code, failure.Code)
	}

	for _, target := range []string{"/v1/jobs/delete", "/v1/jobs/empty-trash"} {
		body := `{"paths":["/docs/sub"]}`
		if target == "/v1/jobs/empty-trash" {
			body = `{"ids":[]}`
		}
		if recorder, _ := h.call(deps, http.MethodPost, target, h.user, body); recorder.Code != http.StatusAccepted {
			t.Fatalf("%s: %d %s", target, recorder.Code, recorder.Body.String())
		}
	}

	refusals := []struct {
		method, target, body string
		status               int
		code                 string
	}{
		{http.MethodPost, "/v1/fs/trash", `{"paths":["/docs"]}`, http.StatusBadRequest, trash.CodeVolume},
		{http.MethodPost, "/v1/fs/trash", `{"paths":["/locked/d.txt"]}`, http.StatusForbidden, codeForbidden},
		{http.MethodPost, "/v1/fs/trash", `{"paths":["/docs/none"]}`, http.StatusNotFound, "files.not_found"},
		{http.MethodPost, "/v1/fs/delete/plan", `{"paths":["/docs"]}`, http.StatusBadRequest, trash.CodeVolume},
		{http.MethodPost, "/v1/fs/delete/plan", `{"paths":["/locked/d.txt"]}`, http.StatusForbidden, codeForbidden},
		{http.MethodPost, "/v1/fs/delete/plan", `{"paths":["/docs/none"]}`, http.StatusNotFound, "files.not_found"},
		{http.MethodPost, "/v1/jobs/delete", `{"paths":["/docs"]}`, http.StatusBadRequest, trash.CodeVolume},
		{http.MethodPost, "/v1/jobs/delete", `{"paths":["/locked/d.txt"]}`, http.StatusForbidden, codeForbidden},
		{http.MethodPost, "/v1/jobs/delete", `{"paths":["/docs/none"]}`, http.StatusNotFound, "files.not_found"},
	}
	for _, tc := range refusals {
		if recorder, failure := h.call(deps, tc.method, tc.target, h.user, tc.body); recorder.Code != tc.status || failure.Code != tc.code {
			t.Errorf("%s %s: %d %q", tc.target, tc.body, recorder.Code, failure.Code)
		}
	}

	busy := trashDeps(t, bobCanWork, nil)
	busy.Jobs = &fakeJobs{startErr: jobs.ErrTooMany}
	for _, target := range []string{"/v1/jobs/delete", "/v1/jobs/empty-trash"} {
		body := `{"paths":["/docs/sub"]}`
		if target == "/v1/jobs/empty-trash" {
			body = `{"ids":[]}`
		}
		if recorder, _ := h.call(busy, http.MethodPost, target, h.user, body); recorder.Code != http.StatusTooManyRequests {
			t.Errorf("%s busy: %d", target, recorder.Code)
		}
	}
	broken := trashDeps(t, bobCanWork, nil)
	broken.Jobs = &fakeJobs{getErr: errors.New("db")}
	if recorder, _ := h.call(broken, http.MethodPost, "/v1/jobs/empty-trash", h.user, `{"ids":[]}`); recorder.Code != http.StatusInternalServerError {
		t.Errorf("job reload failure: %d", recorder.Code)
	}
	noLimits := trashDeps(t, bobCanWork, errors.New("db"))
	for _, call := range [][3]string{{http.MethodGet, "/v1/trash", ""}, {http.MethodPost, "/v1/fs/delete/plan", `{"paths":["/docs/a.txt"]}`}} {
		if recorder, _ := h.call(noLimits, call[0], call[1], h.user, call[2]); recorder.Code != http.StatusInternalServerError {
			t.Errorf("%s without limits: %d", call[1], recorder.Code)
		}
	}
	noGrants := trashDeps(t, fakeGrants{err: errors.New("db")}, nil)
	if recorder, _ := h.call(noGrants, http.MethodPost, "/v1/trash/restore", h.user, `{"ids":["x"]}`); recorder.Code != http.StatusInternalServerError {
		t.Errorf("restore without grants: %d", recorder.Code)
	}
}

func TestTrashRefusesWithoutPrincipal(t *testing.T) {
	s := &server{deps: Deps{Logger: slog.New(slog.NewTextHandler(io.Discard, nil))}}
	ctx := context.Background()
	plan, _ := s.PlanDelete(ctx, api.PlanDeleteRequestObject{})
	moved, _ := s.MoveToTrash(ctx, api.MoveToTrashRequestObject{})
	permanent, _ := s.StartPermanentDelete(ctx, api.StartPermanentDeleteRequestObject{})
	listed, _ := s.ListTrash(ctx, api.ListTrashRequestObject{})
	restored, _ := s.RestoreFromTrash(ctx, api.RestoreFromTrashRequestObject{})
	emptied, _ := s.StartEmptyTrash(ctx, api.StartEmptyTrashRequestObject{})
	_, a := plan.(api.PlanDelete401JSONResponse)
	_, b := moved.(api.MoveToTrash401JSONResponse)
	_, c := permanent.(api.StartPermanentDelete401JSONResponse)
	_, d := listed.(api.ListTrash401JSONResponse)
	_, e := restored.(api.RestoreFromTrash401JSONResponse)
	_, f := emptied.(api.StartEmptyTrash401JSONResponse)
	if !a || !b || !c || !d || !e || !f {
		t.Fatalf("%T %T %T %T %T %T", plan, moved, permanent, listed, restored, emptied)
	}
}
