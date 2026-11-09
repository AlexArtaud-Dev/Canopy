# Archives and checksums

All three run as jobs: live progress and cancel in the operations panel, result there too.

- **Compress** (item menu › Compress › ZIP or TAR.GZ): the entry, or the selection it belongs to,
  becomes an archive in the same folder (`name.zip`; several items take the folder's name). A
  name already taken gets ` (2)`, ` (3)`…, so nothing is replaced. Needs `copy` on each item and
  `create` in the folder; what the person may not read is left out, links are skipped. Items from
  different folders (search results) are refused (`files.mixed_folders`). Zip entries are
  deflated; tar.gz is PAX. A failed or cancelled job leaves no partial archive.
- **Extract here** (zip, tar, tar.gz/tgz): into a new folder next to the archive, named after it
  (free name as above). Needs `read` + `copy` on the archive and `create` in its folder. Archive
  contents are untrusted: every entry name is checked before writing (no absolute paths, no
  `..`, no reserved `.canopy-` names), and all writes go through the root-confined resolver
  anyway. Links, devices and other special entries are skipped; a name present twice keeps the
  first. Limits: 200 000 entries and the free space (zip sizes are checked up front, tar sizes as
  they are written) — `files.archive_too_large`. A damaged or unsafe archive fails with
  `files.bad_archive` and the new folder is removed.
- **Checksum** (MD5, SHA-1, SHA-256, SHA-512) of one file; needs `download`. The digest shows in
  the operations panel with a copy button. MD5 and SHA-1 are offered to compare with published
  sums, not for security.
- Engine: `internal/archive` (`compress`, `extract`, `checksum` jobs), `POST /v1/jobs/compress`,
  `/v1/jobs/extract`, `/v1/jobs/checksum`. Starts are audited as `jobs.start` with the kind.
