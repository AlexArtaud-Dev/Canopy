package thumbs

import (
	"bytes"
	"errors"
	"fmt"
	"image"
	_ "image/gif" // registers the decoder
	"image/jpeg"
	"image/png"
	"io"

	"golang.org/x/image/draw"

	_ "golang.org/x/image/bmp"  // registers the decoder
	_ "golang.org/x/image/tiff" // registers the decoder
	_ "golang.org/x/image/webp" // registers the decoder
)

var (
	// ErrUnsupported means the file cannot have a thumbnail (unknown or broken format).
	ErrUnsupported = errors.New("no thumbnail for this file")
	// ErrTooLarge means the image is past the pixel or size guard.
	ErrTooLarge = errors.New("file too large for a thumbnail")
)

// exifProbeBytes covers the metadata segments at the start of a JPEG.
const exifProbeBytes = 128 << 10

const jpegQuality = 82

// RenderImage decodes an image, scales it to fit Edge, applies the EXIF orientation and encodes it
// (JPEG, or PNG when it has transparency). Dimensions are checked before decoding anything.
func RenderImage(source io.ReadSeeker) ([]byte, error) {
	head := make([]byte, exifProbeBytes)
	read, err := io.ReadFull(source, head)
	if err != nil && !errors.Is(err, io.ErrUnexpectedEOF) {
		return nil, fmt.Errorf("%w: %w", ErrUnsupported, err)
	}
	orientation := Orientation(head[:read])
	if _, err := source.Seek(0, io.SeekStart); err != nil {
		return nil, fmt.Errorf("rewind: %w", err)
	}
	config, _, err := image.DecodeConfig(source)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrUnsupported, err)
	}
	if int64(config.Width)*int64(config.Height) > MaxPixels {
		return nil, ErrTooLarge
	}
	if _, err := source.Seek(0, io.SeekStart); err != nil {
		return nil, fmt.Errorf("rewind: %w", err)
	}
	decoded, _, err := image.Decode(source)
	if err != nil {
		return nil, fmt.Errorf("%w: %w", ErrUnsupported, err)
	}
	return encode(Orient(scale(decoded), orientation))
}

// scale shrinks in two steps for large sources: a fast pass to twice the size, then a sharp one.
func scale(source image.Image) *image.RGBA {
	bounds := source.Bounds()
	width, height := Fit(bounds.Dx(), bounds.Dy(), Edge)
	if bounds.Dx() > 4*width && bounds.Dy() > 4*height {
		intermediate := image.NewRGBA(image.Rect(0, 0, 2*width, 2*height))
		draw.ApproxBiLinear.Scale(intermediate, intermediate.Bounds(), source, bounds, draw.Src, nil)
		source, bounds = intermediate, intermediate.Bounds()
	}
	target := image.NewRGBA(image.Rect(0, 0, width, height))
	draw.CatmullRom.Scale(target, target.Bounds(), source, bounds, draw.Src, nil)
	return target
}

// Orient turns an image upright according to an EXIF orientation (1–8).
func Orient(source *image.RGBA, orientation int) *image.RGBA {
	if orientation < 2 || orientation > 8 {
		return source
	}
	width, height := source.Bounds().Dx(), source.Bounds().Dy()
	swapped := orientation >= 5
	target := image.NewRGBA(image.Rect(0, 0, width, height))
	if swapped {
		target = image.NewRGBA(image.Rect(0, 0, height, width))
	}
	for y := range height {
		for x := range width {
			tx, ty := orientedPoint(orientation, x, y, width, height)
			target.SetRGBA(tx, ty, source.RGBAAt(x, y))
		}
	}
	return target
}

func orientedPoint(orientation, x, y, width, height int) (int, int) {
	switch orientation {
	case 2:
		return width - 1 - x, y
	case 3:
		return width - 1 - x, height - 1 - y
	case 4:
		return x, height - 1 - y
	case 5:
		return y, x
	case 6:
		return height - 1 - y, x
	case 7:
		return height - 1 - y, width - 1 - x
	default: // 8
		return y, width - 1 - x
	}
}

func encode(thumbnail *image.RGBA) ([]byte, error) {
	var out bytes.Buffer
	var err error
	if thumbnail.Opaque() {
		err = jpeg.Encode(&out, thumbnail, &jpeg.Options{Quality: jpegQuality})
	} else {
		err = png.Encode(&out, thumbnail)
	}
	if err != nil {
		return nil, fmt.Errorf("encode thumbnail: %w", err)
	}
	return out.Bytes(), nil
}
