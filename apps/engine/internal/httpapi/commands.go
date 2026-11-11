package httpapi

import (
	"context"
	"errors"
	"net/http"
	"path"
	"slices"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/api"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/commands"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/enginetoken"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/transfer"
)

// advancedPermission lets a person use advanced catalog entries (when the mode is on).
const advancedPermission = "commands:advanced"

// Commands is the catalog side the API needs.
type Commands interface {
	List(advanced bool) []commands.Entry
	Get(id string, advanced bool) (commands.Entry, string, bool)
}

// HostPaths turns checked virtual paths into host paths for external tools.
type HostPaths interface {
	HostPath(virtual string) (string, error)
}

var errUnavailable = errors.New("command unavailable")

// advanced reports whether the caller may use advanced entries: the mode is on (setting) and
// they hold the permission (administrators hold every permission).
func (s *server) advanced(ctx context.Context, principal enginetoken.Principal) bool {
	if s.deps.AdvancedMode == nil || !s.deps.AdvancedMode(ctx) {
		return false
	}
	return principal.IsAdmin() || slices.Contains(principal.Permissions, advancedPermission)
}

func (s *server) ListCommands(ctx context.Context, _ api.ListCommandsRequestObject) (api.ListCommandsResponseObject, error) {
	principal, ok := enginetoken.FromContext(ctx)
	if !ok {
		return api.ListCommands401JSONResponse(newError(ctx, codeUnauthorized)), nil
	}
	advanced := s.advanced(ctx, principal)
	body := api.ListCommands200JSONResponse{Advanced: advanced, Entries: []api.CommandEntry{}}
	if s.deps.Commands != nil {
		for _, entry := range s.deps.Commands.List(advanced) {
			body.Entries = append(body.Entries, toCommandEntry(entry))
		}
	}
	return body, nil
}

func toCommandEntry(entry commands.Entry) api.CommandEntry {
	params := make([]api.CommandParam, 0, len(entry.Params))
	for _, param := range entry.Params {
		converted := api.CommandParam{
			Name: param.Name, Type: api.CommandParamType(param.Type), Label: localized(param.Label),
			Required: param.Required, Secret: param.Secret, Default: param.Default, Min: param.Min, Max: param.Max,
		}
		if param.Access != "" {
			access := api.CommandParamAccess(param.Access)
			converted.Access = &access
		}
		if param.On != "" {
			on := param.On
			converted.On = &on
		}
		if param.ChoicesFrom != "" {
			source := param.ChoicesFrom
			converted.ChoicesFrom = &source
		}
		if len(param.Extensions) > 0 {
			extensions := slices.Clone(param.Extensions)
			converted.Extensions = &extensions
		}
		if len(param.Values) > 0 {
			values := slices.Clone(param.Values)
			converted.Values = &values
		}
		if len(param.Choices) > 0 {
			choices := make([]api.CommandChoice, 0, len(param.Choices))
			for _, choice := range param.Choices {
				choices = append(choices, api.CommandChoice{Value: choice.Value, Label: localized(choice.Label)})
			}
			converted.Choices = &choices
		}
		params = append(params, converted)
	}
	converted := api.CommandEntry{
		Id: entry.ID, Name: localized(entry.Name), Description: localized(entry.Description),
		Mode: api.CommandEntryMode(entry.Mode), DryRun: entry.DryRun != nil, Params: params,
	}
	if entry.Plugin != nil {
		converted.Plugin = &api.CommandPlugin{Id: entry.Plugin.ID, Name: localized(entry.Plugin.Name)}
	}
	return converted
}

func localized(text commands.Text) api.LocalizedText {
	return api.LocalizedText{En: text.En, Fr: text.Fr, Es: text.Es}
}

// plan validates a request: the entry is visible to the caller, the values fit its params, and
// every path param is one the caller holds its access on (on the path, or on its folder when it
// does not exist yet).
func (s *server) plan(ctx context.Context, principal enginetoken.Principal, request api.CommandRequest) (commands.Entry, commands.Plan, error) {
	if s.deps.Commands == nil {
		return commands.Entry{}, commands.Plan{}, errUnavailable
	}
	entry, _, ok := s.deps.Commands.Get(request.Entry, s.advanced(ctx, principal))
	if !ok {
		return commands.Entry{}, commands.Plan{}, errUnavailable
	}
	access, err := s.accessOf(ctx, principal)
	if err != nil {
		return commands.Entry{}, commands.Plan{}, err
	}
	resolve := func(param commands.Param, virtual string) (string, error) {
		return s.hostPathFor(access, param.Access, virtual)
	}
	dryRun := request.DryRun != nil && *request.DryRun
	plan, err := commands.Build(entry, request.Params, resolve, dryRun)
	return entry, plan, err //nolint:wrapcheck // classified by the caller
}

