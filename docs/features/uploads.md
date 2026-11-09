# Uploads

Resumable uploads with the tus protocol: **tusd** in the engine, **tus-js-client** in the browser.

## Using it

- **Upload** in the toolbar (files, or a whole folder), or drop files and folders from the desktop
  onto the file list (it highlights). Needs the `upload` permission on the folder; sub-folders of
  a folder upload also need `create`.
- Names already in the folder open the same conflict dialog as copies: skip, replace, keep both
  (a folder kept twice is renamed `name (1)` before sending). Nothing is replaced silently.
- Progress, speed, cancel and resume appear in the operations panel; finished files refresh open
  folders; failures also get a toast. Leaving the page while files are sending asks first.

## How it works

- The browser sends to `/api/engine/stream/v1/uploads/` (the streaming relay, see
  `docs/dev/streaming.md`), in 32 MiB requests, 3 files at a time. Before each request the stream
  ticket is refreshed when it is about to expire. Network failures retry and resume from the bytes
  the engine already has; resuming after a page reload is not supported (the file would have to
  be picked again).
- The engine stages each upload **in its destination volume**: `<root>/<volume>/.canopy-uploads`
  (the root's own only for uploads into the root). In Docker the root is read-only and each
  volume is its own mount, so this is the only writable place, and finishing an upload is always
  a rename on the same filesystem (a copy only if a volume spans filesystems). Upload ids carry
  the volume (32 random hex characters, then the volume name in hex), so later requests find the
  right folder; ids are always hexadecimal, never paths. Names starting with `.canopy-` are
  reserved: never listed, never reachable by a path. When the last byte arrives the engine checks
  again (permission, name taken meanwhile) and moves the file into place. Abandoned uploads are
  purged after 24 h in every volume.
- Checked before any byte is sent: metadata, `upload` permission, size limit and blocked
  extensions (Settings › Uploads), free space (Linux), and the conflict choice. Every later
  request for an upload must come from the person who started it.
- Audit: `fs.upload` per stored file.
