package httpapi

import (
	"context"
	"errors"
	"net/http"
	"os"
	"path"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/api"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/enginetoken"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/jobs"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/transfer"
)

// Ops writes to the managed tree (an fsx.Resolver in production).
type Ops interface {
	transfer.Files
	OpenFile(virtual string) (*os.File, fsx.Entry, error)
}

// failure is a refusal with its HTTP status and translated code.
type failure struct {
	status int
	code   string
}

// classify maps domain errors to refusals; ok is false for unexpected errors (system.internal).
func classify(err error) (failure, bool) {
	switch {
	case errors.Is(err, fsx.ErrInvalidPath):
		return failure{http.StatusBadRequest, fsx.CodeInvalidPath}, true
	case errors.Is(err, fsx.ErrNotDir):
		return failure{http.StatusBadRequest, fsx.CodeNotDir}, true
	case errors.Is(err, fsx.ErrNotFound):
		return failure{http.StatusNotFound, fsx.CodeNotFound}, true
	case errors.Is(err, fsx.ErrExists):
		return failure{http.StatusConflict, fsx.CodeExists}, true
	case errors.Is(err, transfer.ErrIntoItself):
		return failure{http.StatusBadRequest, transfer.CodeIntoItself}, true
	case errors.Is(err, transfer.ErrSameLocation):
		return failure{http.StatusBadRequest, transfer.CodeSameLocation}, true
	case errors.Is(err, transfer.ErrDuplicateNames):
		return failure{http.StatusBadRequest, transfer.CodeDuplicateNames}, true
	case errors.Is(err, errForbidden):
		return failure{http.StatusForbidden, codeForbidden}, true
	case errors.Is(err, errInvalidName):
		return failure{http.StatusBadRequest, fsx.CodeInvalidName}, true
	case errors.Is(err, jobs.ErrTooMany):
		return failure{http.StatusTooManyRequests, jobs.CodeTooMany}, true
	default:
		return failure{}, false
	}
}

var (
	errForbidden   = errors.New("forbidden")
	errInvalidName = errors.New("invalid name")
)

func (s *server) accessOf(ctx context.Context, principal enginetoken.Principal) (transfer.Access, error) {
	access, err := transfer.LoadAccess(ctx, s.deps.Grants, subjectOf(principal))
	if err != nil {
		return transfer.Access{}, err //nolint:wrapcheck // answered as system.internal
	}
	return access, nil
}

// mkdir creates one folder after checking the name and `create` on the new path.
func (s *server) mkdir(ctx context.Context, principal enginetoken.Principal, virtual string) (string, error) {
	clean, err := fsx.Clean(virtual)
	if err != nil {
		return "", err //nolint:wrapcheck // classified by the caller
	}
	if clean == "/" || !fsx.ValidName(path.Base(clean)) {
		return "", errInvalidName
	}
	access, err := s.accessOf(ctx, principal)
	if err != nil {
		return "", err
	}
	if !access.Can("create", clean) {
		return "", errForbidden
	}
	if err := s.deps.Ops.Mkdir(clean); err != nil {
		return "", err //nolint:wrapcheck // classified by the caller
	}
	s.record(ctx, principal, "fs.mkdir", clean, nil)
	return clean, nil
}

func (s *server) CreateFolder(ctx context.Context, request api.CreateFolderRequestObject) (api.CreateFolderResponseObject, error) {
	principal, ok := enginetoken.FromContext(ctx)
	if !ok {
		return api.CreateFolder401JSONResponse(newError(ctx, codeUnauthorized)), nil
	}
	created, err := s.mkdir(ctx, principal, request.Body.Path)
	if err == nil {
		return api.CreateFolder201JSONResponse{Path: created}, nil
	}
	refusal, known := classify(err)
	switch {
	case !known:
		return nil, err
	case refusal.status == http.StatusBadRequest:
		return api.CreateFolder400JSONResponse(newError(ctx, refusal.code)), nil
	case refusal.status == http.StatusForbidden:
		return api.CreateFolder403JSONResponse(newError(ctx, refusal.code)), nil
	case refusal.status == http.StatusNotFound:
		return api.CreateFolder404JSONResponse(newError(ctx, refusal.code)), nil
	default:
		return api.CreateFolder409JSONResponse(newError(ctx, refusal.code)), nil
	}
}

