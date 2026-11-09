package thumbs

import (
	"bytes"
	"encoding/binary"
	"errors"
	"hash/crc32"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"testing"
)

func pngOf(t *testing.T, width, height int, fill color.Color) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := range height {
		for x := range width {
			img.Set(x, y, fill)
		}
	}
	var out bytes.Buffer
	if err := png.Encode(&out, img); err != nil {
		t.Fatal(err)
	}
	return out.Bytes()
}

func TestRenderImageOpaqueBecomesJPEG(t *testing.T) {
	data, err := RenderImage(bytes.NewReader(pngOf(t, 2000, 1000, color.RGBA{10, 120, 90, 255})))
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := jpeg.Decode(bytes.NewReader(data))
	if err != nil {
		t.Fatalf("jpeg: %v", err)
	}
	if b := decoded.Bounds(); b.Dx() != 320 || b.Dy() != 160 {
		t.Fatalf("size: %v", b)
	}
}

func TestRenderImageTransparentStaysPNG(t *testing.T) {
	data, err := RenderImage(bytes.NewReader(pngOf(t, 40, 20, color.RGBA{0, 0, 0, 0})))
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := png.Decode(bytes.NewReader(data))
	if err != nil {
		t.Fatalf("png: %v", err)
	}
	if b := decoded.Bounds(); b.Dx() != 40 || b.Dy() != 20 {
		t.Fatalf("small images are not enlarged: %v", b)
	}
}

func TestRenderImageRefusals(t *testing.T) {
	if _, err := RenderImage(bytes.NewReader([]byte("not an image"))); !errors.Is(err, ErrUnsupported) {
		t.Fatalf("garbage: %v", err)
	}
	if _, err := RenderImage(bytes.NewReader(nil)); !errors.Is(err, ErrUnsupported) {
		t.Fatalf("empty: %v", err)
	}
	// A valid header claiming 10 000 × 10 000 pixels is refused before any decoding.
	bomb := pngOf(t, 1, 1, color.Black)
	header := bomb[16:29]
	binary.BigEndian.PutUint32(header[0:], 10000)
	binary.BigEndian.PutUint32(header[4:], 10000)
	binary.BigEndian.PutUint32(bomb[29:], crc32.ChecksumIEEE(bomb[12:29]))
	if _, err := RenderImage(bytes.NewReader(bomb)); !errors.Is(err, ErrTooLarge) {
		t.Fatalf("bomb: %v", err)
	}
	// The pixel data is broken after a valid header.
	broken := pngOf(t, 8, 8, color.White)
	broken = broken[:len(broken)-20]
	if _, err := RenderImage(bytes.NewReader(broken)); !errors.Is(err, ErrUnsupported) {
		t.Fatalf("truncated: %v", err)
	}
}

func TestOrient(t *testing.T) {
	// A 2×1 image: red then blue.
	red, blue := color.RGBA{255, 0, 0, 255}, color.RGBA{0, 0, 255, 255}
	source := image.NewRGBA(image.Rect(0, 0, 2, 1))
	source.SetRGBA(0, 0, red)
	source.SetRGBA(1, 0, blue)

	cases := []struct {
		orientation int
		width       int
		redAt       image.Point
	}{
		{1, 2, image.Pt(0, 0)},
		{2, 2, image.Pt(1, 0)},
		{3, 2, image.Pt(1, 0)},
		{4, 2, image.Pt(0, 0)},
		{5, 1, image.Pt(0, 0)},
		{6, 1, image.Pt(0, 0)},
		{7, 1, image.Pt(0, 1)},
		{8, 1, image.Pt(0, 1)},
	}
	for _, c := range cases {
		got := Orient(source, c.orientation)
		if got.Bounds().Dx() != c.width || got.RGBAAt(c.redAt.X, c.redAt.Y) != red {
			t.Errorf("orientation %d: %v, red at %v = %v", c.orientation, got.Bounds(), c.redAt, got.RGBAAt(c.redAt.X, c.redAt.Y))
		}
	}
}