func (s *server) hostPathFor(access transfer.Access, action, virtual string) (string, error) {
	clean, err := fsx.Clean(virtual)
	if err != nil {
		return "", err //nolint:wrapcheck // classified by the caller
	}
	checked := clean
	if _, err := s.deps.Ops.Lstat(clean); errors.Is(err, fsx.ErrNotFound) {
		checked = path.Dir(clean)
	} else if err != nil {
		return "", err //nolint:wrapcheck // classified by the caller
	}
	if !access.Can(action, checked) {
		return "", errForbidden
	}
	return s.deps.HostPaths.HostPath(clean) //nolint:wrapcheck // classified by the caller
}

// commandRefusal maps planning errors to an HTTP status and code.
func commandRefusal(err error) (failure, bool) {
	switch {
	case errors.Is(err, errUnavailable):
		return failure{http.StatusNotFound, commands.CodeUnavailable}, true
	case errors.Is(err, commands.ErrUnknownParam):
		return failure{http.StatusBadRequest, commands.CodeUnknownParam}, true
	case errors.Is(err, commands.ErrMissing):
		return failure{http.StatusBadRequest, commands.CodeMissing}, true
	case errors.Is(err, commands.ErrBadValue):
		return failure{http.StatusBadRequest, commands.CodeBadValue}, true
	case errors.Is(err, commands.ErrNoDryRun):
		return failure{http.StatusBadRequest, commands.CodeNoDryRun}, true
	case errors.Is(err, fsx.ErrOutsideRoot):
		return failure{http.StatusForbidden, codeForbidden}, true
	default:
		return classify(err)
	}
}

func (s *server) PreviewCommand(ctx context.Context, request api.PreviewCommandRequestObject) (api.PreviewCommandResponseObject, error) {
	principal, ok := enginetoken.FromContext(ctx)
	if !ok {
		return api.PreviewCommand401JSONResponse(newError(ctx, codeUnauthorized)), nil
	}
	entry, plan, err := s.plan(ctx, principal, *request.Body)
	if err != nil {
		refusal, known := commandRefusal(err)
		if !known {
			return nil, err
		}
		body := newError(ctx, refusal.code)
		switch refusal.status {
		case http.StatusForbidden:
			return api.PreviewCommand403JSONResponse(body), nil
		case http.StatusNotFound:
			return api.PreviewCommand404JSONResponse(body), nil
		default:
			return api.PreviewCommand400JSONResponse(body), nil
		}
	}
	return api.PreviewCommand200JSONResponse{Binary: entry.Binary, Argv: plan.Preview}, nil
}

func (s *server) StartCommand(ctx context.Context, request api.StartCommandRequestObject) (api.StartCommandResponseObject, error) {
	principal, ok := enginetoken.FromContext(ctx)
	if !ok {
		return api.StartCommand401JSONResponse(newError(ctx, codeUnauthorized)), nil
	}
	outcome, err := s.queueJob(ctx, principal, commands.RunKind, request.Body.Entry, func() (string, error) {
		entry, plan, err := s.plan(ctx, principal, *request.Body)
		if err != nil {
			return "", err
		}
		workDir, err := s.deps.HostPaths.HostPath("/")
		if err != nil {
			return "", err //nolint:wrapcheck // classified
		}
		return s.deps.Jobs.StartCommand(ctx, commands.RunArgs{
			Entry: entry.ID, Argv: plan.Argv, Preview: plan.Preview, Secrets: plan.Secrets,
			WorkDir: workDir, DryRun: request.Body.DryRun != nil && *request.Body.DryRun,
			Subject: subjectOf(principal),
		})
	})
	if err != nil {
		if refusal, known := commandRefusal(err); known {
			outcome = queuedJob{refusal: refusal, refused: true}
		} else {
			return nil, err
		}
	}
	if !outcome.refused {
		return api.StartCommand202JSONResponse(outcome.job), nil
	}
	body := newError(ctx, outcome.refusal.code)
	switch outcome.refusal.status {
	case http.StatusForbidden:
		return api.StartCommand403JSONResponse(body), nil
	case http.StatusNotFound:
		return api.StartCommand404JSONResponse(body), nil
	case http.StatusTooManyRequests:
		return api.StartCommand429JSONResponse(body), nil
	default:
		return api.StartCommand400JSONResponse(body), nil
	}
}
