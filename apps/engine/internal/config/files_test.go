package config

import (
	"errors"
	"testing"
)

func TestWithFiles(t *testing.T) {
	env := map[string]string{
		"A": "direct", "A_FILE": "/a",
		"B_FILE": "/b",
		"C_FILE": "/missing",
	}
	files := map[string]string{"/a": "from-file", "/b": " secret\n"}
	getenv := WithFiles(
		func(name string) string { return env[name] },
		func(path string) ([]byte, error) {
			content, ok := files[path]
			if !ok {
				return nil, errors.New("no such file")
			}
			return []byte(content), nil
		},
	)
	for name, want := range map[string]string{"A": "direct", "B": "secret", "C": "", "D": ""} {
		if got := getenv(name); got != want {
			t.Errorf("%s: got %q, want %q", name, got, want)
		}
	}
}
