//go:build !linux

// Package fileinput hands an already open file to a child process (ffmpeg, ffprobe) so it never
// resolves a path itself: the engine opened the file inside the root, the tool only reads it.
package fileinput

import (
	"os"
	"os/exec"
)

// Path: development hosts stream the open file on stdin. Production runs on Linux, where the
// descriptor is passed instead so files can be seeked.
const Path = "pipe:0"

// Attach passes file to command on stdin.
func Attach(command *exec.Cmd, file *os.File) {
	command.Stdin = file
}
