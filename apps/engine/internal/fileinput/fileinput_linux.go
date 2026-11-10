// Package fileinput hands an already open file to a child process (ffmpeg, ffprobe) so it never
// resolves a path itself: the engine opened the file inside the root, the tool only reads it.
package fileinput

import (
	"os"
	"os/exec"
)

// Path is what the tool is told to read: descriptor 3, which /dev/fd/3 reopens as that very file
// (seekable, which MP4 and Matroska need).
const Path = "/dev/fd/3"

// Attach passes file to command as descriptor 3.
func Attach(command *exec.Cmd, file *os.File) {
	command.ExtraFiles = []*os.File{file}
}