// rename changes an entry's name in place, needing `update` on it.
func (s *server) rename(ctx context.Context, principal enginetoken.Principal, virtual, name string) (string, error) {
	clean, err := fsx.Clean(virtual)
	if err != nil {
		return "", err //nolint:wrapcheck // classified by the caller
	}
	if clean == "/" || !fsx.ValidName(name) {
		return "", errInvalidName
	}
	access, err := s.accessOf(ctx, principal)
	if err != nil {
		return "", err
	}
	if !access.Can("update", clean) {
		return "", errForbidden
	}
	target := path.Join(path.Dir(clean), name)
	if target == clean {
		return clean, nil
	}
	if err := s.deps.Ops.Rename(clean, target); err != nil {
		return "", err //nolint:wrapcheck // classified by the caller
	}
	s.record(ctx, principal, "fs.rename", clean, map[string]any{"to": target})
	return target, nil
}

func (s *server) RenameEntry(ctx context.Context, request api.RenameEntryRequestObject) (api.RenameEntryResponseObject, error) {
	principal, ok := enginetoken.FromContext(ctx)
	if !ok {
		return api.RenameEntry401JSONResponse(newError(ctx, codeUnauthorized)), nil
	}
	renamed, err := s.rename(ctx, principal, request.Body.Path, request.Body.Name)
	if err == nil {
		return api.RenameEntry200JSONResponse{Path: renamed}, nil
	}
	refusal, known := classify(err)
	switch {
	case !known:
		return nil, err
	case refusal.status == http.StatusBadRequest:
		return api.RenameEntry400JSONResponse(newError(ctx, refusal.code)), nil
	case refusal.status == http.StatusForbidden:
		return api.RenameEntry403JSONResponse(newError(ctx, refusal.code)), nil
	case refusal.status == http.StatusNotFound:
		return api.RenameEntry404JSONResponse(newError(ctx, refusal.code)), nil
	default:
		return api.RenameEntry409JSONResponse(newError(ctx, refusal.code)), nil
	}
}

// checkTransfer validates a copy or move and authorizes it: the operation on every source and
// `create` in the destination folder. Overwrites are authorized per target by the job.
func (s *server) checkTransfer(ctx context.Context, principal enginetoken.Principal, request api.TransferRequest) ([]string, string, transfer.Access, error) {
	op := string(request.Operation)
	if !transfer.ValidOperation(op) {
		return nil, "", transfer.Access{}, fsx.ErrInvalidPath
	}
	sources, dest, err := transfer.Validate(op, request.Sources, request.Destination)
	if err != nil {
		return nil, "", transfer.Access{}, err //nolint:wrapcheck // classified by the caller
	}
	access, err := s.accessOf(ctx, principal)
	if err != nil {
		return nil, "", transfer.Access{}, err
	}
	target, err := s.deps.Ops.Lstat(dest)
	if err != nil {
		return nil, "", transfer.Access{}, err //nolint:wrapcheck // classified by the caller
	}
	if !target.IsDir {
		return nil, "", transfer.Access{}, fsx.ErrNotDir
	}
	if !access.Can("create", dest) {
		return nil, "", transfer.Access{}, errForbidden
	}
	for _, src := range sources {
		entry, err := s.deps.Ops.Lstat(src)
		if err != nil {
			return nil, "", transfer.Access{}, err //nolint:wrapcheck // classified by the caller
		}
		if !access.CanRead(src, entry.IsDir) || !access.Can(op, src) {
			return nil, "", transfer.Access{}, errForbidden
		}
	}
	return sources, dest, access, nil
}

