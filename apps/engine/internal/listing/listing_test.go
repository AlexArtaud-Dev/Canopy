package listing

import (
	"slices"
	"testing"
	"time"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/authz"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
)

var (
	day     = time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	entries = []fsx.Entry{
		{Name: "b.txt", Size: 30, Modified: day.Add(3 * time.Hour)},
		{Name: "A.txt", Size: 10, Modified: day.Add(1 * time.Hour)},
		{Name: "photos", IsDir: true, Modified: day},
		{Name: "private", IsDir: true, Modified: day},
		{Name: "c.txt", Size: 20, Modified: day.Add(2 * time.Hour)},
	}
	admin = authz.Subject{UserID: "root", Admin: true}
	bob   = authz.Subject{UserID: "bob"}
)

func names(page Page) []string {
	result := make([]string, 0, len(page.Items))
	for _, item := range page.Items {
		result = append(result, item.Name)
	}
	return result
}

func TestBuildSortsFoldersFirst(t *testing.T) {
	cases := map[string]struct {
		opts Options
		want []string
	}{
		"name asc":      {Options{Limit: 10}, []string{"photos", "private", "A.txt", "b.txt", "c.txt"}},
		"name desc":     {Options{Order: OrderDesc, Limit: 10}, []string{"private", "photos", "c.txt", "b.txt", "A.txt"}},
		"size":          {Options{Sort: SortSize, Limit: 10}, []string{"photos", "private", "A.txt", "c.txt", "b.txt"}},
		"modified desc": {Options{Sort: SortModified, Order: OrderDesc, Limit: 10}, []string{"private", "photos", "b.txt", "c.txt", "A.txt"}},
		"dirs only":     {Options{DirsOnly: true, Limit: 10}, []string{"photos", "private"}},
		"page 2":        {Options{Offset: 2, Limit: 2}, []string{"A.txt", "b.txt"}},
		"past the end":  {Options{Offset: 99, Limit: 2}, []string{}},
		"negative":      {Options{Offset: -3, Limit: -1}, []string{}},
	}
	for name, tc := range cases {
		page := Build("/", entries, nil, admin, tc.opts)
		if got := names(page); !slices.Equal(got, tc.want) {
			t.Errorf("%s: got %v, want %v", name, got, tc.want)
		}
	}
}

func TestBuildFiltersByGrants(t *testing.T) {
	grants := []authz.Grant{
		{SubjectType: authz.SubjectUser, SubjectID: "bob", Path: "/docs/photos", Actions: []string{"read", "download"}, Effect: authz.EffectAllow},
		{SubjectType: authz.SubjectUser, SubjectID: "bob", Path: "/docs/b.txt", Actions: []string{"read"}, Effect: authz.EffectAllow},
	}
	page := Build("/docs", entries, grants, bob, Options{Limit: 10})
	if got := names(page); !slices.Equal(got, []string{"photos", "b.txt"}) || page.Total != 2 {
		t.Fatalf("visible = %v (total %d)", got, page.Total)
	}
	if got := page.Items[0].Actions; !slices.Equal(got, []string{"read", "download"}) {
		t.Fatalf("actions = %v", got)
	}
	if page.Items[0].Path != "/docs/photos" {
		t.Fatalf("path = %s", page.Items[0].Path)
	}
}

func TestVisible(t *testing.T) {
	grants := []authz.Grant{{SubjectType: authz.SubjectUser, SubjectID: "bob", Path: "/a/b", Actions: []string{"read"}, Effect: authz.EffectAllow}}
	if !Visible(grants, bob, "/a", true) || Visible(grants, bob, "/a", false) || Visible(grants, bob, "/z", true) {
		t.Fatal("Visible")
	}
}
