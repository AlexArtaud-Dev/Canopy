package disks

import (
	"context"
	"errors"
	"fmt"
	"os/exec"
	"sync"
	"time"
)

// Exec runs smartctl with an argv (never a shell) and returns its standard output. smartctl's
// exit status is a bit mask that is non-zero on many healthy disks, so it is not an error here.
type Exec func(ctx context.Context, args ...string) ([]byte, error)

// SystemExec runs the smartctl found in PATH.
func SystemExec(ctx context.Context, args ...string) ([]byte, error) {
	// A fixed binary; arguments are flags and devices from smartctl's own scan, never a request's.
	output, err := exec.CommandContext(ctx, "smartctl", args...).Output() //nolint:gosec // see above
	if exitErr := (*exec.ExitError)(nil); errors.As(err, &exitErr) {
		return output, nil
	}
	if err != nil {
		return nil, fmt.Errorf("run smartctl: %w", err)
	}
	return output, nil
}

// TestKind is a self-test a disk runs by itself.
type TestKind string

// The self-tests offered: a quick one (minutes) and a full surface scan (hours).
const (
	TestShort TestKind = "short"
	TestLong  TestKind = "long"
)

// ErrUnknownDisk means the id names no disk smartctl found.
var ErrUnknownDisk = errors.New("unknown disk")

// ErrUnknownTest means the self-test kind is not offered.
var ErrUnknownTest = errors.New("unknown self-test")

// perDiskTimeout bounds one smartctl call: a stuck USB bridge must not hold the others.
const perDiskTimeout = 30 * time.Second

// Smartctl reads disks through smartctl. Devices come from smartctl's own scan, so a request
// only ever names a disk by id.
type Smartctl struct {
	Exec Exec
	mu   sync.Mutex
}

func (s *Smartctl) devices(ctx context.Context) ([]Device, error) {
	output, err := s.Exec(ctx, "--scan-open", "-j")
	if err != nil {
		return nil, err
	}
	return ParseScan(output)
}

func (s *Smartctl) device(ctx context.Context, id string) (Device, error) {
	if !ValidID(id) {
		return Device{}, ErrUnknownDisk
	}
	devices, err := s.devices(ctx)
	if err != nil {
		return Device{}, err
	}
	for _, device := range devices {
		if device.ID == id {
			return device, nil
		}
	}
	return Device{}, ErrUnknownDisk
}

// read reports one device without waking it up: a sleeping disk is reported asleep.
func (s *Smartctl) read(ctx context.Context, device Device) (Disk, error) {
	ctx, cancel := context.WithTimeout(ctx, perDiskTimeout)
	defer cancel()
	output, err := s.Exec(ctx, "-j", "-a", "-n", "standby,0", "-d", device.Type, device.Name)
	if err != nil {
		return Disk{}, err
	}
	return ParseReport(device, output)
}

// List reads every disk. One disk smartctl cannot read is left out rather than failing all.
func (s *Smartctl) List(ctx context.Context) ([]Disk, error) {
	// One reading at a time: smartctl on the same controller does not like company.
	s.mu.Lock()
	defer s.mu.Unlock()
	devices, err := s.devices(ctx)
	if err != nil {
		return nil, err
	}
	disks := make([]Disk, 0, len(devices))
	for _, device := range devices {
		disk, err := s.read(ctx, device)
		if err != nil {
			continue
		}
		disks = append(disks, disk)
	}
	return disks, nil
}

// Get reads one disk.
func (s *Smartctl) Get(ctx context.Context, id string) (Disk, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	device, err := s.device(ctx, id)
	if err != nil {
		return Disk{}, err
	}
	return s.read(ctx, device)
}

// StartTest asks a disk to run a self-test; the disk runs it alone, in the background.
func (s *Smartctl) StartTest(ctx context.Context, id string, kind TestKind) error {
	if kind != TestShort && kind != TestLong {
		return ErrUnknownTest
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	device, err := s.device(ctx, id)
	if err != nil {
		return err
	}
	_, err = s.Exec(ctx, "-t", string(kind), "-d", device.Type, device.Name)
	return err
}

// AbortTest stops a disk's running self-test.
func (s *Smartctl) AbortTest(ctx context.Context, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	device, err := s.device(ctx, id)
	if err != nil {
		return err
	}
	_, err = s.Exec(ctx, "-X", "-d", device.Type, device.Name)
	return err
}
