package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/api"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/disks"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/jobs"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/metrics"
)

// Disk health error codes.
const (
	codeDisksForbidden     = "disks.forbidden"
	codeDisksNotConfigured = "disks.not_configured"
	codeDisksUnavailable   = "disks.unavailable"
	codeDiskNotFound       = "disks.not_found"
	codeDiskInvalidTest    = "disks.invalid_test"
)

// alertBatch is how many alerts one claim hands out.
const alertBatch = 100

// DiskHealth is the disks watcher; nil when the disks service is not set up.
type DiskHealth interface {
	Current(ctx context.Context) (disks.State, error)
	Check(ctx context.Context) (disks.State, error)
	Claim(ctx context.Context, limit int) ([]disks.Alert, error)
}

// toAPI converts between the engine's disk types and the contract's, which share their JSON.
func toAPI[T any](value any) (T, error) {
	var converted T
	data, err := json.Marshal(value)
	if err != nil {
		return converted, fmt.Errorf("encode %T: %w", value, err)
	}
	if err := json.Unmarshal(data, &converted); err != nil {
		return converted, fmt.Errorf("decode %T: %w", converted, err)
	}
	return converted, nil
}

func (s *server) diskReport(state disks.State) (api.DiskReport, error) {
	report := api.DiskReport{Configured: s.deps.Disks != nil, Disks: []api.Disk{}}
	if state.CheckedAt != nil {
		// The contract's date-times are UTC; the database answers in its own zone.
		checked := state.CheckedAt.UTC()
		report.CheckedAt = &checked
	}
	if len(state.Disks) == 0 {
		return report, nil
	}
	converted, err := toAPI[[]api.Disk](state.Disks)
	if err != nil {
		return api.DiskReport{}, err
	}
	report.Disks = converted
	return report, nil
}

func (s *server) GetDisks(ctx context.Context, _ api.GetDisksRequestObject) (api.GetDisksResponseObject, error) {
	principal, ok := readsMetrics(ctx)
	if !ok {
		return api.GetDisks401JSONResponse(newError(ctx, codeUnauthorized)), nil
	}
	if !metrics.MayRead(principal.Permissions, metrics.FamilyDisks) {
		return api.GetDisks403JSONResponse(newError(ctx, codeDisksForbidden)), nil
	}
	var state disks.State
	if s.deps.Disks != nil {
		var err error
		if state, err = s.deps.Disks.Current(ctx); err != nil {
			return nil, err //nolint:wrapcheck // answered as system.internal
		}
	}
	report, err := s.diskReport(state)
	if err != nil {
		return nil, err
	}
	return api.GetDisks200JSONResponse(report), nil
}

func (s *server) CheckDisks(ctx context.Context, _ api.CheckDisksRequestObject) (api.CheckDisksResponseObject, error) {
	principal, ok, admin := adminPrincipal(ctx)
	switch {
	case !ok:
		return api.CheckDisks401JSONResponse(newError(ctx, codeUnauthorized)), nil
	case !admin:
		return api.CheckDisks403JSONResponse(newError(ctx, codeAdminOnly)), nil
	case s.deps.Disks == nil:
		return api.CheckDisks503JSONResponse(newError(ctx, codeDisksNotConfigured)), nil
	}
	state, err := s.deps.Disks.Check(ctx)
	if errors.Is(err, disks.ErrUnavailable) {
		return api.CheckDisks503JSONResponse(newError(ctx, codeDisksUnavailable)), nil
	}
	if err != nil {
		return nil, err //nolint:wrapcheck // answered as system.internal
	}
	s.record(ctx, principal, "disks.check", "", map[string]any{"disks": len(state.Disks)})
	report, err := s.diskReport(state)
	if err != nil {
		return nil, err
	}
	return api.CheckDisks200JSONResponse(report), nil
}

func (s *server) StartDiskSelfTest(ctx context.Context, request api.StartDiskSelfTestRequestObject) (api.StartDiskSelfTestResponseObject, error) {
	principal, ok, admin := adminPrincipal(ctx)
	switch {
	case !ok:
		return api.StartDiskSelfTest401JSONResponse(newError(ctx, codeUnauthorized)), nil
	case !admin:
		return api.StartDiskSelfTest403JSONResponse(newError(ctx, codeAdminOnly)), nil
	case s.deps.Disks == nil:
		return api.StartDiskSelfTest503JSONResponse(newError(ctx, codeDisksNotConfigured)), nil
	case !request.Body.Test.Valid():
		return api.StartDiskSelfTest400JSONResponse(newError(ctx, codeDiskInvalidTest)), nil
	}
	state, err := s.deps.Disks.Current(ctx)
	if err != nil {
		return nil, err //nolint:wrapcheck // answered as system.internal
	}
	disk, found := findDisk(state, request.Disk)
	if !found {
		return api.StartDiskSelfTest404JSONResponse(newError(ctx, codeDiskNotFound)), nil
	}
	test := disks.TestKind(request.Body.Test)
	id, err := s.deps.Jobs.StartDiskSelfTest(ctx, principal.UserID, disk.ID, test)
	if errors.Is(err, jobs.ErrTooMany) {
		return api.StartDiskSelfTest429JSONResponse(newError(ctx, jobs.CodeTooMany)), nil
	}
	if err != nil {
		return nil, err //nolint:wrapcheck // answered as system.internal
	}
	s.record(ctx, principal, "jobs.start", disk.ID, map[string]any{
		"jobId": id, "kind": disks.SelfTestKind, "test": string(test), "disk": disks.SeriesName(disk),
	})
	job, err := s.deps.Jobs.Get(ctx, id, "")
	if err != nil {
		return nil, err //nolint:wrapcheck // answered as system.internal
	}
	body, err := toAPIJob(job)
	if err != nil {
		return nil, err
	}
	return api.StartDiskSelfTest202JSONResponse(body), nil
}

func findDisk(state disks.State, id string) (disks.Disk, bool) {
	for _, disk := range state.Disks {
		if disk.ID == id {
			return disk, true
		}
	}
	return disks.Disk{}, false
}

func (s *server) ClaimDiskAlerts(ctx context.Context, _ api.ClaimDiskAlertsRequestObject) (api.ClaimDiskAlertsResponseObject, error) {
	_, ok, admin := adminPrincipal(ctx)
	switch {
	case !ok:
		return api.ClaimDiskAlerts401JSONResponse(newError(ctx, codeUnauthorized)), nil
	case !admin:
		return api.ClaimDiskAlerts403JSONResponse(newError(ctx, codeAdminOnly)), nil
	case s.deps.Disks == nil:
		return api.ClaimDiskAlerts200JSONResponse(api.DiskAlerts{Alerts: []api.DiskAlert{}}), nil
	}
	alerts, err := s.deps.Disks.Claim(ctx, alertBatch)
	if err != nil {
		return nil, err //nolint:wrapcheck // answered as system.internal
	}
	converted := []api.DiskAlert{}
	if len(alerts) > 0 {
		if converted, err = toAPI[[]api.DiskAlert](alerts); err != nil {
			return nil, err
		}
	}
	return api.ClaimDiskAlerts200JSONResponse(api.DiskAlerts{Alerts: converted}), nil
}
