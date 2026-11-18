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
user, like linuxserver.io images. `UMASK` (default `022`) sets their permissions. The setup step
gives `cache/` and `plugins/` to that user; the folders you mount must be writable by it too:

```bash
sudo chown -R 1000:1000 /mnt/disk1
```

The web container never mounts your files.

### Running the engine as root

When the folders you mount belong to several host users (other containers, old copies, a NAS),
giving them all to `PUID:PGID` may not be possible. The engine can then run as root, so the
host's file rights no longer stop it. **Who may do what is then decided by Canopy alone**: its
roles, groups and folder rights (Administration › Users and groups, and each folder's access).

```yaml
# docker/compose.yaml, engine service
engine:
  user: ${PUID:-1000}:${PGID:-1000} # unchanged: 0:100 with the .env below
  read_only: true
  cap_drop: [ALL]
  # Root without these still obeys the folders' rights.
  cap_add: [DAC_OVERRIDE, DAC_READ_SEARCH, FOWNER]
  security_opt: [no-new-privileges:true]
```

```bash
# docker/.env
PUID=0
PGID=100
UMASK=002
```

- `PGID` and `UMASK=002` make what Canopy creates belong to `root:<group>` and stay writable by
  that group, so other containers running as a member of it keep writing there.
- Only the three capabilities above are added; the container stays read-only and cannot gain
  more privileges.
- The engine can now change anything you mount. Mount only the folders Canopy should manage,
  mount read-only (`:ro`) what must never change, and give folder rights sparingly: start from
  _View_ and add actions per group. _Delete permanently_ is its own right; keep it for the few
  who need it.
- Only `cap_add` is new in the compose file; the GPU image keeps its `runtime` and `deploy`
  lines.

## CANOPY_HOME

One folder holds everything Canopy keeps; the first start fills it:

| Folder     | Content                                          | Owner                |
| ---------- | ------------------------------------------------ | -------------------- |
| `postgres` | The database                                     | Postgres (70)        |
| `secrets`  | Generated passwords, encryption key, engine keys | one file per service |
| `cache`    | Thumbnails (safe to delete)                      | `PUID:PGID`          |
| `plugins`  | Installed plugin binaries                        | `PUID:PGID`          |

To use a value of your own instead of a generated one, write it into the matching file in
`secrets/` before the first start (for example `encryption-key`, 32 bytes in base64). Role
passwords follow their files on every start.

## Environment variables (`docker/.env`)

| Variable                         | Default                 | Purpose                                                     |
| -------------------------------- | ----------------------- | ----------------------------------------------------------- |
| `CANOPY_HOME`                    | `./canopy`              | The folder above                                            |
| `CANOPY_VERSION`                 | `latest`                | Release to run; pin it to upgrade on purpose                |
| `PUID` / `PGID` / `UMASK`        | `1000`/`1000`/`022`     | Owner and permissions of files the engine creates           |
| `CANOPY_DATA_DIR`                | `./data`                | Example folder mounted as `/data`                           |
| `CANOPY_HTTP_BIND`               | `127.0.0.1`             | Interface the web app listens on; `0.0.0.0` for the LAN     |
| `CANOPY_HTTP_PORT`               | `3000`                  | Port on that interface                                      |
| `CANOPY_PUBLIC_URL`              | `http://localhost:3000` | Address people open; `https://` turns on Secure cookies     |
| `CANOPY_TRUSTED_PROXIES`         | empty                   | CIDRs of reverse proxies allowed to give the client IP      |
| `CANOPY_LOCAL_NETWORKS`          | private ranges          | Treated as local: setup wizard and local-only admin actions |
| `CANOPY_ENCRYPTION_KEY_PREVIOUS` | empty                   | Old key(s) during a rotation, comma-separated               |
| `CANOPY_LOG_LEVEL`               | `info`                  | `debug`, `info`, `warn` or `error`                          |
| `CANOPY_VIDEO_ENCODER`           | `auto`                  | `auto` (GPU when one works), `cpu` or `nvenc`; engine only  |

The apps read their secrets from files (`CANOPY_DATABASE_URL_FILE`, `CANOPY_ENCRYPTION_KEY_FILE`,
`CANOPY_ENGINE_PRIVATE_KEY_FILE`, `CANOPY_ENGINE_PUBLIC_KEY_FILE`, set in `compose.yaml`). Setting
the plain variable instead (`CANOPY_ENCRYPTION_KEY=…`) still works and wins over the file.

Some settings can be forced from the environment; the settings page then shows them locked:

| Variable                                                                                              | Setting                                   |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `CANOPY_MAINTENANCE`                                                                                  | Maintenance mode (only the local network) |
| `CANOPY_AUDIT_RETENTION_DAYS`                                                                         | Audit log retention                       |
| `CANOPY_SMTP_ENABLED`, `_HOST`, `_PORT`, `_SECURITY`, `_USERNAME`, `_PASSWORD`, `_FROM`, `_FROM_NAME` | Email                                     |

Add them to the `environment:` list of the `web` service in `docker/compose.yaml`.

## Rotating the encryption key

1. Put the current key (`secrets/encryption-key`) in `CANOPY_ENCRYPTION_KEY_PREVIOUS`, then write
   a new one (`openssl rand -base64 32`) into `secrets/encryption-key`.
2. Restart (`docker compose … up -d`). Secrets encrypted with the old key still open; new and
   re-saved ones use the new key. Re-save the SMTP settings to move the password over.
3. Keep the old key listed: two-factor secrets set up before the rotation still need it until
   each person sets two-factor up again. Removing it too early turns their two-factor off.
