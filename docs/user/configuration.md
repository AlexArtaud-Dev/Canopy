# Configuration

Everything that can change at run time is in **Administration › Configuration › Settings**. The
environment variables below cover what must be known before Canopy starts, plus a few overrides.

## Folders

The engine sees one folder, its **root** (`/srv/canopy/root` in the container). Mount each host
folder you want to manage **inside** it; each mount appears as a top-level folder in Canopy:

```yaml
# docker/compose.yaml, engine service
volumes:
  - /mnt/disk1:/srv/canopy/root/disk1
  - /mnt/nas/media:/srv/canopy/root/media
  - ${CANOPY_CACHE_DIR:-./cache}:/srv/canopy/cache
  - ${CANOPY_PLUGINS_DIR:-./plugins}:/srv/canopy/plugins
```

- No symlinks are needed or followed out of the root: a link pointing outside is refused.
- Each mount gets its own trash (`.canopy-trash`) and upload staging area (`.canopy-uploads`)
  inside it, so deleting and uploading never copy across disks.
- Mount read-only (`:ro`) anything Canopy must never change; writes there fail cleanly.

## Owner of new files: PUID, PGID, UMASK

The engine runs as `PUID:PGID` (default `1000:1000`), so files it creates belong to that host
user, like linuxserver.io images. `UMASK` (default `022`) sets their permissions. The mounted
folders, `cache/` and `plugins/` must be writable by that user:

```bash
sudo chown -R 1000:1000 /mnt/disk1 docker/cache docker/plugins
```

The web container never mounts your files.

## Environment variables (`docker/.env`)

| Variable                         | Default                 | Purpose                                                              |
| -------------------------------- | ----------------------- | -------------------------------------------------------------------- |
| `CANOPY_DB_ADMIN_PASSWORD`       | —                       | Postgres administrator (creates the two app roles)                   |
| `CANOPY_WEB_DB_PASSWORD`         | —                       | Web app's database role                                              |
| `CANOPY_ENGINE_DB_PASSWORD`      | —                       | Engine's database role                                               |
| `CANOPY_ENCRYPTION_KEY`          | —                       | Encrypts secrets at rest; 32 random bytes in base64                  |
| `CANOPY_ENCRYPTION_KEY_PREVIOUS` | empty                   | Old key(s) during a rotation, comma-separated                        |
| `CANOPY_ENGINE_PRIVATE_KEY`      | —                       | Signs web → engine requests (web only)                               |
| `CANOPY_ENGINE_PUBLIC_KEY`       | —                       | Verifies them (engine only)                                          |
| `CANOPY_VERSION`                 | `latest`                | Release to run; pin it to upgrade on purpose                         |
| `CANOPY_HTTP_BIND`               | `127.0.0.1`             | Interface the web app listens on; `0.0.0.0` to reach it from the LAN |
| `CANOPY_HTTP_PORT`               | `3000`                  | Port on that interface                                               |
| `CANOPY_PUBLIC_URL`              | `http://localhost:3000` | Address people open; `https://` turns on Secure cookies              |
| `CANOPY_TRUSTED_PROXIES`         | empty                   | CIDRs of reverse proxies allowed to give the client IP               |
| `CANOPY_LOCAL_NETWORKS`          | private ranges          | Treated as local: setup wizard and local-only admin actions          |
| `PUID` / `PGID` / `UMASK`        | `1000`/`1000`/`022`     | Owner and permissions of files the engine creates                    |
| `CANOPY_DATA_DIR`                | `./data`                | Example folder mounted as `/data`                                    |
| `CANOPY_CACHE_DIR`               | `./cache`               | Thumbnails (safe to delete, rebuilt when needed)                     |
| `CANOPY_PLUGINS_DIR`             | `./plugins`             | Installed plugin binaries                                            |
| `CANOPY_LOG_LEVEL`               | `info`                  | `debug`, `info`, `warn` or `error`                                   |

Some settings can be forced from the environment; the settings page then shows them locked:

| Variable                                                                                              | Setting                                   |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `CANOPY_MAINTENANCE`                                                                                  | Maintenance mode (only the local network) |
| `CANOPY_AUDIT_RETENTION_DAYS`                                                                         | Audit log retention                       |
| `CANOPY_SMTP_ENABLED`, `_HOST`, `_PORT`, `_SECURITY`, `_USERNAME`, `_PASSWORD`, `_FROM`, `_FROM_NAME` | Email                                     |

Add them to the `environment:` list of the `web` service in `docker/compose.yaml`.

## Rotating the encryption key

1. Move the current key to `CANOPY_ENCRYPTION_KEY_PREVIOUS` and set a new `CANOPY_ENCRYPTION_KEY`.
2. Restart (`docker compose … up -d`). Secrets encrypted with the old key still open; new and
   re-saved ones use the new key. Re-save the SMTP settings to move the password over.
3. Keep the old key listed: two-factor secrets set up before the rotation still need it until
   each person sets two-factor up again. Removing it too early turns their two-factor off.
