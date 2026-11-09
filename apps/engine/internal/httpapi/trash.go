package httpapi

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5/middleware"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/api"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/authz"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/enginetoken"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/trash"
)

// Trash is the trash service (trash.Service in production).
type Trash interface {
	PlanDelete(ctx context.Context, subject authz.Subject, paths []string) (trash.Plan, error)
	Delete(ctx context.Context, subject authz.Subject, paths []string, requestID string) ([]trash.Item, error)
	CheckPermanent(ctx context.Context, subject authz.Subject, paths []string) ([]string, error)
	List(ctx context.Context, subject authz.Subject) ([]trash.Item, error)
	Restore(ctx context.Context, subject authz.Subject, ids []string, requestID string) ([]trash.Restored, error)
	CurrentLimits(ctx context.Context) (trash.Limits, error)
}

func toAPILimits(limits trash.Limits) api.TrashLimits {
	return api.TrashLimits{
		MaxBytes: limits.MaxBytes, MaxFiles: limits.MaxFiles,
		RetentionDays: int(limits.Retention.Hours() / 24),
	}
}

func toAPITrashItems(items []trash.Item) []api.TrashItem {
	result := make([]api.TrashItem, 0, len(items))
	for _, item := range items {
		result = append(result, api.TrashItem{
			Id: item.ID, Name: item.Name, OriginalPath: item.OriginalPath, IsDirectory: item.IsDir,
			DeletedAt: item.DeletedAt.UTC(), DeletedBy: item.DeletedBy, Bytes: item.Bytes,
			Files: item.Files, Measured: item.Measured,
		})
	}
	return result
}

// refusal answers a classified error with the generated response for its status.
func refusalFor[T any](ctx context.Context, err error, byStatus map[int]func(api.Error) T) (T, error) {
	var zero T
	refusal, known := classify(err)
	if !known {
		return zero, err
	}
	build, ok := byStatus[refusal.status]
	if !ok {
		return zero, err
	}
	return build(newError(ctx, refusal.code)), nil
}

func (s *server) PlanDelete(ctx context.Context, request api.PlanDeleteRequestObject) (api.PlanDeleteResponseObject, error) {
	principal, ok := enginetoken.FromContext(ctx)
	if !ok {
		return api.PlanDelete401JSONResponse(newError(ctx, codeUnauthorized)), nil
	}
	plan, err := s.deps.Trash.PlanDelete(ctx, subjectOf(principal), request.Body.Paths)
	if err != nil {
		return refusalFor(ctx, err, map[int]func(api.Error) api.PlanDeleteResponseObject{
			http.StatusBadRequest: func(e api.Error) api.PlanDeleteResponseObject { return api.PlanDelete400JSONResponse(e) },
			http.StatusForbidden:  func(e api.Error) api.PlanDeleteResponseObject { return api.PlanDelete403JSONResponse(e) },
			http.StatusNotFound:   func(e api.Error) api.PlanDeleteResponseObject { return api.PlanDelete404JSONResponse(e) },
		})
	}
	limits, err := s.deps.Trash.CurrentLimits(ctx)
	if err != nil {
		return nil, err //nolint:wrapcheck // answered as system.internal
	}
	return api.PlanDelete200JSONResponse{
		Bytes: plan.Bytes, Files: plan.Files, Complete: plan.Complete, FitsTrash: plan.FitsTrash,
		Limits: toAPILimits(limits),
	}, nil
}

func (s *server) MoveToTrash(ctx context.Context, request api.MoveToTrashRequestObject) (api.MoveToTrashResponseObject, error) {
	principal, ok := enginetoken.FromContext(ctx)
	if !ok {
		return api.MoveToTrash401JSONResponse(newError(ctx, codeUnauthorized)), nil
	}
	items, err := s.deps.Trash.Delete(ctx, subjectOf(principal), request.Body.Paths, middleware.GetReqID(ctx))
	if err != nil {
		return refusalFor(ctx, err, map[int]func(api.Error) api.MoveToTrashResponseObject{
			http.StatusBadRequest: func(e api.Error) api.MoveToTrashResponseObject { return api.MoveToTrash400JSONResponse(e) },
			http.StatusForbidden:  func(e api.Error) api.MoveToTrashResponseObject { return api.MoveToTrash403JSONResponse(e) },
			http.StatusNotFound:   func(e api.Error) api.MoveToTrashResponseObject { return api.MoveToTrash404JSONResponse(e) },
		})
	}
	return api.MoveToTrash200JSONResponse{Items: toAPITrashItems(items)}, nil
}

