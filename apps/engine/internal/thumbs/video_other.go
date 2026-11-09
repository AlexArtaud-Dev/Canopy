//go:build !linux

package thumbs

import (
	"os"
	"os/exec"
)

// Development hosts stream the open file on stdin. Production runs on Linux, where the descriptor
// is passed instead so MP4 files can be seeked.
const videoInput = "pipe:0"

func attachInput(command *exec.Cmd, file *os.File) {
	command.Stdin = file
}
