# Architecture

## Overview

```
Browser
  │  (optional upstream SSO, e.g. Authelia forward-auth — transparent to Canopy)
  ▼
Reverse proxy (TLS termination, user-provided config — none shipped)
  ▼
web :3000  (Next.js) ──────────────► PostgreSQL
  │   UI, auth, users/groups/roles,      schemas: auth, app, audit (owned by web)
  │   settings, audit viewer, BFF                 engine, river      (owned by engine)
  │
  ├── JSON API + signed engine token ──► engine :8080 (Go, internal network only)
  └── /engine/* stream proxy (Node pipeline): uploads, downloads, │
      media streaming, SSE job progress                           ▼
                                                   /srv/canopy/root  (all volumes mounted here)
```

## Why two apps

- **Go engine**: I/O-heavy work, cheap concurrency, low memory, single static binary, `os.Root`
  path confinement, native byte-level progress for copy/move/zip.
- **Next.js web**: UI, auth, admin, settings.
- **Blast radius**: the web container does NOT mount the file root. A compromised web process
  cannot read files directly; everything goes through the engine's authorization.

## Data ownership

| Schema   | Owner  | Content                                                | Migrations |
| -------- | ------ | ------------------------------------------------------ | ---------- |
| `auth`   | web    | users, sessions, 2FA                                   | Drizzle    |
| `app`    | web    | groups, roles, path grants, settings, plugins registry | Drizzle    |
| `audit`  | web    | append-only events (engine role: INSERT only)          | Drizzle    |
| `engine` | engine | jobs metadata, job logs, trash index, thumbnails cache | goose      |
| `river`  | engine | River queue tables                                     | River      |

The engine DB role has read-only access to `app` (grants, settings) and INSERT-only on `audit.events`.

## Web ↔ engine contract

- `packages/contracts/openapi.yaml` is the source of truth. `pnpm contracts:gen` produces Go server
  interfaces/types and the TS client + Zod schemas. CI fails on drift. Never hand-edit generated code.
- **Engine token**: web issues a short-lived (≤ 5 min) Ed25519-signed JWT per session:
  `sub`, `sid`, `perms[]` (global module permissions), `groups[]` (group ids, so the engine never
  reads the `auth` schema), `iss=canopy-web`, `aud=canopy-engine`, `exp` (2 min; the engine refuses
  more than 5). The engine verifies it with the public key (`internal/enginetoken`) and resolves
  path grants itself from the DB (single implementation, in Go). Keys: `scripts/dev/engine-keys.mjs`.
- **Capabilities**: listing responses include per-entry capabilities (`canDelete`, `canShare`…)
  computed by the engine, so the UI never re-implements permission logic.
- **Error model**: `{ code: "files.not_found", params: {...}, requestId }`. Codes are namespaced
  `<module>.<error>`; web translates `errors.<code>`.

## Jobs

- River queue. States: `queued → running → succeeded | failed | cancelled`.
- Progress event: `bytesDone, bytesTotal, itemsDone, itemsTotal, currentPath, rateBps, etaSeconds`.
  Persisted throttled (~1/s), broadcast with Postgres `LISTEN/NOTIFY`, streamed to the browser via SSE.
- Job output (external commands) stored as capped log lines → live "command output" view.
- Cancel: context cancellation → SIGTERM, then SIGKILL after a grace period. Partial results cleaned
  up or reported explicitly.
- Concurrency limits, priorities and per-user caps are settings.

## Docker

- `docker/`: `web.Dockerfile`, `engine.Dockerfile`, `compose.yaml`, `compose.dev.yaml`, `.env.example`.
- Services: `postgres`, `engine`, `web`. Networks: `internal` (all three, not published) and only
  `web` publishes a port. Images: multi-stage, non-root, base images pinned by digest.
- **Volumes**: every host volume is bind-mounted INSIDE the root — no host symlinks needed:
  ```yaml
  engine:
    volumes:
      - /mnt/disk1:/srv/canopy/root/disk1
      - /mnt/nas/media:/srv/canopy/root/media
  ```
- Engine runs as `PUID:PGID` (linuxserver-style) with a configurable umask.

## Environment (bootstrap only — everything else is an admin setting)

| Variable                         | Purpose                                          |
| -------------------------------- | ------------------------------------------------ |
| `CANOPY_PUBLIC_URL`              | External URL (cookies, links)                    |
| `CANOPY_DATABASE_URL`            | Postgres DSN (one per app role)                  |
| `CANOPY_ENCRYPTION_KEY`          | AES-256-GCM key for secrets at rest              |
| `CANOPY_ENCRYPTION_KEY_PREVIOUS` | Retired keys still accepted during a rotation    |
| `CANOPY_ENGINE_PRIVATE_KEY`      | Ed25519 seed signing engine tokens (web only)    |
| `CANOPY_ENGINE_PUBLIC_KEY`       | Matching public key verifying them (engine)      |
| `CANOPY_ROOT`                    | File root inside the engine container            |
| `CANOPY_CACHE_DIR`               | Rebuildable cache (thumbnails), outside the root |
| `CANOPY_ENGINE_URL`              | Engine base URL as seen from web (internal)      |
| `CANOPY_ENGINE_ADDR`             | Engine listen address (default `:8080`)          |
| `CANOPY_LOG_LEVEL`               | Engine log level (`debug`, `info`, `warn`…)      |
| `CANOPY_TRUSTED_PROXIES`         | CIDR list allowed to set forwarded headers       |
| `CANOPY_LOCAL_NETWORKS`          | CIDR list considered "local" (maintenance mode)  |
| `CANOPY_MAINTENANCE`             | `true` forces maintenance mode                   |
| `PUID` / `PGID` / `UMASK`        | File ownership for the engine                    |

Env values win over DB settings and show as read-only in the admin UI.

## Streaming (validated in milestone 1)

Multi-GB transfers and SSE go through a single Pages Router API route that pipes raw Node streams
to the engine and injects the engine token. Next.js rewrites and App Router Route Handlers buffer
request bodies and must not carry uploads. Measurements, decision and fallback (reverse proxy
straight to the engine): [streaming.md](streaming.md).
