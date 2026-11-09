// Package search finds files by name under a folder. Version 1 walks the tree with hard limits
// (results, visited entries, depth, time); an index can replace the walk later without changing
// the API.
package search

import (
	"context"
	"errors"
	"io/fs"
	"path"
	"slices"
	"strings"
	"time"
	"unicode"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
)

// Limits bound one search so a huge tree can never hold the engine.
type Limits struct {
	MaxResults int
	MaxVisited int
	MaxDepth   int
	Timeout    time.Duration
}

// DefaultLimits suit a NAS: a few seconds at most, enough results to refine from.
var DefaultLimits = Limits{MaxResults: 500, MaxVisited: 200_000, MaxDepth: 32, Timeout: 5 * time.Second}

// Query bounds, mirrored by the API contract.
const (
	MinQueryLength = 2
	MaxQueryLength = 200
)

// Reason tells why a search stopped before covering the whole tree.
type Reason string

// Reasons a search is truncated.
const (
	ReasonResults Reason = "results"
	ReasonVisited Reason = "visited"
	ReasonTimeout Reason = "timeout"
)

// ErrQuery means the query is too short or too long once trimmed.
var ErrQuery = errors.New("invalid search query")

// Match is one found entry.
type Match struct {
	Path  string
	Entry fsx.Entry
}

// Result is what a search found; Truncated is empty when the whole tree was covered.
type Result struct {
	Matches   []Match
	Truncated Reason
}

// Walker is the root-confined tree walk (fsx.Resolver).
type Walker interface {
	Walk(virtual string, visit func(path string, entry fsx.Entry) error) error
}

// Visible tells whether the person may see an entry (folders: on the way to something readable).
type Visible func(path string, isDir bool) bool

// Terms splits a query into normalized words, all of which a name must contain.
func Terms(query string) ([]string, error) {
	trimmed := strings.TrimSpace(query)
	length := len([]rune(trimmed))
	if length < MinQueryLength || length > MaxQueryLength {
		return nil, ErrQuery
	}
	return strings.Fields(Normalize(trimmed)), nil
}

// Matches reports whether a name contains every term (case- and accent-insensitive).
func Matches(name string, terms []string) bool {
	normalized := Normalize(name)
	for _, term := range terms {
		if !strings.Contains(normalized, term) {
			return false
		}
	}
	return true
}

// folds covers the accented letters of the languages Canopy ships in (and their neighbours).
var folds = map[rune]string{
	'à': "a", 'á': "a", 'â': "a", 'ã': "a", 'ä': "a", 'å': "a", 'ā': "a",
	'ç': "c", 'č': "c", 'ć': "c",
	'è': "e", 'é': "e", 'ê': "e", 'ë': "e", 'ē': "e", 'ě': "e",
	'ì': "i", 'í': "i", 'î': "i", 'ï': "i", 'ī': "i",
	'ñ': "n", 'ń': "n", 'ň': "n",
	'ò': "o", 'ó': "o", 'ô': "o", 'õ': "o", 'ö': "o", 'ø': "o", 'ō': "o",
	'ù': "u", 'ú': "u", 'û': "u", 'ü': "u", 'ū': "u", 'ů': "u",
	'ý': "y", 'ÿ': "y",
	'š': "s", 'ś': "s", 'ž': "z", 'ź': "z", 'ż': "z", 'ř': "r", 'ł': "l",
	'œ': "oe", 'æ': "ae", 'ß': "ss",
}

// Normalize lowercases a string and folds accents, so "Été" and "ete" compare equal.
func Normalize(value string) string {
	var out strings.Builder
	out.Grow(len(value))
	for _, r := range value {
		lower := unicode.ToLower(r)
		if folded, ok := folds[lower]; ok {
			out.WriteString(folded)
			continue
		}
		out.WriteRune(lower)
	}
	return out.String()
}

var (
	errEnough  = errors.New("enough results")
	errVisited = errors.New("too many entries")
)

// Run walks under dir and collects visible entries whose name matches every term. Folders the
// person cannot see are not entered at all.
func Run(ctx context.Context, walker Walker, dir string, terms []string, visible Visible, limits Limits, now func() time.Time) (Result, error) {
	deadline := now().Add(limits.Timeout)
	baseDepth := depth(dir)
	var result Result
	visited := 0
	err := walker.Walk(dir, func(current string, entry fsx.Entry) error {
		if current == dir {
			return nil
		}
		visited++
		if visited > limits.MaxVisited {
			return errVisited
		}
		if ctx.Err() != nil || now().After(deadline) {
			result.Truncated = ReasonTimeout
			return fs.SkipAll
		}
		if !visible(current, entry.IsDir) {
			return skip(entry)
		}
		if Matches(entry.Name, terms) {
			if len(result.Matches) == limits.MaxResults {
				return errEnough
			}
			result.Matches = append(result.Matches, Match{Path: current, Entry: entry})
		}
		if entry.IsDir && depth(current)-baseDepth >= limits.MaxDepth {
			return fs.SkipDir
		}
		return nil
	})
	switch {
	case errors.Is(err, errEnough):
		result.Truncated = ReasonResults
	case errors.Is(err, errVisited):
		result.Truncated = ReasonVisited
	case err != nil:
		return Result{}, err //nolint:wrapcheck // fsx errors carry their codes
	}
	Rank(result.Matches, terms)
	return result, nil
}

func skip(entry fsx.Entry) error {
	if entry.IsDir {
		return fs.SkipDir
	}
	return nil
}

func depth(virtual string) int {
	if virtual == "/" {
		return 0
	}
	return strings.Count(virtual, "/")
}

// Rank puts names starting with the first term first, then shallower paths, then by name.
func Rank(matches []Match, terms []string) {
	first := ""
	if len(terms) > 0 {
		first = terms[0]
	}
	slices.SortStableFunc(matches, func(a, b Match) int {
		aPrefix := strings.HasPrefix(Normalize(a.Entry.Name), first)
		bPrefix := strings.HasPrefix(Normalize(b.Entry.Name), first)
		if aPrefix != bPrefix {
			if aPrefix {
				return -1
			}
			return 1
		}
		if da, db := depth(a.Path), depth(b.Path); da != db {
			return da - db
		}
		return strings.Compare(Normalize(path.Base(a.Path)), Normalize(path.Base(b.Path)))
	})
}
