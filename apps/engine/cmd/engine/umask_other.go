//go:build !unix

package main

// applyUmask is a no-op where the OS has no umask (Windows development machines).
func applyUmask(int) {}
