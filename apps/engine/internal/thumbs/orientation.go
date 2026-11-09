package thumbs

import (
	"bytes"
	"encoding/binary"
)

// Orientation reads the EXIF orientation (1–8) of a JPEG from its first bytes; 1 when absent.
// Phones store photos sideways and rely on this tag, so thumbnails must apply it.
func Orientation(head []byte) int {
	if len(head) < 4 || head[0] != 0xFF || head[1] != 0xD8 {
		return 1
	}
	for at := 2; at+4 <= len(head); {
		if head[at] != 0xFF {
			return 1
		}
		marker := head[at+1]
		length := int(binary.BigEndian.Uint16(head[at+2:]))
		if length < 2 || at+2+length > len(head) {
			return 1
		}
		segment := head[at+4 : at+2+length]
		if marker == 0xE1 && bytes.HasPrefix(segment, []byte("Exif\x00\x00")) {
			return tiffOrientation(segment[6:])
		}
		// Start of scan: no metadata after this.
		if marker == 0xDA {
			return 1
		}
		at += 2 + length
	}
	return 1
}

func tiffOrientation(tiff []byte) int {
	if len(tiff) < 8 {
		return 1
	}
	var order binary.ByteOrder
	switch string(tiff[:2]) {
	case "II":
		order = binary.LittleEndian
	case "MM":
		order = binary.BigEndian
	default:
		return 1
	}
	directory := int(order.Uint32(tiff[4:]))
	if directory+2 > len(tiff) {
		return 1
	}
	count := int(order.Uint16(tiff[directory:]))
	for i := range count {
		entry := directory + 2 + i*12
		if entry+12 > len(tiff) {
			return 1
		}
		if order.Uint16(tiff[entry:]) == 0x0112 {
			value := int(order.Uint16(tiff[entry+8:]))
			if value >= 1 && value <= 8 {
				return value
			}
			return 1
		}
	}
	return 1
}
