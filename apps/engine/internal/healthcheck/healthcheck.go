// Package healthcheck lets the engine binary probe itself, because the distroless runtime image
// has no shell, curl or wget for a container HEALTHCHECK.
package healthcheck

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"time"
)

const timeout = 3 * time.Second

// LocalURL turns a listen address (":8080", "0.0.0.0:8080") into a loopback liveness URL.
func LocalURL(listenAddr string) (string, error) {
	_, port, err := net.SplitHostPort(listenAddr)
	if err != nil {
		return "", fmt.Errorf("healthcheck: listen address %q: %w", listenAddr, err)
	}
	return "http://" + net.JoinHostPort("127.0.0.1", port) + "/healthz", nil
}

// Probe returns nil when the liveness endpoint answers 200.
func Probe(ctx context.Context, client *http.Client, url string) error {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return fmt.Errorf("healthcheck: build request: %w", err)
	}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("healthcheck: request: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("healthcheck: unexpected status %d", resp.StatusCode)
	}
	return nil
}
