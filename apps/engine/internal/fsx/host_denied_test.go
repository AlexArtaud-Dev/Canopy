package fsx

import (
	"errors"
	"fmt"
	"io/fs"
	"testing"
)

func TestNotFoundTellsHostDenialApart(t *testing.T) {
	denied := notFound(fmt.Errorf("open H: %w", fs.ErrPermission))
	if !errors.Is(denied, ErrHostDenied) || !errors.Is(denied, ErrNotFound) {
		t.Fatalf("a host permission refusal is both host-denied and not found: %v", denied)
	}
	missing := notFound(fs.ErrNotExist)
	if errors.Is(missing, ErrHostDenied) || !errors.Is(missing, ErrNotFound) {
		t.Fatalf("a missing path is only not found: %v", missing)
	}
}
