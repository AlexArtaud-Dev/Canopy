# Streaming through the web app

Milestone 1 spike: can multi-GB uploads/downloads, Range requests and long SSE streams go
browser → web (Next.js) → engine without buffering? Measured on Next.js 16.4.5, Node 22,
standalone server, loopback, 10 GiB transfers, 3 min SSE (`scripts/spike/streaming-harness.mjs`).
The throwaway endpoints and proxies it targets live on the unmerged `spike/engine-streaming`
branch; check it out to re-run the measurements.

## Results

| Variant                               | Download 10 GiB | Upload 10 GiB          | Web RSS (upload) | Range | Abort → engine | SSE first event |
| ------------------------------------- | --------------- | ---------------------- | ---------------- | ----- | -------------- | --------------- |
| A. `next.config` rewrites             | 170 MiB/s       | **truncated @ 10 MiB** | —                | ✅    | ✅ ~0.1 s      | 1.0 s           |
| B. App Router Route Handler + `fetch` | 129 MiB/s       | 82 MiB/s               | **+10.3 GiB**    | ✅    | ✅ ~0.8 s      | **7.5 s**       |
| C. Engine direct (baseline)           | 266 MiB/s       | 396 MiB/s              | 0                | ✅    | ✅             | 1.0 s           |
| D. Pages API route, Node `pipeline`   | 121 MiB/s       | 142 MiB/s              | +36 MiB          | ✅    | ✅ ~0.3 s      | 1.0 s           |

## Why A and B fail

- **Rewrites** proxy the request body through a clone limited by
  `experimental.proxyClientMaxBodySize` (10 MiB default). Raising the limit does not help: the clone
  keeps a second copy of the whole body in memory.
- **App Router Route Handlers** turn the Node request into a web `ReadableStream` that reads the
  socket eagerly with no backpressure. When the engine consumes slower than the client sends, the
  whole body accumulates in the web process (observed +10.3 GiB for a 10 GiB upload).

## Decision

**Variant D.** The web app exposes `/engine/*` through one Pages Router API route
(`bodyParser: false`, `responseLimit: false`) that pipes the raw Node request and response to the
engine with `stream.pipeline`. App Router stays the default for everything else.

- Memory stays flat (+36 MiB for 10 GiB) because Node streams apply backpressure end to end.
- Throughput (~120–140 MiB/s on loopback, harness on the same machine) exceeds a 1 GbE line rate
  (~117 MiB/s), the realistic target for a self-hosted NAS.
- The route is server-side, so it attaches the short-lived engine token itself: the token is never
  exposed to the browser.
- Client aborts close the engine request within ~0.3 s; Range and SSE pass through untouched.

**Fallback (documented, not shipped as config):** on 10 GbE setups the reverse proxy may route
`/engine/*` straight to the engine (variant C, ~2–3× faster on loopback). The engine token then
has to travel with the browser request (path-scoped HttpOnly cookie), which the engine already
verifies.

## As built

- **Event streams** (`/api/engine/*`, GET only): App Router route handler. No request body, so
  variant B's buffering does not apply; warm first event ~60 ms. It checks maintenance and the
  session itself and relays allowlisted routes only (`features/files/engine-routes.utils.ts`).
- **Downloads and uploads** (`/api/engine/stream/*`): Pages Router API routes cannot import
  `server-only` modules (session, token, database all carry that guard), so variant D ships as a
  Node preload instead: `apps/web/server/engine-stream.mjs` (loaded with `--import`, like
  `peer-address.mjs`) answers these requests before Next and pipes them to the engine with
  `stream.pipeline`. Next never sees the bytes.
  - Authentication is a **stream ticket**: an engine token with its own audience
    (`canopy-engine-stream`), set by the `refreshStreamTicket` server action as an HttpOnly,
    SameSite=Strict cookie on `/api/engine/stream`, 2 minutes. JavaScript never reads it. The
    engine accepts that audience on streaming routes only; the relay allowlists routes and
    methods (`server/engine-stream.utils.mjs`) and forwards the ticket as a bearer token, never
    the browser's cookies.
  - Uploads use tus through the same relay (`/api/engine/stream/v1/uploads/`): the relay
    rewrites tusd's `Location` to the relay path and refuses cross-origin writes.
  - New tickets are only issued through the App Router (maintenance and session checked there);
    an issued ticket lasts at most 2 minutes.

## Rules that follow

- Never route uploads through `next.config` rewrites or an App Router Route Handler.
- Streaming endpoints set `Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no`.
- The engine sets no read/write timeout on the HTTP server; long transfers are legitimate.
- Re-run the harness when upgrading Next.js: these behaviours are internal and may change.
