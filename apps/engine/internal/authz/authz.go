// Package authz resolves path grants: who may do what under which folder. Pure and
// table-tested; the store only loads rows.
package authz

import (
	"slices"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
)

// Actions are the path actions, as declared by the web app's files module.
var Actions = []string{
	"read", "upload", "create", "update", "move", "copy", "delete", "download", "share", "execute",
}

// Subject types and effects stored in app.path_grants.
const (
	SubjectUser  = "user"
	SubjectGroup = "group"
	EffectAllow  = "allow"
	EffectDeny   = "deny"
)

// Grant is one row of app.path_grants (path already clean).
type Grant struct {
	ID          string
	SubjectType string
	SubjectID   string
	Path        string
	Actions     []string
	Effect      string
}

// Subject is the caller: a user, their groups, and whether they administer Canopy.
type Subject struct {
	UserID string
	Groups []string
	Admin  bool
	// Scope confines a share link to reading and downloading under one path, on top of its
	// owner's own grants (a share never reaches more than its owner can).
	Scope string
}

// scopedActions are all a share link may do.
var scopedActions = []string{"read", "download"}

func (s Subject) outOfScope(target, action string) bool {
	return s.Scope != "" && (!fsx.IsWithin(target, s.Scope) || !slices.Contains(scopedActions, action))
}

func (s Subject) owns(grant Grant) bool {
	switch grant.SubjectType {
	case SubjectUser:
		return grant.SubjectID == s.UserID
	case SubjectGroup:
		return slices.Contains(s.Groups, grant.SubjectID)
	default:
		return false
	}
}

// rank orders matching grants: deeper path first, then user over group, then deny over allow.
func rank(grant Grant) (depth, level, effect int) {
	depth = len(fsx.Ancestors(grant.Path))
	if grant.SubjectType == SubjectUser {
		level = 1
	}
	if grant.Effect == EffectDeny {
		effect = 1
	}
	return depth, level, effect
}

func outranks(a, b Grant) bool {
	ad, al, ae := rank(a)
	bd, bl, be := rank(b)
	if ad != bd {
		return ad > bd
	}
	if al != bl {
		return al > bl
	}
	return ae > be
}

// Decision explains one action on one path: whether it is allowed and why.
type Decision struct {
	Allowed bool
	// ByAdmin is true when system:admin decided (grants ignored).
	ByAdmin bool
	// Grant is the deciding rule; nil when no rule matched (default deny).
	Grant *Grant
}

// Explain decides one action on one clean virtual path and names what decided it.
// Administrators bypass grants; otherwise the most specific matching grant decides.
func Explain(grants []Grant, subject Subject, target, action string) Decision {
	if subject.outOfScope(target, action) {
		return Decision{}
	}
	if subject.Admin {
		return Decision{Allowed: true, ByAdmin: true}
	}
	var decisive *Grant
	for i := range grants {
		grant := grants[i]
		if !subject.owns(grant) || !fsx.IsWithin(target, grant.Path) ||
			!slices.Contains(grant.Actions, action) {
			continue
		}
		if decisive == nil || outranks(grant, *decisive) {
			decisive = &grants[i]
		}
	}
	return Decision{Allowed: decisive != nil && decisive.Effect == EffectAllow, Grant: decisive}
}

// Allowed decides one action on one clean virtual path (no grant means no access).
func Allowed(grants []Grant, subject Subject, target, action string) bool {
	return Explain(grants, subject, target, action).Allowed
}

// Capabilities lists the actions allowed on a path, for per-entry UI affordances.
func Capabilities(grants []Grant, subject Subject, target string) []string {
	allowed := make([]string, 0, len(Actions))
	for _, action := range Actions {
		if Allowed(grants, subject, target, action) {
			allowed = append(allowed, action)
		}
	}
	return allowed
}

// MayTraverse reports whether some grant below target lets the subject read deeper, so a parent
// folder is shown (names only) on the way to a granted subfolder.
func MayTraverse(grants []Grant, subject Subject, target string) bool {
	if subject.outOfScope(target, "read") {
		return false
	}
	if subject.Admin || Allowed(grants, subject, target, "read") {
		return true
	}
	for _, grant := range grants {
		if subject.owns(grant) && grant.Effect == EffectAllow && grant.Path != target &&
			fsx.IsWithin(grant.Path, target) && slices.Contains(grant.Actions, "read") {
			return true
		}
	}
	return false
}
