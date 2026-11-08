package fsx

import (
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path"
	"syscall"
)

// Error codes of write operations (translated by the web app).
const (
	CodeExists      = "files.exists"
	CodeInvalidName = "files.invalid_name"
)

var (
	// ErrExists means the target is already taken: nothing is ever overwritten implicitly.
	ErrExists = errors.New("target exists")
	// ErrCrossDevice means a rename would cross filesystems; callers copy then delete instead.
	ErrCrossDevice = errors.New("cross-device rename")
)

// copyChunk balances syscall overhead against how quickly a cancel is noticed.
const copyChunk = 1 << 20

// Lstat describes a virtual path without following a final symbolic link.
func (r *Resolver) Lstat(virtual string) (Entry, error) {
	clean, err := Clean(virtual)
	if err != nil {
		return Entry{}, err
	}
	info, err := r.root.Lstat(Relative(clean))
	if err != nil {
		return Entry{}, notFound(err)
	}
	return toEntry(clean, info), nil
}

// Exists reports whether anything (even a broken link) sits at the virtual path.
func (r *Resolver) Exists(virtual string) (bool, error) {
	_, err := r.Lstat(virtual)
	switch {
	case err == nil:
		return true, nil
	case errors.Is(err, ErrNotFound):
		return false, nil
	default:
		return false, err
	}
}

// OpenFile opens a regular file for reading (downloads); folders, links and devices are refused.
func (r *Resolver) OpenFile(virtual string) (*os.File, Entry, error) {
	clean, err := Clean(virtual)
	if err != nil {
		return nil, Entry{}, err
	}
	info, err := r.root.Lstat(Relative(clean))
	if err != nil {
		return nil, Entry{}, notFound(err)
	}
	if !info.Mode().IsRegular() {
		return nil, Entry{}, ErrNotRegular
	}
	file, err := r.root.Open(Relative(clean))
	if err != nil {
		return nil, Entry{}, notFound(err)
	}
	return file, toEntry(clean, info), nil
}

// EnsureStaging creates the upload staging folder and returns its name inside the root.
func (r *Resolver) EnsureStaging() (string, error) {
	if err := r.root.MkdirAll(StagingDir, 0o700); err != nil {
		return "", fmt.Errorf("staging folder: %w", err)
	}
	return StagingDir, nil
}

// ImportStaged moves a finished upload (staged name, chosen by the engine, never by a client)
// to its virtual path. Never replaces an existing entry; across filesystems it copies then
// removes the staged file.
func (r *Resolver) ImportStaged(staged, to string) error {
	if path.Dir(staged) != StagingDir || path.Base(staged) == StagingDir {
		return ErrInvalidPath
	}
	dst, err := Clean(to)
	if err != nil {
		return err
	}
	exists, err := r.Exists(dst)
	if err != nil {
		return err
	}
	if exists {
		return ErrExists
	}
	err = r.root.Rename(staged, Relative(dst))
	if err == nil {
		return nil
	}
	if mapped := mapWriteError(err); !errors.Is(mapped, ErrCrossDevice) {
		return mapped
	}
	return r.copyStaged(staged, dst)
}

func (r *Resolver) copyStaged(staged, dst string) (err error) {
	in, err := r.root.Open(staged)
	if err != nil {
		return notFound(err)
	}
	defer func() { _ = in.Close() }()
	out, err := r.root.OpenFile(Relative(dst), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o666)
	if err != nil {
		return mapWriteError(err)
	}
	defer func() {
		closeErr := out.Close()
		if err == nil && closeErr != nil {
			err = fmt.Errorf("close import: %w", closeErr)
		}
		if err != nil {
			_ = r.root.Remove(Relative(dst))
		}
	}()
	if _, err := io.Copy(out, in); err != nil {
		return fmt.Errorf("import: %w", err)
	}
	if err := r.root.Remove(staged); err != nil {
		return fmt.Errorf("remove staged: %w", err)
	}
	return nil
}

// Mkdir creates one directory; its parent must exist and the name must be free.
func (r *Resolver) Mkdir(virtual string) error {
	clean, err := Clean(virtual)
	if err != nil {
		return err
	}
	if err := r.root.Mkdir(Relative(clean), 0o777); err != nil {
		return mapWriteError(err)
	}
	return nil
}

// MkdirAll creates a directory and any missing parents (existing ones are fine).
func (r *Resolver) MkdirAll(virtual string) error {
	clean, err := Clean(virtual)
	if err != nil {
		return err
	}
	if err := r.root.MkdirAll(Relative(clean), 0o777); err != nil {
		return mapWriteError(err)
	}
	return nil
}

