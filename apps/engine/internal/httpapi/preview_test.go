package httpapi

import (
	"crypto/ed25519"
	"crypto/rand"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/enginetoken"
)

func TestPreview(t *testing.T) {
	public, private, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	verifier := enginetoken.NewVerifier(public, time.Now)
	ticket := streamTicket(t, private)
	resolver, dir := opsTree(t)
	for _, name := range []string{"docs/r.pdf", "docs/x.bin"} {
		if err := os.WriteFile(filepath.Join(dir, filepath.FromSlash(name)), []byte("%PDF"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	auditLog := &fakeAudit{}
	deps := Deps{Ops: resolver, Grants: bobCanWork, Audit: auditLog}

	text := get(t, deps, verifier, "/v1/fs/preview?path=/docs/a.txt", ticket, nil)
	header := text.Header()
	if text.Code != http.StatusOK || header.Get("Content-Type") != "text/plain; charset=utf-8" ||
		!strings.HasPrefix(header.Get("Content-Disposition"), "inline;") ||
		header.Get("Content-Security-Policy") != sandboxPolicy {
		t.Fatalf("text: %d %v", text.Code, header)
	}
	if len(auditLog.events) != 1 || auditLog.events[0].Action != "fs.preview" {
		t.Fatalf("audit: %+v", auditLog.events)
	}

	pdf := get(t, deps, verifier, "/v1/fs/preview?path=/docs/r.pdf", ticket, nil)
	if pdf.Header().Get("Content-Type") != "application/pdf" ||
		pdf.Header().Get("Content-Security-Policy") != "frame-ancestors 'self'" {
		t.Fatalf("pdf: %v", pdf.Header())
	}

	refusals := []struct {
		target string
		status int
	}{
		{"/v1/fs/preview?path=/docs/x.bin", http.StatusUnsupportedMediaType},
		{"/v1/fs/preview?path=/locked/d.txt", http.StatusForbidden},
		{"/v1/fs/preview?path=docs", http.StatusBadRequest},
	}
	for _, tc := range refusals {
		if got := get(t, deps, verifier, tc.target, ticket, nil); got.Code != tc.status {
			t.Fatalf("%s: %d, want %d", tc.target, got.Code, tc.status)
		}
	}
}
