# Deployment (Docker)

```bash
cp docker/.env.example docker/.env   # set passwords, PUID/PGID, data folder
docker compose -f docker/compose.yaml --env-file docker/.env up -d --build --wait
```

Canopy listens on `CANOPY_HTTP_BIND:CANOPY_HTTP_PORT` (default `127.0.0.1:3000`). Put your own
reverse proxy with TLS in front of it; none is shipped.

## Images

| Image           | Base                          | Runs as               | Size    |
| --------------- | ----------------------------- | --------------------- | ------- |
| `canopy-web`    | `node:24-alpine` (standalone) | `node` (1000)         | ~210 MB |
| `canopy-engine` | `distroless/static` (nonroot) | `PUID:PGID` (compose) | ~15 MB  |

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
