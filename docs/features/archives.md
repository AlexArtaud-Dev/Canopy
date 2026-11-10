# Archives and checksums

All three run as jobs: live progress and cancel in the operations panel, result there too.

- **Compress** (item menu › Compress › ZIP, TAR.GZ or 7Z): the entry, or the selection it belongs to,
  becomes an archive in the same folder (`name.zip`; several items take the folder's name). A
  name already taken gets ` (2)`, ` (3)`…, so nothing is replaced. Needs `copy` on each item and
  `create` in the folder; what the person may not read is left out, links are skipped. Items from
  different folders (search results) are refused (`files.mixed_folders`). Zip entries are
  deflated; tar.gz is PAX. A failed or cancelled job leaves no partial archive. **7z** is written
  by 7-Zip (normal level, solid) from a list of the readable files only (a folder name would make
  7-Zip add everything below it); links are stored as links (`-snl`), never followed. A selection
  with no readable file fails with `files.nothing_to_compress`.
- **Extract here** (zip, tar, tar.gz/tgz; 7z, RAR including multi-part, ISO through 7-Zip): into a new folder next to the archive, named after it
  (free name as above). Needs `read` + `copy` on the archive and `create` in its folder. Archive
  contents are untrusted: every entry name is checked before writing (no absolute paths, no
  `..`, no reserved `.canopy-` names), and all writes go through the root-confined resolver
  anyway. Links, devices and other special entries are skipped; a name present twice keeps the
  first. Limits: 200 000 entries and the free space (zip sizes are checked up front, tar sizes as
  they are written) — `files.archive_too_large`. A damaged or unsafe archive fails with
  `files.bad_archive` and the new folder is removed. For 7-Zip formats the engine first lists the
  archive (`7zz l -slt`) and applies the same name, entry and size rules before 7-Zip writes
  anything, then removes any link it created. A password-protected archive fails with
  `files.archive_encrypted` (advanced mode can extract it with the password).
- **7-Zip**: the official static `7zzs` build (checksum pinned in `docker/engine.Dockerfile`) is
  in every engine image as `7zz`. Without it, 7-Zip formats fail with `files.sevenzip_unavailable`.
  Its file lists go to `<cache>/tmp` (the engine's file system is read-only).
- **Checksum** (MD5, SHA-1, SHA-256, SHA-512) of one file; needs `download`. The digest shows in
  the operations panel with a copy button. MD5 and SHA-1 are offered to compare with published
  sums, not for security.
- Engine: `internal/archive` (`compress`, `extract`, `checksum` jobs; `sevenzip.go` runs 7-Zip), `POST /v1/jobs/compress`,
  `/v1/jobs/extract`, `/v1/jobs/checksum`. Starts are audited as `jobs.start` with the kind.
