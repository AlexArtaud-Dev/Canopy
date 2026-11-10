package archive

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"regexp"
	"strconv"
	"strings"

	"github.com/AlexArtaud-Dev/Canopy/apps/engine/internal/commands"
)

// Formats read and written through 7-Zip rather than Go's own packages.
const (
	SevenZ Format = "7z"
	Rar    Format = "rar"
	Iso    Format = "iso"
)

// Codes of the 7-Zip formats.
const (
	CodeEncrypted   = "files.archive_encrypted"
	CodeUnavailable = "files.sevenzip_unavailable"
)

var (
	// ErrEncrypted means the archive needs a password (advanced mode can give one).
	ErrEncrypted = errors.New("encrypted archive")
	// ErrNoSevenZip means 7-Zip is not installed on this engine.
	ErrNoSevenZip = errors.New("7-Zip is not installed")
)

// external reports whether a format goes through 7-Zip.
func external(format Format) bool {
	return format == SevenZ || format == Rar || format == Iso
}

// SevenZip runs the 7-Zip command-line program (7zz) with fixed argument lists, never a shell.
type SevenZip struct {
	Binary string
	// Host turns a checked virtual path into the host path 7-Zip works on.
	Host func(virtual string) (string, error)
	// TempDir holds file lists (the engine's own file system is read-only).
	TempDir string
}

// FindSevenZip returns the runner when 7zz is installed, nil otherwise.
func FindSevenZip(lookPath func(string) (string, error), host func(string) (string, error), tempDir string) *SevenZip {
	binary, err := lookPath("7zz")
	if err != nil {
		return nil
	}
	return &SevenZip{Binary: binary, Host: host, TempDir: tempDir}
}

// sevenZipEnv keeps 7-Zip away from the engine's environment (secrets live there).
func (z *SevenZip) env() []string {
	return []string{"PATH=/usr/local/bin:/usr/bin:/bin", "LANG=C.UTF-8", "LC_ALL=C.UTF-8", "HOME=" + z.TempDir, "TMPDIR=" + z.TempDir}
}

// run starts 7zz in dir and hands every output line to onLine; the error lines come back with
// the failure so the caller can tell a wrong password from a damaged archive.
func (z *SevenZip) run(ctx context.Context, dir string, argv []string, onLine func(string)) ([]string, error) {
	command := exec.CommandContext(ctx, z.Binary, argv...) //nolint:gosec // installed binary, fixed argument list
	command.Env = z.env()
	command.Dir = dir
	output, writer := io.Pipe()
	command.Stdout, command.Stderr = writer, writer
	if err := command.Start(); err != nil {
		return nil, fmt.Errorf("start 7-Zip: %w", err)
	}
	done := make(chan error, 1)
	go func() {
		err := command.Wait()
		_ = writer.Close()
		done <- err
	}()
	var problems []string
	scanner := bufio.NewScanner(output)
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)
	scanner.Split(commands.ScanLines)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		if isProblem(line) && len(problems) < 20 {
			problems = append(problems, line)
		}
		onLine(line)
	}
	_, _ = io.Copy(io.Discard, output)
	if err := <-done; err != nil {
		if ctx.Err() != nil {
			return problems, fmt.Errorf("stopped: %w", ctx.Err())
		}
		return problems, fmt.Errorf("7-Zip: %w", err)
	}
	return problems, nil
}

var percentLine = regexp.MustCompile(`^(\d{1,3})%`)

// percentOf reads 7-Zip's progress ("42% 12 - name"); false for other lines.
func percentOf(line string) (int64, bool) {
	match := percentLine.FindStringSubmatch(line)
	if match == nil {
		return 0, false
	}
	percent, _ := strconv.ParseInt(match[1], 10, 64)
	return min(percent, 100), true
}

func isProblem(line string) bool {
	return strings.HasPrefix(line, "ERROR") || strings.Contains(line, "Wrong password") ||
		strings.Contains(line, "Cannot open") || strings.Contains(line, "Headers Error")
}

// failure turns 7-Zip's complaints into the archive errors.
func failure(problems []string, err error) error {
	for _, line := range problems {
		if strings.Contains(strings.ToLower(line), "password") {
			return fmt.Errorf("%w: %w", ErrEncrypted, err)
		}
	}
	return fmt.Errorf("%w: %w", ErrBadArchive, err)
}

// listed is one archive entry as `7zz l -slt` describes it.
type listed struct {
	path string
	size int64
	dir  bool
	link bool
}

// parseListing reads `7zz l -slt -ba`: blocks of "Key = value" lines, one block per entry.
func parseListing(text string) ([]listed, error) {
	var entries []listed
	var current *listed
	for line := range strings.SplitSeq(text, "\n") {
		key, value, found := strings.Cut(strings.TrimRight(line, "\r"), " = ")
		if !found {
			continue
		}
		switch key {
		case "Path":
			entries = append(entries, listed{path: value})
			current = &entries[len(entries)-1]
		case "Size":
			if current != nil && value != "" {
				size, err := strconv.ParseInt(value, 10, 64)
				if err != nil || size < 0 {
					return nil, fmt.Errorf("%w: size %q", ErrBadArchive, value)
				}
				current.size = size
			}
		case "Folder":
			if current != nil {
				current.dir = value == "+"
			}
		case "Attributes":
			if current != nil {
				// "D" for folders; the Unix mode follows ("A lrwxrwxrwx" for a link).
				current.dir = current.dir || strings.HasPrefix(value, "D")
				if _, mode, ok := strings.Cut(value, " "); ok {
					current.link = strings.HasPrefix(mode, "l")
					current.dir = current.dir || strings.HasPrefix(mode, "d")
				}
			}
		}
	}
	return entries, nil
}

// list describes an archive without extracting it; an empty password never prompts.
func (z *SevenZip) list(ctx context.Context, archive string) ([]listed, error) {
	var text strings.Builder
	problems, err := z.run(ctx, "", []string{"l", "-slt", "-ba", "-p", "-sccUTF-8", "--", archive}, func(line string) {
		if text.Len() < 64<<20 {
			text.WriteString(line)
			text.WriteByte('\n')
		}
	})
	if err != nil {
		if errors.Is(err, context.Canceled) {
			return nil, err
		}
		return nil, failure(problems, err)
	}
	return parseListing(text.String())
}

// writeList writes the names 7-Zip should add, one per line, into a temporary file.
func (z *SevenZip) writeList(names []string) (string, error) {
	file, err := os.CreateTemp(z.TempDir, "7z-list-*")
	if err != nil {
		return "", fmt.Errorf("file list: %w", err)
	}
	_, writeErr := file.WriteString(strings.Join(names, "\n") + "\n")
	closeErr := file.Close()
	if err := errors.Join(writeErr, closeErr); err != nil {
		_ = os.Remove(file.Name())
		return "", fmt.Errorf("file list: %w", err)
	}
	return file.Name(), nil
}
