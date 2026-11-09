package trash

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/audit"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/authz"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/jobs"
)

type fakeGrants struct{ err error }

// bob may do everything in /vol; eve nothing.
func (f fakeGrants) GrantsFor(_ context.Context, subject authz.Subject) ([]authz.Grant, error) {
	if subject.UserID != "bob" {
		return nil, f.err
	}
	return []authz.Grant{{SubjectType: authz.SubjectUser, SubjectID: "bob", Path: "/vol", Actions: authz.Actions, Effect: authz.EffectAllow}}, f.err
}

type fakeAudit struct {
	mu      sync.Mutex
	actions []string
}

func (f *fakeAudit) Record(_ context.Context, event audit.Event) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.actions = append(f.actions, event.Action)
	return nil
}

type nopSink struct{}

func (nopSink) SaveProgress(context.Context, string, jobs.Snapshot, time.Time) error { return nil }
func (nopSink) AppendLog(context.Context, string, int, string, string, time.Time) error {
	return nil
}

var (
	bob = authz.Subject{UserID: "bob"}
	eve = authz.Subject{UserID: "eve"}
)

type harness struct {
	dir     string
	service *Service
	audit   *fakeAudit
	limits  Limits
	now     time.Time
}

func newHarness(t *testing.T) *harness {
	t.Helper()
	dir := t.TempDir()
	for name, content := range map[string]string{"vol/a.txt": "aaa", "vol/f/x.txt": "xx", "vol/f/y.txt": "y"} {
		full := filepath.Join(dir, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	resolver, err := fsx.OpenResolver(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = resolver.Close() })
	h := &harness{dir: dir, audit: &fakeAudit{}, limits: DefaultLimits, now: time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC)}
	h.service = New(Config{
		Files:  resolver,
		Grants: fakeGrants{},
		Audit:  h.audit,
		Limits: func(context.Context) (Limits, error) { return h.limits, nil },
		Logger: slog.New(slog.NewTextHandler(io.Discard, nil)),
		Now:    func() time.Time { return h.now },
	})
	return h
}

func (h *harness) exists(name string) bool {
	_, err := os.Stat(filepath.Join(h.dir, filepath.FromSlash(name)))
	return err == nil
}

func TestDeleteListRestore(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	items, err := h.service.Delete(ctx, bob, []string{"/vol/a.txt", "/vol/f"}, "r1")
	if err != nil || len(items) != 2 || h.exists("vol/a.txt") || h.exists("vol/f") {
		t.Fatalf("deleted: %+v %v", items, err)
	}
	if !items[0].Measured || items[0].Bytes != 3 || items[1].Measured {
		t.Fatalf("files are measured at once, folders by the keeper: %+v", items)
	}
	listed, _ := h.service.List(ctx, bob)
	if len(listed) != 2 {
		t.Fatalf("bob sees his items: %+v", listed)
	}
	if others, _ := h.service.List(ctx, eve); len(others) != 0 {
		t.Fatal("eve sees nothing of bob's")
	}
	if all, _ := h.service.List(ctx, authz.Subject{UserID: "root", Admin: true}); len(all) != 2 {
		t.Fatal("administrators see everything")
	}

	// The name was taken meanwhile: both are kept.
	if err := os.WriteFile(filepath.Join(h.dir, "vol", "a.txt"), []byte("new"), 0o644); err != nil {
		t.Fatal(err)
	}
	restored, err := h.service.Restore(ctx, bob, []string{items[0].ID, items[1].ID}, "r2")
	if err != nil || restored[0].Path != "/vol/a (1).txt" || restored[1].Path != "/vol/f" || !h.exists("vol/f/x.txt") {
		t.Fatalf("restored: %+v %v", restored, err)
	}
	if _, err := h.service.Restore(ctx, bob, []string{items[0].ID}, "r3"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("restored twice: %v", err)
	}
	if !strings.Contains(strings.Join(h.audit.actions, ","), "fs.delete,fs.delete,trash.restore,trash.restore") {
		t.Fatalf("audit: %v", h.audit.actions)
	}
}

func TestRefusals(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	if _, err := h.service.Delete(ctx, bob, []string{"/vol"}, ""); !errors.Is(err, fsx.ErrVolume) {
		t.Fatalf("volumes: %v", err)
	}
	if _, err := h.service.Delete(ctx, eve, []string{"/vol/a.txt"}, ""); !errors.Is(err, ErrForbidden) {
		t.Fatalf("no delete permission: %v", err)
	}
	if _, err := h.service.Delete(ctx, bob, []string{"/vol/none"}, ""); !errors.Is(err, fsx.ErrNotFound) {
		t.Fatalf("missing: %v", err)
	}
	if _, err := h.service.Delete(ctx, bob, nil, ""); !errors.Is(err, fsx.ErrInvalidPath) {
		t.Fatalf("empty: %v", err)
	}
	if _, err := h.service.Delete(ctx, bob, []string{"rel"}, ""); !errors.Is(err, fsx.ErrInvalidPath) {
		t.Fatalf("invalid: %v", err)
	}
	items, _ := h.service.Delete(ctx, bob, []string{"/vol/a.txt"}, "")
	if _, err := h.service.Restore(ctx, eve, []string{items[0].ID}, ""); !errors.Is(err, ErrNotFound) {
		t.Fatalf("someone else's item: %v", err)
	}
	if _, err := h.service.Restore(ctx, bob, []string{"nothex"}, ""); !errors.Is(err, ErrNotFound) {
		t.Fatalf("bad id: %v", err)
	}
	broken := New(Config{
		Files: h.service.cfg.Files, Grants: fakeGrants{err: errors.New("db")}, Audit: h.audit,
		Limits: h.service.cfg.Limits, Logger: h.service.cfg.Logger, Now: h.service.cfg.Now,
	})
	if _, err := broken.Delete(ctx, bob, []string{"/vol/f"}, ""); err == nil {
		t.Fatal("grants failure")
	}
	if _, err := broken.Restore(ctx, bob, []string{items[0].ID}, ""); err == nil {
		t.Fatal("grants failure on restore")
	}
}

