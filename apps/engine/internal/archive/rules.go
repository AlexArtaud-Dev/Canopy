// Package archive compresses selections into zip or tar.gz, extracts archives, and computes
// checksums, each as a job. Archive contents are untrusted: every entry name is checked before
// anything is written, and every write goes through the root-confined resolver.
package archive

import (
	"errors"
	"path"
	"strconv"
	"strings"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/fsx"
)

// Format is an archive format.
type Format string

// Formats Canopy writes (Zip, TarGz) and reads (all three).
const (
	Zip   Format = "zip"
	TarGz Format = "tar.gz"
	Tar   Format = "tar"
	// None is not an archive Canopy can open.
	None Format = ""
)

// Error codes (translated by the web app).
const (
	CodeNotArchive   = "files.not_archive"
	CodeBadArchive   = "files.bad_archive"
	CodeMixedFolders = "files.mixed_folders"
	CodeTooLarge     = "files.archive_too_large"
)

var (
	// ErrNotArchive means the file is not a format Canopy extracts.
	ErrNotArchive = errors.New("not an archive")
	// ErrBadArchive means the archive is damaged or holds an unsafe entry name.
	ErrBadArchive = errors.New("damaged or unsafe archive")
	// ErrMixedFolders means a selection to compress spans several folders.
	ErrMixedFolders = errors.New("sources in different folders")
	// ErrTooLarge means extracting would pass the entry or size limit.
	ErrTooLarge = errors.New("archive too large to extract")
)

// MaxEntries bounds what one archive may create, against archives made of millions of tiny files.
const MaxEntries = 200_000

// FormatOf recognizes an archive to extract by its name.
func FormatOf(name string) Format {
	lower := strings.ToLower(name)
	switch {
	case strings.HasSuffix(lower, ".zip"):
		return Zip
	case strings.HasSuffix(lower, ".tar.gz"), strings.HasSuffix(lower, ".tgz"):
		return TarGz
	case strings.HasSuffix(lower, ".tar"):
		return Tar
	default:
		return None
	}
}

// ValidOutput guards a format to write that arrives from a request.
func ValidOutput(format Format) bool { return format == Zip || format == TarGz }

// Stem is an archive's name without its archive extension ("photos.tar.gz" → "photos").
func Stem(name string) string {
	lower := strings.ToLower(name)
	for _, extension := range []string{".tar.gz", ".tgz", ".tar", ".zip"} {
		if strings.HasSuffix(lower, extension) && len(name) > len(extension) {
			return name[:len(name)-len(extension)]
		}
	}
	return name
}

// Parent checks that every source sits in the same folder (where the archive is written) and
// returns that folder.
func Parent(sources []string) (string, error) {
	if len(sources) == 0 {
		return "", fsx.ErrInvalidPath
	}
	parent := path.Dir(sources[0])
	for _, source := range sources[1:] {
		if path.Dir(source) != parent {
			return "", ErrMixedFolders
		}
	}
	return parent, nil
}

// BaseName names a new archive (without extension): the item itself, or its folder for several.
func BaseName(sources []string) string {
	if len(sources) == 1 {
		return path.Base(sources[0])
	}
	if parent := path.Dir(sources[0]); parent != "/" {
		return path.Base(parent)
	}
	return "archive"
}

// EntryTarget maps an entry name read from an archive to where it is extracted, or refuses it:
// absolute names, parent references ("zip slip"), empty or reserved segments, and names that are
// not valid on the filesystem. The result is always inside dest.
func EntryTarget(dest, name string) (string, error) {
	normalized := strings.ReplaceAll(name, "\\", "/")
	if normalized == "" || strings.HasPrefix(normalized, "/") || strings.Contains(normalized, "\x00") {
		return "", ErrBadArchive
	}
	segments := strings.Split(strings.TrimSuffix(normalized, "/"), "/")
	for _, segment := range segments {
		if segment == "" || segment == "." {
			continue
		}
		if segment == ".." || !fsx.ValidName(segment) || fsx.Reserved(segment) {
			return "", ErrBadArchive
		}
	}
	target := path.Join(dest, path.Clean("/"+normalized))
	if target == dest || !fsx.IsWithin(target, dest) {
		return "", ErrBadArchive
	}
	return target, nil
}

// Algorithms for checksums.
const (
	MD5    = "md5"
	SHA1   = "sha1"
	SHA256 = "sha256"
	SHA512 = "sha512"
)

// ValidAlgorithm guards a checksum algorithm that arrives from a request.
func ValidAlgorithm(algorithm string) bool {
	return algorithm == MD5 || algorithm == SHA1 || algorithm == SHA256 || algorithm == SHA512
}

// FreeName is base+extension, or "base (n)"+extension when taken: archives and extracted folders
// never replace anything. The extension stays whole ("photos (2).tar.gz").
func FreeName(base, extension string, taken func(string) bool) string {
	name := base + extension
	for n := 2; taken(name); n++ {
		name = base + " (" + strconv.Itoa(n) + ")" + extension
	}
	return name
}
