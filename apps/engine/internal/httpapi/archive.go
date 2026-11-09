package httpapi

import (
	"context"
	"net/http"
	"path"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/api"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/archive"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/enginetoken"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
)

// queuedJob is how starting a job ended: the job, or a refusal to translate into the operation's
// own response type.
type queuedJob struct {
	job     api.Job
	refusal failure
	refused bool
}

// queueJob checks with allow (which also starts the job and returns its id), audits the start
// and loads the job. Known refusals come back as such; anything else is an internal error.
func (s *server) queueJob(ctx context.Context, principal enginetoken.Principal, kind, target string, start func() (string, error)) (queuedJob, error) {
	id, err := start()
	if err != nil {
		refusal, known := classify(err)
		if !known {
			return queuedJob{}, err
		}
		return queuedJob{refusal: refusal, refused: true}, nil
	}
	s.record(ctx, principal, "jobs.start", target, map[string]any{"jobId": id, "kind": kind})
	job, err := s.deps.Jobs.Get(ctx, id, "")
	if err != nil {
		return queuedJob{}, err //nolint:wrapcheck // answered as system.internal
	}
	body, err := toAPIJob(job)
	if err != nil {
		return queuedJob{}, err
	}
	return queuedJob{job: body}, nil
}

// requireFile refuses folders, links and missing paths as not found: these jobs take one file.
func (s *server) requireFile(virtual string) error {
	entry, err := s.deps.Ops.Lstat(virtual)
	if err != nil {
		return err //nolint:wrapcheck // classified by the caller
	}
	if entry.IsDir || entry.IsLink {
		return fsx.ErrNotFound
	}
	return nil
}

func (s *server) StartCompress(ctx context.Context, request api.StartCompressRequestObject) (api.StartCompressResponseObject, error) {
	principal, ok := enginetoken.FromContext(ctx)
	if !ok {
		return api.StartCompress401JSONResponse(newError(ctx, codeUnauthorized)), nil
	}
	body := *request.Body
	var folder string
	outcome, err := s.queueJob(ctx, principal, archive.CompressKind, "", func() (string, error) {
		format := archive.Format(body.Format)
		if !archive.ValidOutput(format) {
			return "", fsx.ErrInvalidPath
		}
		sources := make([]string, 0, len(body.Sources))
		for _, source := range body.Sources {
			clean, err := fsx.Clean(source)
			if err != nil || clean == "/" {
				return "", fsx.ErrInvalidPath
			}
			sources = append(sources, clean)
		}
		parent, err := archive.Parent(sources)
		if err != nil {
			return "", err //nolint:wrapcheck // classified
		}
		folder = parent
		access, err := s.accessOf(ctx, principal)
		if err != nil {
			return "", err
		}
		if !access.Can("create", folder) {
			return "", errForbidden
		}
		for _, source := range sources {
			entry, err := s.deps.Ops.Lstat(source)
			if err != nil {
				return "", err //nolint:wrapcheck // classified
			}
			if !access.CanRead(source, entry.IsDir) || !access.Can("copy", source) {
				return "", errForbidden
			}
		}
		return s.deps.Jobs.StartCompress(ctx, archive.CompressArgs{
			Sources: sources, Folder: folder, Format: format, Subject: subjectOf(principal),
		})
	})
	switch {
	case err != nil:
		return nil, err
	case !outcome.refused:
		return api.StartCompress202JSONResponse(outcome.job), nil
	}
	refusal := newError(ctx, outcome.refusal.code)
	switch outcome.refusal.status {
	case http.StatusForbidden:
		return api.StartCompress403JSONResponse(refusal), nil
	case http.StatusNotFound:
		return api.StartCompress404JSONResponse(refusal), nil
	case http.StatusTooManyRequests:
		return api.StartCompress429JSONResponse(refusal), nil
	default:
		return api.StartCompress400JSONResponse(refusal), nil
	}
}

func (s *server) StartExtract(ctx context.Context, request api.StartExtractRequestObject) (api.StartExtractResponseObject, error) {
	principal, ok := enginetoken.FromContext(ctx)
	if !ok {
		return api.StartExtract401JSONResponse(newError(ctx, codeUnauthorized)), nil
	}
	outcome, err := s.queueJob(ctx, principal, archive.ExtractKind, request.Body.Path, func() (string, error) {
		clean, err := fsx.Clean(request.Body.Path)
		if err != nil {
			return "", err //nolint:wrapcheck // classified
		}
		if archive.FormatOf(clean) == archive.None {
			return "", archive.ErrNotArchive
		}
		if err := s.requireFile(clean); err != nil {
			return "", err
		}
		access, err := s.accessOf(ctx, principal)
		if err != nil {
			return "", err
		}
		if !access.CanRead(clean, false) || !access.Can("copy", clean) || !access.Can("create", path.Dir(clean)) {
			return "", errForbidden
		}
		return s.deps.Jobs.StartExtract(ctx, archive.ExtractArgs{Archive: clean, Subject: subjectOf(principal)})
	})
	switch {
	case err != nil:
		return nil, err
	case !outcome.refused:
		return api.StartExtract202JSONResponse(outcome.job), nil
	}
	refusal := newError(ctx, outcome.refusal.code)
	switch outcome.refusal.status {
	case http.StatusForbidden:
		return api.StartExtract403JSONResponse(refusal), nil
	case http.StatusNotFound:
		return api.StartExtract404JSONResponse(refusal), nil
	case http.StatusTooManyRequests:
		return api.StartExtract429JSONResponse(refusal), nil
	default:
		return api.StartExtract400JSONResponse(refusal), nil
	}
}

func (s *server) StartChecksum(ctx context.Context, request api.StartChecksumRequestObject) (api.StartChecksumResponseObject, error) {
	principal, ok := enginetoken.FromContext(ctx)
	if !ok {
		return api.StartChecksum401JSONResponse(newError(ctx, codeUnauthorized)), nil
	}
	outcome, err := s.queueJob(ctx, principal, archive.ChecksumKind, request.Body.Path, func() (string, error) {
		clean, err := fsx.Clean(request.Body.Path)
		if err != nil {
			return "", err //nolint:wrapcheck // classified
		}
		algorithm := string(request.Body.Algorithm)
		if !archive.ValidAlgorithm(algorithm) {
			return "", fsx.ErrInvalidPath
		}
		if err := s.requireFile(clean); err != nil {
			return "", err
		}
		access, err := s.accessOf(ctx, principal)
		if err != nil {
			return "", err
		}
		if !access.Can("download", clean) {
			return "", errForbidden
		}
		return s.deps.Jobs.StartChecksum(ctx, archive.ChecksumArgs{Path: clean, Algorithm: algorithm, Subject: subjectOf(principal)})
	})
	switch {
	case err != nil:
		return nil, err
	case !outcome.refused:
		return api.StartChecksum202JSONResponse(outcome.job), nil
	}
	refusal := newError(ctx, outcome.refusal.code)
	switch outcome.refusal.status {
	case http.StatusForbidden:
		return api.StartChecksum403JSONResponse(refusal), nil
	case http.StatusNotFound:
		return api.StartChecksum404JSONResponse(refusal), nil
	case http.StatusTooManyRequests:
		return api.StartChecksum429JSONResponse(refusal), nil
	default:
		return api.StartChecksum400JSONResponse(refusal), nil
	}
}
