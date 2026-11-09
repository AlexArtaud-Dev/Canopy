package thumbs

import (
	"encoding/binary"
	"testing"
)

// exifJPEG builds the start of a JPEG whose APP1 segment holds one orientation tag.
func exifJPEG(order binary.ByteOrder, mark string, orientation uint16) []byte {
	tiff := make([]byte, 8+2+12)
	copy(tiff, mark)
	order.PutUint16(tiff[2:], 42)
	order.PutUint32(tiff[4:], 8)
	order.PutUint16(tiff[8:], 1)
	order.PutUint16(tiff[10:], 0x0112)
	order.PutUint16(tiff[12:], 3)
	order.PutUint32(tiff[14:], 1)
	order.PutUint16(tiff[18:], orientation)
	payload := append([]byte("Exif\x00\x00"), tiff...)
	segment := []byte{0xFF, 0xE1, 0, 0}
	binary.BigEndian.PutUint16(segment[2:], uint16(len(payload)+2))
	head := append([]byte{0xFF, 0xD8}, []byte{0xFF, 0xE0, 0, 4, 0, 0}...) // an APP0 first
	return append(append(head, segment...), payload...)
}

func TestOrientation(t *testing.T) {
	if got := Orientation(exifJPEG(binary.LittleEndian, "II", 6)); got != 6 {
		t.Fatalf("little endian: %d", got)
	}
	if got := Orientation(exifJPEG(binary.BigEndian, "MM", 8)); got != 8 {
		t.Fatalf("big endian: %d", got)
	}
	cases := map[string][]byte{
		"not a jpeg":       []byte("PNG..."),
		"bad tag value":    exifJPEG(binary.BigEndian, "MM", 9),
		"bad byte order":   exifJPEG(binary.BigEndian, "XX", 6),
		"start of scan":    {0xFF, 0xD8, 0xFF, 0xDA, 0, 2},
		"not a marker":     {0xFF, 0xD8, 0x00, 0x00, 0, 0},
		"length too short": {0xFF, 0xD8, 0xFF, 0xE1, 0, 1},
		"truncated":        exifJPEG(binary.BigEndian, "MM", 6)[:20],
		"no metadata":      {0xFF, 0xD8},
	}
	for name, head := range cases {
		if got := Orientation(head); got != 1 {
			t.Errorf("%s: %d", name, got)
		}
	}
	if tiffOrientation([]byte("II")) != 1 {
		t.Error("short tiff")
	}
	if tiffOrientation([]byte{'I', 'I', 42, 0, 200, 0, 0, 0}) != 1 {
		t.Error("directory out of range")
	}
	if tiffOrientation([]byte{'I', 'I', 42, 0, 8, 0, 0, 0, 2, 0}) != 1 {
		t.Error("entries out of range")
	}
	noTag := []byte{'I', 'I', 42, 0, 8, 0, 0, 0, 1, 0, 0x10, 0x01, 3, 0, 1, 0, 0, 0, 1, 0, 0, 0}
	if tiffOrientation(noTag) != 1 {
		t.Error("no orientation tag")
	}
}
