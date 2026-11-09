package preview

import "testing"

func TestClassify(t *testing.T) {
	cases := []struct {
		name        string
		kind        Kind
		contentType string
	}{
		{"photo.JPG", Image, "image/jpeg"},
		{"/a/b/logo.svg", Image, "image/svg+xml"},
		{"report.pdf", PDF, "application/pdf"},
		{"main.go", Text, plain},
		{"Dockerfile", Text, plain},
		{"README", Text, plain},
		{"song.flac", Audio, "audio/flac"},
		{"clip.webm", Video, "video/webm"},
		{"page.HTM", HTML, "text/html; charset=utf-8"},
		{"archive.zip", None, ""},
		{"noextension", None, ""},
	}
	for _, c := range cases {
		kind, contentType := Classify(c.name)
		if kind != c.kind || contentType != c.contentType {
			t.Errorf("Classify(%q) = %q, %q; want %q, %q", c.name, kind, contentType, c.kind, c.contentType)
		}
	}
}

func TestSandboxed(t *testing.T) {
	if Sandboxed(PDF) {
		t.Error("PDF must not be sandboxed")
	}
	for _, kind := range []Kind{Image, Text, Audio, Video, HTML, None} {
		if !Sandboxed(kind) {
			t.Errorf("%q must be sandboxed", kind)
		}
	}
}
