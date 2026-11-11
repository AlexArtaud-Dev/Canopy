# Downloads

- **Download** (item menu, selection bar) needs the `download` permission. One file downloads as
  is; a folder, or several items, download as a zip streamed on the fly (nothing staged on disk,
  files stored uncompressed, entries the person may not download left out).
- Files support HTTP Range: browsers and download managers can resume, and media can seek.
- The browser fetches `/api/engine/stream/v1/fs/download?path=` or `…/archive?path=&path=` right
  after `refreshStreamTicket` sets the stream ticket cookie (see `docs/dev/streaming.md`).
- Files are served as `application/octet-stream` with `Content-Disposition: attachment` and
  `nosniff`: nothing uploaded can run in Canopy's origin.
- Audit: `fs.download` (once per download; resumed ranges are not counted again).
- The browser starts the download from a link carrying the `download` attribute, so that it is a
  download and not a navigation: a navigation cancels the page's requests in flight (server
  actions, the jobs stream) and, in Firefox while the save dialog is open, broke the page.
