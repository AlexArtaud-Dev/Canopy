//go:build !linux

package fsx

// FreeSpace is unknown off Linux (the engine ships in Linux containers): the space check is
// skipped and a full disk surfaces as a write error instead.
func (r *Resolver) FreeSpace(string) (uint64, bool) {
	return 0, false
}
