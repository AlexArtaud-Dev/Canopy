package disks

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"testing"
	"time"
)

type memoryStore struct {
	state    State
	queued   []Alert
	purged   time.Time
	loadErr  error
	saveErr  error
	purgeErr error
}

func (m *memoryStore) Load(context.Context) (State, error) { return m.state, m.loadErr }

func (m *memoryStore) Save(_ context.Context, state State, alerts []Alert) error {
	if m.saveErr != nil {
		return m.saveErr
	}
	m.state = state
	m.queued = append(m.queued, alerts...)
	return nil
}

func (m *memoryStore) Claim(_ context.Context, limit int) ([]Alert, error) {
	claimed := m.queued[:min(limit, len(m.queued))]
	m.queued = m.queued[len(claimed):]
	return claimed, nil
}

func (m *memoryStore) Purge(_ context.Context, before time.Time) error {
	m.purged = before
	return m.purgeErr
}

type listReader struct {
	Reader
	disks []Disk
	err   error
}

func (l *listReader) List(context.Context) ([]Disk, error) { return l.disks, l.err }

var noon = time.Date(2026, 11, 24, 12, 0, 0, 0, time.UTC)

func watcher(store *memoryStore, reader *listReader, settingsErr error) *Watcher {
	return &Watcher{
		Reader: reader, Store: store,
		Settings: func(context.Context) (Settings, error) { return DefaultSettings, settingsErr },
		Logger:   slog.New(slog.NewTextHandler(io.Discard, nil)),
		Now:      func() time.Time { return noon },
	}
}

func TestWatcherCheck(t *testing.T) {
	store := &memoryStore{state: State{Disks: []Disk{{ID: "sda", Serial: "S", Model: "WD", Temperature: value(30), Health: HealthPassed}}}}
	reader := &listReader{disks: []Disk{
		{ID: "sda", Asleep: true},
		{ID: "sdb", Serial: "T", Health: HealthFailing, Reasons: []string{ReasonSmartFailed}},
	}}
	w := watcher(store, reader, nil)
	state, err := w.Check(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if !state.CheckedAt.Equal(noon) || len(state.Disks) != 2 || state.Disks[0].Model != "WD" || !state.Disks[0].Asleep {
		t.Errorf("got %+v", state)
	}
	current, _ := w.Current(context.Background())
	if len(current.Disks) != 2 {
		t.Errorf("not saved: %+v", current)
	}
	alerts, _ := w.Claim(context.Background(), 10)
	if len(alerts) != 1 || alerts[0].Kind != AlertFailing || alerts[0].Disk != "sdb" {
		t.Errorf("alerts %+v", alerts)
	}
}

func TestWatcherCheckFailures(t *testing.T) {
	broken := errors.New("broken")
	ctx := context.Background()
	if _, err := watcher(&memoryStore{}, &listReader{}, broken).Check(ctx); !errors.Is(err, broken) {
		t.Errorf("settings: %v", err)
	}
	if _, err := watcher(&memoryStore{loadErr: broken}, &listReader{}, nil).Check(ctx); !errors.Is(err, broken) {
		t.Errorf("load: %v", err)
	}
	if _, err := watcher(&memoryStore{}, &listReader{err: broken}, nil).Check(ctx); !errors.Is(err, broken) {
		t.Errorf("list: %v", err)
	}
	if _, err := watcher(&memoryStore{saveErr: broken}, &listReader{}, nil).Check(ctx); !errors.Is(err, broken) {
		t.Errorf("save: %v", err)
	}
}

func TestWatcherRounds(t *testing.T) {
	ctx := context.Background()
	store := &memoryStore{}
	if wait := watcher(store, &listReader{}, nil).round(ctx); wait != DefaultSettings.Every {
		t.Errorf("wait %v", wait)
	}
	if !store.purged.Equal(noon.Add(-alertKeep)) {
		t.Errorf("purged before %v", store.purged)
	}
	if wait := watcher(&memoryStore{}, &listReader{err: errors.New("down")}, nil).round(ctx); wait != retryAfter {
		t.Errorf("after a failure: %v", wait)
	}
	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	if wait := watcher(&memoryStore{}, &listReader{err: context.Canceled}, nil).round(cancelled); wait != retryAfter {
		t.Errorf("cancelled: %v", wait)
	}
	// Purging may fail: the round still goes on.
	if wait := watcher(&memoryStore{purgeErr: errors.New("x")}, &listReader{}, nil).round(ctx); wait != DefaultSettings.Every {
		t.Errorf("purge failure: %v", wait)
	}
	// Settings unreadable after the check: the default pace.
	calls := 0
	w := watcher(&memoryStore{}, &listReader{}, nil)
	w.Settings = func(context.Context) (Settings, error) {
		calls++
		if calls > 1 {
			return Settings{}, errors.New("gone")
		}
		return DefaultSettings, nil
	}
	if wait := w.round(ctx); wait != DefaultSettings.Every {
		t.Errorf("settings failure: %v", wait)
	}
}

func TestWatcherRunStops(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	store := &memoryStore{}
	w := watcher(store, &listReader{}, nil)
	done := make(chan struct{})
	go func() {
		w.Run(ctx)
		close(done)
	}()
	cancel()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("Run did not stop")
	}
}
