package transfer

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/authz"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/jobs"
)

var admin = authz.Subject{UserID: "root", Admin: true}

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

// tweaked wraps the real resolver to simulate what a single temp dir cannot: another
// filesystem, a full disk, a copy that comes out short.
type tweaked struct {
	*fsx.Resolver
	crossDevice bool
	free        uint64
	shortCopy   bool
	failMkdir   error
	renameErr   error
}

func (t tweaked) Rename(from, to string) error {
	if t.crossDevice {
		return fsx.ErrCrossDevice
	}
	if t.renameErr != nil {
		return t.renameErr
	}
	return t.Resolver.Rename(from, to)
}

func (t tweaked) FreeSpace(virtual string) (uint64, bool) {
	if t.free > 0 {
		return t.free, true
	}
	return t.Resolver.FreeSpace(virtual)
}

func (t tweaked) CopyFile(ctx context.Context, from, to string, overwrite bool, progress func(int64)) error {
	if err := t.Resolver.CopyFile(ctx, from, to, overwrite, progress); err != nil || !t.shortCopy {
		return err
	}
	return t.RemoveAll(to)
}

func (t tweaked) Mkdir(virtual string) error {
	if t.failMkdir != nil {
		return t.failMkdir
	}
	return t.Resolver.Mkdir(virtual)
}

type tree struct {
	t    *testing.T
	dir  string
	root *fsx.Resolver
}

func newTree(t *testing.T, files map[string]string) tree {
	t.Helper()
	dir := t.TempDir()
	for name, content := range files {
		full := filepath.Join(dir, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			t.Fatal(err)
		}
		if content != "/" {
			if err := os.WriteFile(full, []byte(content), 0o644); err != nil {
				t.Fatal(err)
			}
		} else if err := os.MkdirAll(full, 0o755); err != nil {
			t.Fatal(err)
		}
	}
	root, err := fsx.OpenResolver(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = root.Close() })
	return tree{t: t, dir: dir, root: root}
}

func (tr tree) read(name string) string {
	tr.t.Helper()
	data, err := os.ReadFile(filepath.Join(tr.dir, filepath.FromSlash(name)))
	if err != nil {
		return "<missing>"
	}
	return string(data)
}

func run(ctx context.Context, files Files, grants Grants, args Args) (map[string]any, error) {
	if args.Subject.UserID == "" {
		args.Subject = admin
	}
	if args.Strategy == "" {
		args.Strategy = StrategySkip
	}
	return Handler(files, grants)(ctx, args, jobs.NewReporter(nopSink{}, "job", time.Now(), time.Now))
}

func TestCopy(t *testing.T) {
	tr := newTree(t, map[string]string{
		"src/a.txt": "aaa", "src/sub/b.txt": "bb", "dst/a.txt": "old", "dst/keep.txt": "k",
	})
	result, err := run(context.Background(), tr.root, fakeGrants{}, Args{Operation: OpCopy, Sources: []string{"/src"}, Destination: "/dst"})
	if err != nil {
		t.Fatal(err)
	}
	if tr.read("dst/src/a.txt") != "aaa" || tr.read("dst/src/sub/b.txt") != "bb" || tr.read("src/a.txt") != "aaa" {
		t.Fatal("copied tree")
	}
	if result["bytes"] != int64(5) || result["skipped"] != int64(0) {
		t.Fatalf("result %v", result)
	}

	// Second copy: the folder conflicts; skip leaves it, keep both names a copy.
	if result, _ := run(context.Background(), tr.root, fakeGrants{}, Args{Operation: OpCopy, Sources: []string{"/src"}, Destination: "/dst"}); result["skipped"] != int64(1) {
		t.Fatalf("skip %v", result)
	}
	if _, err := run(context.Background(), tr.root, fakeGrants{}, Args{Operation: OpCopy, Sources: []string{"/src/a.txt"}, Destination: "/dst", Strategy: StrategyKeepBoth}); err != nil || tr.read("dst/a (1).txt") != "aaa" || tr.read("dst/a.txt") != "old" {
		t.Fatalf("keep both: %v", err)
	}

	// Per-item decision overwrites one file only.
	args := Args{
		Operation: OpCopy, Sources: []string{"/src/a.txt"}, Destination: "/dst",
		Decisions: map[string]string{"/dst/a.txt": StrategyOverwrite},
	}
	if _, err := run(context.Background(), tr.root, fakeGrants{}, args); err != nil || tr.read("dst/a.txt") != "aaa" {
		t.Fatalf("overwrite decision: %v %q", err, tr.read("dst/a.txt"))
	}

	// Copy into its own folder always keeps both, even when asked to overwrite.
	if _, err := run(context.Background(), tr.root, fakeGrants{}, Args{Operation: OpCopy, Sources: []string{"/src/a.txt"}, Destination: "/src", Strategy: StrategyOverwrite}); err != nil || tr.read("src/a (1).txt") != "aaa" {
		t.Fatalf("self copy: %v", err)
	}
}

