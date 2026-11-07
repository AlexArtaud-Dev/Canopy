// Package listing turns raw directory entries into what one caller may see: filtered by path
// grants, annotated with their allowed actions, sorted and paginated. Pure.
package listing

import (
	"cmp"
	"path"
	"slices"
	"strings"
	"time"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/authz"
	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
)

// Sort keys and orders accepted by Build.
const (
	SortName     = "name"
	SortSize     = "size"
	SortModified = "modified"
	OrderDesc    = "desc"
)

// Options select and order one page.
type Options struct {
	DirsOnly bool
	Sort     string
	Order    string
	Offset   int
	Limit    int
}

// Item is one visible entry with the caller's actions on it.
type Item struct {
	Name     string
	Path     string
	IsDir    bool
	Size     int64
	Modified time.Time
	Actions  []string
}

// Page is the visible part of a directory.
type Page struct {
	Items []Item
	Total int
}

// Visible reports whether the caller may see a child: files need read, folders need read or a
// path towards a granted subfolder.
func Visible(grants []authz.Grant, subject authz.Subject, child string, isDir bool) bool {
	if isDir {
		return authz.MayTraverse(grants, subject, child)
	}
	return authz.Allowed(grants, subject, child, "read")
}

// Build filters, annotates, sorts (folders first) and paginates the entries of dir.
func Build(dir string, entries []fsx.Entry, grants []authz.Grant, subject authz.Subject, opts Options) Page {
	items := make([]Item, 0, len(entries))
	for _, entry := range entries {
		if opts.DirsOnly && !entry.IsDir {
			continue
		}
		child := path.Join(dir, entry.Name)
		if !Visible(grants, subject, child, entry.IsDir) {
			continue
		}
		items = append(items, Item{
			Name:     entry.Name,
			Path:     child,
			IsDir:    entry.IsDir,
			Size:     entry.Size,
			Modified: entry.Modified,
			Actions:  authz.Capabilities(grants, subject, child),
		})
	}
	slices.SortStableFunc(items, compare(opts.Sort, opts.Order == OrderDesc))
	total := len(items)
	start := min(max(opts.Offset, 0), total)
	end := min(start+max(opts.Limit, 0), total)
	return Page{Items: items[start:end], Total: total}
}

func compare(sortKey string, descending bool) func(a, b Item) int {
	return func(a, b Item) int {
		// Folders always come first, whatever the order.
		if a.IsDir != b.IsDir {
			if a.IsDir {
				return -1
			}
			return 1
		}
		var result int
		switch sortKey {
		case SortSize:
			result = cmp.Compare(a.Size, b.Size)
		case SortModified:
			result = a.Modified.Compare(b.Modified)
		}
		if result == 0 {
			result = cmp.Compare(strings.ToLower(a.Name), strings.ToLower(b.Name))
		}
		if descending {
			return -result
		}
		return result
	}
}
