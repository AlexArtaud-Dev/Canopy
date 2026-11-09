package search

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
)

func tree(t *testing.T, files ...string) *fsx.Resolver {
	t.Helper()
	dir := t.TempDir()
	for _, name := range files {
		full := filepath.Join(dir, filepath.FromSlash(name))
		folder := filepath.Dir(full)
		if strings.HasSuffix(name, "/") {
			folder = full
		}
		if err := os.MkdirAll(folder, 0o755); err != nil {
			t.Fatal(err)
		}
		if strings.HasSuffix(name, "/") {
			continue
		}
		if err := os.WriteFile(full, []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	resolver, err := fsx.OpenResolver(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = resolver.Close() })
	return resolver
}

func everything(string, bool) bool { return true }

func paths(result Result) []string {
	out := make([]string, 0, len(result.Matches))
	for _, match := range result.Matches {
		out = append(out, match.Path)
	}
	return out
}

func TestTermsAndMatches(t *testing.T) {
	if _, err := Terms(" a "); !errors.Is(err, ErrQuery) {
		t.Fatal("too short")
	}
	if _, err := Terms(strings.Repeat("a", MaxQueryLength+1)); !errors.Is(err, ErrQuery) {
		t.Fatal("too long")
	}
	terms, err := Terms("  Été  Photos ")
	if err != nil || len(terms) != 2 || terms[0] != "ete" || terms[1] != "photos" {
		t.Fatalf("terms: %v %v", terms, err)
	}
	if !Matches("Photos de l'ÉTÉ 2024.jpg", terms) || Matches("ete.jpg", terms) {
		t.Fatal("every term, any case or accent")
	}
	if Normalize("Œuvre Straße Ñandú") != "oeuvre strasse nandu" {
		t.Fatalf("normalize: %q", Normalize("Œuvre Straße Ñandú"))
	}
}

func TestRun(t *testing.T) {
	resolver := tree(t, "docs/report.pdf", "docs/old/report-2020.pdf", "photos/report/", "photos/cat.jpg", "private/report.txt", "x-report.md", "secret-report.txt")
	ctx := context.Background()
	hidden := func(p string, _ bool) bool {
		return !strings.HasPrefix(p, "/private") && !strings.HasPrefix(p, "/secret")
	}
	result, err := Run(ctx, resolver, "/", []string{"report"}, hidden, DefaultLimits, time.Now)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"/photos/report", "/docs/report.pdf", "/docs/old/report-2020.pdf", "/x-report.md"}
	if got := paths(result); strings.Join(got, ",") != strings.Join(want, ",") || result.Truncated != "" {
		t.Fatalf("got %v (%q), want %v", got, result.Truncated, want)
	}

	scoped, _ := Run(ctx, resolver, "/docs", []string{"report"}, everything, DefaultLimits, time.Now)
	if len(scoped.Matches) != 2 {
		t.Fatalf("scoped: %v", paths(scoped))
	}
	shallow := DefaultLimits
	shallow.MaxDepth = 2 // the volume's children and grandchildren, no deeper
	if got, _ := Run(ctx, resolver, "/", []string{"report"}, hidden, shallow, time.Now); len(got.Matches) != 3 {
		t.Fatalf("depth: %v", paths(got))
	}
}

func TestRunLimits(t *testing.T) {
	resolver := tree(t, "a/r1", "a/r2", "a/r3", "b/r4")
	ctx := context.Background()
	few := DefaultLimits
	few.MaxResults = 2
	if got, _ := Run(ctx, resolver, "/", []string{"r"}, everything, few, time.Now); len(got.Matches) != 2 || got.Truncated != ReasonResults {
		t.Fatalf("results: %v %q", paths(got), got.Truncated)
	}
	small := DefaultLimits
	small.MaxVisited = 2
	if got, _ := Run(ctx, resolver, "/", []string{"r"}, everything, small, time.Now); got.Truncated != ReasonVisited {
		t.Fatalf("visited: %q", got.Truncated)
	}
	clock := time.Unix(0, 0)
	tick := func() time.Time { clock = clock.Add(2 * time.Second); return clock }
	if got, _ := Run(ctx, resolver, "/", []string{"r"}, everything, DefaultLimits, tick); got.Truncated != ReasonTimeout {
		t.Fatalf("timeout: %q", got.Truncated)
	}
	if _, err := Run(ctx, resolver, "/missing", []string{"r"}, everything, DefaultLimits, time.Now); !errors.Is(err, fsx.ErrNotFound) {
		t.Fatalf("missing folder: %v", err)
	}
}

func TestRank(t *testing.T) {
	matches := []Match{
		{Path: "/b/my-cat.jpg", Entry: fsx.Entry{Name: "my-cat.jpg"}},
		{Path: "/a/b/cat.jpg", Entry: fsx.Entry{Name: "cat.jpg"}},
		{Path: "/cat.png", Entry: fsx.Entry{Name: "cat.png"}},
		{Path: "/z/cat.gif", Entry: fsx.Entry{Name: "cat.gif"}},
		{Path: "/a/my-cat.png", Entry: fsx.Entry{Name: "my-cat.png"}},
	}
	Rank(matches, []string{"cat"})
	got := paths(Result{Matches: matches})
	want := "/cat.png,/z/cat.gif,/a/b/cat.jpg,/b/my-cat.jpg,/a/my-cat.png"
	if strings.Join(got, ",") != want {
		t.Fatalf("rank: %v", got)
	}
	Rank(matches, nil)
}
