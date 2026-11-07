# Commands & plugins

## Basic vs advanced

- **Basic** (everyone): high-level actions implemented natively in the engine — copy, move, rename,
  compress, extract, delete, restore, checksum.
- **Advanced** (global setting ON + `commands:advanced` permission): catalog commands with a
  generated parameter form, a read-only preview of the exact argv, dry-run when supported, and the
  live output stream.
- No free-text command input exists anywhere, in any mode.

## Catalog entry

```yaml
id: rsync.sync
binary: rsync
mode: advanced                # basic | advanced
params:
  - { name: source,         type: path, access: read }
  - { name: destination,    type: path, access: create }
  - { name: deleteExtra,    type: bool, default: false, flag: "--delete" }
  - { name: bandwidthLimit, type: int,  min: 0, flag: "--bwlimit={value}" }
args: ["-a", "--info=progress2", "{flags}", "{source}/", "{destination}/"]
progressParser: rsync-progress2
dryRun: { flag: "--dry-run" }
timeout: 24h
```

## Runner guarantees

- Params validated against the entry (types, ranges, enums); unknown params rejected.
- `path` params resolved through the root resolver + path grants for their `access`.
- argv built from the template only; `exec.CommandContext`, no shell, scrubbed environment,
  working dir inside the root, runs as PUID:PGID with nice/ionice.
- stdout/stderr captured to the job log (capped, secrets redacted); a parser turns output into
  progress events (`rsync-progress2`, `percent-regex`, `line-count`, `none` = indeterminate).

## Plugins (third-party utilities)

- Stored in `/var/lib/canopy/plugins/<id>/<version>/`, declared by `canopy-plugin.yaml`:
  id, name/description (en/fr/es), version, source (GitHub `owner/repo`, asset pattern per os/arch),
  checksum asset (mandatory SHA-256), minimum Canopy version, `commands[]` (catalog entries).
- Admin: install from a GitHub release, check for updates, pin a version, enable/disable, uninstall,
  view release notes.
- Safety: download only from admin-allowlisted repos over HTTPS, checksum verified before
  activation, no install scripts ever run, executable bit set by the engine.
- Reference integration: **mrename** (C). Requires published release binaries (linux amd64/arm64)
  + checksums. Its CLI arguments must be documented before implementing — ask, do not guess.
- Third-party guide: `docs/integrations/writing-a-plugin.md` (written when the feature ships).
