package foldersize

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/authz"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/jobs"
)

type fakeGrants struct {
	grants []authz.Grant
	err    error
}

func (f fakeGrants) GrantsFor(context.Context, authz.Subject) ([]authz.Grant, error) {
	return f.grants, f.err
}

type nopSink struct{}

func (nopSink) SaveProgress(context.Context, string, jobs.Snapshot, time.Time) error { return nil }

func (nopSink) AppendLog(context.Context, string, int, string, string, time.Time) error {
	return nil
}

func newTree(t *testing.T) *fsx.Resolver {
	t.Helper()
	dir := t.TempDir()
	write := func(name, content string) {
		full := filepath.Join(dir, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("docs/a.txt", "12345")
	write("docs/private/secret.txt", "123")
	write("docs/private/shared/b.txt", "12")
	resolver, err := fsx.OpenResolver(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = resolver.Close() })
	return resolver
}

func measure(ctx context.Context, files Walker, grants Grants, args Args) (map[string]any, error) {
	reporter := jobs.NewReporter(nopSink{}, "job", time.Now(), time.Now)
	return Handler(files, grants)(ctx, args, reporter)
}

func TestFolderSize(t *testing.T) {
	files := newTree(t)
	bob := authz.Subject{UserID: "bob"}
	rule := func(path, effect string) authz.Grant {
		return authz.Grant{SubjectType: authz.SubjectUser, SubjectID: "bob", Path: path, Actions: []string{"read"}, Effect: effect}
	}
	grants := fakeGrants{grants: []authz.Grant{
		rule("/docs", authz.EffectAllow),
		rule("/docs/private", authz.EffectDeny),
		rule("/docs/private/shared", authz.EffectAllow),
	}}

	result, err := measure(context.Background(), files, grants, Args{Job: "j", Path: "/docs", Subject: bob})
	if err != nil {
		t.Fatal(err)
	}
	// The denied file is skipped; the allowed folder below the denied one still counts.
	if result["bytes"] != int64(7) || result["files"] != int64(2) || result["skipped"] != int64(1) || result["folders"] != int64(2) {
		t.Fatalf("bob: %v", result)
	}

	admin, err := measure(context.Background(), files, fakeGrants{err: errors.New("unused")}, Args{Path: "/", Subject: authz.Subject{Admin: true}})
	if err != nil || admin["bytes"] != int64(10) || admin["files"] != int64(3) {
		t.Fatalf("admin: %v %v", admin, err)
	}

	stranger, err := measure(context.Background(), files, fakeGrants{}, Args{Path: "/docs", Subject: authz.Subject{UserID: "eve"}})
	if err != nil || stranger["bytes"] != int64(0) || stranger["skipped"] != int64(2) {
		t.Fatalf("stranger: %v %v", stranger, err)
	}
}

func TestFolderSizeFailures(t *testing.T) {
	files := newTree(t)
	bob := authz.Subject{UserID: "bob"}
	if _, err := measure(context.Background(), files, fakeGrants{err: errors.New("db")}, Args{Path: "/docs", Subject: bob}); err == nil {
		t.Fatal("grant loading failure")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := measure(ctx, files, fakeGrants{}, Args{Path: "/", Subject: authz.Subject{Admin: true}}); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled: %v", err)
	}
	args := Args{Job: "id"}
	if args.Kind() != Kind || args.JobID() != "id" {
		t.Fatal("args identity")
	}
}
