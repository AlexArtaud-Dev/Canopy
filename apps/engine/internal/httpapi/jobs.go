package httpapi

import (
	"context"
	"errors"
	"log/slog"

	"github.com/go-chi/chi/v5/middleware"
	"github.com/google/uuid"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/api"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/audit"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/authz"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/enginetoken"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/jobs"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/logging"
)

const defaultJobLimit = 50

// Jobs queues, reads and cancels jobs (a jobs.Runner behind a small adapter in production).
type Jobs interface {
	StartFolderSize(ctx context.Context, path string, subject authz.Subject) (string, error)
	Get(ctx context.Context, id, owner string) (jobs.Job, error)
	List(ctx context.Context, owner string, limit int) ([]jobs.Job, error)
	Cancel(ctx context.Context, job jobs.Job) error
	Logs(ctx context.Context, id string, after int) ([]jobs.LogLine, error)
	Subscribe(owner string) (<-chan jobs.Notice, func())
}

// Auditor records state changes in the audit log.
type Auditor interface {
	Record(ctx context.Context, event audit.Event) error
}

// ownerScope limits what a caller sees: their own jobs, or every job for administrators.
func ownerScope(principal enginetoken.Principal) string {
	if principal.IsAdmin() {
		return ""
	}
	return principal.UserID
}

func (s *server) record(ctx context.Context, principal enginetoken.Principal, action, target string, meta map[string]any) {
	err := s.deps.Audit.Record(ctx, audit.Event{
		ActorID: principal.UserID, Action: action, Target: target, Result: audit.ResultSuccess,
		RequestID: middleware.GetReqID(ctx), Meta: meta,
	})
	if err != nil {
		// The change already happened; losing its audit row must be loud, not fatal for the caller.
		logging.FromContext(ctx, s.deps.Logger).Error("audit write failed", slog.String("action", action), slog.Any("error", err))
	}
}

func (s *server) StartFolderSize(ctx context.Context, request api.StartFolderSizeRequestObject) (api.StartFolderSizeResponseObject, error) {
	principal, ok := enginetoken.FromContext(ctx)
	if !ok {
		return api.StartFolderSize401JSONResponse(newError(ctx, codeUnauthorized)), nil
	}
	dir, err := fsx.Clean(request.Body.Path)
	if err != nil {
		return api.StartFolderSize400JSONResponse(newError(ctx, fsx.CodeInvalidPath)), nil
	}
	subject := subjectOf(principal)
	var grants []authz.Grant
	if !subject.Admin {
		if grants, err = s.deps.Grants.GrantsFor(ctx, subject); err != nil {
			return nil, err //nolint:wrapcheck // answered as system.internal
		}
	}
	if !authz.MayTraverse(grants, subject, dir) {
		return api.StartFolderSize403JSONResponse(newError(ctx, codeForbidden)), nil
	}
	entry, err := s.deps.Files.Stat(dir)
	if err != nil {
		return api.StartFolderSize404JSONResponse(newError(ctx, fsx.CodeNotFound)), nil //nolint:nilerr // missing is an answer
	}
	if !entry.IsDir {
		return api.StartFolderSize404JSONResponse(newError(ctx, fsx.CodeNotDir)), nil
	}

	id, err := s.deps.Jobs.StartFolderSize(ctx, dir, subject)
	if errors.Is(err, jobs.ErrTooMany) {
		return api.StartFolderSize429JSONResponse(newError(ctx, jobs.CodeTooMany)), nil
	}
	if err != nil {
		return nil, err //nolint:wrapcheck // answered as system.internal
	}
	s.record(ctx, principal, "jobs.start", dir, map[string]any{"jobId": id, "kind": "folder_size"})
	job, err := s.deps.Jobs.Get(ctx, id, "")
	if err != nil {
		return nil, err //nolint:wrapcheck // answered as system.internal
	}
	body, err := toAPIJob(job)
	if err != nil {
		return nil, err
	}
	return api.StartFolderSize202JSONResponse(body), nil
}

func (s *server) ListJobs(ctx context.Context, request api.ListJobsRequestObject) (api.ListJobsResponseObject, error) {
	principal, ok := enginetoken.FromContext(ctx)
	if !ok {
		return api.ListJobs401JSONResponse(newError(ctx, codeUnauthorized)), nil
	}
	limit := defaultJobLimit
	if request.Params.Limit != nil {
		limit = *request.Params.Limit
	}
	list, err := s.deps.Jobs.List(ctx, ownerScope(principal), limit)
	if err != nil {
		return nil, err //nolint:wrapcheck // answered as system.internal
	}
	items := make([]api.Job, 0, len(list))
	for _, job := range list {
		body, err := toAPIJob(job)
		if err != nil {
			return nil, err
		}
		items = append(items, body)
	}
	return api.ListJobs200JSONResponse{Items: items}, nil
}

