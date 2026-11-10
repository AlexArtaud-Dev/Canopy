# Properties

- **Open**: right-click a file or folder › Properties, or Alt+Enter on the focused item.
- `GET /v1/fs/properties?path=` (engine) answers the entry as a listing shows it, plus what the
  host knows: `ls -l` mode and permission bits, numeric owner (uid/gid; names would be the
  container's, so none are looked up), last metadata change, MIME type from the extension, and
  for a symbolic link its target when relative (absolute targets are host paths: never sent).
  Visible entries only (hidden and missing both answer `files.not_found`); not audited.
- The dialog adds, on demand:
  - **Folder size**: starts the `folder_size` job and shows bytes, files and folders when done.
  - **Checksum** (files the person may download): MD5 / SHA-1 / SHA-256 / SHA-512 as a job, with a
    copy button.
  - **Media**: video duration, size and codecs from `/v1/fs/media` (engine with ffmpeg); image
    size read by the browser from the preview.
- **Your access**: the person's effective rights on the item (`actions`), as badges.
