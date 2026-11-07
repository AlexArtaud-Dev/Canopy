# Engine (Go)

## Layout

`apps/engine/internal/<domain>/`: `fsx` (resolver, listing, native ops), `jobs`, `runner`
(command catalog execution), `plugins`, `trash`, `authz` (path grant resolution), `audit`,
`httpapi` (implements generated interfaces), `settings`, `config`. `cmd/engine` wires everything.

## Path safety

- Client paths are virtual POSIX paths relative to the root (`/disk1/photos`).
- Reject NUL bytes, non-UTF-8, absolute host paths; clean before use.
- All opens go through `os.Root` (Go ≥ 1.24): symlinks or `..` escaping the root fail by construction.
- Real host paths never leave the engine (not in responses, not in logs shown to users).

## Native operations

- Implemented in Go with byte-level progress: list, stat, mkdir, rename, copy, move, delete (→ trash),
  zip/tar streaming download, checksum, thumbnails.
- Move: `rename` on the same filesystem; across volumes = copy → optional verify (size/hash setting)
  → delete source.
- Conflicts: a pre-scan (dry run) reports conflicts before starting; the user picks a strategy
  (skip / overwrite / keep both / per-item). No silent overwrite.
- Disk space checked before copy; clear error if insufficient.
- External tools (rsync, ffmpeg, plugins) only via `runner` and the catalog.

## Trash

- Delete moves items to `<volume>/.canopy-trash/` (same filesystem → instant, no copy).
- Items above the "trash bypass" size threshold are permanently deleted, only after an explicit
  warning dialog in the UI stating it cannot be undone.
- Scheduled purge (River periodic job), retention and schedule are settings. Every purge audited.

## Conventions

- golangci-lint (repo config) 0 issues; gofumpt.
- Table-driven tests; 100% coverage on `authz`, path resolution, parsers, pure helpers.
- Resource limits: max parallel jobs, nice/ionice levels — settings.
