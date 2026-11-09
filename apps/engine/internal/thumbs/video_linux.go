package thumbs

import (
	"os"
	"os/exec"
)

// The open file is passed as descriptor 3: /dev/fd/3 reopens that very file (seekable, which MP4
// needs) without ffmpeg ever resolving a path.
const videoInput = "/dev/fd/3"

func attachInput(command *exec.Cmd, file *os.File) {
	command.ExtraFiles = []*os.File{file}
}
