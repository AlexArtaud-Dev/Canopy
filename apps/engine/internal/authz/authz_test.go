package authz

import (
	"slices"
	"testing"
)

var (
	alice = Subject{UserID: "alice", Groups: []string{"family"}}
	bob   = Subject{UserID: "bob", Groups: []string{"family"}}
	carol = Subject{UserID: "carol"}
	admin = Subject{UserID: "root", Admin: true}
)

func grant(subjectType, id, path, effect string, actions ...string) Grant {
	return Grant{SubjectType: subjectType, SubjectID: id, Path: path, Actions: actions, Effect: effect}
}

// The example table of docs/dev/permissions.md.
var docGrants = []Grant{
	grant(SubjectGroup, "family", "/media", EffectAllow, "read"),
	grant(SubjectGroup, "family", "/media/private", EffectDeny, "read"),
	grant(SubjectUser, "alice", "/media/private", EffectAllow, "read"),
}

func TestAllowedDocumentedExample(t *testing.T) {
	cases := []struct {
		subject Subject
		path    string
		want    bool
	}{
		{alice, "/media/kids", true},
		{bob, "/media/kids", true},
		{alice, "/media/private", true},
		{alice, "/media/private/x.jpg", true},
		{bob, "/media/private", false},
		{bob, "/media/private/x.jpg", false},
		{carol, "/media/kids", false},
		{bob, "/", false},
		{admin, "/media/private", true},
	}
	for _, tc := range cases {
		if got := Allowed(docGrants, tc.subject, tc.path, "read"); got != tc.want {
			t.Errorf("%s read %s = %v, want %v", tc.subject.UserID, tc.path, got, tc.want)
		}
	}
}

func TestAllowedRules(t *testing.T) {
	t.Run("deny beats allow at the same depth and level", func(t *testing.T) {
		grants := []Grant{
			grant(SubjectGroup, "family", "/a", EffectAllow, "read"),
			grant(SubjectGroup, "family", "/a", EffectDeny, "read"),
		}
		if Allowed(grants, bob, "/a/x", "read") {
			t.Fatal("allowed despite a deny")
		}
	})
	t.Run("deeper beats shallower whatever the level", func(t *testing.T) {
		grants := []Grant{
			grant(SubjectUser, "bob", "/a", EffectDeny, "read"),
			grant(SubjectGroup, "family", "/a/b", EffectAllow, "read"),
		}
		if !Allowed(grants, bob, "/a/b/c", "read") || Allowed(grants, bob, "/a/z", "read") {
			t.Fatal("depth did not decide")
		}
	})
	t.Run("grants only apply to their actions, subjects and subtree", func(t *testing.T) {
		grants := []Grant{
			grant(SubjectUser, "bob", "/a", EffectAllow, "read"),
			grant("robot", "bob", "/", EffectAllow, "delete"),
		}
		if Allowed(grants, bob, "/a", "delete") || Allowed(grants, alice, "/a", "read") ||
			Allowed(grants, bob, "/ab", "read") {
			t.Fatal("grant leaked")
		}
	})
	t.Run("root grant covers everything", func(t *testing.T) {
		grants := []Grant{grant(SubjectGroup, "family", "/", EffectAllow, "read")}
		if !Allowed(grants, alice, "/deep/down/file", "read") {
			t.Fatal("root grant ignored")
		}
	})
}

func TestCapabilities(t *testing.T) {
	grants := []Grant{grant(SubjectUser, "bob", "/a", EffectAllow, "read", "download", "upload")}
	got := Capabilities(grants, bob, "/a/x")
	if !slices.Equal(got, []string{"read", "upload", "download"}) {
		t.Fatalf("Capabilities = %v", got)
	}
	if len(Capabilities(nil, admin, "/x")) != len(Actions) {
		t.Fatal("admin should hold every action")
	}
	if len(Capabilities(nil, bob, "/x")) != 0 {
		t.Fatal("default deny")
	}
}

func TestMayTraverse(t *testing.T) {
	grants := []Grant{
		grant(SubjectUser, "bob", "/media/photos", EffectAllow, "read"),
		grant(SubjectUser, "bob", "/backups", EffectAllow, "download"),
		grant(SubjectUser, "bob", "/old", EffectDeny, "read"),
	}
	cases := map[string]bool{
		"/":             true,
		"/media":        true,
		"/media/photos": true,
		"/media/music":  false,
		"/backups":      false,
		"/old":          false,
	}
	for path, want := range cases {
		if got := MayTraverse(grants, bob, path); got != want {
			t.Errorf("MayTraverse(%s) = %v, want %v", path, got, want)
		}
	}
	if !MayTraverse(nil, admin, "/anything") {
		t.Fatal("admin traverses everything")
	}
}

func TestExplain(t *testing.T) {
	decision := Explain(docGrants, alice, "/media/private/x", "read")
	if !decision.Allowed || decision.ByAdmin || decision.Grant == nil ||
		decision.Grant.SubjectType != SubjectUser || decision.Grant.Path != "/media/private" {
		t.Fatalf("alice: %+v", decision)
	}
	denied := Explain(docGrants, bob, "/media/private", "read")
	if denied.Allowed || denied.Grant == nil || denied.Grant.Effect != EffectDeny {
		t.Fatalf("bob: %+v", denied)
	}
	none := Explain(docGrants, carol, "/media", "read")
	if none.Allowed || none.Grant != nil {
		t.Fatalf("carol: %+v", none)
	}
	byAdmin := Explain(nil, admin, "/x", "delete")
	if !byAdmin.Allowed || !byAdmin.ByAdmin {
		t.Fatalf("admin: %+v", byAdmin)
	}
}

func TestScope(t *testing.T) {
	grants := []Grant{{SubjectType: SubjectUser, SubjectID: "bob", Path: "/media", Actions: Actions, Effect: EffectAllow}}
	shared := Subject{UserID: "bob", Scope: "/media/photos"}
	if !Allowed(grants, shared, "/media/photos/a.jpg", "download") || !Allowed(grants, shared, "/media/photos", "read") {
		t.Fatal("reads inside the share")
	}
	if Allowed(grants, shared, "/media/photos/a.jpg", "delete") || Allowed(grants, shared, "/media/music", "read") {
		t.Fatal("nothing else")
	}
	if MayTraverse(grants, shared, "/media") || !MayTraverse(grants, shared, "/media/photos/2024") {
		t.Fatal("no way up")
	}
	admin := Subject{UserID: "root", Admin: true, Scope: "/media/photos"}
	if Allowed(nil, admin, "/media/music", "read") {
		t.Fatal("scope applies before the administrator bypass")
	}
	if got := Capabilities(grants, shared, "/media/photos"); len(got) != 2 {
		t.Fatalf("capabilities: %v", got)
	}
	owner := Subject{UserID: "carol", Scope: "/media/photos"}
	if Allowed(grants, owner, "/media/photos/a.jpg", "read") {
		t.Fatal("a share never reaches more than its owner can")
	}
}
