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
- **Videos the browser cannot play** (MKV with HEVC, AC-3, DTS…; AVI): `GET /v1/fs/media` probes
  the file with `ffprobe` and answers a mode — `direct` (play as stored), `remux` (H.264 video
  copied into MP4) or `transcode` (H.264, longest edge capped at 1920) — plus the duration. The
  viewer plays `direct` files natively and falls back to `/v1/fs/stream?path=&start=` (fragmented
  MP4 from ffmpeg) for the others, or when native playback fails. Such a stream cannot seek: the
  player's own seek bar asks for a new stream from the chosen time. Audio is copied when AAC or
  MP3, otherwise AAC stereo. At most 2 conversions run at once (`media.busy`, 503, otherwise).
  The file is handed to ffmpeg already open (fd 3, `internal/fileinput`), arguments are a fixed
  list, ffmpeg output is never logged. Needs the `engine-ffmpeg` image (or ffmpeg and ffprobe on
  the engine's `PATH`); without it, unplayable videos offer a download.
- **GPU** (`engine-gpu` image, Debian ffmpeg with NVENC): at startup the engine encodes a tenth of
  a second of black with `h264_nvenc`; when that works (`CANOPY_VIDEO_ENCODER` `auto` or
  `nvenc`), conversions use the GPU and up to 4 run at once. HEVC, MPEG-2 and VC-1 in 4:2:0 stay
  on the GPU end to end (`-hwaccel cuda -hwaccel_output_format cuda`, `scale_cuda`, NVENC):
  measured on a 30 s 4K 10-bit HEVC clip, 1.3 s of CPU time instead of 96 s with libx264. Other
  codecs and 4:2:2 / 4:4:4 pictures are decoded and scaled on the CPU, encoded on the GPU.
  Constant quality 26, capped at 8 Mb/s.
- Audit: `fs.preview` (once per opening; media range requests and seeks are not counted again).
