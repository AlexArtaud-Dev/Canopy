//go:build windows

package metrics

import "errors"

// DiskUsage is not measured on Windows (development only): volume metrics are left out.
func DiskUsage(string) (used, total uint64, err error) {
	return 0, 0, errors.New("metrics: disk usage not measured on windows")
}
