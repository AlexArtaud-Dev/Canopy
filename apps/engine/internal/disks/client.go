package disks

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

// ErrUnavailable means the disks service did not answer (not running, not reachable).
var ErrUnavailable = errors.New("disks service unavailable")

// maxReplyBytes bounds a reply from the disks service.
const maxReplyBytes = 4 << 20

// clientTimeout covers a full listing: smartctl reads disks one after another.
const clientTimeout = 3 * time.Minute

// Client asks the disks service, as the engine does.
type Client struct {
	BaseURL string
	Token   string
	HTTP    *http.Client
}

// NewClient builds a client for the service at baseURL.
func NewClient(baseURL, token string) *Client {
	return &Client{BaseURL: baseURL, Token: token, HTTP: &http.Client{Timeout: clientTimeout}}
}

func (c *Client) do(ctx context.Context, method, path string, body, into any) error {
	var payload io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("encode disks request: %w", err)
		}
		payload = bytes.NewReader(encoded)
	}
	//nolint:gosec // the disks service's address is the engine's own configuration, paths are fixed
	request, err := http.NewRequestWithContext(ctx, method, c.BaseURL+path, payload)
	if err != nil {
		return fmt.Errorf("build disks request: %w", err)
	}
	request.Header.Set("Authorization", "Bearer "+c.Token)
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	response, err := c.HTTP.Do(request) //nolint:gosec // same configured address
	if err != nil {
		return fmt.Errorf("%w: %w", ErrUnavailable, err)
	}
	defer func() { _ = response.Body.Close() }()
	switch {
	case response.StatusCode == http.StatusNotFound:
		return ErrUnknownDisk
	case response.StatusCode == http.StatusBadRequest:
		return ErrUnknownTest
	case response.StatusCode >= http.StatusMultipleChoices:
		return fmt.Errorf("%w: status %d", ErrUnavailable, response.StatusCode)
	case into == nil:
		return nil
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, maxReplyBytes)).Decode(into); err != nil {
		return fmt.Errorf("%w: %w", ErrUnavailable, err)
	}
	return nil
}

// List reads every disk.
func (c *Client) List(ctx context.Context) ([]Disk, error) {
	var list List
	if err := c.do(ctx, http.MethodGet, "/v1/disks", nil, &list); err != nil {
		return nil, err
	}
	return list.Disks, nil
}

// Get reads one disk.
func (c *Client) Get(ctx context.Context, id string) (Disk, error) {
	if !ValidID(id) {
		return Disk{}, ErrUnknownDisk
	}
	var disk Disk
	err := c.do(ctx, http.MethodGet, "/v1/disks/"+url.PathEscape(id), nil, &disk)
	return disk, err
}

// StartTest asks a disk to run a self-test.
func (c *Client) StartTest(ctx context.Context, id string, kind TestKind) error {
	if !ValidID(id) {
		return ErrUnknownDisk
	}
	return c.do(ctx, http.MethodPost, "/v1/disks/"+url.PathEscape(id)+"/self-test", testRequest{Kind: kind}, nil)
}

// AbortTest stops a disk's running self-test.
func (c *Client) AbortTest(ctx context.Context, id string) error {
	if !ValidID(id) {
		return ErrUnknownDisk
	}
	return c.do(ctx, http.MethodDelete, "/v1/disks/"+url.PathEscape(id)+"/self-test", nil, nil)
}
