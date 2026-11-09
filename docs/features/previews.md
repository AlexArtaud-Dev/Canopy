# Previews

- **Open** a file (double-click, Enter, item menu) to view it in a dialog; ← / → go to the previous
  or next previewable file in the folder, with Download and Close in the header.
- The engine decides what can be previewed, by extension only (never by sniffing content):
  `internal/preview` maps it to a viewer (`image`, `pdf`, `text`, `audio`, `video`, `html`) and a
  Content-Type. Each listed entry carries this as `preview` (`none`: download only).
- Viewing needs the `download` permission: seeing the content is getting it.
- The browser reads `/api/engine/stream/v1/fs/preview?path=` (stream ticket, kept fresh while the
  viewer is open). Files are served `inline` with Range support (video seeking), `nosniff`, and
  formats outside the allowlist are refused with `files.no_preview`.
- **Sandbox**: everything except PDF is served with `Content-Security-Policy: sandbox;
default-src 'none' …` — no scripts, an opaque origin, nothing loaded from elsewhere. HTML is
  also shown in an `<iframe sandbox="">`; SVG only through `<img>`. PDF is exempt because browsers
  refuse to run their PDF viewer in a sandboxed document.
- **Text and code**: the first 512 KB are read with a Range request (a notice says when the file
  is longer); files with a NUL byte near the start are treated as binary. Highlighting uses shiki
  with the JavaScript regex engine (no WebAssembly, so the page CSP is unchanged), loaded lazily
  with one chunk per grammar, up to 100 000 characters.
- Audit: `fs.preview` (once per opening; media range requests are not counted again).
