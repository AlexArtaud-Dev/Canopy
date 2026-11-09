# Thumbnails

- In the grid view, images (PNG, JPEG, GIF, WebP, BMP, TIFF) show a small preview instead of their
  icon; videos too when `ffmpeg` is on the engine's `PATH` (the default engine image has none).
- The engine decides: each listed entry carries `thumbnail` (supported format, non-empty, under
  200 MB, thumbnails turned on). The browser fetches `/api/engine/stream/v1/fs/thumbnail?path=&v=`
  with the stream ticket, kept fresh while the grid shows thumbnails. Any failure keeps the icon.
- Viewing needs `download`, like a preview. Rendering changes nothing, so it is not audited.
- **Images** are decoded in Go (`golang.org/x/image`): dimensions are checked before decoding
  (64 megapixels at most), scaled to 320 px on the longest side, turned upright with the EXIF
  orientation, encoded as JPEG (PNG when transparent).
- **Videos**: `ffmpeg` with a fixed argument list (no shell) picks a representative frame. It never
  receives a path: the engine opens the file through the root-confined resolver and hands over the
  open descriptor (`/dev/fd/3` on Linux). 20 s timeout, output capped, messages discarded.
- **Cache**: files in `CANOPY_CACHE_DIR/thumbnails` (default `/srv/canopy/cache`, a host folder in
  compose), named by a hash of path, size and modification time, so any change gives a new
  thumbnail. `engine.thumbnails` indexes them; an hourly sweep removes the least recently used
  beyond the size setting, and everything when thumbnails are off. An unwritable folder only
  disables caching. Browsers keep a thumbnail a day (`ETag`, the URL changes with the file).
- **Settings** (module `thumbnails`): show thumbnails (on), largest cache (1024 MB).
- Concurrency: one rendering per CPU, and concurrent requests for the same file share one.
