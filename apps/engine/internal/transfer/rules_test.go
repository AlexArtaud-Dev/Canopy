package transfer

import (
	"errors"
	"slices"
	"testing"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
)

func TestValidate(t *testing.T) {
	sources, dest, err := Validate(OpCopy, []string{"/a/x/", "/b/y"}, "/c/")
	if err != nil || dest != "/c" || !slices.Equal(sources, []string{"/a/x", "/b/y"}) {
		t.Fatalf("valid: %v %q %v", sources, dest, err)
	}
	cases := []struct {
		op      string
		sources []string
		dest    string
		want    error
	}{
		{OpCopy, []string{"/a"}, "rel", fsx.ErrInvalidPath},
		{OpCopy, []string{"rel"}, "/c", fsx.ErrInvalidPath},
		{OpCopy, []string{"/"}, "/c", fsx.ErrInvalidPath},
		{OpCopy, nil, "/c", fsx.ErrInvalidPath},
		{OpCopy, []string{"/a"}, "/a/sub", ErrIntoItself},
		{OpMove, []string{"/a"}, "/a", ErrIntoItself},
		{OpMove, []string{"/c/x"}, "/c", ErrSameLocation},
		{OpCopy, []string{"/a/x", "/b/x"}, "/c", ErrDuplicateNames},
	}
	for _, tc := range cases {
		if _, _, err := Validate(tc.op, tc.sources, tc.dest); !errors.Is(err, tc.want) {
			t.Errorf("Validate(%s, %v, %s) = %v, want %v", tc.op, tc.sources, tc.dest, err, tc.want)
		}
	}
	// Copying into the same folder is allowed: the conflict strategy names the copy.
	if _, _, err := Validate(OpCopy, []string{"/c/x"}, "/c"); err != nil {
		t.Fatalf("copy in place: %v", err)
	}
}

func TestStrategiesAndNames(t *testing.T) {
	if !ValidOperation(OpCopy) || !ValidOperation(OpMove) || ValidOperation("delete") {
		t.Fatal("operations")
	}
	if !ValidStrategy(StrategyKeepBoth) || ValidStrategy("merge") {
		t.Fatal("strategies")
	}
	decisions := map[string]string{"/c/a": StrategyOverwrite, "/c/b": "bogus"}
	if StrategyFor(decisions, StrategySkip, "/c/a") != StrategyOverwrite ||
		StrategyFor(decisions, StrategySkip, "/c/b") != StrategySkip ||
		StrategyFor(nil, StrategyKeepBoth, "/c/z") != StrategyKeepBoth {
		t.Fatal("per-item decisions win when valid")
	}
	if (Args{Operation: OpMove}).Label() != OpMove {
		t.Fatal("label")
	}
	if TargetPath("/c", "/a/b.txt") != "/c/b.txt" || TargetPath("/", "/a") != "/a" {
		t.Fatal("target path")
	}

	taken := map[string]bool{"photo (1).jpg": true}
	has := func(name string) bool { return taken[name] }
	if got := KeepBothName("photo.jpg", false, has); got != "photo (2).jpg" {
		t.Fatalf("file: %s", got)
	}
	if got := KeepBothName("archive.tar.gz", false, has); got != "archive.tar (1).gz" {
		t.Fatalf("double extension: %s", got)
	}
	if got := KeepBothName("v1.2", true, has); got != "v1.2 (1)" {
		t.Fatalf("folder keeps its dots: %s", got)
	}
	if got := KeepBothName(".env", false, has); got != ".env (1)" {
		t.Fatalf("dotfile: %s", got)
	}
}
