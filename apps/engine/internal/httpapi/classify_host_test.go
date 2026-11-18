package httpapi

import (
	"fmt"
	"net/http"
	"syscall"
	"testing"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
)

func TestClassifyHostRefusals(t *testing.T) {
	cases := []struct {
		err    error
		status int
		code   string
	}{
		{fmt.Errorf("mkdir: %w", syscall.EACCES), http.StatusForbidden, fsx.CodeHostDenied},
		{fmt.Errorf("mkdir: %w", syscall.EROFS), http.StatusConflict, fsx.CodeReadOnly},
		{fmt.Errorf("write: %w", syscall.ENOSPC), http.StatusConflict, fsx.CodeNoSpace},
	}
	for _, c := range cases {
		refusal, known := classify(c.err)
		if !known || refusal.status != c.status || refusal.code != c.code {
			t.Errorf("%v: got %+v %v", c.err, refusal, known)
		}
	}
}