// Rename moves an entry inside the root. It never replaces an existing target (os.Rename would,
// silently, for files) and reports ErrCrossDevice when the target is on another filesystem.
func (r *Resolver) Rename(from, to string) error {
	src, err := Clean(from)
	if err != nil {
		return err
	}
	dst, err := Clean(to)
	if err != nil {
		return err
	}
	exists, err := r.Exists(dst)
	if err != nil {
		return err
	}
	if exists {
		return ErrExists
	}
	if err := r.root.Rename(Relative(src), Relative(dst)); err != nil {
		return mapWriteError(err)
	}
	return nil
}

// RemoveEmptyDir deletes a directory only if it is empty (after moving its contents away).
func (r *Resolver) RemoveEmptyDir(virtual string) error {
	clean, err := Clean(virtual)
	if err != nil {
		return err
	}
	if clean == "/" {
		return ErrInvalidPath
	}
	if err := r.root.Remove(Relative(clean)); err != nil {
		return fmt.Errorf("remove directory: %w", err)
	}
	return nil
}

// RemoveAll deletes an entry and everything below it (used after a verified cross-volume move).
func (r *Resolver) RemoveAll(virtual string) error {
	clean, err := Clean(virtual)
	if err != nil {
		return err
	}
	if clean == "/" {
		return ErrInvalidPath
	}
	if err := r.root.RemoveAll(Relative(clean)); err != nil {
		return fmt.Errorf("remove: %w", err)
	}
	return nil
}

// CopyFile copies one regular file, reporting bytes as they are written and stopping when ctx
// ends. overwrite replaces an existing file; otherwise an existing target is ErrExists. The
// modification time is kept. A partial target is removed on failure, so no truncated file stays.
func (r *Resolver) CopyFile(ctx context.Context, from, to string, overwrite bool, progress func(int64)) (err error) {
	src, err := Clean(from)
	if err != nil {
		return err
	}
	dst, err := Clean(to)
	if err != nil {
		return err
	}
	in, err := r.root.Open(Relative(src))
	if err != nil {
		return notFound(err)
	}
	defer func() { _ = in.Close() }()
	info, err := in.Stat()
	if err != nil {
		return notFound(err)
	}
	if !info.Mode().IsRegular() {
		return ErrNotRegular
	}
	flags := os.O_WRONLY | os.O_CREATE | os.O_EXCL
	if overwrite {
		flags = os.O_WRONLY | os.O_CREATE | os.O_TRUNC
	}
	out, err := r.root.OpenFile(Relative(dst), flags, info.Mode().Perm())
	if err != nil {
		return mapWriteError(err)
	}
	defer func() {
		closeErr := out.Close()
		if err == nil && closeErr != nil {
			err = fmt.Errorf("close copy: %w", closeErr)
		}
		if err != nil {
			_ = r.root.Remove(Relative(dst))
		}
	}()
	if err := copyWithProgress(ctx, out, in, progress); err != nil {
		return err
	}
	if err := r.root.Chtimes(Relative(dst), info.ModTime(), info.ModTime()); err != nil {
		return fmt.Errorf("keep modification time: %w", err)
	}
	return nil
}

// ErrNotRegular refuses to copy devices, sockets or links as if they were files.
var ErrNotRegular = errors.New("not a regular file")

func copyWithProgress(ctx context.Context, out io.Writer, in io.Reader, progress func(int64)) error {
	buffer := make([]byte, copyChunk)
	for {
		if err := ctx.Err(); err != nil {
			return fmt.Errorf("copy stopped: %w", err)
		}
		n, readErr := in.Read(buffer)
		if n > 0 {
			if _, err := out.Write(buffer[:n]); err != nil {
				return fmt.Errorf("write: %w", err)
			}
			if progress != nil {
				progress(int64(n))
			}
		}
		if errors.Is(readErr, io.EOF) {
			return nil
		}
		if readErr != nil {
			return fmt.Errorf("read: %w", readErr)
		}
	}
}

func mapWriteError(err error) error {
	switch {
	case errors.Is(err, fs.ErrExist):
		return ErrExists
	case errors.Is(err, syscall.EXDEV):
		return ErrCrossDevice
	case errors.Is(err, fs.ErrNotExist):
		return notFound(err)
	default:
		return fmt.Errorf("write: %w", err)
	}
}

// ValidName checks one path segment typed by a person (rename, new folder).
func ValidName(name string) bool {
	if name == "" || name == "." || name == ".." || len(name) > 255 {
		return false
	}
	for _, r := range name {
		if r == '/' || r == '\\' || r == 0 || r < 0x20 {
			return false
		}
	}
	return path.Base(name) == name
}