func TestOverwriteMergesFoldersAndSkipsMismatches(t *testing.T) {
	tr := newTree(t, map[string]string{
		"src/x/a.txt": "new", "src/x/only.txt": "o", "src/x/kind": "file",
		"dst/x/a.txt": "old", "dst/x/other.txt": "keep", "dst/x/kind/inner.txt": "dir",
	})
	result, err := run(context.Background(), tr.root, fakeGrants{}, Args{Operation: OpCopy, Sources: []string{"/src/x"}, Destination: "/dst", Strategy: StrategyOverwrite})
	if err != nil {
		t.Fatal(err)
	}
	if tr.read("dst/x/a.txt") != "new" || tr.read("dst/x/only.txt") != "o" || tr.read("dst/x/other.txt") != "keep" || tr.read("dst/x/kind/inner.txt") != "dir" {
		t.Fatal("merge")
	}
	if result["skipped"] != int64(1) {
		t.Fatalf("a file never replaces a folder: %v", result)
	}
}

func TestMove(t *testing.T) {
	tr := newTree(t, map[string]string{"src/a.txt": "aaa", "src/sub/b.txt": "bb", "dst/": "/"})
	if _, err := run(context.Background(), tr.root, fakeGrants{}, Args{Operation: OpMove, Sources: []string{"/src"}, Destination: "/dst"}); err != nil {
		t.Fatal(err)
	}
	if tr.read("dst/src/sub/b.txt") != "bb" || tr.read("src/a.txt") != "<missing>" {
		t.Fatal("renamed")
	}

	// Overwriting a file by a moved file.
	tr2 := newTree(t, map[string]string{"a/f.txt": "new", "b/f.txt": "old"})
	if _, err := run(context.Background(), tr2.root, fakeGrants{}, Args{Operation: OpMove, Sources: []string{"/a/f.txt"}, Destination: "/b", Strategy: StrategyOverwrite}); err != nil || tr2.read("b/f.txt") != "new" || tr2.read("a/f.txt") != "<missing>" {
		t.Fatalf("move overwrite: %v", err)
	}
}

func TestMoveAcrossFilesystems(t *testing.T) {
	tr := newTree(t, map[string]string{"src/a.txt": "aaa", "src/sub/b.txt": "bb", "src/sub/c.txt": "c", "dst/src/sub/c.txt": "taken"})
	files := tweaked{Resolver: tr.root, crossDevice: true}
	// Merge the two folders, but keep the default "skip" for the conflicting file.
	result, err := run(context.Background(), files, fakeGrants{}, Args{
		Operation: OpMove, Sources: []string{"/src"}, Destination: "/dst",
		Decisions: map[string]string{"/dst/src": StrategyOverwrite, "/dst/src/sub": StrategyOverwrite},
	})
	if err != nil {
		t.Fatal(err)
	}
	if tr.read("dst/src/a.txt") != "aaa" || tr.read("dst/src/sub/b.txt") != "bb" || tr.read("dst/src/sub/c.txt") != "taken" {
		t.Fatal("copied across")
	}
	// The skipped conflict stays at the source; everything moved is gone from it.
	if tr.read("src/a.txt") != "<missing>" || tr.read("src/sub/b.txt") != "<missing>" || tr.read("src/sub/c.txt") != "c" || result["skipped"] != int64(1) {
		t.Fatalf("source after move: %v", result)
	}
}