func (s *server) PlanTransfer(ctx context.Context, request api.PlanTransferRequestObject) (api.PlanTransferResponseObject, error) {
	principal, ok := enginetoken.FromContext(ctx)
	if !ok {
		return api.PlanTransfer401JSONResponse(newError(ctx, codeUnauthorized)), nil
	}
	sources, dest, access, err := s.checkTransfer(ctx, principal, *request.Body)
	var conflicts []transfer.Conflict
	truncated := false
	if err == nil {
		conflicts, truncated, err = transfer.FindConflicts(s.deps.Ops, access, sources, dest)
	}
	if err != nil {
		refusal, known := classify(err)
		switch {
		case !known:
			return nil, err
		case refusal.status == http.StatusForbidden:
			return api.PlanTransfer403JSONResponse(newError(ctx, refusal.code)), nil
		case refusal.status == http.StatusNotFound:
			return api.PlanTransfer404JSONResponse(newError(ctx, refusal.code)), nil
		default:
			return api.PlanTransfer400JSONResponse(newError(ctx, refusal.code)), nil
		}
	}
	body := api.PlanTransfer200JSONResponse{Conflicts: make([]api.TransferConflict, 0, len(conflicts)), Truncated: truncated}
	for _, conflict := range conflicts {
		body.Conflicts = append(body.Conflicts, api.TransferConflict{
			Source: conflict.Source, Target: conflict.Target, Self: conflict.Self,
			SourceIsDirectory: conflict.SourceIsDir, TargetIsDirectory: conflict.TargetIsDir,
		})
	}
	return body, nil
}

func (s *server) StartTransfer(ctx context.Context, request api.StartTransferRequestObject) (api.StartTransferResponseObject, error) {
	principal, ok := enginetoken.FromContext(ctx)
	if !ok {
		return api.StartTransfer401JSONResponse(newError(ctx, codeUnauthorized)), nil
	}
	body := *request.Body
	id, err := s.queueTransfer(ctx, principal, body)
	if err != nil {
		refusal, known := classify(err)
		switch {
		case !known:
			return nil, err
		case refusal.status == http.StatusForbidden:
			return api.StartTransfer403JSONResponse(newError(ctx, refusal.code)), nil
		case refusal.status == http.StatusNotFound:
			return api.StartTransfer404JSONResponse(newError(ctx, refusal.code)), nil
		case refusal.status == http.StatusTooManyRequests:
			return api.StartTransfer429JSONResponse(newError(ctx, refusal.code)), nil
		default:
			return api.StartTransfer400JSONResponse(newError(ctx, refusal.code)), nil
		}
	}
	job, err := s.deps.Jobs.Get(ctx, id, "")
	if err != nil {
		return nil, err //nolint:wrapcheck // answered as system.internal
	}
	created, err := toAPIJob(job)
	if err != nil {
		return nil, err
	}
	return api.StartTransfer202JSONResponse(created), nil
}

func (s *server) queueTransfer(ctx context.Context, principal enginetoken.Principal, body api.TransferJobRequest) (string, error) {
	strategy := string(body.Strategy)
	if !transfer.ValidStrategy(strategy) {
		return "", fsx.ErrInvalidPath
	}
	sources, dest, _, err := s.checkTransfer(ctx, principal, api.TransferRequest{
		Operation: body.Operation, Sources: body.Sources, Destination: body.Destination,
	})
	if err != nil {
		return "", err
	}
	decisions := map[string]string{}
	if body.Decisions != nil {
		for target, decision := range *body.Decisions {
			decisions[target] = string(decision)
		}
	}
	args := transfer.Args{
		Operation: string(body.Operation), Sources: sources, Destination: dest,
		Strategy: strategy, Decisions: decisions, Subject: subjectOf(principal),
	}
	id, err := s.deps.Jobs.StartTransfer(ctx, args)
	if err != nil {
		return "", err //nolint:wrapcheck // classified by the caller
	}
	s.record(ctx, principal, "jobs.start", dest, map[string]any{
		"jobId": id, "kind": transfer.Kind, "operation": args.Operation,
		"sources": len(sources), "strategy": strategy,
	})
	return id, nil
}
