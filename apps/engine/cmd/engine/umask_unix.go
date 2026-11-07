//go:build unix

package main

import "syscall"

func applyUmask(mask int) {
	syscall.Umask(mask)
}