func TestPlan(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	plan, err := h.service.PlanDelete(ctx, bob, []string{"/vol/a.txt", "/vol/f"})
	if err != nil || plan.Bytes != 6 || plan.Files != 3 || !plan.Complete || !plan.FitsTrash {
		t.Fatalf("plan: %+v %v", plan, err)
	}
	h.limits.MaxFiles = 2
	if plan, _ := h.service.PlanDelete(ctx, bob, []string{"/vol/f", "/vol/a.txt"}); plan.FitsTrash {
		t.Fatal("over the file limit: permanent delete is offered instead")
	}
	if _, err := h.service.PlanDelete(ctx, eve, []string{"/vol/f"}); !errors.Is(err, ErrForbidden) {
		t.Fatal("plan checks permission")
	}
	// A clock past the budget stops measuring: the plan says it is incomplete.
	start := h.now
	h.service.cfg.Now = func() time.Time { start = start.Add(time.Second); return start }
	if plan, _ := h.service.PlanDelete(ctx, bob, []string{"/vol/f"}); plan.Complete || plan.FitsTrash {
		t.Fatalf("budget: %+v", plan)
	}
}

func TestKeeperEnforcesLimits(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	if _, err := h.service.Delete(ctx, bob, []string{"/vol/f"}, ""); err != nil {
		t.Fatal(err)
	}
	h.now = h.now.Add(time.Hour)
	if _, err := h.service.Delete(ctx, bob, []string{"/vol/a.txt"}, ""); err != nil {
		t.Fatal(err)
	}

	if removed := h.service.Sweep(ctx); removed != 0 {
		t.Fatal("within limits nothing goes")
	}
	listed, _ := h.service.List(ctx, bob)
	for _, item := range listed {
		if !item.Measured {
			t.Fatal("the keeper measures folders")
		}
	}
	// Two files allowed: the folder (2 files, oldest) goes, the file stays.
	h.limits.MaxFiles = 2
	if removed := h.service.Sweep(ctx); removed != 1 {
		t.Fatalf("limit eviction: %d", removed)
	}
	listed, _ = h.service.List(ctx, bob)
	if len(listed) != 1 || listed[0].Name != "a.txt" {
		t.Fatalf("oldest removed first: %+v", listed)
	}
	h.now = h.now.Add(31 * 24 * time.Hour)
	if removed := h.service.Sweep(ctx); removed != 1 {
		t.Fatal("retention")
	}
	if !strings.Contains(strings.Join(h.audit.actions, ","), "trash.purge") {
		t.Fatal("purges are audited")
	}

	// Keep runs a sweep right away and stops with its context.
	stop, cancel := context.WithCancel(ctx)
	done := make(chan struct{})
	go func() {
		h.service.Keep(stop, time.Hour)
		close(done)
	}()
	h.service.Kick()
	h.service.Kick()
	cancel()
	<-done
}

func TestJobs(t *testing.T) {
	h := newHarness(t)
	ctx := context.Background()
	reporter := jobs.NewReporter(nopSink{}, "job", h.now, func() time.Time { return h.now })

	result, err := h.service.DeleteHandler()(ctx, DeleteArgs{Paths: []string{"/vol/f"}, Subject: bob}, reporter)
	if err != nil || result["items"] != int64(1) || h.exists("vol/f") {
		t.Fatalf("permanent delete: %v %v", result, err)
	}
	if _, err := h.service.DeleteHandler()(ctx, DeleteArgs{Paths: []string{"/vol/a.txt"}, Subject: eve}, reporter); err == nil {
		t.Fatal("permission checked again in the job")
	}
	if _, err := h.service.CheckPermanent(ctx, bob, []string{"/vol"}); !errors.Is(err, fsx.ErrVolume) {
		t.Fatal("check before queueing")
	}

	if _, err := h.service.Delete(ctx, bob, []string{"/vol/a.txt"}, ""); err != nil {
		t.Fatal(err)
	}
	result, err = h.service.EmptyHandler()(ctx, EmptyArgs{Subject: bob}, reporter)
	if err != nil || result["items"] != int64(1) {
		t.Fatalf("empty: %v %v", result, err)
	}
	if listed, _ := h.service.List(ctx, bob); len(listed) != 0 {
		t.Fatal("trash emptied")
	}
	if result, _ := h.service.EmptyHandler()(ctx, EmptyArgs{IDs: []string{"unknown"}, Subject: bob}, reporter); result["items"] != int64(0) {
		t.Fatal("unknown ids are skipped")
	}

	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	if _, err := h.service.DeleteHandler()(cancelled, DeleteArgs{Paths: []string{"/vol"}, Subject: bob}, reporter); err == nil {
		t.Fatal("refused before cancel check")
	}
	if args := (DeleteArgs{Job: "j"}); args.Kind() != KindDelete || args.JobID() != "j" {
		t.Fatal("delete args")
	}
	if args := (EmptyArgs{Job: "j"}); args.Kind() != KindEmpty || args.JobID() != "j" {
		t.Fatal("empty args")
	}
}