func TestFailures(t *testing.T) {
	tr := newTree(t, map[string]string{"src/a.txt": "aaa", "dst/": "/"})
	copyArgs := Args{Operation: OpCopy, Sources: []string{"/src"}, Destination: "/dst"}

	if _, err := run(context.Background(), tweaked{Resolver: tr.root, free: 1}, fakeGrants{}, copyArgs); !hasCode(err, CodeNoSpace) {
		t.Fatalf("no space: %v", err)
	}
	if _, err := run(context.Background(), tweaked{Resolver: tr.root, shortCopy: true}, fakeGrants{}, Args{Operation: OpCopy, Sources: []string{"/src/a.txt"}, Destination: "/dst"}); !hasCode(err, CodeVerifyFailed) {
		t.Fatalf("verify: %v", err)
	}
	if _, err := run(context.Background(), tr.root, fakeGrants{}, Args{Operation: OpCopy, Sources: []string{"/nope"}, Destination: "/dst"}); !hasCode(err, fsx.CodeNotFound) {
		t.Fatalf("missing source: %v", err)
	}
	mkdirErr := errors.New("disk")
	if _, err := run(context.Background(), tweaked{Resolver: tr.root, failMkdir: mkdirErr}, fakeGrants{}, Args{Operation: OpCopy, Sources: []string{"/src"}, Destination: "/dst", Strategy: StrategyKeepBoth}); !errors.Is(err, mkdirErr) {
		t.Fatalf("mkdir failure: %v", err)
	}
	bob := authz.Subject{UserID: "bob"}
	if _, err := run(context.Background(), tr.root, fakeGrants{err: errors.New("db")}, Args{Operation: OpCopy, Sources: []string{"/src"}, Destination: "/dst", Subject: bob}); err == nil {
		t.Fatal("grant loading failure")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := run(ctx, tr.root, fakeGrants{}, copyArgs); !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled: %v", err)
	}
}

func TestAccessSkipsWhatCannotBeRead(t *testing.T) {
	tr := newTree(t, map[string]string{"src/ok.txt": "ok", "src/secret.txt": "s", "src/hidden/x.txt": "x", "dst/": "/"})
	rule := func(path, effect string, actions ...string) authz.Grant {
		return authz.Grant{SubjectType: authz.SubjectUser, SubjectID: "bob", Path: path, Actions: actions, Effect: effect}
	}
	grants := fakeGrants{grants: []authz.Grant{
		rule("/src", authz.EffectAllow, "read", "copy"),
		rule("/src/secret.txt", authz.EffectDeny, "read"),
		rule("/src/hidden", authz.EffectDeny, "read"),
	}}
	bob := authz.Subject{UserID: "bob"}
	if _, err := run(context.Background(), tr.root, grants, Args{Operation: OpCopy, Sources: []string{"/src"}, Destination: "/dst", Subject: bob}); err != nil {
		t.Fatal(err)
	}
	if tr.read("dst/src/ok.txt") != "ok" || tr.read("dst/src/secret.txt") != "<missing>" || tr.read("dst/src/hidden/x.txt") != "<missing>" {
		t.Fatal("unreadable entries are never copied")
	}
	// Overwrite needs "update" on the target: without it, the conflict is skipped.
	tr2 := newTree(t, map[string]string{"a/f.txt": "new", "b/f.txt": "old"})
	limited := fakeGrants{grants: []authz.Grant{rule("/", authz.EffectAllow, "read", "copy", "create")}}
	if result, _ := run(context.Background(), tr2.root, limited, Args{Operation: OpCopy, Sources: []string{"/a/f.txt"}, Destination: "/b", Strategy: StrategyOverwrite, Subject: bob}); tr2.read("b/f.txt") != "old" || result["skipped"] != int64(1) {
		t.Fatal("overwrite without update is skipped")
	}
}

