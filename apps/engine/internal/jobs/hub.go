package jobs

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	subscriberBuffer = 64
	reconnectDelay   = 2 * time.Second
)

// Notice is one change announced on Channel.
type Notice struct {
	ID    string `json:"id"`
	Owner string `json:"owner"`
}

// ParseNotice decodes a notification payload.
func ParseNotice(payload string) (Notice, error) {
	var notice Notice
	if err := json.Unmarshal([]byte(payload), &notice); err != nil {
		return Notice{}, fmt.Errorf("decode job notice: %w", err)
	}
	if notice.ID == "" || notice.Owner == "" {
		return Notice{}, errors.New("incomplete job notice")
	}
	return notice, nil
}

type subscription struct {
	owner string
	ch    chan Notice
}

// Hub listens to Channel once and fans notices out to event-stream subscribers.
type Hub struct {
	mu          sync.Mutex
	subscribers map[*subscription]struct{}
}

// NewHub builds an idle hub; call Listen to feed it.
func NewHub() *Hub {
	return &Hub{subscribers: map[*subscription]struct{}{}}
}

// Subscribe receives notices for owner's jobs ("" for every job). Call cancel when done.
func (h *Hub) Subscribe(owner string) (notices <-chan Notice, cancel func()) {
	sub := &subscription{owner: owner, ch: make(chan Notice, subscriberBuffer)}
	h.mu.Lock()
	h.subscribers[sub] = struct{}{}
	h.mu.Unlock()
	return sub.ch, func() {
		h.mu.Lock()
		delete(h.subscribers, sub)
		h.mu.Unlock()
	}
}

// Publish delivers a notice to matching subscribers. A subscriber too slow to keep up loses
// intermediate notices rather than stalling everyone; the next one carries the latest state.
func (h *Hub) Publish(notice Notice) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for sub := range h.subscribers {
		if sub.owner != "" && sub.owner != notice.Owner {
			continue
		}
		select {
		case sub.ch <- notice:
		default:
		}
	}
}

// Listen feeds the hub from Postgres until ctx ends, reconnecting after failures.
func (h *Hub) Listen(ctx context.Context, pool *pgxpool.Pool, logger *slog.Logger) {
	for ctx.Err() == nil {
		if err := h.listenOnce(ctx, pool, logger); err != nil && ctx.Err() == nil {
			logger.Warn("job notifications interrupted", slog.Any("error", err))
			select {
			case <-ctx.Done():
			case <-time.After(reconnectDelay):
			}
		}
	}
}

func (h *Hub) listenOnce(ctx context.Context, pool *pgxpool.Pool, logger *slog.Logger) error {
	conn, err := pool.Acquire(ctx)
	if err != nil {
		return fmt.Errorf("acquire: %w", err)
	}
	defer conn.Release()
	if _, err := conn.Exec(ctx, "LISTEN "+Channel); err != nil {
		return fmt.Errorf("listen: %w", err)
	}
	for {
		notification, err := conn.Conn().WaitForNotification(ctx)
		if err != nil {
			return fmt.Errorf("wait: %w", err)
		}
		notice, err := ParseNotice(notification.Payload)
		if err != nil {
			logger.Warn("ignored job notice", slog.Any("error", err))
			continue
		}
		h.Publish(notice)
	}
}