func (s *server) GetJob(ctx context.Context, request api.GetJobRequestObject) (api.GetJobResponseObject, error) {
	principal, ok := enginetoken.FromContext(ctx)
	if !ok {
		return api.GetJob401JSONResponse(newError(ctx, codeUnauthorized)), nil
	}
	job, err := s.deps.Jobs.Get(ctx, request.JobId.String(), ownerScope(principal))
	if errors.Is(err, jobs.ErrNotFound) {
		return api.GetJob404JSONResponse(newError(ctx, jobs.CodeNotFound)), nil
	}
	if err != nil {
		return nil, err //nolint:wrapcheck // answered as system.internal
	}
	body, err := toAPIJob(job)
	if err != nil {
		return nil, err
	}
	return api.GetJob200JSONResponse(body), nil
}

func (s *server) CancelJob(ctx context.Context, request api.CancelJobRequestObject) (api.CancelJobResponseObject, error) {
	principal, ok := enginetoken.FromContext(ctx)
	if !ok {
		return api.CancelJob401JSONResponse(newError(ctx, codeUnauthorized)), nil
	}
	id := request.JobId.String()
	job, err := s.deps.Jobs.Get(ctx, id, ownerScope(principal))
	if errors.Is(err, jobs.ErrNotFound) {
		return api.CancelJob404JSONResponse(newError(ctx, jobs.CodeNotFound)), nil
	}
	if err != nil {
		return nil, err //nolint:wrapcheck // answered as system.internal
	}
	err = s.deps.Jobs.Cancel(ctx, job)
	if errors.Is(err, jobs.ErrNotCancellable) {
		return api.CancelJob409JSONResponse(newError(ctx, jobs.CodeNotRunning)), nil
	}
	if err != nil {
		return nil, err //nolint:wrapcheck // answered as system.internal
	}
	s.record(ctx, principal, "jobs.cancel", derefOr(job.Target), map[string]any{"jobId": id, "kind": job.Kind})
	if job, err = s.deps.Jobs.Get(ctx, id, ""); err != nil {
		return nil, err //nolint:wrapcheck // answered as system.internal
	}
	body, err := toAPIJob(job)
	if err != nil {
		return nil, err
	}
	return api.CancelJob202JSONResponse(body), nil
}

func (s *server) GetJobLogs(ctx context.Context, request api.GetJobLogsRequestObject) (api.GetJobLogsResponseObject, error) {
	principal, ok := enginetoken.FromContext(ctx)
	if !ok {
		return api.GetJobLogs401JSONResponse(newError(ctx, codeUnauthorized)), nil
	}
	id := request.JobId.String()
	if _, err := s.deps.Jobs.Get(ctx, id, ownerScope(principal)); err != nil {
		if errors.Is(err, jobs.ErrNotFound) {
			return api.GetJobLogs404JSONResponse(newError(ctx, jobs.CodeNotFound)), nil
		}
		return nil, err //nolint:wrapcheck // answered as system.internal
	}
	after := 0
	if request.Params.After != nil {
		after = *request.Params.After
	}
	lines, err := s.deps.Jobs.Logs(ctx, id, after)
	if err != nil {
		return nil, err //nolint:wrapcheck // answered as system.internal
	}
	items := make([]api.JobLogLine, 0, len(lines))
	for _, line := range lines {
		items = append(items, api.JobLogLine{
			Seq: line.Seq, At: line.At, Level: api.JobLogLineLevel(line.Level), Line: line.Line,
		})
	}
	return api.GetJobLogs200JSONResponse{Items: items}, nil
}

// toAPIJob maps a stored job to the contract shape.
func toAPIJob(job jobs.Job) (api.Job, error) {
	id, err := uuid.Parse(job.ID)
	if err != nil {
		return api.Job{}, err //nolint:wrapcheck // ids come from Postgres; a bad one is an internal error
	}
	body := api.Job{
		Id: id, Kind: job.Kind, OwnerId: job.OwnerID, State: api.JobState(job.State),
		Target: job.Target, BytesDone: job.Snapshot.BytesDone, BytesTotal: job.Snapshot.BytesTotal,
		ItemsDone: job.Snapshot.ItemsDone, ItemsTotal: job.Snapshot.ItemsTotal,
		RateBps: job.Snapshot.RateBps, ErrorCode: job.ErrorCode, CreatedAt: job.CreatedAt,
		StartedAt: job.StartedAt, FinishedAt: job.FinishedAt,
	}
	if job.Snapshot.CurrentPath != "" {
		current := job.Snapshot.CurrentPath
		body.CurrentPath = &current
	}
	if job.Snapshot.EtaSeconds != nil {
		eta := int(*job.Snapshot.EtaSeconds)
		body.EtaSeconds = &eta
	}
	if job.Result != nil {
		result := job.Result
		body.Result = &result
	}
	return body, nil
}

func derefOr(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
