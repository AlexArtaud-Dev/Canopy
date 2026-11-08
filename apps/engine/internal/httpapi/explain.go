package httpapi

import (
	"context"
	"slices"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/api"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/authz"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/enginetoken"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
)

const (
	codeAuthForbidden = "auth.forbidden"
	inspectPermission = "users:read"
)

// ExplainAccess traces a person's access to a path with the same resolution the engine enforces,
// so the admin "access" page can never disagree with reality.
func (s *server) ExplainAccess(ctx context.Context, request api.ExplainAccessRequestObject) (api.ExplainAccessResponseObject, error) {
	principal, ok := enginetoken.FromContext(ctx)
	if !ok {
		return api.ExplainAccess401JSONResponse(newError(ctx, codeUnauthorized)), nil
	}
	if !principal.IsAdmin() && !slices.Contains(principal.Permissions, inspectPermission) {
		return api.ExplainAccess403JSONResponse(newError(ctx, codeAuthForbidden)), nil
	}
	body := request.Body
	if body == nil {
		return api.ExplainAccess400JSONResponse(newError(ctx, codeBadRequest)), nil
	}
	target, err := fsx.Clean(body.Path)
	if err != nil {
		return api.ExplainAccess400JSONResponse(newError(ctx, fsx.CodeInvalidPath)), nil
	}
	subject := authz.Subject{UserID: body.UserId, Groups: body.Groups, Admin: body.Admin}
	var grants []authz.Grant
	if !subject.Admin {
		grants, err = s.deps.Grants.GrantsFor(ctx, subject)
		if err != nil {
			return nil, err //nolint:wrapcheck // answered as system.internal
		}
	}

	response := api.ExplainAccess200JSONResponse{Path: target}
	for _, action := range authz.Actions {
		decision := authz.Explain(grants, subject, target, action)
		item := api.AccessDecision{
			Action:  api.PathAction(action),
			Allowed: decision.Allowed,
			ByAdmin: decision.ByAdmin,
		}
		if decision.Grant != nil {
			item.Grant = &api.DecidingGrant{
				Id:          decision.Grant.ID,
				SubjectType: api.DecidingGrantSubjectType(decision.Grant.SubjectType),
				SubjectId:   decision.Grant.SubjectID,
				Path:        decision.Grant.Path,
				Effect:      api.DecidingGrantEffect(decision.Grant.Effect),
			}
		}
		response.Decisions = append(response.Decisions, item)
	}
	return response, nil
}
