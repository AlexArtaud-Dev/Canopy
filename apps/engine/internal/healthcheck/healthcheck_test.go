package healthcheck

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestLocalURL(t *testing.T) {
	t.Parallel()

	tests := []struct {
		addr    string
		want    string
		wantErr bool
	}{
		{":8080", "http://127.0.0.1:8080/healthz", false},
		{"0.0.0.0:9000", "http://127.0.0.1:9000/healthz", false},
		{"8080", "", true},
	}
	for _, tt := range tests {
		got, err := LocalURL(tt.addr)
		if (err != nil) != tt.wantErr || got != tt.want {
			t.Errorf("LocalURL(%q) = %q, %v; want %q, err=%v", tt.addr, got, err, tt.want, tt.wantErr)
		}
	}
}

func TestProbe(t *testing.T) {
	t.Parallel()

	healthy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer healthy.Close()
	failing := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer failing.Close()

	ctx := context.Background()
	if err := Probe(ctx, healthy.Client(), healthy.URL); err != nil {
		t.Fatalf("healthy probe: %v", err)
	}
	if err := Probe(ctx, failing.Client(), failing.URL); err == nil {
		t.Fatal("failing probe should return an error")
	}
	if err := Probe(ctx, healthy.Client(), "http://127.0.0.1:1/healthz"); err == nil {
		t.Fatal("unreachable probe should return an error")
	}
	if err := Probe(ctx, healthy.Client(), "://bad"); err == nil {
		t.Fatal("invalid URL should return an error")
	}
}
