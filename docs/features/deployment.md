# Deployment (Docker)

The step-by-step guide for people installing Canopy is [docs/user](../user/README.md); this page
is the technical summary.

```bash
cp docker/.env.example docker/.env   # CANOPY_HOME, PUID/PGID, folders to manage
docker compose -f docker/compose.yaml --env-file docker/.env up -d --wait
```

One folder, `CANOPY_HOME`, holds the database, the generated secrets, thumbnails and plugins. Two
one-shot services from the engine image run before the apps: `setup` (`engine setup`, root with
only `CHOWN`/`FOWNER`/`DAC_OVERRIDE`, no network) creates the sub-folders with their owners and
generates missing secrets, one file per consumer (mode 0400); `setup-db` (`engine setup-db`) creates
or updates the roles and schemas as the database administrator. Apps read secrets through
`NAME_FILE` variables (`config.WithFiles` in the engine, `server/secret-files.mjs` in the web app).

Canopy listens on `CANOPY_HTTP_BIND:CANOPY_HTTP_PORT` (default `127.0.0.1:3000`). Put your own
reverse proxy with TLS in front of it; none is shipped.

## Images

| Image           | Base                                        | Runs as               | Size    |
| --------------- | ------------------------------------------- | --------------------- | ------- |
| `canopy-web`    | `alpine` + the node binary (standalone app) | `node` (1000)         | ~180 MB |
| `canopy-engine` | `distroless/static` (nonroot)               | `PUID:PGID` (compose) | ~19 MB  |

The web image keeps only what runs: no npm, corepack or yarn, and no sharp (images are served
unoptimized; thumbnails come from the engine already sized). Node.js itself is ~125 MB of it.

Base images are pinned by digest. Both have a `HEALTHCHECK`; the engine image has no shell, so it
probes itself with `engine healthcheck`.

## Hardening defaults

- `read_only` root filesystems, `cap_drop: [ALL]`, `no-new-privileges`.
- Network `internal` (`internal: true`, no egress) for postgres and engine; only `web` joins
  `edge` and publishes a port. The engine and the database are unreachable from the host.
- The web container never mounts the file root.

## Volumes

Mount every host folder inside the engine root, no symlinks needed:

```yaml
engine:
  volumes:
    - /mnt/disk1:/srv/canopy/root/disk1
    - /mnt/nas/media:/srv/canopy/root/media
```

Files created by the engine belong to `PUID:PGID` with `UMASK` applied.