func TestFindConflicts(t *testing.T) {
	tr := newTree(t, map[string]string{
		"src/x/a.txt": "1", "src/x/b.txt": "2", "src/y.txt": "y",
		"dst/x/a.txt": "old", "dst/y.txt": "old",
	})
	conflicts, truncated, err := FindConflicts(tr.root, Access{Subject: admin}, []string{"/src/x", "/src/y.txt"}, "/dst")
	if err != nil || truncated || len(conflicts) != 3 {
		t.Fatalf("conflicts %+v %v %v", conflicts, truncated, err)
	}
	if !conflicts[0].SourceIsDir || conflicts[1].Target != "/dst/x/a.txt" || conflicts[2].Target != "/dst/y.txt" {
		t.Fatalf("order and kinds %+v", conflicts)
	}
	self, _, _ := FindConflicts(tr.root, Access{Subject: admin}, []string{"/src/y.txt"}, "/src")
	if len(self) != 1 || !self[0].Self {
		t.Fatalf("self %+v", self)
	}
	if _, _, err := FindConflicts(tr.root, Access{Subject: admin}, []string{"/nope"}, "/dst"); err == nil {
		t.Fatal("missing source")
	}

	many := map[string]string{}
	for i := range maxConflicts + 5 {
		name := fmt.Sprintf("f%04d.txt", i)
		many["a/d/"+name] = "1"
		many["b/d/"+name] = "1"
	}
	big := newTree(t, many)
	found, truncated, err := FindConflicts(big.root, Access{Subject: admin}, []string{"/a/d"}, "/b")
	if err != nil || !truncated || len(found) != maxConflicts {
		t.Fatalf("truncated: %d %v %v", len(found), truncated, err)
	}
}

func TestArgsIdentity(t *testing.T) {
	args := Args{Job: "id"}
	if args.Kind() != Kind || args.JobID() != "id" {
		t.Fatal("identity")
	}
	if _, err := LoadAccess(context.Background(), fakeGrants{err: errors.New("db")}, authz.Subject{UserID: "bob"}); err == nil {
		t.Fatal("grant error")
	}
}

func hasCode(err error, code string) bool {
	var failure *jobs.Failure
	return errors.As(err, &failure) && failure.Code == code
}

func TestMoreMoves(t *testing.T) {
	tr := newTree(t, map[string]string{"src/a.txt": "aaa", "dst/": "/"})
	if _, err := run(context.Background(), tweaked{Resolver: tr.root, crossDevice: true}, fakeGrants{}, Args{Operation: OpMove, Sources: []string{"/src/a.txt"}, Destination: "/dst"}); err != nil || tr.read("dst/a.txt") != "aaa" || tr.read("src/a.txt") != "<missing>" {
		t.Fatalf("single file across filesystems: %v", err)
	}
	busy := errors.New("busy")
	tr2 := newTree(t, map[string]string{"src/a.txt": "aaa", "dst/": "/"})
	if _, err := run(context.Background(), tweaked{Resolver: tr2.root, renameErr: busy}, fakeGrants{}, Args{Operation: OpMove, Sources: []string{"/src"}, Destination: "/dst"}); !errors.Is(err, busy) {
		t.Fatalf("other rename errors stop the job: %v", err)
	}
	tr3 := newTree(t, map[string]string{"src/a.txt": "aaa", "dst/": "/"})
	if _, err := run(context.Background(), tweaked{Resolver: tr3.root, crossDevice: true, failMkdir: busy}, fakeGrants{}, Args{Operation: OpMove, Sources: []string{"/src"}, Destination: "/dst"}); !errors.Is(err, busy) {
		t.Fatalf("mkdir failure across filesystems: %v", err)
	}
	if _, err := run(context.Background(), tweaked{Resolver: tr3.root, crossDevice: true, shortCopy: true}, fakeGrants{}, Args{Operation: OpMove, Sources: []string{"/src/a.txt"}, Destination: "/dst"}); !hasCode(err, CodeVerifyFailed) || tr3.read("src/a.txt") != "aaa" {
		t.Fatalf("a failed verify keeps the source: %v", err)
	}
}

func TestLinksAreSkipped(t *testing.T) {
	tr := newTree(t, map[string]string{"src/a.txt": "aaa", "dst/": "/"})
	if err := os.Symlink("a.txt", filepath.Join(tr.dir, "src", "link")); err != nil {
		t.Skipf("symbolic links unavailable here: %v", err)
	}
	result, err := run(context.Background(), tr.root, fakeGrants{}, Args{Operation: OpCopy, Sources: []string{"/src"}, Destination: "/dst"})
	if err != nil || result["skipped"] != int64(1) || tr.read("dst/src/a.txt") != "aaa" {
		t.Fatalf("link: %v %v", result, err)
	}
	if _, err := os.Lstat(filepath.Join(tr.dir, "dst", "src", "link")); err == nil {
		t.Fatal("links are not recreated")
	}
}