func (s *server) StartPermanentDelete(ctx context.Context, request api.StartPermanentDeleteRequestObject) (api.StartPermanentDeleteResponseObject, error) {
	principal, ok := enginetoken.FromContext(ctx)
	if !ok {
		return api.StartPermanentDelete401JSONResponse(newError(ctx, codeUnauthorized)), nil
	}
	subject := subjectOf(principal)
	paths, err := s.deps.Trash.CheckPermanent(ctx, subject, request.Body.Paths)
	var id string
	if err == nil {
		id, err = s.deps.Jobs.StartDelete(ctx, trash.DeleteArgs{Paths: paths, Subject: subject})
	}
	if err != nil {
		return refusalFor(ctx, err, map[int]func(api.Error) api.StartPermanentDeleteResponseObject{
			http.StatusBadRequest: func(e api.Error) api.StartPermanentDeleteResponseObject {
				return api.StartPermanentDelete400JSONResponse(e)
			},
			http.StatusForbidden: func(e api.Error) api.StartPermanentDeleteResponseObject {
				return api.StartPermanentDelete403JSONResponse(e)
			},
			http.StatusNotFound: func(e api.Error) api.StartPermanentDeleteResponseObject {
				return api.StartPermanentDelete404JSONResponse(e)
			},
			http.StatusTooManyRequests: func(e api.Error) api.StartPermanentDeleteResponseObject {
				return api.StartPermanentDelete429JSONResponse(e)
			},
		})
	}
	s.record(ctx, principal, "jobs.start", "", map[string]any{"jobId": id, "kind": trash.KindDelete, "items": len(paths)})
	job, err := s.queuedJob(ctx, id)
	if err != nil {
		return nil, err
	}
	return api.StartPermanentDelete202JSONResponse(job), nil
}

func (s *server) ListTrash(ctx context.Context, _ api.ListTrashRequestObject) (api.ListTrashResponseObject, error) {
	principal, ok := enginetoken.FromContext(ctx)
	if !ok {
		return api.ListTrash401JSONResponse(newError(ctx, codeUnauthorized)), nil
	}
	items, err := s.deps.Trash.List(ctx, subjectOf(principal))
	if err != nil {
		return nil, err //nolint:wrapcheck // answered as system.internal
	}
	limits, err := s.deps.Trash.CurrentLimits(ctx)
	if err != nil {
		return nil, err //nolint:wrapcheck // answered as system.internal
	}
	return api.ListTrash200JSONResponse{Items: toAPITrashItems(items), Limits: toAPILimits(limits)}, nil
}

func (s *server) RestoreFromTrash(ctx context.Context, request api.RestoreFromTrashRequestObject) (api.RestoreFromTrashResponseObject, error) {
	principal, ok := enginetoken.FromContext(ctx)
	if !ok {
		return api.RestoreFromTrash401JSONResponse(newError(ctx, codeUnauthorized)), nil
	}
	restored, err := s.deps.Trash.Restore(ctx, subjectOf(principal), request.Body.Ids, middleware.GetReqID(ctx))
	if err != nil {
		return refusalFor(ctx, err, map[int]func(api.Error) api.RestoreFromTrashResponseObject{
			http.StatusForbidden: func(e api.Error) api.RestoreFromTrashResponseObject { return api.RestoreFromTrash403JSONResponse(e) },
			http.StatusNotFound:  func(e api.Error) api.RestoreFromTrashResponseObject { return api.RestoreFromTrash404JSONResponse(e) },
			http.StatusConflict:  func(e api.Error) api.RestoreFromTrashResponseObject { return api.RestoreFromTrash409JSONResponse(e) },
		})
	}
	body := api.RestoreFromTrash200JSONResponse{Items: make([]api.RestoredItem, 0, len(restored))}
	for _, item := range restored {
		body.Items = append(body.Items, api.RestoredItem{Id: item.ID, Path: item.Path})
	}
	return body, nil
}

func (s *server) StartEmptyTrash(ctx context.Context, request api.StartEmptyTrashRequestObject) (api.StartEmptyTrashResponseObject, error) {
	principal, ok := enginetoken.FromContext(ctx)
	if !ok {
		return api.StartEmptyTrash401JSONResponse(newError(ctx, codeUnauthorized)), nil
	}
	id, err := s.deps.Jobs.StartEmptyTrash(ctx, trash.EmptyArgs{IDs: request.Body.Ids, Subject: subjectOf(principal)})
	if err != nil {
		return refusalFor(ctx, err, map[int]func(api.Error) api.StartEmptyTrashResponseObject{
			http.StatusTooManyRequests: func(e api.Error) api.StartEmptyTrashResponseObject { return api.StartEmptyTrash429JSONResponse(e) },
		})
	}
	s.record(ctx, principal, "jobs.start", "", map[string]any{"jobId": id, "kind": trash.KindEmpty, "items": len(request.Body.Ids)})
	job, err := s.queuedJob(ctx, id)
	if err != nil {
		return nil, err
	}
	return api.StartEmptyTrash202JSONResponse(job), nil
}

// queuedJob loads a job just queued, in the contract's shape.
func (s *server) queuedJob(ctx context.Context, id string) (api.Job, error) {
	job, err := s.deps.Jobs.Get(ctx, id, "")
	if err != nil {
		return api.Job{}, err //nolint:wrapcheck // answered as system.internal
	}
	return toAPIJob(job)
}
